/**
 * Unit tests for src/lib/utils.ts
 *
 * Tests utility functions for environment variable handling
 * and object serialization.
 */

import { describe, test, expect } from 'bun:test';
import { objectify, isENVTrue, isENVFalse } from '../src/lib/utils';

describe('Utils: objectify()', () => {
	test('converts plain object to JSON', () => {
		const input = { foo: 'bar', baz: 123 };
		const result = objectify(input);

		expect(result).toEqual(input);
		expect(typeof result).toBe('object');
	});

	test('handles nested objects', () => {
		const input = {
			level1: {
				level2: {
					level3: 'deep'
				}
			}
		};
		const result = objectify(input);

		expect(result).toEqual(input);
		expect(result.level1.level2.level3).toBe('deep');
	});

	test('handles arrays', () => {
		const input = [1, 2, 3, { nested: true }];
		const result = objectify(input);

		expect(result).toEqual(input);
		expect(Array.isArray(result)).toBe(true);
	});

	test('serializes complex types to JSON-compatible format', () => {
		// Simulate a Wharfkit type with toJSON method
		const input = {
			name: 'test',
			value: {
				toJSON: () => ({ serialized: true })
			}
		};

		const result = objectify(input);

		// After JSON parse/stringify, toJSON method is called
		expect(result.value).toEqual({ serialized: true });
	});
});

describe('Utils: isENVTrue()', () => {
	test('returns true for "true" string', () => {
		expect(isENVTrue('true')).toBe(true);
	});

	test('returns false for "false" string', () => {
		expect(isENVTrue('false')).toBe(false);
	});

	test('returns false for "1" string', () => {
		expect(isENVTrue('1')).toBe(false);
	});

	test('returns false for empty string', () => {
		expect(isENVTrue('')).toBe(false);
	});

	test('returns false for undefined', () => {
		expect(isENVTrue(undefined)).toBe(false);
	});

	test('returns false for any other string', () => {
		expect(isENVTrue('yes')).toBe(false);
		expect(isENVTrue('TRUE')).toBe(false);
		expect(isENVTrue('True')).toBe(false);
	});
});

describe('Utils: isENVFalse()', () => {
	test('returns true for "false" string', () => {
		expect(isENVFalse('false')).toBe(true);
	});

	test('returns false for "true" string', () => {
		expect(isENVFalse('true')).toBe(false);
	});

	test('returns false for "0" string', () => {
		expect(isENVFalse('0')).toBe(false);
	});

	test('returns false for empty string', () => {
		expect(isENVFalse('')).toBe(false);
	});

	test('returns false for undefined', () => {
		expect(isENVFalse(undefined)).toBe(false);
	});

	test('returns false for any other string', () => {
		expect(isENVFalse('no')).toBe(false);
		expect(isENVFalse('FALSE')).toBe(false);
		expect(isENVFalse('False')).toBe(false);
	});
});
