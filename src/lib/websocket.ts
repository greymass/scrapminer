/**
 * WebSocket Management Module
 *
 * Manages connection to SCRAP API websocket for real-time droplet streaming.
 * Handles reconnection, message parsing, and droplet caching.
 */

import { websocketLog } from './logger';
import { objectify } from './utils';

// Use native WebSocket (works in both Bun and browsers)
const WebSocket = globalThis.WebSocket;

export interface DropletMessage {
	command: 'validscraps';
	status: 'processed' | 'complete' | 'processing';
	droplet?: {
		_id: string;
		owner: string;
		created: string;
		[key: string]: any;
	};
	count: number;
}

export interface EpochMessage {
	command: 'epoch';
	epoch: any;
}

export type WSMessage = DropletMessage | EpochMessage | { command: 'pong' };

export interface Droplet {
	_id: string;
	owner: string;
	bound: boolean;
	created: string;
	[key: string]: any;
}

/**
 * Manages websocket connection to SCRAP API and stores droplets per account
 */
export class ScrapWebSocket {
	private ws: WebSocket | null = null;
	private url: string;
	private droplets: Map<string, Droplet[]> = new Map();
	private reconnectTimer: Timer | null = null;
	private reconnectDelay = 5000;
	private onEpochChange?: () => void;
	private completionCallbacks: Map<string, (count: number) => void> = new Map();
	private pingInterval: Timer | null = null;
	private pingIntervalMs = 30000; // 30 seconds
	private shouldReconnect = true; // Flag to control reconnection

	constructor(url: string, onEpochChange?: () => void) {
		this.url = url;
		this.onEpochChange = onEpochChange;
	}

	/**
	 * Connect to websocket and set up event handlers
	 */
	connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				websocketLog.debug('Connecting to SCRAP API websocket', { url: this.url });
				this.ws = new WebSocket(this.url);

				this.ws.addEventListener('open', () => {
					websocketLog.info('🔌 Connected to SCRAP API');
					// Send ping to verify connection
					this.send({ command: 'ping' });
					// Start heartbeat ping interval
					this.startPingInterval();
					resolve();
				});

				this.ws.addEventListener('message', (event) => {
					this.handleMessage(event.data);
				});

				this.ws.addEventListener('error', (event) => {
					websocketLog.error('Websocket error', objectify({ error: event }));
					reject(new Error('WebSocket connection error'));
				});

				this.ws.addEventListener('close', () => {
					this.stopPingInterval();
					if (this.shouldReconnect) {
						websocketLog.warn('⚠️ Connection lost - reconnecting...');
						this.scheduleReconnect();
					} else {
						websocketLog.debug('Websocket connection closed (no reconnect scheduled)');
					}
				});
			} catch (error) {
				websocketLog.error('Failed to create websocket connection', objectify({ error }));
				reject(error);
			}
		});
	}

	/**
	 * Handle incoming websocket messages
	 */
	private handleMessage(data: string | Buffer): void {
		try {
			const dataStr = typeof data === 'string' ? data : data.toString();
			const message: WSMessage = JSON.parse(dataStr);

			if (message.command === 'pong') {
				websocketLog.debug('Received pong from server');
				return;
			}

			if (message.command === 'epoch') {
				websocketLog.info('⏰ Epoch changed', {
					epoch: (message as EpochMessage).epoch
				});
				this.droplets.clear();
				if (this.onEpochChange) {
					this.onEpochChange();
				}
				return;
			}

			if (message.command === 'validscraps') {
				const msg = message as DropletMessage;

				if (msg.status === 'processed' && msg.droplet) {
					// Add full droplet object to account's list
					const account = msg.droplet.owner;
					if (!this.droplets.has(account)) {
						this.droplets.set(account, []);
					}
					this.droplets.get(account)?.push(msg.droplet as Droplet);

					if (msg.count % 100 === 0) {
						websocketLog.debug('Receiving droplets', { account, count: msg.count });
					}
				} else if (msg.status === 'complete') {
					websocketLog.debug('Droplet streaming complete', { totalDroplets: msg.count });

					// Notify waiting sync operations
					for (const [account, callback] of this.completionCallbacks.entries()) {
						callback(msg.count);
					}
					this.completionCallbacks.clear();
				} else if (msg.status === 'processing') {
					websocketLog.debug('Server is still processing droplets, waiting...');
				}
			}
		} catch (error) {
			websocketLog.error('Failed to parse websocket message', objectify({ error }));
		}
	}

	/**
	 * Start heartbeat ping interval to keep connection alive
	 */
	private startPingInterval(): void {
		this.stopPingInterval(); // Clear any existing interval
		this.pingInterval = setInterval(() => {
			if (this.isConnected()) {
				websocketLog.debug('Sending heartbeat ping');
				this.send({ command: 'ping' });
			}
		}, this.pingIntervalMs);
	}

	/**
	 * Stop heartbeat ping interval
	 */
	private stopPingInterval(): void {
		if (this.pingInterval) {
			clearInterval(this.pingInterval);
			this.pingInterval = null;
		}
	}

	/**
	 * Schedule reconnection attempt
	 */
	private scheduleReconnect(): void {
		if (this.reconnectTimer) return;

		websocketLog.debug('Scheduling reconnection', { delay: this.reconnectDelay });
		this.reconnectTimer = setTimeout(async () => {
			this.reconnectTimer = null;
			try {
				await this.connect();
			} catch (error) {
				websocketLog.error('❌ Reconnection failed', objectify({ error }));
			}
		}, this.reconnectDelay);
	}

	/**
	 * Send message to websocket
	 */
	private send(message: any): void {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(message));
		} else {
			websocketLog.warn('Cannot send message, websocket not connected');
		}
	}

	/**
	 * Subscribe to valid scraps for an account
	 */
	subscribeToAccount(account: string): void {
		websocketLog.debug('Subscribing to valid scraps', { account });
		this.droplets.set(account, []); // Initialize empty array
		this.send({ command: 'validscraps', account });
	}

	/**
	 * Wait for droplet streaming to complete
	 */
	waitForCompletion(account: string, timeout = 30000): Promise<number> {
		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				this.completionCallbacks.delete(account);
				reject(new Error(`Timeout waiting for droplet sync after ${timeout}ms`));
			}, timeout);

			this.completionCallbacks.set(account, (count: number) => {
				clearTimeout(timeoutId);
				resolve(count);
			});
		});
	}

	/**
	 * Get cached droplets for an account
	 */
	getDroplets(account: string): Droplet[] {
		return this.droplets.get(account) || [];
	}

	/**
	 * Clear droplets for an account (after claiming)
	 */
	clearDroplets(account: string): void {
		this.droplets.delete(account);
	}

	/**
	 * Check if websocket is connected
	 */
	isConnected(): boolean {
		return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
	}

	/**
	 * Close websocket connection permanently (disable reconnection)
	 */
	close(): void {
		websocketLog.debug('Closing websocket connection');
		this.stopPingInterval();
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
	}

	/**
	 * Destroy websocket and prevent reconnection (for shutdown)
	 */
	destroy(): void {
		websocketLog.debug('Destroying websocket connection (no reconnect)');
		this.shouldReconnect = false; // Disable reconnection
		this.stopPingInterval();
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
	}
}
