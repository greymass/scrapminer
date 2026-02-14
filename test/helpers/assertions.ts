/**
 * Custom Test Assertions
 *
 * Provides custom matchers for Wharfkit types and common test patterns.
 */

import type { Action } from '@wharfkit/session';
import { expect } from 'bun:test';

/**
 * Assert that an action has expected structure
 */
export function assertAction(
	action: Action,
	expected: {
		account?: string;
		name?: string;
		hasData?: boolean;
	}
) {
	if (expected.account) {
		expect(String(action.account)).toBe(expected.account);
	}

	if (expected.name) {
		expect(String(action.name)).toBe(expected.name);
	}

	if (expected.hasData !== undefined) {
		if (expected.hasData) {
			expect(action.data).toBeDefined();
		} else {
			expect(action.data).toBeUndefined();
		}
	}
}

/**
 * Assert that an array of actions all have same account
 */
export function assertActionsForAccount(actions: Action[], account: string) {
	for (const action of actions) {
		expect(String(action.account)).toBe(account);
	}
}

/**
 * Assert that an array of actions all have same name
 */
export function assertActionsWithName(actions: Action[], name: string) {
	for (const action of actions) {
		expect(String(action.name)).toBe(name);
	}
}

/**
 * Assert that a value is within a range
 */
export function assertInRange(value: number, min: number, max: number) {
	expect(value).toBeGreaterThanOrEqual(min);
	expect(value).toBeLessThanOrEqual(max);
}

/**
 * Assert that execution time is within acceptable range
 */
export async function assertExecutionTime(
	fn: () => Promise<void>,
	expectedMs: number,
	tolerance: number = 100
) {
	const start = Date.now();
	await fn();
	const elapsed = Date.now() - start;

	assertInRange(elapsed, expectedMs - tolerance, expectedMs + tolerance);
}

/**
 * Assert that a transaction ID is valid format (64 hex chars)
 */
export function assertValidTransactionId(txId: string | null) {
	expect(txId).toBeDefined();
	expect(txId).toMatch(/^[a-f0-9]{64}$/);
}

/**
 * Assert that an error contains expected message
 */
export function assertErrorContains(error: Error, substring: string) {
	expect(error.message).toContain(substring);
}
