/**
 * Wharf/Session Management Module
 *
 * Handles blockchain client initialization and session creation
 * for all configured accounts.
 */

import { APIClient, Chains, Session } from '@wharfkit/session';
import { WalletPluginPrivateKey } from '@wharfkit/wallet-plugin-privatekey';
import { CHAIN_NAME, CONTRACT_NAME, LEAP_API, SCRAP_CONTRACT } from '../config';
import type { AccountConfig } from './config';
import { Contract as DropsContract } from './contracts/drops';
import { Contract as ScrapContract } from './contracts/scrap';
import { configLog } from './logger';
import { discoverAccountsFromPrivateKey } from './utils';

// Get chain configuration
export const chain = Chains[CHAIN_NAME];
if (!chain) {
	throw new Error(`Invalid CHAIN_NAME: ${CHAIN_NAME}`);
}

// Initialize API client
export const client = new APIClient({ url: LEAP_API || chain.url });

// Contract names
export const contractName = CONTRACT_NAME;
export const scrapContractName = SCRAP_CONTRACT;

// Initialize contract instances
export const dropsContract = new DropsContract({ client, account: contractName });
export const scrapContract = new ScrapContract({ client, account: scrapContractName });

/**
 * Create Wharf sessions for all configured accounts
 *
 * This function:
 * 1. Takes private keys from environment configuration
 * 2. Converts each private key to public key
 * 3. Queries blockchain to discover ALL account/permission pairs for each key
 * 4. Filters to only "claim" permissions
 * 5. Creates Session objects for all discovered accounts
 *
 * A single private key may control multiple accounts - all will be claimed for.
 */
export async function createSessions(accounts: AccountConfig[]): Promise<Session[]> {
	const sessions: Session[] = [];

	for (let i = 0; i < accounts.length; i++) {
		const account = accounts[i];

		configLog.info('Discovering accounts from private key', {
			keyIndex: i + 1
		});

		try {
			// Discover ALL accounts/permissions from private key (filtered to "claim" permission)
			const discoveredAccounts = await discoverAccountsFromPrivateKey(
				account.privkey,
				client,
				'claim' // Only use "claim" permissions
			);

			if (discoveredAccounts.length === 0) {
				configLog.warn('No accounts with "claim" permission found for private key', {
					keyIndex: i + 1
				});
				continue;
			}

			configLog.info('Accounts discovered', {
				keyIndex: i + 1,
				accountCount: discoveredAccounts.length,
				accounts: discoveredAccounts.map((acc) => `${acc.actor}@${acc.permission}`)
			});

			// Create session for each discovered account
			for (const discovered of discoveredAccounts) {
				configLog.info('Creating session', {
					actor: discovered.actor,
					permission: discovered.permission,
					publicKey: discovered.publicKey
				});

				const session = new Session({
					chain,
					actor: discovered.actor,
					permission: discovered.permission,
					walletPlugin: new WalletPluginPrivateKey(account.privkey)
				});

				sessions.push(session);
			}
		} catch (error) {
			throw new Error(`Failed to create sessions for PRIVATE_KEY${i + 1}: ${error.message}`);
		}
	}

	return sessions;
}
