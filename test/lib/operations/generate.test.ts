/**
 * Tests for generate operations module
 * 
 * Tests the generateDroplets() orchestration function which:
 * - Validates amount
 * - Builds generate actions
 * - Processes batches
 * - Executes transactions
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { generateDroplets } from '../../../src/lib/operations/generate';
import { createMockSession } from '../../mocks/session';

// Mock dependencies
const mockBuildGenerateAction = mock(() => ({ 
	authorization: [{ actor: 'testuser', permission: 'active' }],
	account: 'drops',
	name: 'generate',
	data: { owner: 'testuser', amount: 0, bound: false }
}));

const mockExecuteTransactionOrThrow = mock(() => Promise.resolve('txid123'));

const mockProcessBatches = mock(async (items: any[], processor: Function) => {
	// Simulate processing all items in batches
	const results = [];
	for (let i = 0; i < items.length; i++) {
		const result = await processor([items[i]], i + 1, items.length);
		results.push(result);
	}
	return results;
});

mock.module('../../../src/lib/actions/drops', () => ({
	buildGenerateAction: mockBuildGenerateAction
}));

mock.module('../../../src/lib/transaction', () => ({
	executeTransactionOrThrow: mockExecuteTransactionOrThrow
}));

mock.module('../../../src/lib/batch', () => ({
	processBatches: mockProcessBatches
}));

describe('Generate Operations: generateDroplets()', () => {
	beforeEach(() => {
		mockBuildGenerateAction.mockClear();
		mockExecuteTransactionOrThrow.mockClear();
		mockExecuteTransactionOrThrow.mockResolvedValue('txid123'); // Reset to default
		mockProcessBatches.mockClear();
	});

	describe('Validation', () => {
		test('throws error if amount is 0', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			await expect(
				generateDroplets(session, 0, false)
			).rejects.toThrow('Amount must be greater than 0');
			
			expect(mockBuildGenerateAction).not.toHaveBeenCalled();
			expect(mockExecuteTransactionOrThrow).not.toHaveBeenCalled();
		});

		test('throws error if amount is negative', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			await expect(
				generateDroplets(session, -10, false)
			).rejects.toThrow('Amount must be greater than 0');
		});

		test('accepts positive amount', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			await generateDroplets(session, 10, false);
			
			expect(mockBuildGenerateAction).toHaveBeenCalled();
			expect(mockExecuteTransactionOrThrow).toHaveBeenCalled();
		});
	});

	describe('Single batch operations', () => {
		test('generates bound droplets in single batch', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			const result = await generateDroplets(session, 100, true);
			
			expect(result).toEqual(['txid123']);
			expect(mockProcessBatches).toHaveBeenCalledTimes(1);
			expect(mockBuildGenerateAction).toHaveBeenCalledTimes(1);
			expect(mockExecuteTransactionOrThrow).toHaveBeenCalledTimes(1);
		});

		test('generates unbound droplets in single batch', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			const result = await generateDroplets(session, 100, false);
			
			expect(result).toEqual(['txid123']);
			expect(mockProcessBatches).toHaveBeenCalledTimes(1);
			expect(mockBuildGenerateAction).toHaveBeenCalledTimes(1);
			expect(mockExecuteTransactionOrThrow).toHaveBeenCalledTimes(1);
		});

		test('passes bound parameter to buildGenerateAction', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			await generateDroplets(session, 50, true);
			
			expect(mockBuildGenerateAction).toHaveBeenCalledWith(
				session.actor,
				50,
				true,
				expect.any(Object)
			);
		});

		test('passes data option to buildGenerateAction', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			const data = 'custom-data';
			
			await generateDroplets(session, 50, false, { data });
			
			expect(mockBuildGenerateAction).toHaveBeenCalledWith(
				session.actor,
				50,
				false,
				expect.objectContaining({ data })
			);
		});

		test('passes toNotify option to buildGenerateAction', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			const toNotify = 'notifyuser';
			
			await generateDroplets(session, 50, false, { toNotify });
			
			expect(mockBuildGenerateAction).toHaveBeenCalledWith(
				session.actor,
				50,
				false,
				expect.objectContaining({ toNotify })
			);
		});
	});

	describe('Multi-batch operations', () => {
		test('splits large amounts into multiple batches', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			// 5000 should split into 2 batches (2500 + 2500)
			
			const result = await generateDroplets(session, 5000, false);
			
			expect(result).toHaveLength(2);
			expect(mockBuildGenerateAction).toHaveBeenCalledTimes(2);
			expect(mockExecuteTransactionOrThrow).toHaveBeenCalledTimes(2);
		});

		test('handles partial last batch correctly', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			// 3000 should split into 2 batches (2500 + 500)
			
			mockExecuteTransactionOrThrow
				.mockResolvedValueOnce('tx1')
				.mockResolvedValueOnce('tx2');
			
			const result = await generateDroplets(session, 3000, false);
			
			expect(result).toEqual(['tx1', 'tx2']);
			
			// First batch should be 2500
			expect(mockBuildGenerateAction).toHaveBeenNthCalledWith(
				1,
				expect.anything(),
				2500,
				expect.anything(),
				expect.anything()
			);
			
			// Second batch should be 500
			expect(mockBuildGenerateAction).toHaveBeenNthCalledWith(
				2,
				expect.anything(),
				500,
				expect.anything(),
				expect.anything()
			);
		});

		test('returns transaction IDs from all batches', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			mockExecuteTransactionOrThrow
				.mockResolvedValueOnce('tx_batch1')
				.mockResolvedValueOnce('tx_batch2')
				.mockResolvedValueOnce('tx_batch3');
			
			const result = await generateDroplets(session, 7500, false);
			
			expect(result).toEqual(['tx_batch1', 'tx_batch2', 'tx_batch3']);
		});

		test('processes exactly batch size without splitting', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			const result = await generateDroplets(session, 2500, false);
			
			expect(result).toHaveLength(1);
			expect(mockBuildGenerateAction).toHaveBeenCalledTimes(1);
		});
	});

	describe('Dry run mode', () => {
		test('does not broadcast transactions in dry run', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			await generateDroplets(session, 100, false, { dryRun: true });
			
			expect(mockExecuteTransactionOrThrow).toHaveBeenCalledWith(
				session,
				expect.any(Object),
				expect.objectContaining({ broadcast: false })
			);
		});

		test('returns empty array in dry run when no txIds returned', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			mockExecuteTransactionOrThrow.mockResolvedValueOnce(null);
			
			const result = await generateDroplets(session, 100, false, { dryRun: true });
			
			expect(result).toEqual([]);
		});

		test('still validates amount in dry run', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			await expect(
				generateDroplets(session, 0, false, { dryRun: true })
			).rejects.toThrow('Amount must be greater than 0');
		});

		test('handles multi-batch dry run', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			mockExecuteTransactionOrThrow.mockResolvedValue(null);
			
			const result = await generateDroplets(session, 5000, false, { dryRun: true });
			
			expect(result).toEqual([]);
			expect(mockExecuteTransactionOrThrow).toHaveBeenCalledTimes(2);
		});
	});

	describe('Error handling', () => {
		test('throws error if transaction execution fails', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			mockExecuteTransactionOrThrow.mockRejectedValueOnce(
				new Error('Transaction failed')
			);
			
			await expect(
				generateDroplets(session, 100, false)
			).rejects.toThrow('Transaction failed');
		});

		test('throws error if action building fails', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			mockBuildGenerateAction.mockImplementationOnce(() => {
				throw new Error('Action build failed');
			});
			
			await expect(
				generateDroplets(session, 100, false)
			).rejects.toThrow('Action build failed');
		});

		test('propagates batch processing errors', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			mockProcessBatches.mockRejectedValueOnce(
				new Error('Batch processing failed')
			);
			
			await expect(
				generateDroplets(session, 100, false)
			).rejects.toThrow('Batch processing failed');
		});

		test('stops on first batch error in multi-batch operation', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			mockExecuteTransactionOrThrow
				.mockResolvedValueOnce('tx1')
				.mockRejectedValueOnce(new Error('Batch 2 failed'));
			
			await expect(
				generateDroplets(session, 5000, false)
			).rejects.toThrow('Batch 2 failed');
			
			// Should have attempted 2 batches before failing
			expect(mockExecuteTransactionOrThrow).toHaveBeenCalledTimes(2);
		});
	});

	describe('Transaction metadata', () => {
		test('passes correct description to executeTransactionOrThrow', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			await generateDroplets(session, 100, false);
			
			expect(mockExecuteTransactionOrThrow).toHaveBeenCalledWith(
				session,
				expect.any(Object),
				expect.objectContaining({
					description: expect.stringContaining('Generate batch')
				})
			);
		});

		test('description includes bound/unbound type', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			await generateDroplets(session, 100, true);
			
			expect(mockExecuteTransactionOrThrow).toHaveBeenCalledWith(
				session,
				expect.any(Object),
				expect.objectContaining({
					description: expect.stringContaining('bound')
				})
			);
		});

		test('includes batch number in log context for multi-batch', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			await generateDroplets(session, 5000, false);
			
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
			
			await generateDroplets(session, 100, false);
			
			expect(mockBuildGenerateAction).toHaveBeenCalledWith(
				session.actor,
				expect.any(Number),
				expect.any(Boolean),
				expect.any(Object)
			);
		});

		test('handles different account names', async () => {
			const accounts = ['user1', 'user2', 'longaccname12'];
			
			for (const accountName of accounts) {
				mockBuildGenerateAction.mockClear();
				mockExecuteTransactionOrThrow.mockClear();
				
				const session = createMockSession({ actor: accountName, permission: 'active' });
				await generateDroplets(session, 10, false);
				
				expect(mockBuildGenerateAction).toHaveBeenCalledWith(
					session.actor,
					expect.any(Number),
					expect.any(Boolean),
					expect.any(Object)
				);
			}
		});
	});

	describe('Bound vs Unbound generation', () => {
		test('generates bound droplets when bound=true', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			await generateDroplets(session, 50, true);
			
			expect(mockBuildGenerateAction).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				true,
				expect.anything()
			);
		});

		test('generates unbound droplets when bound=false', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			await generateDroplets(session, 50, false);
			
			expect(mockBuildGenerateAction).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				false,
				expect.anything()
			);
		});

		test('maintains bound flag across multiple batches', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			await generateDroplets(session, 5000, true);
			
			// All batches should have bound=true
			expect(mockBuildGenerateAction).toHaveBeenNthCalledWith(
				1,
				expect.anything(),
				expect.anything(),
				true,
				expect.anything()
			);
			expect(mockBuildGenerateAction).toHaveBeenNthCalledWith(
				2,
				expect.anything(),
				expect.anything(),
				true,
				expect.anything()
			);
		});
	});

	describe('Edge cases', () => {
		test('handles amount of 1', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			const result = await generateDroplets(session, 1, false);
			
			expect(result).toEqual(['txid123']);
			expect(mockBuildGenerateAction).toHaveBeenCalledWith(
				expect.anything(),
				1,
				expect.anything(),
				expect.anything()
			);
		});

		test('handles very large amounts', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			const largeAmount = 100000; // 40 batches
			
			// Mock all batch calls
			mockExecuteTransactionOrThrow.mockResolvedValue('tx');
			
			const result = await generateDroplets(session, largeAmount, false);
			
			expect(result).toHaveLength(40);
			expect(mockBuildGenerateAction).toHaveBeenCalledTimes(40);
		});

		test('handles amount exactly one less than batch size', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			const result = await generateDroplets(session, 2499, false);
			
			expect(result).toHaveLength(1);
			expect(mockBuildGenerateAction).toHaveBeenCalledWith(
				expect.anything(),
				2499,
				expect.anything(),
				expect.anything()
			);
		});

		test('handles amount exactly one more than batch size', async () => {
			const session = createMockSession({ actor: 'testuser', permission: 'active' });
			
			mockExecuteTransactionOrThrow
				.mockResolvedValueOnce('tx1')
				.mockResolvedValueOnce('tx2');
			
			const result = await generateDroplets(session, 2501, false);
			
			expect(result).toHaveLength(2);
			expect(mockBuildGenerateAction).toHaveBeenNthCalledWith(
				1,
				expect.anything(),
				2500,
				expect.anything(),
				expect.anything()
			);
			expect(mockBuildGenerateAction).toHaveBeenNthCalledWith(
				2,
				expect.anything(),
				1,
				expect.anything(),
				expect.anything()
			);
		});
	});
});
