/**
 * Generate Operations Module
 *
 * Handles generation of bound/unbound droplets with validation, batching, and transaction building.
 */

import type { Session } from '@wharfkit/session';
import { buildGenerateAction } from '../actions/drops';
import { processBatches } from '../batch';
import { generalLog } from '../logger';
import { executeTransactionOrThrow } from '../transaction';

/**
 * Validate amount is within reasonable limits
 */
function validateAmount(amount: number): void {
	if (amount <= 0) {
		throw new Error('Amount must be greater than 0');
	}
}

/**
 * Generate droplets for a single account with automatic batching
 *
 * @param session - Wharf session for the account
 * @param amount - Total number of droplets to generate
 * @param bound - Whether to generate bound (true) or unbound (false) droplets
 * @param options - Optional parameters
 * @returns Array of transaction IDs (one per batch)
 */
export async function generateDroplets(
	session: Session,
	amount: number,
	bound: boolean,
	options: {
		data?: string;
		toNotify?: string;
		dryRun?: boolean;
	} = {}
): Promise<string[]> {
	const account = String(session.actor);

	// Validate amount
	validateAmount(amount);

	generalLog.info('Starting generate operation', {
		account,
		amount,
		bound,
		data: options.data ? 'custom' : 'auto-generated',
		toNotify: options.toNotify,
		dryRun: options.dryRun || false
	});

	try {
		const txIds: string[] = [];

		// Create array of batch amounts (last batch may be smaller)
		const batchAmounts: number[] = [];
		let remaining = amount;
		while (remaining > 0) {
			const batchAmount = Math.min(remaining, 2500); // Use literal instead of CLAIM_BATCH_SIZE to avoid import
			batchAmounts.push(batchAmount);
			remaining -= batchAmount;
		}

		// Process in batches using shared utility
		const results = await processBatches(
			batchAmounts,
			async (batch, batchNum, totalBatches) => {
				const batchAmount = batch[0]; // Each batch item is just a number

				// Build generate action
				const action = buildGenerateAction(session.actor, batchAmount, bound, {
					data: options.data,
					toNotify: options.toNotify
				});

				// Execute transaction
				const txId = await executeTransactionOrThrow(session, action, {
					broadcast: !options.dryRun,
					logger: generalLog,
					logContext: { batch: batchNum, totalBatches },
					description: `Generate batch ${batchNum}/${totalBatches} (${batchAmount} ${bound ? 'bound' : 'unbound'} droplets)`
				});

				if (txId) {
					txIds.push(txId);
				}

				// Progress message for multi-batch operations
				if (totalBatches > 1) {
					generalLog.info(`✅ Generated batch ${batchNum}/${totalBatches}`, {
						account,
						amount: batchAmount,
						bound,
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
				generalLog.info(
					`✅ Generate complete - created ${amount} ${bound ? 'bound' : 'unbound'} droplets`,
					{
						account,
						amount,
						bound,
						txId: txIds[0]
					}
				);
			} else {
				generalLog.info(
					`✅ Generate complete - ${txIds.length} batches, ${amount} ${bound ? 'bound' : 'unbound'} droplets`,
					{
						account,
						amount,
						bound,
						txIds
					}
				);
			}
		} else if (options.dryRun) {
			generalLog.info('✅ Generate dry-run complete', {
				account,
				amount,
				bound
			});
		}

		return txIds;
	} catch (error) {
		generalLog.error('❌ Generate operation failed', {
			account,
			amount,
			bound,
			error: error.message
		});
		throw error;
	}
}
