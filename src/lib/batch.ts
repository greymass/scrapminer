/**
 * Generic Batch Processing Utility
 *
 * Provides reusable batching logic for any operation that needs to split
 * large datasets into smaller chunks with delays between batches.
 */

import type { Logger } from 'winston';
import { BATCH_DELAY, CLAIM_BATCH_SIZE } from '../config';

/**
 * Helper: sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Configuration for batch processing
 */
export interface BatchConfig {
	/**
	 * Maximum number of items per batch
	 * @default CLAIM_BATCH_SIZE (from env)
	 */
	batchSize?: number;

	/**
	 * Delay in milliseconds between batches
	 * @default BATCH_DELAY (from env)
	 */
	batchDelay?: number;

	/**
	 * Whether to stop on first error or continue
	 * @default false (stop on error)
	 */
	continueOnError?: boolean;

	/**
	 * Logger instance for progress/error messages
	 */
	logger?: Logger;

	/**
	 * Context for logging (e.g. { account: 'myaccount' })
	 */
	logContext?: Record<string, any>;
}

/**
 * Result from processing a single batch
 */
export interface BatchResult<R> {
	batchNum: number;
	result: R;
	itemsProcessed: number;
}

/**
 * Process items in batches with automatic splitting, delays, and error handling
 *
 * @param items - Array of items to process
 * @param processBatch - Function to process a single batch
 * @param config - Batch configuration
 * @returns Array of batch results
 *
 * @example
 * ```typescript
 * const dropletIds = ['123', '456', '789'];
 * const results = await processBatches(
 *   dropletIds,
 *   async (batch, batchNum, totalBatches) => {
 *     return await destroyDroplets(session, batch);
 *   },
 *   { 
 *     batchSize: 500,
 *     logger: myLogger,
 *     logContext: { account: 'myaccount' }
 *   }
 * );
 * ```
 */
export async function processBatches<T, R>(
	items: T[],
	processBatch: (
		batch: T[],
		batchNum: number,
		totalBatches: number
	) => Promise<R>,
	config: BatchConfig = {}
): Promise<BatchResult<R>[]> {
	const {
		batchSize = CLAIM_BATCH_SIZE,
		batchDelay = BATCH_DELAY,
		continueOnError = false,
		logger,
		logContext = {}
	} = config;

	const totalBatches = Math.ceil(items.length / batchSize);
	const results: BatchResult<R>[] = [];

	if (logger) {
		logger.debug('Starting batch processing', {
			...logContext,
			totalItems: items.length,
			batchSize,
			totalBatches
		});
	}

	let offset = 0;
	let batchNum = 0;

	while (offset < items.length) {
		batchNum++;
		const batch = items.slice(offset, offset + batchSize);

		try {
			const result = await processBatch(batch, batchNum, totalBatches);
			
			results.push({
				batchNum,
				result,
				itemsProcessed: batch.length
			});

			offset += batch.length;

			// Delay between batches if more remain
			if (offset < items.length) {
				if (logger) {
					logger.debug('Waiting before next batch', {
						...logContext,
						delay: batchDelay,
						remaining: items.length - offset
					});
				}
				await sleep(batchDelay);
			}
		} catch (error) {
			if (logger) {
				logger.error(`Batch ${batchNum}/${totalBatches} failed`, {
					...logContext,
					error: error.message
				});
			}

			if (!continueOnError) {
				throw error;
			}

			// Continue to next batch even on error
			offset += batch.length;
		}
	}

	if (logger) {
		logger.debug('Batch processing complete', {
			...logContext,
			totalBatches: results.length,
			totalItemsProcessed: results.reduce((sum, r) => sum + r.itemsProcessed, 0)
		});
	}

	return results;
}

/**
 * Calculate batch statistics for planning
 */
export function calculateBatchStats(
	totalItems: number,
	batchSize: number = CLAIM_BATCH_SIZE
): {
	totalBatches: number;
	fullBatches: number;
	lastBatchSize: number;
	estimatedTime: (delayMs?: number) => number;
} {
	const totalBatches = Math.ceil(totalItems / batchSize);
	const fullBatches = Math.floor(totalItems / batchSize);
	const lastBatchSize = totalItems % batchSize || batchSize;

	return {
		totalBatches,
		fullBatches,
		lastBatchSize,
		estimatedTime: (delayMs = BATCH_DELAY) => {
			// Time = (batches - 1) * delay (no delay after last batch)
			return totalBatches > 1 ? (totalBatches - 1) * delayMs : 0;
		}
	};
}
