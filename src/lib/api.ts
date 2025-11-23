import type { Config } from './config';
import { logger } from './logger';

export interface DropletsResponse {
	account: string;
	droplets: number;
	last_claim?: string;
}

export async function checkClaimable(account: string, config: Config): Promise<number> {
	try {
		const url = `${config.scrapApiUrl}/get/droplets?account=${account}`;
		logger.debug('Checking claimable droplets', { account, url });

		const response = await fetch(url);

		if (!response.ok) {
			throw new Error(`API returned ${response.status}: ${response.statusText}`);
		}

		const data = (await response.json()) as DropletsResponse;

		logger.debug('Received droplets data', {
			account,
			droplets: data.droplets,
			last_claim: data.last_claim
		});

		return data.droplets || 0;
	} catch (error) {
		logger.error('Failed to check claimable balance', { account, error });
		throw error;
	}
}

export async function getAccountDroplets(
	accounts: string[],
	config: Config
): Promise<Map<string, number>> {
	const results = new Map<string, number>();

	// Query all accounts in parallel
	const promises = accounts.map(async (account) => {
		try {
			const droplets = await checkClaimable(account, config);
			results.set(account, droplets);
		} catch (_error) {
			// Set to 0 on error - will skip claim
			results.set(account, 0);
		}
	});

	await Promise.all(promises);

	return results;
}
