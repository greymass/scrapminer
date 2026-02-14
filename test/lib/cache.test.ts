/**
 * Unit tests for src/lib/cache.ts
 *
 * Tests in-memory droplet cache operations including:
 * - Adding/retrieving droplets
 * - Removing claimed droplets
 * - Cache clearing
 * - Statistics and queries
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { dropletCache } from '../../src/lib/cache';
import type { Droplet } from '../../src/lib/cache';

// Sample test droplets
const createDroplet = (id: string, owner: string, bound: boolean): Droplet => ({
	_id: id,
	owner,
	bound,
	created: new Date().toISOString()
});

describe('DropletCache: set() and get()', () => {
	beforeEach(() => {
		// Clear cache before each test
		dropletCache.clearAll();
	});

	test('stores and retrieves droplets for an account', () => {
		const droplets = [
			createDroplet('drop1', 'testuser1', true),
			createDroplet('drop2', 'testuser1', false)
		];

		dropletCache.set('testuser1', droplets);
		const retrieved = dropletCache.get('testuser1');

		expect(retrieved).toEqual(droplets);
		expect(retrieved).toHaveLength(2);
	});

	test('returns empty array for account with no droplets', () => {
		const retrieved = dropletCache.get('nonexistent');
		expect(retrieved).toEqual([]);
		expect(retrieved).toHaveLength(0);
	});

	test('overwrites existing cache when setting new droplets', () => {
		const droplets1 = [createDroplet('drop1', 'testuser1', true)];
		const droplets2 = [
			createDroplet('drop2', 'testuser1', false),
			createDroplet('drop3', 'testuser1', true)
		];

		dropletCache.set('testuser1', droplets1);
		expect(dropletCache.get('testuser1')).toHaveLength(1);

		dropletCache.set('testuser1', droplets2);
		expect(dropletCache.get('testuser1')).toHaveLength(2);
		expect(dropletCache.get('testuser1')[0]._id).toBe('drop2');
	});

	test('maintains separate caches for different accounts', () => {
		const droplets1 = [createDroplet('drop1', 'testuser1', true)];
		const droplets2 = [createDroplet('drop2', 'testuser2', false)];

		dropletCache.set('testuser1', droplets1);
		dropletCache.set('testuser2', droplets2);

		expect(dropletCache.get('testuser1')).toHaveLength(1);
		expect(dropletCache.get('testuser2')).toHaveLength(1);
		expect(dropletCache.get('testuser1')[0]._id).toBe('drop1');
		expect(dropletCache.get('testuser2')[0]._id).toBe('drop2');
	});

	test('handles empty droplet array', () => {
		dropletCache.set('testuser1', []);
		const retrieved = dropletCache.get('testuser1');

		expect(retrieved).toEqual([]);
		expect(retrieved).toHaveLength(0);
	});

	test('preserves droplet properties', () => {
		const droplet: Droplet = {
			_id: 'drop1',
			owner: 'testuser1',
			bound: true,
			created: '2025-01-01T00:00:00Z',
			customField: 'custom value',
			metadata: { foo: 'bar' }
		};

		dropletCache.set('testuser1', [droplet]);
		const retrieved = dropletCache.get('testuser1')[0];

		expect(retrieved._id).toBe('drop1');
		expect(retrieved.owner).toBe('testuser1');
		expect(retrieved.bound).toBe(true);
		expect(retrieved.created).toBe('2025-01-01T00:00:00Z');
		expect(retrieved.customField).toBe('custom value');
		expect(retrieved.metadata).toEqual({ foo: 'bar' });
	});
});

describe('DropletCache: remove()', () => {
	beforeEach(() => {
		dropletCache.clearAll();
	});

	test('removes specific droplets by ID', () => {
		const droplets = [
			createDroplet('drop1', 'testuser1', true),
			createDroplet('drop2', 'testuser1', false),
			createDroplet('drop3', 'testuser1', true)
		];

		dropletCache.set('testuser1', droplets);
		dropletCache.remove('testuser1', ['drop2']);

		const remaining = dropletCache.get('testuser1');
		expect(remaining).toHaveLength(2);
		expect(remaining.find((d) => d._id === 'drop1')).toBeDefined();
		expect(remaining.find((d) => d._id === 'drop3')).toBeDefined();
		expect(remaining.find((d) => d._id === 'drop2')).toBeUndefined();
	});

	test('removes multiple droplets', () => {
		const droplets = [
			createDroplet('drop1', 'testuser1', true),
			createDroplet('drop2', 'testuser1', false),
			createDroplet('drop3', 'testuser1', true),
			createDroplet('drop4', 'testuser1', false)
		];

		dropletCache.set('testuser1', droplets);
		dropletCache.remove('testuser1', ['drop1', 'drop3']);

		const remaining = dropletCache.get('testuser1');
		expect(remaining).toHaveLength(2);
		expect(remaining[0]._id).toBe('drop2');
		expect(remaining[1]._id).toBe('drop4');
	});

	test('clears cache when all droplets are removed', () => {
		const droplets = [
			createDroplet('drop1', 'testuser1', true),
			createDroplet('drop2', 'testuser1', false)
		];

		dropletCache.set('testuser1', droplets);
		dropletCache.remove('testuser1', ['drop1', 'drop2']);

		const remaining = dropletCache.get('testuser1');
		expect(remaining).toEqual([]);
		expect(dropletCache.getAccounts()).not.toContain('testuser1');
	});

	test('handles removal of non-existent droplet IDs', () => {
		const droplets = [createDroplet('drop1', 'testuser1', true)];

		dropletCache.set('testuser1', droplets);
		dropletCache.remove('testuser1', ['nonexistent']);

		const remaining = dropletCache.get('testuser1');
		expect(remaining).toHaveLength(1);
		expect(remaining[0]._id).toBe('drop1');
	});

	test('handles removal from non-existent account', () => {
		// Should not throw
		dropletCache.remove('nonexistent', ['drop1']);
		expect(dropletCache.get('nonexistent')).toEqual([]);
	});

	test('handles empty removal array', () => {
		const droplets = [createDroplet('drop1', 'testuser1', true)];

		dropletCache.set('testuser1', droplets);
		dropletCache.remove('testuser1', []);

		const remaining = dropletCache.get('testuser1');
		expect(remaining).toHaveLength(1);
	});

	test('does not affect other accounts when removing', () => {
		const droplets1 = [createDroplet('drop1', 'testuser1', true)];
		const droplets2 = [createDroplet('drop2', 'testuser2', false)];

		dropletCache.set('testuser1', droplets1);
		dropletCache.set('testuser2', droplets2);
		dropletCache.remove('testuser1', ['drop1']);

		expect(dropletCache.get('testuser1')).toEqual([]);
		expect(dropletCache.get('testuser2')).toHaveLength(1);
	});
});

describe('DropletCache: clear() and clearAll()', () => {
	beforeEach(() => {
		dropletCache.clearAll();
	});

	test('clear() removes all droplets for specific account', () => {
		const droplets = [
			createDroplet('drop1', 'testuser1', true),
			createDroplet('drop2', 'testuser1', false)
		];

		dropletCache.set('testuser1', droplets);
		dropletCache.clear('testuser1');

		expect(dropletCache.get('testuser1')).toEqual([]);
		expect(dropletCache.hasDroplets('testuser1')).toBe(false);
	});

	test('clear() does not affect other accounts', () => {
		const droplets1 = [createDroplet('drop1', 'testuser1', true)];
		const droplets2 = [createDroplet('drop2', 'testuser2', false)];

		dropletCache.set('testuser1', droplets1);
		dropletCache.set('testuser2', droplets2);
		dropletCache.clear('testuser1');

		expect(dropletCache.get('testuser1')).toEqual([]);
		expect(dropletCache.get('testuser2')).toHaveLength(1);
	});

	test('clear() handles non-existent account', () => {
		// Should not throw
		dropletCache.clear('nonexistent');
		expect(dropletCache.get('nonexistent')).toEqual([]);
	});

	test('clearAll() removes all droplets for all accounts', () => {
		dropletCache.set('testuser1', [createDroplet('drop1', 'testuser1', true)]);
		dropletCache.set('testuser2', [createDroplet('drop2', 'testuser2', false)]);
		dropletCache.set('testuser3', [createDroplet('drop3', 'testuser3', true)]);

		dropletCache.clearAll();

		expect(dropletCache.get('testuser1')).toEqual([]);
		expect(dropletCache.get('testuser2')).toEqual([]);
		expect(dropletCache.get('testuser3')).toEqual([]);
		expect(dropletCache.getAccounts()).toEqual([]);
	});

	test('clearAll() handles empty cache', () => {
		// Should not throw
		dropletCache.clearAll();
		expect(dropletCache.getAccounts()).toEqual([]);
	});
});

describe('DropletCache: getAccounts()', () => {
	beforeEach(() => {
		dropletCache.clearAll();
	});

	test('returns accounts with cached droplets', () => {
		dropletCache.set('testuser1', [createDroplet('drop1', 'testuser1', true)]);
		dropletCache.set('testuser2', [createDroplet('drop2', 'testuser2', false)]);

		const accounts = dropletCache.getAccounts();
		expect(accounts).toContain('testuser1');
		expect(accounts).toContain('testuser2');
		expect(accounts).toHaveLength(2);
	});

	test('returns empty array when no accounts cached', () => {
		const accounts = dropletCache.getAccounts();
		expect(accounts).toEqual([]);
	});

	test('excludes accounts after clearing', () => {
		dropletCache.set('testuser1', [createDroplet('drop1', 'testuser1', true)]);
		dropletCache.clear('testuser1');

		const accounts = dropletCache.getAccounts();
		expect(accounts).not.toContain('testuser1');
	});

	test('includes accounts with empty droplet arrays', () => {
		dropletCache.set('testuser1', []);
		const accounts = dropletCache.getAccounts();
		expect(accounts).toContain('testuser1');
	});
});

describe('DropletCache: hasDroplets()', () => {
	beforeEach(() => {
		dropletCache.clearAll();
	});

	test('returns true when account has droplets', () => {
		dropletCache.set('testuser1', [createDroplet('drop1', 'testuser1', true)]);
		expect(dropletCache.hasDroplets('testuser1')).toBe(true);
	});

	test('returns false when account has no droplets', () => {
		expect(dropletCache.hasDroplets('nonexistent')).toBe(false);
	});

	test('returns false when account has empty droplet array', () => {
		dropletCache.set('testuser1', []);
		expect(dropletCache.hasDroplets('testuser1')).toBe(false);
	});

	test('returns false after clearing account', () => {
		dropletCache.set('testuser1', [createDroplet('drop1', 'testuser1', true)]);
		dropletCache.clear('testuser1');
		expect(dropletCache.hasDroplets('testuser1')).toBe(false);
	});

	test('returns false after removing all droplets', () => {
		const droplets = [createDroplet('drop1', 'testuser1', true)];
		dropletCache.set('testuser1', droplets);
		dropletCache.remove('testuser1', ['drop1']);
		expect(dropletCache.hasDroplets('testuser1')).toBe(false);
	});
});

describe('DropletCache: getStats()', () => {
	beforeEach(() => {
		dropletCache.clearAll();
	});

	test('returns statistics for all cached accounts', () => {
		dropletCache.set('testuser1', [
			createDroplet('drop1', 'testuser1', true),
			createDroplet('drop2', 'testuser1', false)
		]);
		dropletCache.set('testuser2', [createDroplet('drop3', 'testuser2', true)]);

		const stats = dropletCache.getStats();

		expect(stats).toHaveProperty('testuser1');
		expect(stats).toHaveProperty('testuser2');
		expect(stats.testuser1.count).toBe(2);
		expect(stats.testuser2.count).toBe(1);
	});

	test('includes lastSync timestamp', () => {
		dropletCache.set('testuser1', [createDroplet('drop1', 'testuser1', true)]);
		const stats = dropletCache.getStats();

		expect(stats.testuser1.lastSync).toBeDefined();
		expect(typeof stats.testuser1.lastSync).toBe('string');
		// Should be valid ISO timestamp
		expect(() => new Date(stats.testuser1.lastSync!)).not.toThrow();
	});

	test('returns empty object when no accounts cached', () => {
		const stats = dropletCache.getStats();
		expect(stats).toEqual({});
	});

	test('updates lastSync on subsequent set operations', async () => {
		dropletCache.set('testuser1', [createDroplet('drop1', 'testuser1', true)]);
		const stats1 = dropletCache.getStats();
		const firstSync = stats1.testuser1.lastSync;

		// Wait a bit
		await new Promise((resolve) => setTimeout(resolve, 10));

		dropletCache.set('testuser1', [createDroplet('drop2', 'testuser1', false)]);
		const stats2 = dropletCache.getStats();
		const secondSync = stats2.testuser1.lastSync;

		expect(secondSync).not.toBe(firstSync);
		expect(new Date(secondSync!) > new Date(firstSync!)).toBe(true);
	});

	test('reflects correct count after removing droplets', () => {
		const droplets = [
			createDroplet('drop1', 'testuser1', true),
			createDroplet('drop2', 'testuser1', false),
			createDroplet('drop3', 'testuser1', true)
		];

		dropletCache.set('testuser1', droplets);
		dropletCache.remove('testuser1', ['drop2']);

		const stats = dropletCache.getStats();
		expect(stats.testuser1.count).toBe(2);
	});

	test('excludes cleared accounts from stats', () => {
		dropletCache.set('testuser1', [createDroplet('drop1', 'testuser1', true)]);
		dropletCache.set('testuser2', [createDroplet('drop2', 'testuser2', false)]);
		dropletCache.clear('testuser1');

		const stats = dropletCache.getStats();
		expect(stats).not.toHaveProperty('testuser1');
		expect(stats).toHaveProperty('testuser2');
	});
});

describe('DropletCache: Concurrent operations', () => {
	beforeEach(() => {
		dropletCache.clearAll();
	});

	test('handles rapid set operations for same account', () => {
		const droplets1 = [createDroplet('drop1', 'testuser1', true)];
		const droplets2 = [createDroplet('drop2', 'testuser1', false)];
		const droplets3 = [createDroplet('drop3', 'testuser1', true)];

		dropletCache.set('testuser1', droplets1);
		dropletCache.set('testuser1', droplets2);
		dropletCache.set('testuser1', droplets3);

		// Should have last set value
		const result = dropletCache.get('testuser1');
		expect(result).toHaveLength(1);
		expect(result[0]._id).toBe('drop3');
	});

	test('handles interleaved operations on multiple accounts', () => {
		dropletCache.set('user1', [createDroplet('d1', 'user1', true)]);
		dropletCache.set('user2', [createDroplet('d2', 'user2', false)]);
		dropletCache.remove('user1', ['d1']);
		dropletCache.set('user3', [createDroplet('d3', 'user3', true)]);
		dropletCache.clear('user2');

		expect(dropletCache.hasDroplets('user1')).toBe(false);
		expect(dropletCache.hasDroplets('user2')).toBe(false);
		expect(dropletCache.hasDroplets('user3')).toBe(true);
	});
});
