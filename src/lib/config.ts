/**
 * Account Configuration Module
 *
 * Loads account configurations from environment variables.
 * This is kept separate from the main config because account loading
 * is more complex and needs to be called at runtime.
 */

import {
	CHAIN_NAME,
	CLAIM_BATCH_SIZE,
	CLAIM_ENABLED,
	CLAIM_INTERVAL,
	SCRAP_API_URL
} from '../config';
import { configLog } from './logger';

export interface AccountConfig {
	privkey: string;
}

/**
 * Load accounts from environment variables
 * Format: PRIVATE_KEY (single key only)
 *
 * Account name and permission are discovered at runtime via
 * get_accounts_by_authorizers API call.
 */
export function loadAccounts(): AccountConfig[] {
	const accounts: AccountConfig[] = [];

	const privkey = process.env.PRIVATE_KEY;
	if (!privkey) {
		throw new Error('No account configured. Set PRIVATE_KEY in .env');
	}

	accounts.push({ privkey });
	configLog.info('Loaded account configuration from PRIVATE_KEY');

	return accounts;
}

/**
 * Validate required environment variables and log configuration summary
 *
 * Note: Most validation now happens in config.ts at module load time.
 * This function just logs a summary and checks CLAIM_ENABLED flag.
 */
export function validateConfig(): void {
	// Check CLAIM_ENABLED flag
	if (!CLAIM_ENABLED) {
		configLog.warn(
			'⚠️  CLAIM_ENABLED is not set to true - running in DRY RUN mode (no transactions will be broadcast)'
		);
	}

	configLog.info('Configuration validated', {
		chain: CHAIN_NAME,
		apiUrl: SCRAP_API_URL,
		claimEnabled: CLAIM_ENABLED,
		claimInterval: CLAIM_INTERVAL,
		batchSize: CLAIM_BATCH_SIZE
	});
}
