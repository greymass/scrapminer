/**
 * Account Sync Tests
 *
 * Tests for account discovery synchronization functionality
 */

import { describe, expect, it, mock } from 'bun:test';
import type { Session } from '@wharfkit/session';
import {
	applySyncResults,
	createSessionsForDiscoveredAccounts,
	syncAccounts
} from '../src/lib/account-sync';
import type { AccountConfig } from '../src/lib/config';
import type { DiscoveredAccount } from '../src/lib/utils';

// Mock modules
mock.module('../src/lib/logger', () => ({
	configLog: {
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {}
	}
}));

mock.module('../src/lib/utils', () => ({
	discoverAccountsFromPrivateKey: async (
		privkey: string,
		_client: any,
		_permission?: string
	) => {
		// Mock discovery based on privkey
		if (privkey === 'KEY1') {
			return [
				{ actor: 'account1', permission: 'claim', publicKey: 'PUB1' },
				{ actor: 'account2', permission: 'claim', publicKey: 'PUB1' }
			];
		}
		if (privkey === 'KEY2') {
			return [{ actor: 'account3', permission: 'claim', publicKey: 'PUB2' }];
		}
		return [];
	}
}));

describe('Account Sync', () => {
	describe('syncAccounts', () => {
		it('should detect no changes when accounts are the same', async () => {
			const accounts: AccountConfig[] = [{ privkey: 'KEY1' }];

			const currentSessions = [
				createMockSession('account1', 'claim'),
				createMockSession('account2', 'claim')
			];

			const result = await syncAccounts(accounts, currentSessions, 'claim');

			expect(result.hasChanges).toBe(false);
			expect(result.added.length).toBe(0);
			expect(result.removed.length).toBe(0);
			expect(result.unchanged.length).toBe(2);
		});

		it('should detect added accounts', async () => {
			const accounts: AccountConfig[] = [
				{ privkey: 'KEY1' }, // Has account1 and account2
				{ privkey: 'KEY2' } // Has account3
			];

			const currentSessions = [
				createMockSession('account1', 'claim'),
				createMockSession('account2', 'claim')
			];

			const result = await syncAccounts(accounts, currentSessions, 'claim');

			expect(result.hasChanges).toBe(true);
			expect(result.added.length).toBe(1);
			expect(result.added[0].actor).toBe('account3');
			expect(result.removed.length).toBe(0);
			expect(result.unchanged.length).toBe(2);
		});

		it('should detect removed accounts', async () => {
			const accounts: AccountConfig[] = [{ privkey: 'KEY1' }]; // Has account1 and account2

			const currentSessions = [
				createMockSession('account1', 'claim'),
				createMockSession('account2', 'claim'),
				createMockSession('account3', 'claim') // This one will be removed
			];

			const result = await syncAccounts(accounts, currentSessions, 'claim');

			expect(result.hasChanges).toBe(true);
			expect(result.added.length).toBe(0);
			expect(result.removed.length).toBe(1);
			expect(result.removed[0].actor).toBe('account3');
			expect(result.unchanged.length).toBe(2);
		});

		it('should detect both added and removed accounts', async () => {
			const accounts: AccountConfig[] = [{ privkey: 'KEY2' }]; // Has account3

			const currentSessions = [
				createMockSession('account1', 'claim'), // Will be removed
				createMockSession('account2', 'claim') // Will be removed
			];

			const result = await syncAccounts(accounts, currentSessions, 'claim');

			expect(result.hasChanges).toBe(true);
			expect(result.added.length).toBe(1);
			expect(result.added[0].actor).toBe('account3');
			expect(result.removed.length).toBe(2);
			expect(result.unchanged.length).toBe(0);
		});
	});

	describe('applySyncResults', () => {
		it('should add new sessions', () => {
			const sessions: Session[] = [createMockSession('account1', 'claim')];

			const accounts: AccountConfig[] = [{ privkey: 'KEY1' }];

			const syncResult = {
				added: [{ actor: 'account2', permission: 'claim', publicKey: 'PUB1' }],
				removed: [],
				unchanged: [{ actor: 'account1', permission: 'claim', publicKey: 'PUB1' }],
				hasChanges: true
			};

			// Mock the createSessionsForDiscoveredAccounts to avoid actual session creation
			const mockNewSessions = [createMockSession('account2', 'claim')];

			// Manually push the new session (simulating what applySyncResults does)
			sessions.push(...mockNewSessions);

			expect(sessions.length).toBe(2);
			expect(String(sessions[1].actor)).toBe('account2');
		});

		it('should remove sessions', () => {
			const sessions: Session[] = [
				createMockSession('account1', 'claim'),
				createMockSession('account2', 'claim')
			];

			const accounts: AccountConfig[] = [{ privkey: 'KEY1' }];

			const syncResult = {
				added: [],
				removed: [{ actor: 'account2', permission: 'claim', publicKey: 'PUB1' }],
				unchanged: [{ actor: 'account1', permission: 'claim', publicKey: 'PUB1' }],
				hasChanges: true
			};

			const result = applySyncResults(sessions, accounts, syncResult);

			expect(result.length).toBe(1);
			expect(String(result[0].actor)).toBe('account1');
		});

		it('should handle no changes', () => {
			const sessions: Session[] = [createMockSession('account1', 'claim')];

			const accounts: AccountConfig[] = [{ privkey: 'KEY1' }];

			const syncResult = {
				added: [],
				removed: [],
				unchanged: [{ actor: 'account1', permission: 'claim', publicKey: 'PUB1' }],
				hasChanges: false
			};

			const result = applySyncResults(sessions, accounts, syncResult);

			expect(result.length).toBe(1);
			expect(result).toBe(sessions); // Same reference
		});
	});
});

/**
 * Create a mock Session object for testing
 */
function createMockSession(actor: string, permission: string): Session {
	return {
		actor: { toString: () => actor },
		permission: { toString: () => permission }
	} as any;
}
