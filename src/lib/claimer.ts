/**
 * Claim Operations Module
 *
 * Handles the core claim logic: batch processing, transaction building,
 * and multi-account coordination.
 */

import type { Session } from '@wharfkit/session';
import { AUTO_GENERATE, AUTO_RECLAIM, BATCH_DELAY, DRY_RUN } from '../config';
import { buildDestroyAction, buildDestroyAndRegenerateActions } from './actions/drops';
import { processBatches } from './batch';
import type { Droplet } from './cache';
import { claimerLog } from './logger';
import { executeTransactionOrThrow } from './transaction';

/**
 * Claim SCRAP tokens for a single account session using cached droplets
 */
export async function claimForAccount(session: Session, droplets: Droplet[]): Promise<string[]> {
	const account = String(session.actor);

	if (droplets.length === 0) {
		claimerLog.debug('No claimable droplets', { account });
		return [];
	}

	// Track claimed IDs and transaction IDs at function scope
	const claimedIds: string[] = [];
	const txIds: string[] = [];

	try {
		claimerLog.debug('Starting claim process', {
			account,
			totalDroplets: droplets.length
		});

		// Process in batches using shared utility
		const results = await processBatches(
			droplets,
			async (batch, batchNum, totalBatches) => {
				const txId = await claimBatch(session, batch, batchNum, totalBatches);

				// Track claimed IDs
				claimedIds.push(...batch.map((d) => d._id));
				if (txId) {
					txIds.push(txId);
				}

				// Progress message for multi-batch claims
				if (totalBatches > 1) {
					claimerLog.info(`Claimed batch ${batchNum}/${totalBatches}`, {
						account,
						droplets: batch.length,
						remaining: droplets.length - claimedIds.length,
						txId
					});
				}

				// Check AUTO_RECLAIM before continuing
				if (claimedIds.length < droplets.length && !AUTO_RECLAIM) {
					claimerLog.info('AUTO_RECLAIM disabled', {
						account,
						remaining: droplets.length - claimedIds.length
					});
					// Stop processing by throwing special error
					throw new Error('AUTO_RECLAIM_DISABLED');
				}

				return txId;
			},
			{
				logger: claimerLog,
				logContext: { account },
				continueOnError: false // Stop on first error
			}
		);

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
				claimerLog.info(
					`✅ Claimed ${claimedIds.length} droplets in ${txIds.length} transactions${autoGenSuffix}`,
					{
						account,
						txIds
					}
				);
			} else {
				// Dry run mode
				claimerLog.info(`✅ Claimed ${claimedIds.length} droplets (DRY RUN)`, {
					account
				});
			}
		}

		return claimedIds;
	} catch (error) {
		// Ignore AUTO_RECLAIM_DISABLED error - it's intentional
		if (error.message === 'AUTO_RECLAIM_DISABLED') {
			return claimedIds;
		}

		claimerLog.error('Claim process failed', {
			account,
			error: error.message
		});
		return [];
	}
}

/**
 * Claim a single batch of droplets
 * @returns Transaction ID if successful, null if dry run
 */
async function claimBatch(
	session: Session,
	droplets: Droplet[],
	batchNum: number,
	totalBatches: number
): Promise<string | null> {
	const account = String(session.actor);

	// Build actions using shared utilities
	const actions = AUTO_GENERATE
		? buildDestroyAndRegenerateActions(session.actor, droplets, {
				memo: `scrapminer batch ${batchNum}`
			})
		: [
				buildDestroyAction(
					session.actor,
					droplets.map((d) => d._id),
					{ memo: `scrapminer batch ${batchNum}` }
				)
			];

	// Log AUTO_GENERATE details if enabled
	if (AUTO_GENERATE) {
		const boundCount = droplets.filter((d) => d.bound === true).length;
		const unboundCount = droplets.filter((d) => d.bound === false).length;

		claimerLog.debug('AUTO_GENERATE enabled - will regenerate droplets', {
			account,
			batch: batchNum,
			bound: boundCount,
			unbound: unboundCount,
			total: droplets.length
		});
	}

	// Execute transaction using shared utility
	const txId = await executeTransactionOrThrow(session, actions, {
		broadcast: !DRY_RUN,
		logger: claimerLog,
		logContext: { batch: batchNum, totalBatches },
		description: `Claim batch ${batchNum}/${totalBatches} (${droplets.length} droplets)`
	});

	return txId;
}

/**
 * Check cache and claim for all accounts that have droplets
 */
export async function claimFromCache(sessions: Session[]): Promise<void> {
	const { dropletCache } = await import('./cache');

	claimerLog.debug('Starting claim cycle from cache', {
		accounts: sessions.length
	});

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
		const droplets = dropletCache.get(account);

		if (droplets.length > 0) {
			try {
				const claimedIds = await claimForAccount(session, droplets);

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
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
	}

	claimerLog.debug('Claim cycle completed');
}
