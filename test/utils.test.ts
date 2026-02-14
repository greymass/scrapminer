/**
 * Unit tests for src/lib/utils.ts
 *
 * Tests utility functions for environment variable handling,
 * object serialization, and account discovery.
 */

import { describe, test, expect, mock } from 'bun:test';
import { objectify, isENVTrue, isENVFalse, discoverAccountsFromPrivateKey } from '../src/lib/utils';
import { PrivateKey } from '@wharfkit/antelope';
import type { APIClient } from '@wharfkit/antelope';

describe('Utils: objectify()', () => {
	test('converts plain object to JSON', () => {
		const input = { foo: 'bar', baz: 123 };
		const result = objectify(input);

		expect(result).toEqual(input);
		expect(typeof result).toBe('object');
	});

	test('handles nested objects', () => {
		const input = {
			level1: {
				level2: {
					level3: 'deep'
				}
			}
		};
		const result = objectify(input);

		expect(result).toEqual(input);
		expect(result.level1.level2.level3).toBe('deep');
	});

	test('handles arrays', () => {
		const input = [1, 2, 3, { nested: true }];
		const result = objectify(input);

		expect(result).toEqual(input);
		expect(Array.isArray(result)).toBe(true);
	});

	test('serializes complex types to JSON-compatible format', () => {
		// Simulate a Wharfkit type with toJSON method
		const input = {
			name: 'test',
			value: {
				toJSON: () => ({ serialized: true })
			}
		};

		const result = objectify(input);

		// After JSON parse/stringify, toJSON method is called
		expect(result.value).toEqual({ serialized: true });
	});
});

describe('Utils: isENVTrue()', () => {
	test('returns true for "true" string', () => {
		expect(isENVTrue('true')).toBe(true);
	});

	test('returns false for "false" string', () => {
		expect(isENVTrue('false')).toBe(false);
	});

	test('returns false for "1" string', () => {
		expect(isENVTrue('1')).toBe(false);
	});

	test('returns false for empty string', () => {
		expect(isENVTrue('')).toBe(false);
	});

	test('returns false for undefined', () => {
		expect(isENVTrue(undefined)).toBe(false);
	});

	test('returns false for any other string', () => {
		expect(isENVTrue('yes')).toBe(false);
		expect(isENVTrue('TRUE')).toBe(false);
		expect(isENVTrue('True')).toBe(false);
	});
});

describe('Utils: isENVFalse()', () => {
	test('returns true for "false" string', () => {
		expect(isENVFalse('false')).toBe(true);
	});

	test('returns false for "true" string', () => {
		expect(isENVFalse('true')).toBe(false);
	});

	test('returns false for "0" string', () => {
		expect(isENVFalse('0')).toBe(false);
	});

	test('returns false for empty string', () => {
		expect(isENVFalse('')).toBe(false);
	});

	test('returns false for undefined', () => {
		expect(isENVFalse(undefined)).toBe(false);
	});

	test('returns false for any other string', () => {
		expect(isENVFalse('no')).toBe(false);
		expect(isENVFalse('FALSE')).toBe(false);
		expect(isENVFalse('False')).toBe(false);
	});
});

describe('Utils: discoverAccountsFromPrivateKey()', () => {
	// Sample test private key (from EOS docs - publicly known)
	const testPrivateKey = '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3';
	// Note: Using PUB_K1_ format (modern Antelope format, not legacy EOS format)
	const testPublicKey = 'PUB_K1_6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5BoDq63';

	test('discovers accounts with multiple permissions', async () => {
		// Mock API response with multiple accounts/permissions
		const mockClient = {
			v1: {
				chain: {
					get_accounts_by_authorizers: mock(() =>
						Promise.resolve({
							accounts: [
								{ account_name: 'testuser1', permission_name: 'active' },
								{ account_name: 'testuser1', permission_name: 'claim' },
								{ account_name: 'testuser2', permission_name: 'active' }
							]
						})
					)
				}
			}
		} as unknown as APIClient;

		const accounts = await discoverAccountsFromPrivateKey(testPrivateKey, mockClient);

		expect(accounts).toHaveLength(3);
		expect(accounts[0]).toEqual({
			actor: 'testuser1',
			permission: 'active',
			publicKey: testPublicKey
		});
		expect(accounts[1]).toEqual({
			actor: 'testuser1',
			permission: 'claim',
			publicKey: testPublicKey
		});
		expect(accounts[2]).toEqual({
			actor: 'testuser2',
			permission: 'active',
			publicKey: testPublicKey
		});

		// Verify API was called with correct public key
		expect(mockClient.v1.chain.get_accounts_by_authorizers).toHaveBeenCalledWith({
			keys: [expect.any(Object)] // PublicKey object
		});
	});

	test('filters by preferred permission', async () => {
		const mockClient = {
			v1: {
				chain: {
					get_accounts_by_authorizers: mock(() =>
						Promise.resolve({
							accounts: [
								{ account_name: 'testuser1', permission_name: 'active' },
								{ account_name: 'testuser1', permission_name: 'claim' },
								{ account_name: 'testuser2', permission_name: 'claim' }
							]
						})
					)
				}
			}
		} as unknown as APIClient;

		const accounts = await discoverAccountsFromPrivateKey(testPrivateKey, mockClient, 'claim');

		// Should only return 'claim' permissions
		expect(accounts).toHaveLength(2);
		expect(accounts[0].permission).toBe('claim');
		expect(accounts[1].permission).toBe('claim');
		expect(accounts[0].actor).toBe('testuser1');
		expect(accounts[1].actor).toBe('testuser2');
	});

	test('returns empty array when no accounts found', async () => {
		const mockClient = {
			v1: {
				chain: {
					get_accounts_by_authorizers: mock(() =>
						Promise.resolve({
							accounts: []
						})
					)
				}
			}
		} as unknown as APIClient;

		const accounts = await discoverAccountsFromPrivateKey(testPrivateKey, mockClient);

		expect(accounts).toEqual([]);
	});

	test('returns empty array when response.accounts is undefined', async () => {
		const mockClient = {
			v1: {
				chain: {
					get_accounts_by_authorizers: mock(() => Promise.resolve({}))
				}
			}
		} as unknown as APIClient;

		const accounts = await discoverAccountsFromPrivateKey(testPrivateKey, mockClient);

		expect(accounts).toEqual([]);
	});

	test('returns empty array when preferred permission not found', async () => {
		const mockClient = {
			v1: {
				chain: {
					get_accounts_by_authorizers: mock(() =>
						Promise.resolve({
							accounts: [
								{ account_name: 'testuser1', permission_name: 'active' },
								{ account_name: 'testuser2', permission_name: 'owner' }
							]
						})
					)
				}
			}
		} as unknown as APIClient;

		const accounts = await discoverAccountsFromPrivateKey(testPrivateKey, mockClient, 'claim');

		expect(accounts).toEqual([]);
	});

	test('throws error on API failure', async () => {
		const mockClient = {
			v1: {
				chain: {
					get_accounts_by_authorizers: mock(() =>
						Promise.reject(new Error('Network timeout'))
					)
				}
			}
		} as unknown as APIClient;

		await expect(
			discoverAccountsFromPrivateKey(testPrivateKey, mockClient)
		).rejects.toThrow('Failed to discover accounts from private key: Network timeout');
	});

	test('throws error on invalid private key', async () => {
		const mockClient = {
			v1: {
				chain: {
					get_accounts_by_authorizers: mock(() => Promise.resolve({ accounts: [] }))
				}
			}
		} as unknown as APIClient;

		// PrivateKey.from() will throw on invalid key
		await expect(
			discoverAccountsFromPrivateKey('invalid-key', mockClient)
		).rejects.toThrow();
	});

	test('converts private key to public key correctly', async () => {
		const mockClient = {
			v1: {
				chain: {
					get_accounts_by_authorizers: mock(() =>
						Promise.resolve({
							accounts: [{ account_name: 'testuser', permission_name: 'active' }]
						})
					)
				}
			}
		} as unknown as APIClient;

		const accounts = await discoverAccountsFromPrivateKey(testPrivateKey, mockClient);

		// Verify public key was derived correctly
		expect(accounts[0].publicKey).toBe(testPublicKey);
	});

	test('handles single account with single permission', async () => {
		const mockClient = {
			v1: {
				chain: {
					get_accounts_by_authorizers: mock(() =>
						Promise.resolve({
							accounts: [{ account_name: 'testuser', permission_name: 'claim' }]
						})
					)
				}
			}
		} as unknown as APIClient;

		const accounts = await discoverAccountsFromPrivateKey(testPrivateKey, mockClient);

		expect(accounts).toHaveLength(1);
		expect(accounts[0]).toEqual({
			actor: 'testuser',
			permission: 'claim',
			publicKey: testPublicKey
		});
	});

	test('handles account names as Name types (converts to string)', async () => {
		const mockClient = {
			v1: {
				chain: {
					get_accounts_by_authorizers: mock(() =>
						Promise.resolve({
							accounts: [
								{
									account_name: { toString: () => 'testuser1' }, // Name type
									permission_name: { toString: () => 'active' } // Name type
								}
							]
						})
					)
				}
			}
		} as unknown as APIClient;

		const accounts = await discoverAccountsFromPrivateKey(testPrivateKey, mockClient);

		// Should convert Name types to strings
		expect(accounts[0].actor).toBe('testuser1');
		expect(accounts[0].permission).toBe('active');
		expect(typeof accounts[0].actor).toBe('string');
		expect(typeof accounts[0].permission).toBe('string');
	});
});
