/**
 * Unit tests for src/lib/transaction.ts
 *
 * Tests transaction execution with logging, error handling,
 * and broadcast flag behavior.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { Name } from '@wharfkit/antelope';
import {
	executeTransaction,
	executeTransactionOrThrow,
} from '../src/lib/transaction';
import { createMockSession, MockSessionRecorder } from './mocks/session';
import { MockLogger } from './mocks/logger';
import { buildDestroyAction } from '../src/lib/actions/drops';
import { SAMPLE_TX_IDS } from './helpers/fixtures';

describe('Transaction: executeTransaction()', () => {
	let mockLogger: MockLogger;

	beforeEach(() => {
		mockLogger = new MockLogger();
	});

	test('executes transaction successfully', async () => {
		const session = createMockSession({
			actor: 'testaccount',
			transactionId: SAMPLE_TX_IDS[0],
		});

		const action = buildDestroyAction(Name.from('testaccount'), ['1', '2']);

		const result = await executeTransaction(session, action, {
			logger: mockLogger.logger,
		});

		expect(result.success).toBe(true);
		expect(result.transactionId).toBe(SAMPLE_TX_IDS[0]);
		expect(result.broadcasted).toBe(true);
		expect(result.error).toBeUndefined();
		expect(result.result).toBeDefined();
	});

	test('handles single action', async () => {
		const session = createMockSession();
		const action = buildDestroyAction(Name.from('testaccount'), ['1']);

		const result = await executeTransaction(session, action);

		expect(result.success).toBe(true);
	});

	test('handles multiple actions', async () => {
		const session = createMockSession();
		const actions = [
			buildDestroyAction(Name.from('testaccount'), ['1']),
			buildDestroyAction(Name.from('testaccount'), ['2']),
		];

		const result = await executeTransaction(session, actions);

		expect(result.success).toBe(true);
	});

	test('broadcasts by default', async () => {
		const recorder = new MockSessionRecorder();
		const action = buildDestroyAction(Name.from('testaccount'), ['1']);

		await executeTransaction(recorder.session, action);

		expect(recorder.callCount).toBe(1);
		expect(recorder.lastCall.broadcast).toBe(true);
	});

	test('respects broadcast=false (dry run)', async () => {
		const recorder = new MockSessionRecorder();
		const action = buildDestroyAction(Name.from('testaccount'), ['1']);

		const result = await executeTransaction(recorder.session, action, {
			broadcast: false,
			logger: mockLogger.logger,
		});

		expect(result.success).toBe(true);
		expect(result.broadcasted).toBe(false);
		expect(recorder.lastCall.broadcast).toBe(false);

		// Should log dry run message
		expect(mockLogger.hasMessageContaining('DRY RUN')).toBe(true);
		expect(mockLogger.hasMessageContaining('not broadcast')).toBe(true);
	});

	test('handles transaction error', async () => {
		const session = createMockSession({
			shouldSucceed: false,
			error: new Error('Transaction failed: insufficient CPU'),
		});

		const action = buildDestroyAction(Name.from('testaccount'), ['1']);

		const result = await executeTransaction(session, action, {
			logger: mockLogger.logger,
		});

		expect(result.success).toBe(false);
		expect(result.transactionId).toBeNull();
		expect(result.broadcasted).toBe(false);
		expect(result.error).toBeDefined();
		expect(result.error?.message).toContain('insufficient CPU');

		// Should log error
		expect(mockLogger.errors.length).toBeGreaterThan(0);
		expect(mockLogger.hasMessageContaining('failed', 'error')).toBe(true);
	});

	test('logs transaction details', async () => {
		const session = createMockSession({
			actor: 'testaccount',
			transactionId: SAMPLE_TX_IDS[0],
		});

		const action = buildDestroyAction(Name.from('testaccount'), ['1', '2']);

		await executeTransaction(session, action, {
			logger: mockLogger.logger,
			logContext: { batch: 1, claimableCount: 500 },
			description: 'Destroy 2 droplets',
		});

		// Should log before execution
		expect(
			mockLogger.hasMessageContaining('Broadcasting Destroy 2 droplets')
		).toBe(true);

		// Should log after success
		expect(mockLogger.hasMessageContaining('successfully')).toBe(true);

		// Should include log context
		const successLog = mockLogger.debugs.find((log) =>
			log.message.includes('successfully')
		);
		expect(successLog?.meta?.batch).toBe(1);
		expect(successLog?.meta?.claimableCount).toBe(500);
		expect(successLog?.meta?.account).toBe('testaccount');
	});

	test('logs dry run execution', async () => {
		const session = createMockSession();
		const action = buildDestroyAction(Name.from('testaccount'), ['1']);

		await executeTransaction(session, action, {
			broadcast: false,
			logger: mockLogger.logger,
			description: 'Test destroy',
		});

		// Should log dry run before
		expect(mockLogger.hasMessageContaining('DRY RUN: Test destroy')).toBe(true);

		// Should log simulated success
		expect(mockLogger.hasMessageContaining('simulated successfully')).toBe(true);
	});

	test('includes transaction ID in success log', async () => {
		const session = createMockSession({
			transactionId: SAMPLE_TX_IDS[0],
		});

		const action = buildDestroyAction(Name.from('testaccount'), ['1']);

		await executeTransaction(session, action, {
			logger: mockLogger.logger,
		});

		const successLog = mockLogger.debugs.find((log) =>
			log.message.includes('successfully')
		);
		expect(successLog?.meta?.transactionId).toBe(SAMPLE_TX_IDS[0]);
	});

	test('includes action count in logs', async () => {
		const session = createMockSession();
		const actions = [
			buildDestroyAction(Name.from('testaccount'), ['1']),
			buildDestroyAction(Name.from('testaccount'), ['2']),
			buildDestroyAction(Name.from('testaccount'), ['3']),
		];

		await executeTransaction(session, actions, {
			logger: mockLogger.logger,
		});

		const successLog = mockLogger.debugs.find((log) =>
			log.message.includes('successfully')
		);
		expect(successLog?.meta?.actions).toBe(3);
	});

	test('works without logger', async () => {
		const session = createMockSession();
		const action = buildDestroyAction(Name.from('testaccount'), ['1']);

		const result = await executeTransaction(session, action);

		expect(result.success).toBe(true);
		// Should not throw without logger
	});

	test('uses default description', async () => {
		const session = createMockSession();
		const action = buildDestroyAction(Name.from('testaccount'), ['1']);

		await executeTransaction(session, action, {
			logger: mockLogger.logger,
		});

		// Should use default "transaction"
		expect(mockLogger.hasMessageContaining('Broadcasting transaction')).toBe(
			true
		);
	});

	test('handles empty log context', async () => {
		const session = createMockSession();
		const action = buildDestroyAction(Name.from('testaccount'), ['1']);

		const result = await executeTransaction(session, action, {
			logger: mockLogger.logger,
			logContext: {},
		});

		expect(result.success).toBe(true);
	});
});

describe('Transaction: executeTransactionOrThrow()', () => {
	let mockLogger: MockLogger;

	beforeEach(() => {
		mockLogger = new MockLogger();
	});

	test('returns transaction ID on success', async () => {
		const session = createMockSession({
			transactionId: SAMPLE_TX_IDS[0],
		});

		const action = buildDestroyAction(Name.from('testaccount'), ['1']);

		const txId = await executeTransactionOrThrow(session, action, {
			logger: mockLogger.logger,
		});

		expect(txId).toBe(SAMPLE_TX_IDS[0]);
	});

	test('returns null on dry run', async () => {
		const session = createMockSession();
		const action = buildDestroyAction(Name.from('testaccount'), ['1']);

		const txId = await executeTransactionOrThrow(session, action, {
			broadcast: false,
		});

		// Dry run returns empty string, which becomes null
		expect(txId).toBeDefined();
	});

	test('throws on transaction error', async () => {
		const session = createMockSession({
			shouldSucceed: false,
			error: new Error('Transaction failed: CPU exceeded'),
		});

		const action = buildDestroyAction(Name.from('testaccount'), ['1']);

		await expect(
			executeTransactionOrThrow(session, action, {
				logger: mockLogger.logger,
			})
		).rejects.toThrow('CPU exceeded');
	});

	test('throws with error message', async () => {
		const session = createMockSession({
			shouldSucceed: false,
			error: new Error('Specific error message'),
		});

		const action = buildDestroyAction(Name.from('testaccount'), ['1']);

		try {
			await executeTransactionOrThrow(session, action);
			expect(true).toBe(false); // Should not reach here
		} catch (error) {
			expect(error.message).toContain('Specific error message');
		}
	});

	test('works with multiple actions', async () => {
		const session = createMockSession({
			transactionId: SAMPLE_TX_IDS[1],
		});

		const actions = [
			buildDestroyAction(Name.from('testaccount'), ['1']),
			buildDestroyAction(Name.from('testaccount'), ['2']),
		];

		const txId = await executeTransactionOrThrow(session, actions);

		expect(txId).toBe(SAMPLE_TX_IDS[1]);
	});

	test('logs errors before throwing', async () => {
		const session = createMockSession({
			shouldSucceed: false,
			error: new Error('Test error'),
		});

		const action = buildDestroyAction(Name.from('testaccount'), ['1']);

		try {
			await executeTransactionOrThrow(session, action, {
				logger: mockLogger.logger,
			});
		} catch (error) {
			// Expected
		}

		// Should have logged the error
		expect(mockLogger.errors.length).toBeGreaterThan(0);
	});
});
