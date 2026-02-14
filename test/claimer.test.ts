/**
 * Integration tests for src/lib/claimer.ts
 *
 * Tests claim orchestration logic with mocked dependencies.
 * Low-level operations (batching, transactions, actions) are tested separately.
 */

import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import type { Session } from '@wharfkit/session';
import { createMockSession, MockSessionRecorder } from './mocks/session';
import { createDroplets } from './helpers/fixtures';
import type { Droplet } from '../src/lib/cache';

/**
 * Mock dependencies before importing claimer
 */
const mockProcessBatches = mock(async (items: any[], processor: any, options: any) => {
	// Default: process all items successfully
	const results = [];
	for (let i = 0; i < items.length; i += (options.batchSize || 2500)) {
		const batch = items.slice(i, i + (options.batchSize || 2500));
		const batchNum = Math.floor(i / (options.batchSize || 2500)) + 1;
		const totalBatches = Math.ceil(items.length / (options.batchSize || 2500));
		
		const result = await processor(batch, batchNum, totalBatches);
		results.push(result);
	}
	return results;
});

const mockExecuteTransactionOrThrow = mock(async (session: Session, actions: any[], options: any) => {
	if (!options.broadcast) {
		return null; // DRY_RUN mode
	}
	return `tx-${Date.now()}`;
});

const mockBuildDestroyAction = mock((actor: any, dropletIds: string[], options?: any) => ({
	account: 'drops',
	name: 'destroy',
	authorization: [{ actor: String(actor), permission: 'claim' }],
	data: { owner: String(actor), ids: dropletIds, memo: options?.memo || '' },
}));

const mockBuildDestroyAndRegenerateActions = mock((actor: any, droplets: Droplet[], options?: any) => {
	const boundIds = droplets.filter(d => d.bound).map(d => d._id);
	const unboundIds = droplets.filter(d => !d.bound).map(d => d._id);
	
	return [
		{
			account: 'drops',
			name: 'destroy',
			authorization: [{ actor: String(actor), permission: 'claim' }],
			data: { owner: String(actor), ids: droplets.map(d => d._id), memo: options?.memo || '' },
		},
		{
			account: 'drops',
			name: 'generate',
			authorization: [{ actor: String(actor), permission: 'claim' }],
			data: { owner: String(actor), bound_drops: boundIds.length, unbound_drops: unboundIds.length },
		},
	];
});

// Mock modules
mock.module('../src/lib/batch', () => ({
	processBatches: mockProcessBatches,
}));

mock.module('../src/lib/transaction', () => ({
	executeTransactionOrThrow: mockExecuteTransactionOrThrow,
}));

mock.module('../src/lib/actions/drops', () => ({
	buildDestroyAction: mockBuildDestroyAction,
	buildDestroyAndRegenerateActions: mockBuildDestroyAndRegenerateActions,
}));

// Import after mocking
const { claimForAccount, claimFromCache } = await import('../src/lib/claimer');

describe('claimForAccount', () => {
	let session: Session;

	beforeEach(() => {
		session = createMockSession({ actor: 'testaccount' });
		
		// Reset all mocks
		mockProcessBatches.mockClear();
		mockExecuteTransactionOrThrow.mockClear();
		mockBuildDestroyAction.mockClear();
		mockBuildDestroyAndRegenerateActions.mockClear();
	});

	test('returns empty array when no droplets provided', async () => {
		const result = await claimForAccount(session, []);
		
		expect(result).toEqual([]);
		expect(mockProcessBatches).not.toHaveBeenCalled();
	});

	test('claims droplets successfully (AUTO_GENERATE disabled)', async () => {
		// Mock config: AUTO_GENERATE = false, DRY_RUN = false
		mock.module('../src/config', () => ({
			AUTO_GENERATE: false,
			AUTO_RECLAIM: true,
			DRY_RUN: false,
			BATCH_DELAY: 0,
		}));

		const droplets = createDroplets(3, { owner: 'testaccount', bound: true });
		const result = await claimForAccount(session, droplets);

		expect(result).toHaveLength(3);
		expect(result).toEqual(['1', '2', '3']);
		
		// Should call processBatches once
		expect(mockProcessBatches).toHaveBeenCalledTimes(1);
		
		// Should use buildDestroyAction (not regenerate)
		expect(mockBuildDestroyAction).toHaveBeenCalled();
		expect(mockBuildDestroyAndRegenerateActions).not.toHaveBeenCalled();
	});

	test('claims droplets with AUTO_GENERATE enabled', async () => {
		// Mock config: AUTO_GENERATE = true
		mock.module('../src/config', () => ({
			AUTO_GENERATE: true,
			AUTO_RECLAIM: true,
			DRY_RUN: false,
			BATCH_DELAY: 0,
		}));

		const droplets = createDroplets(3, { owner: 'testaccount', bound: true });
		const result = await claimForAccount(session, droplets);

		expect(result).toHaveLength(3);
		
		// Should use buildDestroyAndRegenerateActions
		expect(mockBuildDestroyAndRegenerateActions).toHaveBeenCalled();
		expect(mockBuildDestroyAction).not.toHaveBeenCalled();
	});

	test('respects DRY_RUN mode', async () => {
		// Mock config: DRY_RUN = true
		mock.module('../src/config', () => ({
			AUTO_GENERATE: false,
			AUTO_RECLAIM: true,
			DRY_RUN: true,
			BATCH_DELAY: 0,
		}));

		const droplets = createDroplets(3, { owner: 'testaccount', bound: true });
		const result = await claimForAccount(session, droplets);

		expect(result).toHaveLength(3);
		
		// Should pass broadcast: false to executeTransaction
		expect(mockExecuteTransactionOrThrow).toHaveBeenCalledWith(
			session,
			expect.any(Array),
			expect.objectContaining({ broadcast: false })
		);
	});

	test('handles AUTO_RECLAIM disabled after first batch', async () => {
		// Mock config: AUTO_RECLAIM = false
		mock.module('../src/config', () => ({
			AUTO_GENERATE: false,
			AUTO_RECLAIM: false,
			DRY_RUN: false,
			BATCH_DELAY: 0,
		}));

		// Create enough droplets for 2 batches (2500+ each)
		const droplets = createDroplets(5000, { owner: 'testaccount', bound: true });
		
		// Mock processBatches to simulate AUTO_RECLAIM check
		mockProcessBatches.mockImplementationOnce(async (items: any[], processor: any) => {
			const batch1 = items.slice(0, 2500);
			await processor(batch1, 1, 2);
			
			// Simulate AUTO_RECLAIM_DISABLED error on second batch
			throw new Error('AUTO_RECLAIM_DISABLED');
		});

		const result = await claimForAccount(session, droplets);

		// Should return claimed IDs from first batch only
		expect(result.length).toBeGreaterThan(0);
		expect(result.length).toBeLessThan(5000);
	});

	test('handles transaction errors gracefully', async () => {
		// Mock executeTransaction to throw error
		mockExecuteTransactionOrThrow.mockRejectedValueOnce(new Error('Insufficient CPU'));

		const droplets = createDroplets(3, { owner: 'testaccount', bound: true });
		const result = await claimForAccount(session, droplets);

		// Should return empty array on error
		expect(result).toEqual([]);
	});

	test('processes multiple batches correctly', async () => {
		// Mock config: AUTO_RECLAIM = true to allow multiple batches
		mock.module('../src/config', () => ({
			AUTO_GENERATE: false,
			AUTO_RECLAIM: true, // MUST be true for multi-batch
			DRY_RUN: false,
			BATCH_DELAY: 0,
		}));

		const droplets = createDroplets(5000, { owner: 'testaccount', bound: true });
		
		// Mock batch processing to track batch numbers
		const batchNumbers: number[] = [];
		mockProcessBatches.mockImplementationOnce(async (items: any[], processor: any) => {
			for (let i = 0; i < items.length; i += 2500) {
				const batch = items.slice(i, i + 2500);
				const batchNum = Math.floor(i / 2500) + 1;
				const totalBatches = Math.ceil(items.length / 2500);
				
				batchNumbers.push(batchNum);
				await processor(batch, batchNum, totalBatches);
			}
			return [];
		});

		const result = await claimForAccount(session, droplets);

		expect(batchNumbers).toEqual([1, 2]);
		expect(result).toHaveLength(5000);
	});

	test('includes batch number in action memo', async () => {
		const droplets = createDroplets(3, { owner: 'testaccount', bound: true });
		await claimForAccount(session, droplets);

		// Check that buildDestroyAction was called with memo containing batch number
		expect(mockBuildDestroyAction).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			expect.objectContaining({ memo: expect.stringContaining('batch') })
		);
	});
});

describe('claimFromCache', () => {
	beforeEach(() => {
		// Reset mocks
		mockProcessBatches.mockClear();
		mockExecuteTransactionOrThrow.mockClear();
	});

	test('skips claiming when no droplets in cache', async () => {
		// Mock empty cache
		mock.module('../src/lib/cache', () => ({
			dropletCache: {
				getStats: () => ({}),
				get: () => [],
				remove: mock(() => {}),
			},
		}));

		const sessions = [createMockSession({ actor: 'testaccount1' })];
		await claimFromCache(sessions);

		// Should not process any batches
		expect(mockProcessBatches).not.toHaveBeenCalled();
	});

	test('claims droplets for accounts in cache', async () => {
		const testDroplets = createDroplets(3, { owner: 'testaccount1', bound: true });
		const mockRemove = mock(() => {});

		// Mock cache with droplets
		mock.module('../src/lib/cache', () => ({
			dropletCache: {
				getStats: () => ({
					testaccount1: { count: 3, bound: 3, unbound: 0 },
				}),
				get: (account: string) => (account === 'testaccount1' ? testDroplets : []),
				remove: mockRemove,
			},
		}));

		const sessions = [createMockSession({ actor: 'testaccount1' })];
		await claimFromCache(sessions);

		// Should process batches
		expect(mockProcessBatches).toHaveBeenCalled();
		
		// Should remove claimed droplets from cache
		expect(mockRemove).toHaveBeenCalledWith('testaccount1', expect.arrayContaining(['1', '2', '3']));
	});

	test('processes multiple accounts sequentially', async () => {
		const droplets1 = createDroplets(2, { owner: 'testaccount1', bound: true });
		const droplets2 = createDroplets(2, { owner: 'testaccount2', bound: true });

		// Mock cache with droplets for both accounts
		mock.module('../src/lib/cache', () => ({
			dropletCache: {
				getStats: () => ({
					testaccount1: { count: 2, bound: 2, unbound: 0 },
					testaccount2: { count: 2, bound: 2, unbound: 0 },
				}),
				get: (account: string) => {
					if (account === 'testaccount1') return droplets1;
					if (account === 'testaccount2') return droplets2;
					return [];
				},
				remove: mock(() => {}),
			},
		}));

		const sessions = [
			createMockSession({ actor: 'testaccount1' }),
			createMockSession({ actor: 'testaccount2' }),
		];

		await claimFromCache(sessions);

		// Should process batches for both accounts
		expect(mockProcessBatches).toHaveBeenCalledTimes(2);
	});

	test('continues processing after account failure', async () => {
		const droplets = createDroplets(2, { bound: true });

		// Mock cache
		mock.module('../src/lib/cache', () => ({
			dropletCache: {
				getStats: () => ({
					testaccount1: { count: 2, bound: 2, unbound: 0 },
					testaccount2: { count: 2, bound: 2, unbound: 0 },
				}),
				get: (account: string) => droplets,
				remove: mock(() => {}),
			},
		}));

		// Mock processBatches to fail for first account
		let callCount = 0;
		mockProcessBatches.mockImplementation(async () => {
			callCount++;
			if (callCount === 1) {
				throw new Error('First account failed');
			}
			return [];
		});

		const sessions = [
			createMockSession({ actor: 'testaccount1' }),
			createMockSession({ actor: 'testaccount2' }),
		];

		await claimFromCache(sessions);

		// Should attempt both accounts
		expect(mockProcessBatches).toHaveBeenCalledTimes(2);
	});

	test('skips accounts with no droplets', async () => {
		// Mock cache with mixed accounts
		mock.module('../src/lib/cache', () => ({
			dropletCache: {
				getStats: () => ({
					testaccount1: { count: 3, bound: 3, unbound: 0 },
					testaccount2: { count: 0, bound: 0, unbound: 0 }, // No droplets
				}),
				get: (account: string) => {
					if (account === 'testaccount1') return createDroplets(3, { bound: true });
					return [];
				},
				remove: mock(() => {}),
			},
		}));

		const sessions = [
			createMockSession({ actor: 'testaccount1' }),
			createMockSession({ actor: 'testaccount2' }),
		];

		await claimFromCache(sessions);

		// Should only process testaccount1
		expect(mockProcessBatches).toHaveBeenCalledTimes(1);
	});
});
