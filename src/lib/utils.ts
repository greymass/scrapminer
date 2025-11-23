/**
 * Utility Functions
 *
 * Common helpers used throughout the application.
 * Pattern from: resource-provider/src/lib/utils.ts
 */

import type { ABISerializable, APIClient } from '@wharfkit/antelope';
import { PrivateKey } from '@wharfkit/antelope';

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
 * Convert private key to public key and lookup associated accounts/permissions
 *
 * Uses the /v1/chain/get_accounts_by_authorizers API endpoint to find all
 * account/permission combinations authorized by this private key.
 *
 * @param privkey - Private key in WIF format (e.g., "5K...")
 * @param client - APIClient instance for making blockchain queries
 * @param preferredPermission - Preferred permission name to use if multiple found (default: "claim")
 * @returns Discovered account information
 * @throws Error if no accounts found or API call fails
 */
export async function discoverAccountFromPrivateKey(
	privkey: string,
	client: APIClient,
	preferredPermission = 'claim'
): Promise<DiscoveredAccount> {
	try {
		// Convert private key to public key
		const privateKey = PrivateKey.from(privkey);
		const publicKey = privateKey.toPublic();

		// Query blockchain for accounts authorized by this public key
		const response = await client.v1.chain.get_accounts_by_authorizers({
			keys: [publicKey]
		});

		if (!response.accounts || response.accounts.length === 0) {
			throw new Error(`No accounts found for public key ${String(publicKey)}`);
		}

		// Try to find preferred permission first
		const preferred = response.accounts.find(
			(row) => String(row.permission_name) === preferredPermission
		);

		if (preferred) {
			return {
				actor: String(preferred.account_name),
				permission: String(preferred.permission_name),
				publicKey: String(publicKey)
			};
		}

		// If preferred not found, use the first account
		const first = response.accounts[0];
		return {
			actor: String(first.account_name),
			permission: String(first.permission_name),
			publicKey: String(publicKey)
		};
	} catch (error) {
		throw new Error(`Failed to discover account from private key: ${error.message}`);
	}
}
