import type { Config } from './config';
import { logger } from './logger';

export interface DropletsResponse {
	account: string;
	droplets: number;
	last_claim?: string;
}

export interface Droplet {
	_id: string;
	owner: string;
	bound: boolean;
	created: string;
	[key: string]: any;
}

export interface DropletsListResponse {
	droplets: Droplet[];
	total: number;
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

/**
 * Fetch actual droplet IDs for an account from the API
 * 
 * @param account - Account name
 * @param config - Configuration with API URL
 * @param limit - Maximum number of droplets to fetch (default: 5000)
 * @param skip - Number of droplets to skip (for pagination)
 * @returns Array of droplet objects with IDs
 */
export async function fetchDropletIds(
	account: string,
	config: Config,
	limit: number = 5000,
	skip: number = 0
): Promise<Droplet[]> {
	try {
		const url = `${config.scrapApiUrl}/get/droplets?account=${account}&limit=${limit}&skip=${skip}`;
		logger.debug('Fetching droplet IDs', { account, limit, skip, url });

		const response = await fetch(url);

		if (!response.ok) {
			throw new Error(`API returned ${response.status}: ${response.statusText}`);
		}

		const data = (await response.json()) as DropletsListResponse;

		logger.debug('Received droplet list', {
			account,
			droplets: data.droplets.length,
			total: data.total
		});

		return data.droplets || [];
	} catch (error) {
		logger.error('Failed to fetch droplet IDs', { account, error });
		throw error;
	}
}
