/**
 * Unit tests for src/lib/config.ts
 *
 * Tests account loading and configuration validation.
 * Uses test/.env for isolated test environment.
 *
 * NOTE: After PRIVATE_KEY refactor, loadAccounts() now only returns
 * { privkey } - account discovery happens at runtime via blockchain API.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';

// Store original env vars to restore after tests
const originalEnv = { ...process.env };

describe('Config: loadAccounts()', () => {
	beforeEach(() => {
		// Clear PRIVATE_KEY env var before each test
		delete process.env.PRIVATE_KEY;
	});

	afterEach(() => {
		// Restore original env after each test
		process.env = { ...originalEnv };
	});

	test('loads account from PRIVATE_KEY environment variable', async () => {
		// Set up test private key
		process.env.PRIVATE_KEY = '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3';

		// Dynamically import to get fresh module with new env vars
		const { loadAccounts } = await import('../src/lib/config');
		const accounts = loadAccounts();

		expect(accounts).toHaveLength(1);
		expect(accounts[0].privkey).toBe('5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3');
		// Note: actor and permission are discovered at runtime, not in config
	});

	test('throws error when PRIVATE_KEY is missing', async () => {
		// PRIVATE_KEY not set

		const { loadAccounts } = await import('../src/lib/config');

		expect(() => loadAccounts()).toThrow('No account configured. Set PRIVATE_KEY in .env');
	});

	test('returns array with single account config', async () => {
		process.env.PRIVATE_KEY = '5JgqWJYVBcRhviWZB3TU1tN6pG7ufhqcQqqLfNxgEfBYDVqNrZB';

		const { loadAccounts } = await import('../src/lib/config');
		const accounts = loadAccounts();

		// Always returns array (even though currently single key only)
		expect(Array.isArray(accounts)).toBe(true);
		expect(accounts).toHaveLength(1);
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
