/**
 * Account Synchronization Module
 *
 * Periodically re-discovers accounts from configured private keys to ensure
 * the session list stays in sync with blockchain permission changes.
 *
 * This handles cases where:
 * - Accounts add/remove the claim permission
 * - The private key is added to new accounts
 * - Permission configurations change
 */

import { Session } from '@wharfkit/session';
import { WalletPluginPrivateKey } from '@wharfkit/wallet-plugin-privatekey';
import type { AccountConfig } from './config';
import { configLog } from './logger';
import { type DiscoveredAccount, discoverClaimAccounts } from './utils';
import { chain, client, contractName } from './wharf';

/**
 * Account discovery result comparing old vs new state
 */
export interface AccountSyncResult {
	added: DiscoveredAccount[];
	removed: DiscoveredAccount[];
	unchanged: DiscoveredAccount[];
	hasChanges: boolean;
}

/**
 * Re-discover accounts from private keys and compare with current sessions
 *
 * @param accounts - Account configurations with private keys
 * @param currentSessions - Current active sessions
 * @returns Sync result with added/removed/unchanged accounts
 */
export async function syncAccounts(
	accounts: AccountConfig[],
	currentSessions: Session[]
): Promise<AccountSyncResult> {
	configLog.debug('Starting account sync', {
		privateKeys: accounts.length,
		currentSessions: currentSessions.length
	});

	// Build map of current sessions for comparison
	const currentAccountMap = new Map<string, Session>();
	for (const session of currentSessions) {
		const key = `${String(session.actor)}@${String(session.permission)}`;
		currentAccountMap.set(key, session);
	}

	// Discover accounts from all private keys
	const allDiscovered: DiscoveredAccount[] = [];
	for (let i = 0; i < accounts.length; i++) {
		const account = accounts[i];

		try {
			const discovered = await discoverClaimAccounts(account.privkey, client, contractName);

			allDiscovered.push(...discovered);

			if (discovered.length === 0) {
				configLog.warn('No permission linked to the claim actions found', {
					keyIndex: i + 1
				});
			}
		} catch (error) {
			configLog.error('Failed to discover accounts from private key', {
				keyIndex: i + 1,
				error: error.message
			});
		}
	}

	// Build map of discovered accounts
	const discoveredMap = new Map<string, DiscoveredAccount>();
	for (const discovered of allDiscovered) {
		const key = `${discovered.actor}@${discovered.permission}`;
		discoveredMap.set(key, discovered);
	}

	// Compare and categorize changes
	const added: DiscoveredAccount[] = [];
	const removed: DiscoveredAccount[] = [];
	const unchanged: DiscoveredAccount[] = [];

	// Find added and unchanged accounts
	for (const [key, discovered] of discoveredMap.entries()) {
		if (currentAccountMap.has(key)) {
			unchanged.push(discovered);
		} else {
			added.push(discovered);
		}
	}

	// Find removed accounts
	for (const [key, session] of currentAccountMap.entries()) {
		if (!discoveredMap.has(key)) {
			removed.push({
				actor: String(session.actor),
				permission: String(session.permission),
				publicKey: '' // Not needed for removal
			});
		}
	}

	const hasChanges = added.length > 0 || removed.length > 0;

	configLog.debug('Account discovery complete', {
		discovered: allDiscovered.length,
		added: added.length,
		removed: removed.length,
		unchanged: unchanged.length
	});

	return {
		added,
		removed,
		unchanged,
		hasChanges
	};
}

/**
 * Create sessions for newly discovered accounts
 *
 * @param accounts - Account configurations with private keys
 * @param discovered - Newly discovered accounts to create sessions for
 * @returns Array of new Session objects
 */
export function createSessionsForDiscoveredAccounts(
	accounts: AccountConfig[],
	discovered: DiscoveredAccount[]
): Session[] {
	const sessions: Session[] = [];

	// Build a map of public key -> private key for quick lookup
	const keyMap = new Map<string, string>();
	for (const account of accounts) {
		try {
			const PrivateKey = require('@wharfkit/antelope').PrivateKey;
			const privateKey = PrivateKey.from(account.privkey);
			const publicKey = privateKey.toPublic();
			keyMap.set(String(publicKey), account.privkey);
		} catch (error) {
			configLog.error('Failed to process private key', {
				error: error.message
			});
		}
	}

	// Create session for each discovered account
	for (const disc of discovered) {
		const privkey = keyMap.get(disc.publicKey);
		if (!privkey) {
			configLog.error('Could not find private key for discovered account', {
				account: `${disc.actor}@${disc.permission}`,
				publicKey: disc.publicKey
			});
			continue;
		}

		configLog.info('Creating session', {
			actor: disc.actor,
			permission: disc.permission,
			publicKey: disc.publicKey
		});

		const session = new Session({
			chain,
			actor: disc.actor,
			permission: disc.permission,
			walletPlugin: new WalletPluginPrivateKey(privkey)
		});

		sessions.push(session);
	}

	return sessions;
}

/**
 * Apply sync results to current session list
 *
 * This function modifies the sessions array in-place:
 * - Removes sessions for accounts that no longer have the permission
 * - Adds sessions for newly discovered accounts
 *
 * @param sessions - Current session array (will be modified in-place)
 * @param accounts - Account configurations with private keys
 * @param syncResult - Result from syncAccounts()
 * @returns Updated session array (same reference as input)
 */
export function applySyncResults(
	sessions: Session[],
	accounts: AccountConfig[],
	syncResult: AccountSyncResult
): Session[] {
	// Remove sessions for accounts that lost the permission
	if (syncResult.removed.length > 0) {
		for (const removed of syncResult.removed) {
			const index = sessions.findIndex(
				(s) =>
					String(s.actor) === removed.actor && String(s.permission) === removed.permission
			);

			if (index !== -1) {
				sessions.splice(index, 1);
			}
		}
	}

	// Add sessions for newly discovered accounts
	if (syncResult.added.length > 0) {
		const newSessions = createSessionsForDiscoveredAccounts(accounts, syncResult.added);
		sessions.push(...newSessions);
	}

	return sessions;
}
