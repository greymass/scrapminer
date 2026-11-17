/**
 * Utility Functions
 *
 * Common helpers used throughout the application.
 * Pattern from: resource-provider/src/lib/utils.ts
 */

import type { ABISerializable, APIClient } from '@wharfkit/antelope';
import { PrivateKey } from '@wharfkit/antelope';
import { logger } from './logger';

/**
 * Convert Wharfkit types to plain JSON objects for logging
 *
 * This is critical for logging complex types like Session, UInt64, Action, etc.
 * Without this, they don't serialize properly in JSON logs.
 *
 * @param data - Any Wharfkit ABISerializable type or plain object
 * @returns Plain JSON-serializable object
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function objectify(data: ABISerializable | Record<string, any>) {
	return JSON.parse(JSON.stringify(data));
}

/**
 * Check if environment variable is set to 'true'
 */
export const isENVTrue = (value: string | undefined): boolean => value === 'true';

/**
 * Check if environment variable is set to 'false'
 */
export const isENVFalse = (value: string | undefined): boolean => value === 'false';

/**
 * Discovered account/permission from private key lookup
 */
export interface DiscoveredAccount {
	actor: string;
	permission: string;
	publicKey: string;
}

/**
 * Convert private key to public key and lookup ALL associated accounts/permissions
 *
 * Uses the /v1/chain/get_accounts_by_authorizers API endpoint to find all
 * account/permission combinations authorized by this private key.
 *
 * @param privkey - Private key in WIF format (e.g., "5K...")
 * @param client - APIClient instance for making blockchain queries
 * @param preferredPermission - Filter to only this permission name if provided (e.g., "claim")
 * @returns Array of all discovered accounts (empty array if none found)
 * @throws Error if API call fails
 */
export async function discoverAccountsFromPrivateKey(
	privkey: string,
	client: APIClient,
	preferredPermission?: string
): Promise<DiscoveredAccount[]> {
	try {
		// Convert private key to public key
		const privateKey = PrivateKey.from(privkey);
		const publicKey = privateKey.toPublic();

		// Query blockchain for accounts authorized by this public key
		const response = await client.v1.chain.get_accounts_by_authorizers({
			keys: [publicKey]
		});

		if (!response.accounts || response.accounts.length === 0) {
			console.log(`No accounts found for public key ${String(publicKey)}`);
			return [];
		}

		// Convert all accounts to DiscoveredAccount format
		let accounts = response.accounts.map((row) => ({
			actor: String(row.account_name),
			permission: String(row.permission_name),
			publicKey: String(publicKey)
		}));

		// Filter by preferred permission if specified
		if (preferredPermission) {
			accounts = accounts.filter((acc) => acc.permission === preferredPermission);
		}

		// Log discovered accounts
		logger.debug('Discovered accounts from private key', {
			count: accounts.length,
			accounts: accounts.map((acc) => `${acc.actor}@${acc.permission}`)
		});

		return accounts;
	} catch (error) {
		throw new Error(`Failed to discover accounts from private key: ${error.message}`);
	}
}

const CLAIM_ACTIONS = ['destroy', 'generate'];
const PROTECTED_PERMISSIONS = ['owner', 'active'];

export async function discoverClaimAccounts(
	privkey: string,
	client: APIClient,
	contract: string
): Promise<DiscoveredAccount[]> {
	const candidates = (await discoverAccountsFromPrivateKey(privkey, client)).filter(
		(acc) => !PROTECTED_PERMISSIONS.includes(acc.permission)
	);

	const byActor = new Map<string, DiscoveredAccount[]>();
	for (const acc of candidates) {
		byActor.set(acc.actor, [...(byActor.get(acc.actor) ?? []), acc]);
	}

	const result: DiscoveredAccount[] = [];
	for (const [actor, perms] of byActor) {
		const account = await client.v1.chain.get_account(actor);
		const match = perms.find((candidate) => {
			const permission = account.permissions.find((p) =>
				p.perm_name.equals(candidate.permission)
			);
			const links = permission?.linked_actions ?? [];
			return CLAIM_ACTIONS.every((action) =>
				links.some(
					(link) =>
						link.account.equals(contract) &&
						(link.action.equals(action) || link.action.equals(''))
				)
			);
		});
		if (match) {
			result.push(match);
		} else {
			logger.debug('No permission linked to claim actions', {
				actor,
				permissions: perms.map((p) => p.permission)
			});
		}
	}

	return result;
}
