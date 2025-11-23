/**
 * Unit tests for src/lib/config.ts
 *
 * Tests account loading and configuration validation.
 * Uses test/.env for isolated test environment.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';

// Store original env vars to restore after tests
const originalEnv = { ...process.env };

describe('Config: loadAccounts()', () => {
	beforeEach(() => {
		// Clear all ACCOUNT* env vars before each test
		Object.keys(process.env).forEach((key) => {
			if (key.startsWith('ACCOUNT')) {
				delete process.env[key];
			}
		});
	});

	afterEach(() => {
		// Restore original env after each test
		process.env = { ...originalEnv };
	});

	test('loads single account from environment', async () => {
		// Set up test account
		process.env.ACCOUNT1_NAME = 'testuser1';
		process.env.ACCOUNT1_PERMISSION = 'claim';
		process.env.ACCOUNT1_KEY = '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3';

		// Dynamically import to get fresh module with new env vars
		const { loadAccounts } = await import('../src/lib/config');
		const accounts = loadAccounts();

		expect(accounts).toHaveLength(1);
		expect(accounts[0].actor).toBe('testuser1');
		expect(accounts[0].permission).toBe('claim');
		expect(accounts[0].privkey).toBe('5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3');
	});

	test('loads multiple accounts from environment', async () => {
		// Set up multiple test accounts
		process.env.ACCOUNT1_NAME = 'testuser1';
		process.env.ACCOUNT1_PERMISSION = 'claim';
		process.env.ACCOUNT1_KEY = '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3';

		process.env.ACCOUNT2_NAME = 'testuser2';
		process.env.ACCOUNT2_PERMISSION = 'active';
		process.env.ACCOUNT2_KEY = '5JgqWJYVBcRhviWZB3TU1tN6pG7ufhqcQqqLfNxgEfBYDVqNrZB';

		process.env.ACCOUNT3_NAME = 'testuser3';
		process.env.ACCOUNT3_KEY = '5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbLvyTHU';

		const { loadAccounts } = await import('../src/lib/config');
		const accounts = loadAccounts();

		expect(accounts).toHaveLength(3);
		expect(accounts[0].actor).toBe('testuser1');
		expect(accounts[1].actor).toBe('testuser2');
		expect(accounts[1].permission).toBe('active');
		expect(accounts[2].actor).toBe('testuser3');
		expect(accounts[2].permission).toBe('claim'); // default permission
	});

	test('uses default permission when not specified', async () => {
		process.env.ACCOUNT1_NAME = 'testuser1';
		process.env.ACCOUNT1_KEY = '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3';
		// ACCOUNT1_PERMISSION not set

		const { loadAccounts } = await import('../src/lib/config');
		const accounts = loadAccounts();

		expect(accounts[0].permission).toBe('claim'); // default
	});

	test('throws error when private key is missing', async () => {
		process.env.ACCOUNT1_NAME = 'testuser1';
		process.env.ACCOUNT1_PERMISSION = 'claim';
		// ACCOUNT1_KEY not set

		const { loadAccounts } = await import('../src/lib/config');

		expect(() => loadAccounts()).toThrow('ACCOUNT1_KEY is required');
	});

	test('throws error when no accounts are configured', async () => {
		// No ACCOUNT* env vars set

		const { loadAccounts } = await import('../src/lib/config');

		expect(() => loadAccounts()).toThrow('No accounts configured');
	});

	test('handles non-sequential account numbers gracefully', async () => {
		// Only ACCOUNT1 and ACCOUNT3 (missing ACCOUNT2)
		process.env.ACCOUNT1_NAME = 'testuser1';
		process.env.ACCOUNT1_KEY = '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3';

		process.env.ACCOUNT3_NAME = 'testuser3';
		process.env.ACCOUNT3_KEY = '5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbLvyTHU';

		const { loadAccounts } = await import('../src/lib/config');
		const accounts = loadAccounts();

		// Should only load ACCOUNT1 (stops at first gap)
		expect(accounts).toHaveLength(1);
		expect(accounts[0].actor).toBe('testuser1');
	});
});

describe('Config: validateConfig()', () => {
	test('logs configuration summary', async () => {
		// Set valid env vars
		process.env.CHAIN_NAME = 'EOS';
		process.env.SCRAP_API_URL = 'ws://localhost:3000';
		process.env.CLAIM_ENABLED = 'true';

		const { validateConfig } = await import('../src/lib/config');

		// Should not throw
		expect(() => validateConfig()).not.toThrow();
	});

	test('warns when CLAIM_ENABLED is false', async () => {
		process.env.CLAIM_ENABLED = 'false';

		const { validateConfig } = await import('../src/lib/config');

		// Should not throw but will warn (we can't easily test console output)
		expect(() => validateConfig()).not.toThrow();
	});
});
