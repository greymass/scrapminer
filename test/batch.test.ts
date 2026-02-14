/**
 * Unit tests for src/lib/batch.ts
 *
 * Tests the generic batch processing utility for correct splitting,
 * delays, error handling, and logging.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { processBatches, calculateBatchStats } from '../src/lib/batch';
import { MockLogger } from './mocks/logger';
import { assertInRange, assertExecutionTime } from './helpers/assertions';

describe('Batch: processBatches()', () => {
	let mockLogger: MockLogger;

	beforeEach(() => {
		mockLogger = new MockLogger();
	});

	test('processes single batch', async () => {
		const items = [1, 2, 3];
		const processor = async (batch: number[]) => batch.reduce((sum, n) => sum + n, 0);

		const results = await processBatches(items, processor, {
			batchSize: 10,
			logger: mockLogger.logger,
		});

		expect(results).toHaveLength(1);
		expect(results[0].batchNum).toBe(1);
		expect(results[0].result).toBe(6); // 1 + 2 + 3
		expect(results[0].itemsProcessed).toBe(3);
	});

	test('splits into multiple batches', async () => {
		const items = Array.from({ length: 15 }, (_, i) => i + 1);
		const processor = async (batch: number[]) => batch.length;

		const results = await processBatches(items, processor, {
			batchSize: 5,
			batchDelay: 0,
			logger: mockLogger.logger,
		});

		// Should have 3 batches: [0-4], [5-9], [10-14]
		expect(results).toHaveLength(3);
		expect(results[0].itemsProcessed).toBe(5);
		expect(results[1].itemsProcessed).toBe(5);
		expect(results[2].itemsProcessed).toBe(5);
	});

	test('handles uneven last batch', async () => {
		const items = Array.from({ length: 12 }, (_, i) => i + 1);
		const processor = async (batch: number[]) => batch.length;

		const results = await processBatches(items, processor, {
			batchSize: 5,
			batchDelay: 0,
		});

		// Should have 3 batches: 5 + 5 + 2
		expect(results).toHaveLength(3);
		expect(results[0].itemsProcessed).toBe(5);
		expect(results[1].itemsProcessed).toBe(5);
		expect(results[2].itemsProcessed).toBe(2);
	});

	test('handles empty array', async () => {
		const processor = async (batch: any[]) => batch.length;

		const results = await processBatches([], processor, {
			batchSize: 5,
			logger: mockLogger.logger,
		});

		expect(results).toHaveLength(0);
		expect(mockLogger.hasMessageContaining('Starting batch processing')).toBe(true);
		expect(mockLogger.hasMessageContaining('complete')).toBe(true);
	});

	test('passes batch number and total to processor', async () => {
		const items = Array.from({ length: 10 }, (_, i) => i);
		const batchInfo: Array<{ num: number; total: number }> = [];

		const processor = async (
			batch: number[],
			batchNum: number,
			totalBatches: number
		) => {
			batchInfo.push({ num: batchNum, total: totalBatches });
			return batch.length;
		};

		await processBatches(items, processor, {
			batchSize: 3,
			batchDelay: 0,
		});

		// Should have 4 batches
		expect(batchInfo).toHaveLength(4);
		expect(batchInfo[0]).toEqual({ num: 1, total: 4 });
		expect(batchInfo[1]).toEqual({ num: 2, total: 4 });
		expect(batchInfo[2]).toEqual({ num: 3, total: 4 });
		expect(batchInfo[3]).toEqual({ num: 4, total: 4 });
	});

	test('applies delay between batches', async () => {
		const items = [1, 2, 3, 4];
		const processor = async (batch: number[]) => batch.length;

		await assertExecutionTime(
			async () => {
				await processBatches(items, processor, {
					batchSize: 2,
					batchDelay: 100, // 100ms delay
				});
			},
			200, // 2 batches = 1 delay = 100ms (allow 200ms tolerance)
			150
		);
	});

	test('no delay after last batch', async () => {
		const items = [1, 2, 3];
		const processor = async (batch: number[]) => batch.length;

		// Should complete quickly (no delay after last batch)
		const start = Date.now();
		await processBatches(items, processor, {
			batchSize: 2,
			batchDelay: 100,
		});
		const elapsed = Date.now() - start;

		// Should have 2 batches with 1 delay (100ms)
		// Total time should be ~100ms, not 200ms
		expect(elapsed).toBeLessThan(180);
	});

	test('stops on first error by default', async () => {
		const items = [1, 2, 3, 4, 5];
		const processor = async (batch: number[], batchNum: number) => {
			if (batchNum === 2) {
				throw new Error('Batch 2 failed');
			}
			return batch.length;
		};

		await expect(
			processBatches(items, processor, {
				batchSize: 2,
				batchDelay: 0,
			})
		).rejects.toThrow('Batch 2 failed');
	});

	test('continues on error when configured', async () => {
		const items = [1, 2, 3, 4, 5];
		const processor = async (batch: number[], batchNum: number) => {
			if (batchNum === 2) {
				throw new Error('Batch 2 failed');
			}
			return batch.length;
		};

		const results = await processBatches(items, processor, {
			batchSize: 2,
			batchDelay: 0,
			continueOnError: true,
			logger: mockLogger.logger,
		});

		// Should have 2 successful results (batch 1 and 3)
		// Batch 2 failed but processing continued
		expect(results).toHaveLength(2);
		expect(results[0].batchNum).toBe(1);
		expect(results[1].batchNum).toBe(3);

		// Should log the error
		expect(mockLogger.errors.length).toBeGreaterThan(0);
		expect(mockLogger.hasMessageContaining('failed', 'error')).toBe(true);
	});

	test('logs batch processing progress', async () => {
		const items = [1, 2, 3, 4, 5];
		const processor = async (batch: number[]) => batch.length;

		await processBatches(items, processor, {
			batchSize: 2,
			batchDelay: 0,
			logger: mockLogger.logger,
			logContext: { account: 'testaccount' },
		});

		// Should log start, delays, and completion
		expect(mockLogger.hasMessageContaining('Starting batch processing')).toBe(true);
		expect(mockLogger.hasMessageContaining('complete')).toBe(true);

		// Check log context is included
		const startLog = mockLogger.debugs.find((log) =>
			log.message.includes('Starting')
		);
		expect(startLog?.meta?.account).toBe('testaccount');
	});

	test('uses default batch size from config', async () => {
		const items = Array.from({ length: 1000 }, (_, i) => i);
		const batchSizes: number[] = [];
		const processor = async (batch: number[]) => {
			batchSizes.push(batch.length);
			return batch.length;
		};

		await processBatches(items, processor, {
			batchDelay: 0,
			// No batchSize provided - should use default (500)
		});

		// First batch should be default size (500)
		expect(batchSizes[0]).toBe(500);
	});

	test('processes different data types', async () => {
		interface TestItem {
			id: string;
			value: number;
		}

		const items: TestItem[] = [
			{ id: 'a', value: 1 },
			{ id: 'b', value: 2 },
			{ id: 'c', value: 3 },
		];

		const processor = async (batch: TestItem[]) => {
			return batch.map((item) => item.id).join(',');
		};

		const results = await processBatches(items, processor, {
			batchSize: 2,
			batchDelay: 0,
		});

		expect(results).toHaveLength(2);
		expect(results[0].result).toBe('a,b');
		expect(results[1].result).toBe('c');
	});

	test('returns results in order', async () => {
		const items = [1, 2, 3, 4, 5];
		const processor = async (batch: number[], batchNum: number) => {
			// Simulate varying processing times
			await new Promise((resolve) => setTimeout(resolve, (5 - batchNum) * 10));
			return batchNum;
		};

		const results = await processBatches(items, processor, {
			batchSize: 2,
			batchDelay: 0,
		});

		// Results should be in order despite varying processing times
		expect(results[0].batchNum).toBe(1);
		expect(results[1].batchNum).toBe(2);
		expect(results[2].batchNum).toBe(3);
	});
});

describe('Batch: calculateBatchStats()', () => {
	test('calculates stats for even division', () => {
		const stats = calculateBatchStats(1000, 500);

		expect(stats.totalBatches).toBe(2);
		expect(stats.fullBatches).toBe(2);
		expect(stats.lastBatchSize).toBe(500);
	});

	test('calculates stats for uneven division', () => {
		const stats = calculateBatchStats(1250, 500);

		expect(stats.totalBatches).toBe(3);
		expect(stats.fullBatches).toBe(2);
		expect(stats.lastBatchSize).toBe(250);
	});

	test('calculates stats for single batch', () => {
		const stats = calculateBatchStats(100, 500);

		expect(stats.totalBatches).toBe(1);
		expect(stats.fullBatches).toBe(0);
		expect(stats.lastBatchSize).toBe(100);
	});

	test('calculates stats for exact batch size', () => {
		const stats = calculateBatchStats(500, 500);

		expect(stats.totalBatches).toBe(1);
		expect(stats.fullBatches).toBe(1);
		expect(stats.lastBatchSize).toBe(500);
	});

	test('estimates time for multiple batches', () => {
		const stats = calculateBatchStats(1500, 500);

		// 3 batches = 2 delays
		expect(stats.estimatedTime(100)).toBe(200);
		expect(stats.estimatedTime(500)).toBe(1000);
	});

	test('estimates zero time for single batch', () => {
		const stats = calculateBatchStats(100, 500);

		// 1 batch = 0 delays
		expect(stats.estimatedTime(100)).toBe(0);
	});

	test('uses default batch size', () => {
		const stats = calculateBatchStats(1000);

		// Default batch size from config (500)
		expect(stats.totalBatches).toBe(2);
	});

	test('handles zero items', () => {
		const stats = calculateBatchStats(0, 500);

		expect(stats.totalBatches).toBe(0);
		expect(stats.fullBatches).toBe(0);
		expect(stats.lastBatchSize).toBe(500); // Modulo of 0
		expect(stats.estimatedTime(100)).toBe(0);
	});

	test('handles large numbers', () => {
		const stats = calculateBatchStats(10000, 500);

		expect(stats.totalBatches).toBe(20);
		expect(stats.fullBatches).toBe(20);
		expect(stats.lastBatchSize).toBe(500);
		expect(stats.estimatedTime(1000)).toBe(19000); // 19 delays
	});
});
