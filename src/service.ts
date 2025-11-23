/**
 * Scrapminer Service
 *
 * Core service logic with two independent schedulers:
 * 1. Sync Scheduler: Hourly droplet sync from SCRAP API (populates cache)
 * 2. Claim Scheduler: 1-minute claim check (processes from cache)
 */

import type { Session } from '@wharfkit/session';
import { AsyncTask, SimpleIntervalJob, ToadScheduler } from 'toad-scheduler';
import {
	AUTO_RECLAIM,
	BATCH_DELAY,
	CLAIM_INTERVAL,
	SCRAP_API_URL,
	SYNC_INTERVAL,
	SYNC_ON_STARTUP,
	SYNC_TIMEOUT
} from './config';
import { claimFromCache } from './lib/claimer';
import { type AccountConfig, loadAccounts, validateConfig } from './lib/config';
import { claimerLog, generalLog, syncLog } from './lib/logger';
import { syncAllAccounts } from './lib/sync';
import { createSessions } from './lib/wharf';

export interface ServiceOptions {
	useSyncScheduler?: boolean;
	useClaimScheduler?: boolean;
	syncInterval?: number;
	claimInterval?: number;
}

export class ScrapMinerService {
	private syncScheduler?: ToadScheduler;
	private claimScheduler?: ToadScheduler;
	private sessions?: Session[];
	private accounts: AccountConfig[];
	private options: Required<ServiceOptions>;
	private initialized = false;

	constructor(options: ServiceOptions = {}) {
		// Validate environment and load configuration
		validateConfig();
		this.accounts = loadAccounts();

		// Set default options
		this.options = {
			useSyncScheduler: options.useSyncScheduler ?? true,
			useClaimScheduler: options.useClaimScheduler ?? true,
			syncInterval: options.syncInterval ?? SYNC_INTERVAL,
			claimInterval: options.claimInterval ?? CLAIM_INTERVAL
		};
	}

	/**
	 * Initialize sessions by discovering accounts from private keys
	 * Must be called before start()
	 */
	private async initializeSessions(): Promise<void> {
		if (this.initialized) {
			return;
		}

		generalLog.debug('Initializing sessions and discovering accounts from private keys');
		this.sessions = await createSessions(this.accounts);
		this.initialized = true;
	}

	/**
	 * Sync cycle - fetches droplets from SCRAP API and populates cache
	 */
	async runSyncCycle(): Promise<void> {
		if (!this.sessions) {
			throw new Error('Sessions not initialized. Call start() first.');
		}

		try {
			await syncAllAccounts(this.sessions);
		} catch (error) {
			syncLog.error('Sync failed', { error: error.message });
		}
	}

	/**
	 * Claim cycle - checks cache and claims for accounts with droplets
	 */
	async runClaimCycle(): Promise<void> {
		if (!this.sessions) {
			throw new Error('Sessions not initialized. Call start() first.');
		}

		try {
			await claimFromCache(this.sessions);
		} catch (error) {
			claimerLog.error('Claim failed', { error: error.message });
		}
	}

	/**
	 * Initialize sync scheduler - runs hourly to fetch droplets from API
	 */
	private initSyncScheduler(): void {
		if (!this.options.useSyncScheduler) {
			return;
		}

		this.syncScheduler = new ToadScheduler();
		const syncTask = new AsyncTask('sync-droplets', () => this.runSyncCycle());
		const syncJob = new SimpleIntervalJob(
			{
				milliseconds: this.options.syncInterval,
				runImmediately: SYNC_ON_STARTUP
			},
			syncTask,
			{
				id: 'sync-droplets',
				preventOverrun: true // Critical: prevents overlapping executions
			}
		);

		this.syncScheduler.addSimpleIntervalJob(syncJob);
		syncLog.debug('Sync scheduler started', {
			interval: this.options.syncInterval,
			intervalMinutes: this.options.syncInterval / 1000 / 60
		});
	}

	/**
	 * Initialize claim scheduler - runs every minute to check cache and claim
	 */
	private initClaimScheduler(): void {
		if (!this.options.useClaimScheduler) {
			return;
		}

		this.claimScheduler = new ToadScheduler();
		const claimTask = new AsyncTask('claim-from-cache', () => this.runClaimCycle());
		const claimJob = new SimpleIntervalJob(
			{
				milliseconds: this.options.claimInterval,
				runImmediately: false // Don't run immediately - wait for initial sync
			},
			claimTask,
			{
				id: 'claim-from-cache',
				preventOverrun: true // Critical: prevents overlapping executions
			}
		);

		this.claimScheduler.addSimpleIntervalJob(claimJob);
		claimerLog.debug('Claim scheduler started', {
			interval: this.options.claimInterval,
			intervalSeconds: this.options.claimInterval / 1000
		});
	}

	/**
	 * Start the service with two independent schedulers
	 */
	async start(): Promise<void> {
		generalLog.info('🚀 Scrapminer starting', {
			accounts: this.accounts.length,
			syncInterval: `${this.options.syncInterval / 60000}min`,
			claimInterval: `${this.options.claimInterval / 1000}s`
		});

		try {
			// Initialize sessions by discovering accounts from private keys
			await this.initializeSessions();

			// Log discovered accounts
			if (this.sessions) {
				const accounts = this.sessions.map((s) => `${String(s.actor)}@${String(s.permission)}`);
				generalLog.info(`📋 Monitoring ${accounts.length} account${accounts.length > 1 ? 's' : ''}`, {
					accounts
				});
			}

			// Initialize persistent websocket connection
			const { initWebSocket } = await import('./lib/sync');
			await initWebSocket();

			// Initialize sync scheduler (hourly droplet fetch)
			this.initSyncScheduler();

			// Initialize claim scheduler (1-minute cache check)
			this.initClaimScheduler();

			generalLog.info('✅ Service started - monitoring for droplets');

			// If sync runs on startup, trigger an immediate claim check after a short delay
			// This allows the initial sync to complete first
			if (SYNC_ON_STARTUP && this.options.useClaimScheduler) {
				setTimeout(async () => {
					claimerLog.debug('Running initial claim check after startup sync');
					await this.runClaimCycle();
				}, 5000); // 5 second delay to allow sync to complete
			}
		} catch (error) {
			generalLog.error('❌ Startup failed', { error: error.message });
			throw error;
		}
	}

	/**
	 * Stop the service and cleanup resources
	 */
	async stop(): Promise<void> {
		generalLog.info('🛑 Stopping service');

		if (this.syncScheduler) {
			this.syncScheduler.stop();
			syncLog.debug('Sync scheduler stopped');
		}

		if (this.claimScheduler) {
			this.claimScheduler.stop();
			claimerLog.debug('Claim scheduler stopped');
		}

		// Close websocket connection
		const { closeWebSocket } = await import('./lib/sync');
		closeWebSocket();

		generalLog.info('👋 Service stopped');
	}

	/**
	 * Run once mode: Sync and claim all droplets for all accounts until cache is empty
	 *
	 * Process:
	 * 1. For each account, sync droplets from API into cache
	 * 2. Claim all droplets from cache (handles batching and AUTO_RECLAIM)
	 * 3. Continue until all accounts have 0 droplets in cache
	 */
	static async runOnce(): Promise<void> {
		generalLog.info('🎯 Once mode: sync and claim all droplets');

		// Create service without schedulers
		const service = new ScrapMinerService({
			useSyncScheduler: false,
			useClaimScheduler: false
		});

		// Initialize sessions first
		await service.initializeSessions();

		if (!service.sessions) {
			throw new Error('Failed to initialize sessions');
		}

		const { dropletCache } = await import('./lib/cache');
		const { syncAccountDroplets, initWebSocket, closeWebSocket } = await import('./lib/sync');
		const { claimForAccount } = await import('./lib/claimer');

		// Initialize persistent websocket connection
		await initWebSocket();

		// Process each account sequentially
		for (const session of service.sessions) {
			const account = String(session.actor);
			generalLog.debug('Processing account', { account });

			try {
				// Sync droplets for this account
				await syncAccountDroplets(account, SYNC_TIMEOUT);

				// Keep claiming until cache is empty for this account
				let iteration = 0;
				while (dropletCache.hasDroplets(account)) {
					iteration++;
					const dropletIds = dropletCache.get(account);

					claimerLog.debug('Claiming droplets', {
						account,
						iteration,
						dropletsInCache: dropletIds.length
					});

					// Claim droplets (respects CLAIM_BATCH_SIZE and AUTO_RECLAIM)
					const claimedIds = await claimForAccount(session, dropletIds);

					if (claimedIds.length === 0) {
						// No droplets were claimed (might be an error or dry run)
						claimerLog.debug('No droplets claimed, stopping', { account });
						dropletCache.clear(account);
						break;
					}

					// Remove claimed droplets from cache
					dropletCache.remove(account, claimedIds);

					const remaining = dropletCache.get(account).length;
					claimerLog.debug('Batch complete', {
						account,
						iteration,
						claimed: claimedIds.length,
						remaining
					});

					// If no more droplets or AUTO_RECLAIM is disabled, stop
					if (remaining === 0 || !AUTO_RECLAIM) {
						if (remaining > 0 && !AUTO_RECLAIM) {
							claimerLog.debug('AUTO_RECLAIM disabled, stopping', {
								account,
								remaining
							});
						}
						break;
					}

					// Small delay between batches
					if (remaining > 0) {
						await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
					}
				}

				generalLog.debug('Account processing complete', { account });
			} catch (error) {
				generalLog.error('❌ Processing failed', {
					account,
					error: error.message
				});
			}

			// Small delay between accounts
			await new Promise((resolve) => setTimeout(resolve, 2000));
		}

		// Close websocket connection
		closeWebSocket();

		generalLog.info('✅ Once mode complete');
	}

	/**
	 * Sync droplets from SCRAP API and output as JSON (for piping)
	 */
	static async runSync(options: {
		account?: string;
		limit?: string;
		pretty?: boolean;
		revealed?: boolean;
		unrevealed?: boolean;
	}): Promise<void> {
		// Suppress all winston logs by setting transports to silent
		// This ensures only JSON is written to stdout (for piping)
		const winston = await import('winston');
		const { generalLog, configLog, syncLog, websocketLog, cacheLog } = await import('./lib/logger');
		
		const silentTransports = [new winston.transports.Console({ silent: true })];
		generalLog.configure({ transports: silentTransports });
		configLog.configure({ transports: silentTransports });
		syncLog.configure({ transports: silentTransports });
		websocketLog.configure({ transports: silentTransports });
		cacheLog.configure({ transports: silentTransports });

		const { syncAccountDroplets, initWebSocket, closeWebSocket } = await import('./lib/sync');
		const limit = options.limit ? Number(options.limit) : 0;

		// Determine which account to sync
		let targetAccount: string;
		if (options.account) {
			// Use specified account (doesn't need to be configured)
			targetAccount = options.account;
		} else {
			// Discover first configured account from private key
			const accounts = loadAccounts();
			const sessions = await createSessions(accounts);
			targetAccount = String(sessions[0].actor);
		}

		try {
			// Initialize persistent websocket connection
			await initWebSocket();

			// Sync droplets for account
			const dropletIds = await syncAccountDroplets(targetAccount, SYNC_TIMEOUT);

			// Apply filters if specified
			if (options.revealed || options.unrevealed) {
				console.error(
					'Warning: --revealed and --unrevealed filters require full droplet data (not yet implemented)'
				);
			}

			// Apply limit if specified
			let outputIds = dropletIds;
			if (limit > 0 && dropletIds.length > limit) {
				outputIds = dropletIds.slice(0, limit);
			}

			// Output as JSON
			const output = {
				account: targetAccount,
				timestamp: new Date().toISOString(),
				count: outputIds.length,
				total: dropletIds.length,
				droplets: outputIds
			};

			if (options.pretty) {
				console.log(JSON.stringify(output, null, 2));
			} else {
				console.log(JSON.stringify(output));
			}
			
			// Close websocket and exit cleanly
			closeWebSocket();
			process.exit(0);
		} catch (error) {
			console.error('Error syncing droplets:', error.message);
			closeWebSocket();
			process.exit(1);
		}
	}
}
