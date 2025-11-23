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
import { discoverAccountFromPrivateKey } from './utils';

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
 * 3. Queries blockchain to discover account/permission pairs
 * 4. Creates Session objects with discovered credentials
 *
 * Prefers "claim" permission if available, otherwise uses first discovered permission.
 */
export async function createSessions(accounts: AccountConfig[]): Promise<Session[]> {
	const sessions: Session[] = [];

	for (let i = 0; i < accounts.length; i++) {
		const account = accounts[i];

		configLog.info('Discovering account from private key', {
			accountIndex: i + 1
		});

		try {
			// Discover account/permission from private key
			const discovered = await discoverAccountFromPrivateKey(
				account.privkey,
				client,
				'claim' // Prefer "claim" permission if available
			);

			configLog.info('Account discovered', {
				accountIndex: i + 1,
				actor: discovered.actor,
				permission: discovered.permission,
				publicKey: discovered.publicKey
			});

			// Create session with discovered credentials
			const session = new Session({
				chain,
				actor: discovered.actor,
				permission: discovered.permission,
				walletPlugin: new WalletPluginPrivateKey(account.privkey)
			});

			sessions.push(session);
		} catch (error) {
			throw new Error(`Failed to create session for ACCOUNT${i + 1}_KEY: ${error.message}`);
		}
	}

	return sessions;
}
