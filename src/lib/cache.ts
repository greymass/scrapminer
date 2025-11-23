/**
 * Droplet Cache Module
 *
 * Manages in-memory cache of claimable droplets per account.
 * Cache is populated by periodic sync operations and consumed by claim operations.
 */

import { cacheLog } from './logger';

export interface Droplet {
	_id: string;
	owner: string;
	bound: boolean;
	created: string;
	[key: string]: any;
}

/**
 * In-memory cache of droplets per account
 */
class DropletCache {
	private cache: Map<string, Droplet[]> = new Map();
	private lastSync: Map<string, Date> = new Map();

	/**
	 * Store droplets for an account
	 */
	set(account: string, droplets: Droplet[]): void {
		this.cache.set(account, droplets);
		this.lastSync.set(account, new Date());

		cacheLog.info('Cache updated', {
			account,
			dropletCount: droplets.length,
			timestamp: new Date().toISOString()
		});
	}

	/**
	 * Get droplets for an account
	 */
	get(account: string): Droplet[] {
		return this.cache.get(account) || [];
	}

	/**
	 * Remove droplets from cache after claiming
	 */
	remove(account: string, claimedIds: string[]): void {
		const current = this.cache.get(account) || [];
		const remaining = current.filter((droplet) => !claimedIds.includes(droplet._id));

		if (remaining.length === 0) {
			this.cache.delete(account);
			cacheLog.debug('Cache cleared for account', { account });
		} else {
			this.cache.set(account, remaining);
			cacheLog.debug('Cache updated after claim', {
				account,
				claimed: claimedIds.length,
				remaining: remaining.length
			});
		}
	}

	/**
	 * Clear all droplets for an account
	 */
	clear(account: string): void {
		this.cache.delete(account);
		this.lastSync.delete(account);
		cacheLog.debug('Cache cleared', { account });
	}

	/**
	 * Clear entire cache
	 */
	clearAll(): void {
		this.cache.clear();
		this.lastSync.clear();
		cacheLog.info('Cache cleared for all accounts');
	}

	/**
	 * Get all accounts with cached droplets
	 */
	getAccounts(): string[] {
		return Array.from(this.cache.keys());
	}

	/**
	 * Get cache statistics
	 */
	getStats(): Record<string, { count: number; lastSync: string | null }> {
		const stats: Record<string, { count: number; lastSync: string | null }> = {};

		for (const [account, droplets] of this.cache.entries()) {
			stats[account] = {
				count: droplets.length,
				lastSync: this.lastSync.get(account)?.toISOString() || null
			};
		}

		return stats;
	}

	/**
	 * Check if account has claimable droplets
	 */
	hasDroplets(account: string): boolean {
		const droplets = this.cache.get(account);
		return droplets !== undefined && droplets.length > 0;
	}
}

// Export singleton instance
export const dropletCache = new DropletCache();
