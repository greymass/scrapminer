/**
 * Test Fixtures
 *
 * Provides sample data for tests including droplets, accounts, and actions.
 */

import type { Droplet } from '../../src/lib/cache';

/**
 * Create a sample droplet for testing
 */
export function createDroplet(overrides: Partial<Droplet> = {}): Droplet {
	return {
		_id: '1',
		owner: 'testaccount',
		bound: true,
		created: new Date().toISOString(),
		...overrides,
	};
}

/**
 * Create multiple droplets for testing
 */
export function createDroplets(count: number, overrides: Partial<Droplet> = {}): Droplet[] {
	return Array.from({ length: count }, (_, i) =>
		createDroplet({
			_id: String(i + 1),
			...overrides,
		})
	);
}

/**
 * Sample account configurations
 */
export const TEST_ACCOUNTS = {
	account1: {
		actor: 'testuser1',
		permission: 'claim',
		privkey: '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3',
	},
	account2: {
		actor: 'testuser2',
		permission: 'claim',
		privkey: '5JZqmH8ZfnVmVeUqJPKpLKUbJjKq7fJYx3fJ6dZYy9YxhYxzJ5p',
	},
	account3: {
		actor: 'testuser3',
		permission: 'active',
		privkey: '5K1pLFJKQhLJhYxzJ5p6dZYy9YxhYxzJ5pqVmVeUqJPKpLKUbJjK',
	},
};

/**
 * Sample API responses
 */
export const API_RESPONSES = {
	droplets: {
		success: {
			droplets: [
				{
					droplet_id: '1',
					owner: 'testaccount',
					bound: true,
					revealed: false,
					generation: 1,
					data: '',
					epoch_generated: 1,
				},
				{
					droplet_id: '2',
					owner: 'testaccount',
					bound: true,
					revealed: false,
					generation: 1,
					data: '',
					epoch_generated: 1,
				},
			],
		},
		empty: {
			droplets: [],
		},
		error: {
			error: 'Internal server error',
		},
	},
	claimable: {
		hasClaimable: {
			claimable: 100,
		},
		noClaimable: {
			claimable: 0,
		},
	},
};

/**
 * Sample transaction IDs for testing
 */
export const SAMPLE_TX_IDS = [
	'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
	'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
	'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
];

/**
 * Sample batch sizes for testing
 */
export const TEST_BATCH_SIZES = {
	small: 5,
	medium: 10,
	large: 50,
	xlarge: 100,
};

/**
 * Sample delays for testing
 */
export const TEST_DELAYS = {
	none: 0,
	short: 100,
	medium: 500,
	long: 1000,
};
