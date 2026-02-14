/**
 * Unit tests for src/lib/wharf.ts
 *
 * Tests session creation and account discovery integration.
 * This is a critical initialization path.
 */

import { describe, test, expect, mock } from 'bun:test';
import type { AccountConfig } from '../../src/lib/config';
import type { Session } from '@wharfkit/session';

// Mock the discoverAccountsFromPrivateKey function before importing wharf
const mockDiscoverAccounts = mock(() => Promise.resolve([]));
mock.module('../../src/lib/utils', () => ({
	discoverAccountsFromPrivateKey: mockDiscoverAccounts,
	objectify: (obj: any) => JSON.parse(JSON.stringify(obj)),
	isENVTrue: (val?: string) => val === 'true',
	isENVFalse: (val?: string) => val === 'false'
}));

// Mock logger to prevent console spam during tests
mock.module('../../src/lib/logger', () => ({
	configLog: {
		info: mock(() => {}),
		warn: mock(() => {}),
		error: mock(() => {})
	},
	dropLog: mock(() => ({})),
	claimLog: mock(() => ({}))
}));

describe('Wharf: createSessions()', () => {
	test('creates sessions for single account with claim permission', async () => {
		// Reset mock
		mockDiscoverAccounts.mockClear();
		mockDiscoverAccounts.mockResolvedValue([
			{
				actor: 'testuser1',
				permission: 'claim',
				publicKey: 'PUB_K1_6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5BoDq63'
			}
		]);

		const { createSessions } = await import('../../src/lib/wharf');
		const accounts: AccountConfig[] = [
			{ privkey: '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3' }
		];

		const sessions = await createSessions(accounts);

		expect(sessions).toHaveLength(1);
		expect(sessions[0].actor.toString()).toBe('testuser1');
		expect(sessions[0].permission.toString()).toBe('claim');
		expect(mockDiscoverAccounts).toHaveBeenCalledTimes(1);
	});

	test('creates multiple sessions from single private key', async () => {
		// One private key can control multiple accounts
		mockDiscoverAccounts.mockClear();
		mockDiscoverAccounts.mockResolvedValue([
			{
				actor: 'testuser1',
				permission: 'claim',
				publicKey: 'PUB_K1_6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5BoDq63'
			},
			{
				actor: 'testuser2',
				permission: 'claim',
				publicKey: 'PUB_K1_6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5BoDq63'
			},
			{
				actor: 'testuser3',
				permission: 'claim',
				publicKey: 'PUB_K1_6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5BoDq63'
			}
		]);

		const { createSessions } = await import('../../src/lib/wharf');
		const accounts: AccountConfig[] = [
			{ privkey: '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3' }
		];

		const sessions = await createSessions(accounts);

		// Should create 3 sessions from 1 private key
		expect(sessions).toHaveLength(3);
		expect(sessions[0].actor.toString()).toBe('testuser1');
		expect(sessions[1].actor.toString()).toBe('testuser2');
		expect(sessions[2].actor.toString()).toBe('testuser3');
		expect(mockDiscoverAccounts).toHaveBeenCalledTimes(1);
	});

	test('handles multiple private keys', async () => {
		mockDiscoverAccounts.mockClear();
		// First key discovers 2 accounts
		mockDiscoverAccounts.mockResolvedValueOnce([
			{ actor: 'user1', permission: 'claim', publicKey: 'PUB_K1_...' },
			{ actor: 'user2', permission: 'claim', publicKey: 'PUB_K1_...' }
		]);
		// Second key discovers 1 account
		mockDiscoverAccounts.mockResolvedValueOnce([
			{ actor: 'user3', permission: 'claim', publicKey: 'PUB_K1_...' }
		]);

		const { createSessions } = await import('../../src/lib/wharf');
		const accounts: AccountConfig[] = [
			{ privkey: '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3' },
			{ privkey: 'PVT_K1_2NQT4pcthA17Smy3QbT9M9PEgmGt9ASTFZ2TW2t6PAV1ndebxm' }
		];

		const sessions = await createSessions(accounts);

		// Should create 3 total sessions from 2 keys
		expect(sessions).toHaveLength(3);
		expect(mockDiscoverAccounts).toHaveBeenCalledTimes(2);
	});

	test('returns empty array when no accounts discovered', async () => {
		mockDiscoverAccounts.mockClear();
		mockDiscoverAccounts.mockResolvedValue([]);

		const { createSessions } = await import('../../src/lib/wharf');
		const accounts: AccountConfig[] = [
			{ privkey: '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3' }
		];

		const sessions = await createSessions(accounts);

		expect(sessions).toEqual([]);
		expect(mockDiscoverAccounts).toHaveBeenCalledTimes(1);
	});

	test('skips private key with no claim permissions', async () => {
		mockDiscoverAccounts.mockClear();
		// First key: no accounts
		mockDiscoverAccounts.mockResolvedValueOnce([]);
		// Second key: 1 account
		mockDiscoverAccounts.mockResolvedValueOnce([
			{ actor: 'user1', permission: 'claim', publicKey: 'PUB_K1_...' }
		]);

		const { createSessions } = await import('../../src/lib/wharf');
		const accounts: AccountConfig[] = [
			{ privkey: '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3' },
			{ privkey: 'PVT_K1_2NQT4pcthA17Smy3QbT9M9PEgmGt9ASTFZ2TW2t6PAV1ndebxm' }
		];

		const sessions = await createSessions(accounts);

		// Should only create 1 session (from second key)
		expect(sessions).toHaveLength(1);
		expect(sessions[0].actor.toString()).toBe('user1');
	});

	test('throws error on discovery failure', async () => {
		mockDiscoverAccounts.mockClear();
		mockDiscoverAccounts.mockRejectedValue(new Error('API connection failed'));

		const { createSessions } = await import('../../src/lib/wharf');
		const accounts: AccountConfig[] = [
			{ privkey: '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3' }
		];

		await expect(createSessions(accounts)).rejects.toThrow(
			'Failed to create sessions for PRIVATE_KEY1: API connection failed'
		);
	});

	test('passes private key to discoverAccountsFromPrivateKey', async () => {
		mockDiscoverAccounts.mockClear();
		mockDiscoverAccounts.mockResolvedValue([
			{ actor: 'user1', permission: 'claim', publicKey: 'PUB_K1_...' }
		]);

		const { createSessions } = await import('../../src/lib/wharf');
		const testPrivKey = '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3';
		const accounts: AccountConfig[] = [{ privkey: testPrivKey }];

		await createSessions(accounts);

		// Verify correct arguments passed to discovery function
		expect(mockDiscoverAccounts).toHaveBeenCalledWith(
			testPrivKey,
			expect.any(Object), // APIClient
			'claim' // preferredPermission
		);
	});

	test('filters to only "claim" permissions', async () => {
		mockDiscoverAccounts.mockClear();
		mockDiscoverAccounts.mockResolvedValue([
			{ actor: 'user1', permission: 'claim', publicKey: 'PUB_K1_...' }
		]);

		const { createSessions } = await import('../../src/lib/wharf');
		const accounts: AccountConfig[] = [
			{ privkey: '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3' }
		];

		await createSessions(accounts);

		// Verify "claim" permission filter was passed
		const callArgs = mockDiscoverAccounts.mock.calls[0];
		expect(callArgs[2]).toBe('claim');
	});

	test('creates valid Session objects with correct properties', async () => {
		mockDiscoverAccounts.mockClear();
		mockDiscoverAccounts.mockResolvedValue([
			{
				actor: 'testuser',
				permission: 'claim',
				publicKey: 'PUB_K1_6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5BoDq63'
			}
		]);

		const { createSessions } = await import('../../src/lib/wharf');
		const accounts: AccountConfig[] = [
			{ privkey: '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3' }
		];

		const sessions = await createSessions(accounts);

		// Verify Session object structure
		expect(sessions[0]).toHaveProperty('actor');
		expect(sessions[0]).toHaveProperty('permission');
		expect(sessions[0]).toHaveProperty('chain');
		expect(sessions[0]).toHaveProperty('walletPlugin');
		expect(typeof sessions[0].transact).toBe('function');
	});

	test('handles empty accounts array', async () => {
		mockDiscoverAccounts.mockClear();

		const { createSessions } = await import('../../src/lib/wharf');
		const sessions = await createSessions([]);

		expect(sessions).toEqual([]);
		expect(mockDiscoverAccounts).not.toHaveBeenCalled();
	});

	test('preserves order of sessions from discovery', async () => {
		mockDiscoverAccounts.mockClear();
		mockDiscoverAccounts.mockResolvedValue([
			{ actor: 'alpha', permission: 'claim', publicKey: 'PUB_K1_...' },
			{ actor: 'beta', permission: 'claim', publicKey: 'PUB_K1_...' },
			{ actor: 'gamma', permission: 'claim', publicKey: 'PUB_K1_...' }
		]);

		const { createSessions } = await import('../../src/lib/wharf');
		const accounts: AccountConfig[] = [
			{ privkey: '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3' }
		];

		const sessions = await createSessions(accounts);

		// Verify order is preserved
		expect(sessions[0].actor.toString()).toBe('alpha');
		expect(sessions[1].actor.toString()).toBe('beta');
		expect(sessions[2].actor.toString()).toBe('gamma');
	});

	test('includes keyIndex in error message for specific key', async () => {
		mockDiscoverAccounts.mockClear();
		mockDiscoverAccounts.mockResolvedValueOnce([
			{ actor: 'user1', permission: 'claim', publicKey: 'PUB_K1_...' }
		]);
		mockDiscoverAccounts.mockRejectedValueOnce(new Error('Network timeout'));

		const { createSessions } = await import('../../src/lib/wharf');
		const accounts: AccountConfig[] = [
			{ privkey: '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3' },
			{ privkey: 'PVT_K1_2NQT4pcthA17Smy3QbT9M9PEgmGt9ASTFZ2TW2t6PAV1ndebxm' }
		];

		await expect(createSessions(accounts)).rejects.toThrow(
			'Failed to create sessions for PRIVATE_KEY2: Network timeout'
		);
	});
});
