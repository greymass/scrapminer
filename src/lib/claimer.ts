/**
 * Claim Operations Module
 *
 * Handles the core claim logic: batch processing, transaction building,
 * and multi-account coordination.
 */

import { UInt32, UInt64 } from '@wharfkit/antelope';
import type { Session } from '@wharfkit/session';
import {
	AUTO_GENERATE,
	AUTO_RECLAIM,
	BATCH_DELAY,
	CLAIM_BATCH_SIZE,
	CLAIM_ENABLED,
	SCRAP_CONTRACT
} from '../config';
import { claimerLog } from './logger';
import { objectify } from './utils';
import { dropsContract } from './wharf';

/**
 * Claim SCRAP tokens for a single account session using cached droplets
 */
export async function claimForAccount(session: Session, dropletIds: string[]): Promise<string[]> {
	const account = String(session.actor);

	if (dropletIds.length === 0) {
		claimerLog.debug('No claimable droplets', { account });
		return [];
	}

	try {
		const batches = Math.ceil(dropletIds.length / CLAIM_BATCH_SIZE);
		claimerLog.debug('Starting claim process', {
			account,
			totalDroplets: dropletIds.length,
			batches
		});

		const claimedIds: string[] = [];
		const txIds: string[] = [];
		let batchNum = 0;

		// Process in batches
		let offset = 0;
		while (offset < dropletIds.length) {
			batchNum++;
			const batch = dropletIds.slice(offset, offset + CLAIM_BATCH_SIZE);

			try {
				const txId = await claimBatch(session, batch, batchNum);
				if (txId) {
					txIds.push(txId);
				}
				claimedIds.push(...batch);
				offset += batch.length;

				// Simple progress message for multi-batch claims
				if (batches > 1) {
					claimerLog.info(`Claimed batch ${batchNum}/${batches}`, {
						account,
						droplets: batch.length,
						remaining: dropletIds.length - offset,
						txId
					});
				}

				// If more batches remain and AUTO_RECLAIM is enabled
				if (offset < dropletIds.length && AUTO_RECLAIM) {
					claimerLog.debug('Waiting before next batch', {
						account,
						delay: BATCH_DELAY
					});
					await sleep(BATCH_DELAY);
				} else if (offset < dropletIds.length) {
					claimerLog.info('AUTO_RECLAIM disabled', {
						account,
						remaining: dropletIds.length - offset
					});
					break;
				}
			} catch (error) {
				claimerLog.error('Claim failed', {
					account,
					batch: batchNum,
					error: error.message
				});

				// Don't continue to next batch on error
				break;
			}
		}

		// Summary message with transaction IDs
		if (claimedIds.length > 0) {
			const autoGenSuffix = AUTO_GENERATE ? ' + regenerated' : '';
			
			if (txIds.length === 1) {
				// Single transaction
				claimerLog.info(`✅ Claimed ${claimedIds.length} droplets${autoGenSuffix}`, { 
					account,
					txId: txIds[0]
				});
			} else if (txIds.length > 1) {
				// Multiple transactions
				claimerLog.info(`✅ Claimed ${claimedIds.length} droplets in ${txIds.length} transactions${autoGenSuffix}`, { 
					account,
					txIds
				});
			} else {
				// Dry run mode
				claimerLog.info(`✅ Claimed ${claimedIds.length} droplets (DRY RUN)`, { account });
			}
		}

		return claimedIds;
	} catch (error) {
		claimerLog.error('Claim process failed', {
			account,
			error: error.message
		});
	}
}

/**
 * Claim a single batch of droplets
 * @returns Transaction ID if successful, null if dry run
 */
async function claimBatch(session: Session, dropletIds: string[], batchNum: number): Promise<string | null> {
	const account = String(session.actor);

	// Convert droplet IDs to UInt64
	const ids = dropletIds.map((id) => UInt64.from(id));

	// Build destroy action with CRITICAL to_notify parameter
	const destroyAction = dropsContract.action('destroy', {
		owner: session.actor,
		drops_ids: ids,
		memo: `scrapminer batch ${batchNum}`,
		to_notify: SCRAP_CONTRACT // CRITICAL: triggers SCRAP minting
	});

	// Build actions array - add generate after destroy if AUTO_GENERATE enabled
	const actions = [destroyAction];
	
	if (AUTO_GENERATE) {
		// Generate the same number of unbound droplets that were destroyed
		const generateAction = dropsContract.action('generate', {
			owner: session.actor,
			bound: false, // Always generate unbound (destroyed drops yield SCRAP)
			amount: UInt32.from(ids.length),
			data: ''
			// Note: to_notify is optional, omitting it for now
		});
		actions.push(generateAction);
		
		claimerLog.debug('AUTO_GENERATE enabled - will regenerate droplets', {
			account,
			batch: batchNum,
			droplets: ids.length
		});
	}

	// Safety check: CLAIM_ENABLED must be true to broadcast
	if (!CLAIM_ENABLED) {
		claimerLog.warn(
			'DRY RUN: Transaction not broadcast (CLAIM_ENABLED=false)',
			objectify({
				account,
				batch: batchNum,
				droplets: ids.length,
				actions: AUTO_GENERATE ? 'destroy + generate' : 'destroy',
				toNotify: SCRAP_CONTRACT
			})
		);
		return null;
	}

	claimerLog.debug(
		'Broadcasting transaction',
		objectify({
			account,
			batch: batchNum,
			droplets: ids.length,
			actions: AUTO_GENERATE ? 'destroy + generate' : 'destroy',
			toNotify: SCRAP_CONTRACT
		})
	);

	// Execute transaction with one or more actions
	const result = AUTO_GENERATE 
		? await session.transact({ actions }) // Multiple actions
		: await session.transact({ action: destroyAction }); // Single action
	const txId = String(result.response?.transaction_id || '');

	claimerLog.debug(
		'Transaction broadcast successfully',
		objectify({
			account,
			batch: batchNum,
			transactionId: txId,
			droplets: ids.length,
			autoGenerate: AUTO_GENERATE
		})
	);

	return txId;
}

/**
 * Check cache and claim for all accounts that have droplets
 */
export async function claimFromCache(sessions: Session[]): Promise<void> {
	const { dropletCache } = await import('./cache');

	claimerLog.debug('Starting claim cycle from cache', { accounts: sessions.length });

	const cacheStats = dropletCache.getStats();
	const accountsWithDroplets = Object.entries(cacheStats).filter(([_, stats]) => stats.count > 0);

	if (accountsWithDroplets.length === 0) {
		claimerLog.debug('No cached droplets to claim');
		return;
	}

	claimerLog.debug('Accounts with droplets', {
		count: accountsWithDroplets.length,
		accounts: accountsWithDroplets.map(([account, stats]) => ({
			account,
			droplets: stats.count
		}))
	});

	for (const session of sessions) {
		const account = String(session.actor);
		const dropletIds = dropletCache.get(account);

		if (dropletIds.length > 0) {
			try {
				const claimedIds = await claimForAccount(session, dropletIds);

				// Remove claimed droplets from cache
				if (claimedIds.length > 0) {
					dropletCache.remove(account, claimedIds);
				}
			} catch (error) {
				claimerLog.error('Claim failed', {
					account,
					error: error.message
				});
			}

			// Small delay between accounts to avoid rate limits
			await sleep(1000);
		}
	}

	claimerLog.debug('Claim cycle completed');
}

/**
 * Helper: sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
