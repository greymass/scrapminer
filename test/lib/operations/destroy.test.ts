/**
 * Tests for destroy operations module
 * 
 * Tests the destroyDroplets() orchestration function which:
 * - Validates droplet IDs
 * - Builds destroy actions
 * - Processes batches
 * - Executes transactions
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { UInt64 } from '@wharfkit/antelope';
import { destroyDroplets, destroyDropletsByAmount } from '../../../src/lib/operations/destroy';
import { createMockSession } from '../../mocks/session';
import type { Config } from '../../../src/lib/config';

// Mock dependencies
const mockBuildDestroyAction = mock(() => ({ 
	authorization: [{ actor: 'testuser', permission: 'active' }],
	account: 'drops',
	name: 'destroy',
	data: { owner: 'testuser', droplet_ids: [] }
}));

const mockExecuteTransactionOrThrow = mock(() => Promise.resolve('txid123'));

const mockProcessBatches = mock(async (items: any[], processor: Function) => {
	// Simulate processing all items in batches
	const results = [];
	const batchSize = 2500;
	const batches = [];
	for (let i = 0; i < items.length; i += batchSize) {
		batches.push(items.slice(i, i + batchSize));
	}
	
	for (let i = 0; i < batches.length; i++) {
		const result = await processor(batches[i], i + 1, batches.length);
		results.push(result);
	}
	return results;
});

mock.module('../../../src/lib/actions/drops', () => ({
	buildDestroyAction: mockBuildDestroyAction
}));

mock.module('../../../src/lib/transaction', () => ({
	executeTransactionOrThrow: mockExecuteTransactionOrThrow
}));

mock.module('../../../src/lib/batch', () => ({
	processBatches: mockProcessBatches
}));

// Mock API for destroyDropletsByAmount tests
const mockFetchDropletIds = mock(() => Promise.resolve([]));

mock.module('../../../src/lib/api', () => ({
	fetchDropletIds: mockFetchDropletIds
}));

describe('Destroy Operations: destroyDroplets()', () => {
	beforeEach(() => {
		mockBuildDestroyAction.mockClear();
		mockExecuteTransactionOrThrow.mockClear();
		mockProcessBatches.mockClear();
		mockFetchDropletIds.mockClear();
		
		// Reset to defaults
		mockFetchDropletIds.mockResolvedValue([]);
	});

	describe('Validation', () => {
		test('throws error if droplet IDs array is empty', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			await expect(
				destroyDroplets(session, [])
			).rejects.toThrow('At least one droplet ID is required');
			
			expect(mockBuildDestroyAction).not.toHaveBeenCalled();
			expect(mockExecuteTransactionOrThrow).not.toHaveBeenCalled();
		});

		test('throws error if droplet ID is empty string', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			await expect(
				destroyDroplets(session, ['123', '', '456'])
			).rejects.toThrow('Empty droplet ID provided');
		});

		test('throws error if droplet ID is whitespace only', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			await expect(
				destroyDroplets(session, ['123', '   ', '456'])
			).rejects.toThrow('Empty droplet ID provided');
		});

		test('throws error if droplet ID is invalid format', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			await expect(
				destroyDroplets(session, ['123', 'invalid', '456'])
			).rejects.toThrow('Invalid droplet ID format');
		});

		test('accepts valid droplet IDs with whitespace', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			await destroyDroplets(session, [' 123 ', '456', '  789  ']);
			
			expect(mockBuildDestroyAction).toHaveBeenCalledTimes(1);
			expect(mockExecuteTransactionOrThrow).toHaveBeenCalledTimes(1);
		});
	});

	describe('Single batch operations', () => {
		test('destroys droplets in single batch', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			const dropletIds = ['100', '200', '300'];
			
			const result = await destroyDroplets(session, dropletIds);
			
			expect(result).toEqual(['txid123']);
			expect(mockProcessBatches).toHaveBeenCalledTimes(1);
			expect(mockBuildDestroyAction).toHaveBeenCalledTimes(1);
			expect(mockExecuteTransactionOrThrow).toHaveBeenCalledTimes(1);
		});

		test('passes memo to buildDestroyAction', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			const dropletIds = ['100', '200'];
			const memo = 'Test memo';
			
			await destroyDroplets(session, dropletIds, { memo });
			
			expect(mockBuildDestroyAction).toHaveBeenCalledWith(
				session.actor,
				expect.any(Array),
				expect.objectContaining({ memo })
			);
		});

		test('passes toNotify to buildDestroyAction', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			const dropletIds = ['100', '200'];
			const toNotify = 'notifyuser';
			
			await destroyDroplets(session, dropletIds, { toNotify });
			
			expect(mockBuildDestroyAction).toHaveBeenCalledWith(
				session.actor,
				expect.any(Array),
				expect.objectContaining({ toNotify })
			);
		});

		test('converts droplet IDs to UInt64', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			const dropletIds = ['100', '200', '300'];
			
			await destroyDroplets(session, dropletIds);
			
			// Check that buildDestroyAction received UInt64 array
			const callArgs = mockBuildDestroyAction.mock.calls[0];
			const ids = callArgs[1];
			expect(ids).toBeArray();
			expect(ids.length).toBe(3);
		});
	});

	describe('Multi-batch operations', () => {
		test('processes large number of droplets in multiple batches', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			// Create 5000 droplet IDs (should split into 2 batches)
			const dropletIds = Array.from({ length: 5000 }, (_, i) => String(i + 1));
			
			const result = await destroyDroplets(session, dropletIds);
			
			expect(result).toHaveLength(2);
			expect(mockBuildDestroyAction).toHaveBeenCalledTimes(2);
			expect(mockExecuteTransactionOrThrow).toHaveBeenCalledTimes(2);
		});

		test('returns transaction IDs from all batches', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			const dropletIds = Array.from({ length: 5000 }, (_, i) => String(i + 1));
			
			// Mock different tx IDs for each batch
			mockExecuteTransactionOrThrow
				.mockResolvedValueOnce('tx_batch1')
				.mockResolvedValueOnce('tx_batch2');
			
			const result = await destroyDroplets(session, dropletIds);
			
			expect(result).toEqual(['tx_batch1', 'tx_batch2']);
		});
	});

	describe('Dry run mode', () => {
		test('does not broadcast transactions in dry run', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			const dropletIds = ['100', '200'];
			
			await destroyDroplets(session, dropletIds, { dryRun: true });
			
			expect(mockExecuteTransactionOrThrow).toHaveBeenCalledWith(
				session,
				expect.any(Object),
				expect.objectContaining({ broadcast: false })
			);
		});

		test('returns empty array in dry run when no txIds returned', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			const dropletIds = ['100', '200'];
			
			mockExecuteTransactionOrThrow.mockResolvedValueOnce(null);
			
			const result = await destroyDroplets(session, dropletIds, { dryRun: true });
			
			expect(result).toEqual([]);
		});

		test('still validates droplet IDs in dry run', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			await expect(
				destroyDroplets(session, [], { dryRun: true })
			).rejects.toThrow('At least one droplet ID is required');
		});
	});

	describe('Error handling', () => {
		test('throws error if transaction execution fails', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			const dropletIds = ['100', '200'];
			
			mockExecuteTransactionOrThrow.mockRejectedValueOnce(
				new Error('Transaction failed')
			);
			
			await expect(
				destroyDroplets(session, dropletIds)
			).rejects.toThrow('Transaction failed');
		});

		test('throws error if action building fails', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			const dropletIds = ['100', '200'];
			
			mockBuildDestroyAction.mockImplementationOnce(() => {
				throw new Error('Action build failed');
			});
			
			await expect(
				destroyDroplets(session, dropletIds)
			).rejects.toThrow('Action build failed');
		});

		test('propagates batch processing errors', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			const dropletIds = ['100', '200'];
			
			mockProcessBatches.mockRejectedValueOnce(
				new Error('Batch processing failed')
			);
			
			await expect(
				destroyDroplets(session, dropletIds)
			).rejects.toThrow('Batch processing failed');
		});
	});

	describe('Transaction metadata', () => {
		test('passes correct description to executeTransactionOrThrow', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			const dropletIds = ['100', '200', '300'];
			
			await destroyDroplets(session, dropletIds);
			
			expect(mockExecuteTransactionOrThrow).toHaveBeenCalledWith(
				session,
				expect.any(Object),
				expect.objectContaining({
					description: expect.stringContaining('Destroy batch')
				})
			);
		});

		test('includes batch number in log context for multi-batch', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			const dropletIds = Array.from({ length: 5000 }, (_, i) => String(i + 1));
			
			await destroyDroplets(session, dropletIds);
			
			// Check first batch call
			expect(mockExecuteTransactionOrThrow).toHaveBeenNthCalledWith(
				1,
				session,
				expect.any(Object),
				expect.objectContaining({
					logContext: { batch: 1, totalBatches: 2 }
				})
			);
			
			// Check second batch call
			expect(mockExecuteTransactionOrThrow).toHaveBeenNthCalledWith(
				2,
				session,
				expect.any(Object),
				expect.objectContaining({
					logContext: { batch: 2, totalBatches: 2 }
				})
			);
		});
	});

	describe('Account context', () => {
		test('uses session actor as owner', async () => {
			const session = createMockSession({ actor: 'myaccount', permission: 'active' });
			const dropletIds = ['100', '200'];
			
			await destroyDroplets(session, dropletIds);
			
			expect(mockBuildDestroyAction).toHaveBeenCalledWith(
				session.actor,
				expect.any(Array),
				expect.any(Object)
			);
		});

		test('handles different account names', async () => {
			const accounts = ['user1', 'user2', 'longaccname12'];
			
			for (const accountName of accounts) {
				mockBuildDestroyAction.mockClear();
				mockExecuteTransactionOrThrow.mockClear();
				
				const session = createMockSession({ actor: accountName, permission: 'active' });
				await destroyDroplets(session, ['100']);
				
				expect(mockBuildDestroyAction).toHaveBeenCalledWith(
					session.actor,
					expect.any(Array),
					expect.any(Object)
				);
			}
		});
	});
});

describe('Destroy Operations: destroyDropletsByAmount()', () => {
	const mockConfig: Config = {
		scrapApiUrl: 'https://api.example.com',
		dropsContract: 'drops',
		scrapContract: 'scrap',
		dryRun: false,
		autoGenerate: false,
		autoReclaim: false,
		claimInterval: 300000
	};

	beforeEach(() => {
		mockBuildDestroyAction.mockClear();
		mockExecuteTransactionOrThrow.mockClear();
		mockProcessBatches.mockClear();
		mockFetchDropletIds.mockClear();
		
		// Reset to defaults
		mockExecuteTransactionOrThrow.mockResolvedValue('txid123');
		mockFetchDropletIds.mockResolvedValue([]);
	});

	describe('Validation', () => {
		test('throws error if amount is 0', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			await expect(
				destroyDropletsByAmount(session, 0, mockConfig)
			).rejects.toThrow('Amount must be greater than 0');
		});

		test('throws error if amount is negative', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			await expect(
				destroyDropletsByAmount(session, -5, mockConfig)
			).rejects.toThrow('Amount must be greater than 0');
		});

		test('throws error if no droplets found', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			// Mock empty API response
			mockFetchDropletIds.mockResolvedValue([]);
			
			await expect(
				destroyDropletsByAmount(session, 10, mockConfig)
			).rejects.toThrow('No droplets found');
		});
	});

	describe('Fetching from API', () => {
		test('fetches droplet IDs from API', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			// Mock API with droplets
			const apiDroplets = [
				{ _id: '100', owner: 'testuser', bound: false, created: '2024-01-01' },
				{ _id: '200', owner: 'testuser', bound: false, created: '2024-01-01' }
			];
			mockFetchDropletIds.mockResolvedValue(apiDroplets);
			
			await destroyDropletsByAmount(session, 2, mockConfig);
			
			expect(mockFetchDropletIds).toHaveBeenCalledWith('testuser', mockConfig, 2);
			expect(mockBuildDestroyAction).toHaveBeenCalledTimes(1);
		});

		test('passes exact amount to API', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			const apiDroplets = Array.from({ length: 50 }, (_, i) => ({
				_id: String(i + 1),
				owner: 'testuser',
				bound: false,
				created: '2024-01-01'
			}));
			mockFetchDropletIds.mockResolvedValue(apiDroplets);
			
			await destroyDropletsByAmount(session, 50, mockConfig);
			
			expect(mockFetchDropletIds).toHaveBeenCalledWith('testuser', mockConfig, 50);
			expect(mockBuildDestroyAction).toHaveBeenCalledTimes(1);
		});

		test('handles API returning more than requested', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			// API returns 100, but we only want 50
			const apiDroplets = Array.from({ length: 100 }, (_, i) => ({
				_id: String(i + 1),
				owner: 'testuser',
				bound: false,
				created: '2024-01-01'
			}));
			mockFetchDropletIds.mockResolvedValue(apiDroplets);
			
			await destroyDropletsByAmount(session, 50, mockConfig);
			
			// Should only use first 50
			const callArgs = mockBuildDestroyAction.mock.calls[0];
			const ids = callArgs[1];
			expect(ids.length).toBe(50);
		});
	});

	describe('Partial availability', () => {
		test('warns and destroys available amount if less than requested', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			// Mock only 5 droplets available
			const apiDroplets = Array.from({ length: 5 }, (_, i) => ({
				_id: String(i + 1),
				owner: 'testuser',
				bound: false,
				created: '2024-01-01'
			}));
			mockFetchDropletIds.mockResolvedValue(apiDroplets);
			
			// Request 10 but only 5 available
			await destroyDropletsByAmount(session, 10, mockConfig);
			
			// Should destroy the 5 available
			expect(mockBuildDestroyAction).toHaveBeenCalledTimes(1);
			const callArgs = mockBuildDestroyAction.mock.calls[0];
			const ids = callArgs[1];
			expect(ids.length).toBe(5);
		});
	});

	describe('Options forwarding', () => {
		test('forwards memo option to destroyDroplets', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			mockFetchDropletIds.mockResolvedValue([
				{ _id: '100', owner: 'testuser', bound: false, created: '2024-01-01' }
			]);
			
			await destroyDropletsByAmount(session, 1, mockConfig, { memo: 'Test memo' });
			
			expect(mockBuildDestroyAction).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				expect.objectContaining({ memo: 'Test memo' })
			);
		});

		test('forwards toNotify option to destroyDroplets', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			mockFetchDropletIds.mockResolvedValue([
				{ _id: '100', owner: 'testuser', bound: false, created: '2024-01-01' }
			]);
			
			await destroyDropletsByAmount(session, 1, mockConfig, { toNotify: 'notifyuser' });
			
			expect(mockBuildDestroyAction).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				expect.objectContaining({ toNotify: 'notifyuser' })
			);
		});

		test('forwards dryRun option to destroyDroplets', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			mockFetchDropletIds.mockResolvedValue([
				{ _id: '100', owner: 'testuser', bound: false, created: '2024-01-01' }
			]);
			
			await destroyDropletsByAmount(session, 1, mockConfig, { dryRun: true });
			
			expect(mockExecuteTransactionOrThrow).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				expect.objectContaining({ broadcast: false })
			);
		});
	});
});
