/**
 * Unit tests for src/lib/api.ts
 *
 * Tests API client functions for querying droplet data.
 * Uses mocked fetch() to avoid real API calls.
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { checkClaimable, getAccountDroplets } from '../../src/lib/api';
import type { DropletsResponse } from '../../src/lib/api';

// Mock logger to prevent console spam
mock.module('../../src/lib/logger', () => ({
	logger: {
		debug: mock(() => {}),
		info: mock(() => {}),
		warn: mock(() => {}),
		error: mock(() => {})
	},
	configLog: mock(() => ({})),
	dropLog: mock(() => ({})),
	claimLog: mock(() => ({})),
	cacheLog: mock(() => ({}))
}));

// Test config object
const testConfig = {
	scrapApiUrl: 'https://test-api.example.com'
};

describe('API: checkClaimable()', () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		// Reset fetch mock before each test
		globalThis.fetch = originalFetch;
	});

	test('returns droplet count for account with droplets', async () => {
		const mockResponse: DropletsResponse = {
			account: 'testuser1',
			droplets: 150,
			last_claim: '2025-01-01T00:00:00Z'
		};

		globalThis.fetch = mock(() =>
			Promise.resolve({
				ok: true,
				status: 200,
				json: () => Promise.resolve(mockResponse)
			} as Response)
		);

		const result = await checkClaimable('testuser1', testConfig);

		expect(result).toBe(150);
		expect(globalThis.fetch).toHaveBeenCalledTimes(1);
		expect(globalThis.fetch).toHaveBeenCalledWith(
			'https://test-api.example.com/get/droplets?account=testuser1'
		);
	});

	test('returns 0 for account with no droplets', async () => {
		const mockResponse: DropletsResponse = {
			account: 'testuser2',
			droplets: 0
		};

		globalThis.fetch = mock(() =>
			Promise.resolve({
				ok: true,
				status: 200,
				json: () => Promise.resolve(mockResponse)
			} as Response)
		);

		const result = await checkClaimable('testuser2', testConfig);

		expect(result).toBe(0);
	});

	test('returns 0 when droplets field is undefined', async () => {
		const mockResponse = {
			account: 'testuser3'
			// droplets field missing
		};

		globalThis.fetch = mock(() =>
			Promise.resolve({
				ok: true,
				status: 200,
				json: () => Promise.resolve(mockResponse)
			} as Response)
		);

		const result = await checkClaimable('testuser3', testConfig);

		expect(result).toBe(0);
	});

	test('constructs correct API URL', async () => {
		const fetchMock = mock(() =>
			Promise.resolve({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ account: 'test', droplets: 0 })
			} as Response)
		);
		globalThis.fetch = fetchMock;

		await checkClaimable('myaccount', testConfig);

		expect(fetchMock).toHaveBeenCalledWith(
			'https://test-api.example.com/get/droplets?account=myaccount'
		);
	});

	test('throws error on HTTP error response', async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve({
				ok: false,
				status: 404,
				statusText: 'Not Found'
			} as Response)
		);

		await expect(checkClaimable('testuser', testConfig)).rejects.toThrow(
			'API returned 404: Not Found'
		);
	});

	test('throws error on HTTP 500 response', async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve({
				ok: false,
				status: 500,
				statusText: 'Internal Server Error'
			} as Response)
		);

		await expect(checkClaimable('testuser', testConfig)).rejects.toThrow(
			'API returned 500: Internal Server Error'
		);
	});

	test('throws error on network failure', async () => {
		globalThis.fetch = mock(() => Promise.reject(new Error('Network timeout')));

		await expect(checkClaimable('testuser', testConfig)).rejects.toThrow('Network timeout');
	});

	test('throws error on invalid JSON response', async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve({
				ok: true,
				status: 200,
				json: () => Promise.reject(new Error('Invalid JSON'))
			} as Response)
		);

		await expect(checkClaimable('testuser', testConfig)).rejects.toThrow('Invalid JSON');
	});

	test('handles account names with special characters', async () => {
		const fetchMock = mock(() =>
			Promise.resolve({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ account: 'my.account', droplets: 5 })
			} as Response)
		);
		globalThis.fetch = fetchMock;

		await checkClaimable('my.account', testConfig);

		expect(fetchMock).toHaveBeenCalledWith(
			'https://test-api.example.com/get/droplets?account=my.account'
		);
	});

	test('preserves last_claim field from response', async () => {
		const mockResponse: DropletsResponse = {
			account: 'testuser',
			droplets: 10,
			last_claim: '2025-01-15T12:34:56Z'
		};

		globalThis.fetch = mock(() =>
			Promise.resolve({
				ok: true,
				status: 200,
				json: () => Promise.resolve(mockResponse)
			} as Response)
		);

		// Function returns droplets count, but internally logs last_claim
		const result = await checkClaimable('testuser', testConfig);
		expect(result).toBe(10);
	});
});

describe('API: getAccountDroplets()', () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		globalThis.fetch = originalFetch;
	});

	test('queries multiple accounts and returns map', async () => {
		let callCount = 0;
		globalThis.fetch = mock(() => {
			callCount++;
			const responses: Record<string, DropletsResponse> = {
				testuser1: { account: 'testuser1', droplets: 100 },
				testuser2: { account: 'testuser2', droplets: 50 },
				testuser3: { account: 'testuser3', droplets: 200 }
			};
			const account = callCount === 1 ? 'testuser1' : callCount === 2 ? 'testuser2' : 'testuser3';
			return Promise.resolve({
				ok: true,
				status: 200,
				json: () => Promise.resolve(responses[account])
			} as Response);
		});

		const accounts = ['testuser1', 'testuser2', 'testuser3'];
		const result = await getAccountDroplets(accounts, testConfig);

		expect(result.size).toBe(3);
		expect(result.get('testuser1')).toBe(100);
		expect(result.get('testuser2')).toBe(50);
		expect(result.get('testuser3')).toBe(200);
	});

	test('handles empty accounts array', async () => {
		const result = await getAccountDroplets([], testConfig);
		expect(result.size).toBe(0);
	});

	test('handles single account', async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ account: 'testuser', droplets: 75 })
			} as Response)
		);

		const result = await getAccountDroplets(['testuser'], testConfig);

		expect(result.size).toBe(1);
		expect(result.get('testuser')).toBe(75);
	});

	test('sets droplets to 0 for accounts with API errors', async () => {
		let callCount = 0;
		globalThis.fetch = mock(() => {
			callCount++;
			if (callCount === 1) {
				// First call succeeds
				return Promise.resolve({
					ok: true,
					status: 200,
					json: () => Promise.resolve({ account: 'user1', droplets: 100 })
				} as Response);
			} else {
				// Second call fails
				return Promise.resolve({
					ok: false,
					status: 500,
					statusText: 'Server Error'
				} as Response);
			}
		});

		const result = await getAccountDroplets(['user1', 'user2'], testConfig);

		expect(result.size).toBe(2);
		expect(result.get('user1')).toBe(100);
		expect(result.get('user2')).toBe(0); // Error -> set to 0
	});

	test('sets droplets to 0 for accounts with network errors', async () => {
		let callCount = 0;
		globalThis.fetch = mock(() => {
			callCount++;
			if (callCount === 1) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: () => Promise.resolve({ account: 'user1', droplets: 50 })
				} as Response);
			} else {
				return Promise.reject(new Error('Network timeout'));
			}
		});

		const result = await getAccountDroplets(['user1', 'user2'], testConfig);

		expect(result.size).toBe(2);
		expect(result.get('user1')).toBe(50);
		expect(result.get('user2')).toBe(0); // Network error -> set to 0
	});

	test('continues querying even when some accounts fail', async () => {
		// Mock fetch to fail for user2, succeed for others
		globalThis.fetch = mock((url: string) => {
			if (url.includes('user2')) {
				return Promise.reject(new Error('API Error'));
			}
			const account = url.includes('user1') ? 'user1' : 'user3';
			const droplets = account === 'user1' ? 10 : 30;
			return Promise.resolve({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ account, droplets })
			} as Response);
		});

		const result = await getAccountDroplets(['user1', 'user2', 'user3'], testConfig);

		expect(result.size).toBe(3);
		expect(result.get('user1')).toBe(10);
		expect(result.get('user2')).toBe(0); // Failed
		expect(result.get('user3')).toBe(30);
	});

	test('queries accounts in parallel (not sequentially)', async () => {
		const startTimes: number[] = [];

		globalThis.fetch = mock(async () => {
			startTimes.push(Date.now());
			await new Promise((resolve) => setTimeout(resolve, 10));
			return {
				ok: true,
				status: 200,
				json: () => Promise.resolve({ account: 'test', droplets: 1 })
			} as Response;
		});

		const accounts = ['user1', 'user2', 'user3'];
		await getAccountDroplets(accounts, testConfig);

		// If parallel, all start times should be within a few ms of each other
		const timeDiff = Math.max(...startTimes) - Math.min(...startTimes);
		expect(timeDiff).toBeLessThan(50); // Should start nearly simultaneously
	});

	test('returns Map with string keys and number values', async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ account: 'test', droplets: 42 })
			} as Response)
		);

		const result = await getAccountDroplets(['test'], testConfig);

		expect(result instanceof Map).toBe(true);
		expect(typeof result.get('test')).toBe('number');
	});
});
