/**
 * Destroy Operations Module
 *
 * Handles destruction of droplets with validation, batching, and transaction building.
 */

import { UInt64 } from '@wharfkit/antelope';
import type { Session } from '@wharfkit/session';
import { generalLog } from '../logger';
import { buildDestroyAction } from '../actions/drops';
import { executeTransactionOrThrow } from '../transaction';
import { processBatches } from '../batch';
import { fetchDropletIds } from '../api';
import type { Config } from '../config';

/**
 * Validate and convert droplet IDs from strings to UInt64 array
 */
function validateDropletIds(ids: string[]): UInt64[] {
	if (ids.length === 0) {
		throw new Error('At least one droplet ID is required');
	}

	try {
		return ids.map((id) => {
			const trimmed = id.trim();
			if (!trimmed) {
				throw new Error('Empty droplet ID provided');
			}
			return UInt64.from(trimmed);
		});
	} catch (error) {
		throw new Error(`Invalid droplet ID format: ${error.message}`);
	}
}

/**
 * Destroy droplets for a single account with automatic batching
 *
 * @param session - Wharf session for the account
 * @param dropletIds - Array of droplet ID strings
 * @param options - Optional parameters
 * @returns Array of transaction IDs (one per batch)
 */
export async function destroyDroplets(
	session: Session,
	dropletIds: string[],
	options: {
		memo?: string;
		toNotify?: string;
		dryRun?: boolean;
	} = {}
): Promise<string[]> {
	const account = String(session.actor);

	// Validate and convert droplet IDs
	const ids = validateDropletIds(dropletIds);

	generalLog.info('Starting destroy operation', {
		account,
		dropletCount: ids.length,
		memo: options.memo,
		toNotify: options.toNotify,
		dryRun: options.dryRun || false
	});

	try {
		const txIds: string[] = [];

		// Process in batches using shared utility
		const results = await processBatches(
			ids,
			async (batch, batchNum, totalBatches) => {
				// Build destroy action
				const action = buildDestroyAction(
					session.actor,
					batch,
					{
						memo: options.memo,
						toNotify: options.toNotify
					}
				);

				// Execute transaction
				const txId = await executeTransactionOrThrow(
					session,
					action,
					{
						broadcast: !options.dryRun,
						logger: generalLog,
						logContext: { batch: batchNum, totalBatches },
						description: `Destroy batch ${batchNum}/${totalBatches} (${batch.length} droplets)`
					}
				);

				if (txId) {
					txIds.push(txId);
				}

				// Progress message for multi-batch operations
				if (totalBatches > 1) {
					generalLog.info(`✅ Destroyed batch ${batchNum}/${totalBatches}`, {
						account,
						droplets: batch.length,
						txId
					});
				}

				return txId;
			},
			{
				logger: generalLog,
				logContext: { account },
				continueOnError: false
			}
		);

		// Summary message
		if (txIds.length > 0) {
			if (txIds.length === 1) {
				generalLog.info('✅ Destroy complete', {
					account,
					droplets: ids.length,
					txId: txIds[0]
				});
			} else {
				generalLog.info(`✅ Destroy complete - ${txIds.length} batches`, {
					account,
					droplets: ids.length,
					txIds
				});
			}
		} else if (options.dryRun) {
			generalLog.info('✅ Destroy dry-run complete', {
				account,
				droplets: ids.length
			});
		}

		return txIds;
	} catch (error) {
		generalLog.error('❌ Destroy operation failed', {
			account,
			droplets: dropletIds.length,
			error: error.message
		});
		throw error;
	}
}

/**
 * Destroy a specified amount of droplets for an account
 * 
 * This is a convenience function that fetches droplet IDs from the API
 * and then calls destroyDroplets().
 * 
 * Note: This function queries the SCRAP API directly. It does not use
 * the local cache since it's typically called from CLI commands where
 * no cache exists (cache is only populated by the sync scheduler in
 * daemon mode).
 * 
 * @param session - Wharf session for the account
 * @param amount - Number of droplets to destroy
 * @param config - Configuration with API URL
 * @param options - Optional parameters
 * @returns Array of transaction IDs (one per batch)
 */
export async function destroyDropletsByAmount(
	session: Session,
	amount: number,
	config: Config,
	options: {
		memo?: string;
		toNotify?: string;
		dryRun?: boolean;
	} = {}
): Promise<string[]> {
	const account = String(session.actor);

	// Validate amount
	if (amount <= 0) {
		throw new Error('Amount must be greater than 0');
	}

	generalLog.info('Fetching droplet IDs from API', {
		account,
		amount
	});

	// Fetch droplet IDs from API
	const apiDroplets = await fetchDropletIds(account, config, amount);
	
	if (apiDroplets.length === 0) {
		throw new Error(`No droplets found for account ${account}`);
	}

	// Take only the requested amount (API might return more)
	const dropletIds = apiDroplets.slice(0, amount).map((d) => d._id);

	if (dropletIds.length < amount) {
		generalLog.warn('Fewer droplets available than requested', {
			account,
			requested: amount,
			found: dropletIds.length
		});
	}

	generalLog.info('Droplet IDs fetched, proceeding with destroy', {
		account,
		dropletCount: dropletIds.length
	});

	// Call the existing destroyDroplets function with the fetched IDs
	return await destroyDroplets(session, dropletIds, {
		memo: options.memo,
		toNotify: options.toNotify,
		dryRun: options.dryRun
	});
}
