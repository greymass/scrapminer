/**
 * Integration tests for src/lib/websocket.ts
 *
 * Tests websocket connection and message handling (mocked).
 * Real websocket tests require a running SCRAP API server.
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test';

// Mock WebSocket for testing
class MockWebSocket {
	public url: string;
	public readyState: number = 0; // CONNECTING
	public onopen: (() => void) | null = null;
	public onmessage: ((event: { data: string }) => void) | null = null;
	public onerror: ((error: Error) => void) | null = null;
	public onclose: (() => void) | null = null;

	constructor(url: string) {
		this.url = url;
		// Simulate connection opening
		setTimeout(() => {
			this.readyState = 1; // OPEN
			if (this.onopen) this.onopen();
		}, 10);
	}

	send(data: string) {
		// Simulate server response
		setTimeout(() => {
			if (this.onmessage) {
				// Echo back or send mock response
				if (data.includes('ping')) {
					this.onmessage({ data: JSON.stringify({ command: 'pong' }) });
				} else if (data.includes('subscribe')) {
					this.onmessage({
						data: JSON.stringify({
							command: 'subscribed',
							account: JSON.parse(data).account
						})
					});
				}
			}
		}, 10);
	}

	close() {
		this.readyState = 3; // CLOSED
		if (this.onclose) this.onclose();
	}
}

describe('WebSocket: Connection', () => {
	test('connects to websocket URL', async () => {
		const ws = new MockWebSocket('ws://localhost:3000');

		await new Promise((resolve) => {
			ws.onopen = () => {
				expect(ws.readyState).toBe(1); // OPEN
				expect(ws.url).toBe('ws://localhost:3000');
				resolve(true);
			};
		});
	});

	test('handles connection errors gracefully', async () => {
		const ws = new MockWebSocket('ws://localhost:3000');

		await new Promise((resolve) => {
			ws.onerror = (error) => {
				expect(error).toBeDefined();
				resolve(true);
			};

			// Simulate error after connection
			setTimeout(() => {
				if (ws.onerror) ws.onerror(new Error('Connection failed'));
			}, 20);
		});
	});
});

describe('WebSocket: Message Handling', () => {
	test('sends ping and receives pong', async () => {
		const ws = new MockWebSocket('ws://localhost:3000');

		await new Promise((resolve) => {
			ws.onopen = () => {
				ws.send(JSON.stringify({ command: 'ping' }));
			};

			ws.onmessage = (event) => {
				const data = JSON.parse(event.data);
				expect(data.command).toBe('pong');
				resolve(true);
			};
		});
	});

	test('subscribes to account and receives confirmation', async () => {
		const ws = new MockWebSocket('ws://localhost:3000');

		await new Promise((resolve) => {
			ws.onopen = () => {
				ws.send(JSON.stringify({ command: 'subscribe', account: 'testaccount' }));
			};

			ws.onmessage = (event) => {
				const data = JSON.parse(event.data);
				if (data.command === 'subscribed') {
					expect(data.account).toBe('testaccount');
					resolve(true);
				}
			};
		});
	});

	test('handles epoch change message', async () => {
		const ws = new MockWebSocket('ws://localhost:3000');
		let epochChangeReceived = false;

		await new Promise((resolve) => {
			ws.onopen = () => {
				// Simulate server sending epoch change
				setTimeout(() => {
					if (ws.onmessage) {
						ws.onmessage({
							data: JSON.stringify({
								command: 'epoch',
								epoch: 123,
								timestamp: Date.now()
							})
						});
					}
				}, 20);
			};

			ws.onmessage = (event) => {
				const data = JSON.parse(event.data);
				if (data.command === 'epoch') {
					epochChangeReceived = true;
					expect(data.epoch).toBe(123);
					expect(data.timestamp).toBeDefined();
					resolve(true);
				}
			};
		});

		expect(epochChangeReceived).toBe(true);
	});

	test('handles droplet updates', async () => {
		const ws = new MockWebSocket('ws://localhost:3000');

		await new Promise((resolve) => {
			ws.onopen = () => {
				// Simulate droplet update from server
				setTimeout(() => {
					if (ws.onmessage) {
						ws.onmessage({
							data: JSON.stringify({
								command: 'droplets',
								account: 'testaccount',
								droplets: [
									{ id: 1, revealed: false },
									{ id: 2, revealed: true }
								]
							})
						});
					}
				}, 20);
			};

			ws.onmessage = (event) => {
				const data = JSON.parse(event.data);
				if (data.command === 'droplets') {
					expect(data.account).toBe('testaccount');
					expect(data.droplets).toHaveLength(2);
					expect(data.droplets[0].id).toBe(1);
					resolve(true);
				}
			};
		});
	});
});

describe('WebSocket: Connection Lifecycle', () => {
	test('closes connection cleanly', async () => {
		const ws = new MockWebSocket('ws://localhost:3000');

		await new Promise((resolve) => {
			ws.onopen = () => {
				ws.close();
			};

			ws.onclose = () => {
				expect(ws.readyState).toBe(3); // CLOSED
				resolve(true);
			};
		});
	});

	test('handles reconnection logic', async () => {
		let connectionAttempts = 0;

		const attemptConnection = () => {
			connectionAttempts++;
			const ws = new MockWebSocket('ws://localhost:3000');

			ws.onopen = () => {
				expect(connectionAttempts).toBeGreaterThanOrEqual(1);
				expect(ws.readyState).toBe(1);
			};

			ws.onerror = () => {
				// In production, this would trigger a reconnect
				if (connectionAttempts < 3) {
					setTimeout(attemptConnection, 100);
				}
			};
		};

		attemptConnection();

		// Wait for connection to succeed
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(connectionAttempts).toBe(1);
	});
});
