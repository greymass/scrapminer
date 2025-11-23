/**
 * Droplet Sync Module
 *
 * Fetches valid/claimable droplets from SCRAP API websocket and stores in cache.
 * Runs periodically (hourly) and at startup.
 * 
 * Uses a singleton persistent websocket connection that stays open for the
 * lifetime of the application.
 */

import type { Session } from '@wharfkit/session';
import { SCRAP_API_URL } from '../config';
import { dropletCache } from './cache';
import { syncLog } from './logger';
import { ScrapWebSocket } from './websocket';

// Singleton websocket instance - persists for application lifetime
let websocketInstance: ScrapWebSocket | null = null;

/**
 * Get or create the singleton websocket instance
 */
function getWebSocket(): ScrapWebSocket {
	if (!websocketInstance) {
		syncLog.debug('Creating persistent websocket connection', { url: SCRAP_API_URL });
		websocketInstance = new ScrapWebSocket(SCRAP_API_URL, () => {
			// On epoch change, clear the cache for all accounts
			syncLog.info('⏰ Epoch changed - cache cleared');
			dropletCache.clearAll();
		});
	}
	return websocketInstance;
}

/**
 * Initialize websocket connection (call on startup)
 */
export async function initWebSocket(): Promise<void> {
	const ws = getWebSocket();
	if (!ws.isConnected()) {
		syncLog.debug('Connecting to SCRAP API websocket');
		await ws.connect();
	}
}

/**
 * Close websocket connection (call on shutdown)
 */
export function closeWebSocket(): void {
	if (websocketInstance) {
		websocketInstance.destroy();
		websocketInstance = null;
	}
}

/**
 * Sync droplets for a single account using persistent websocket
 *
 * Process:
 * 1. Ensure websocket is connected
 * 2. Subscribe to account's valid scraps
 * 3. Wait for all droplets to stream in
 * 4. Store in cache
 */
export async function syncAccountDroplets(account: string, timeout = 30000): Promise<string[]> {
	syncLog.debug('Starting droplet sync', { account, timeout });

	const ws = getWebSocket();

	try {
		// Ensure websocket is connected
		if (!ws.isConnected()) {
			syncLog.debug('Websocket not connected, connecting now');
			await ws.connect();
		}

		// Subscribe to account's valid scraps
		ws.subscribeToAccount(account);

		// Wait for streaming to complete
		syncLog.debug('Waiting for droplets to stream', { account, timeout });
		const totalCount = await ws.waitForCompletion(account, timeout);

		// Get droplets from websocket cache
		const dropletIds = ws.getDroplets(account);

		// Store in cache
		dropletCache.set(account, dropletIds);

		// Only log if droplets found
		if (dropletIds.length > 0) {
			syncLog.info('Synced droplets', {
				account,
				droplets: dropletIds.length
			});
		} else {
			syncLog.debug('No droplets found', { account });
		}

		return dropletIds;
	} catch (error) {
		syncLog.error('Droplet sync failed', {
			account,
			error: error.message
		});
		throw error;
	}
}

/**
 * Sync droplets for all accounts sequentially
 */
export async function syncAllAccounts(sessions: Session[]): Promise<void> {
	syncLog.debug('Starting sync for all accounts', { accountCount: sessions.length });

	const results: Record<string, number> = {};
	let totalDroplets = 0;

	for (const session of sessions) {
		const account = String(session.actor);

		try {
			const dropletIds = await syncAccountDroplets(account);
			results[account] = dropletIds.length;
			totalDroplets += dropletIds.length;

			// Small delay between accounts to be nice to the API
			await sleep(2000);
		} catch (error) {
			syncLog.error('Sync failed', {
				account,
				error: error.message
			});
			results[account] = -1; // Indicate failure
		}
	}

	// Only log summary if droplets found
	if (totalDroplets > 0) {
		syncLog.info('Sync complete', { total: totalDroplets, accounts: results });
	} else {
		syncLog.debug('Sync complete - no droplets found', { results });
	}
}

/**
 * Helper: sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
