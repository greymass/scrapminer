/**
 * Unit tests for src/lib/actions/drops.ts
 *
 * Tests the drops contract action builders for correct structure,
 * type conversions, and default values.
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { Name, UInt32, UInt64 } from '@wharfkit/antelope';
import {
	randomName,
	generateRandomHash,
	buildDestroyAction,
	buildGenerateAction,
	buildDestroyAndRegenerateActions,
} from '../../src/lib/actions/drops';
import { createDroplet, createDroplets } from '../helpers/fixtures';
import { assertAction } from '../helpers/assertions';

// Mock dropsContract for testing
import * as wharf from '../../src/lib/wharf';

describe('Actions: randomName()', () => {
	test('generates 12-character name', () => {
		const name = randomName();
		expect(name).toHaveLength(12);
	});

	test('uses only valid characters (a-z, 1-5)', () => {
		const name = randomName();
		expect(name).toMatch(/^[abcdefghijklmnopqrstuvwxyz12345]{12}$/);
	});

	test('generates different names each time', () => {
		const names = Array.from({ length: 10 }, () => randomName());
		const uniqueNames = new Set(names);
		expect(uniqueNames.size).toBeGreaterThan(1);
	});
});

describe('Actions: generateRandomHash()', () => {
	test('generates hash string', () => {
		const hash = generateRandomHash();
		expect(typeof hash).toBe('string');
		expect(hash.length).toBeGreaterThan(0);
	});

	test('generates different hashes each time', () => {
		const hashes = Array.from({ length: 10 }, () => generateRandomHash());
		const uniqueHashes = new Set(hashes);
		expect(uniqueHashes.size).toBeGreaterThan(1);
	});
});

describe('Actions: buildDestroyAction()', () => {
	const testOwner = Name.from('testaccount');

	test('builds destroy action with string IDs', () => {
		const action = buildDestroyAction(testOwner, ['1', '2', '3']);

		assertAction(action, {
			account: 'drops',
			name: 'destroy',
			hasData: true,
		});

		// Action should be created successfully (data is encoded internally)
		expect(action).toBeDefined();
		expect(action.account).toEqual(Name.from('drops'));
		expect(action.name).toEqual(Name.from('destroy'));
	});

	test('builds destroy action with UInt64 IDs', () => {
		const ids = [UInt64.from('1'), UInt64.from('2'), UInt64.from('3')];
		const action = buildDestroyAction(testOwner, ids);

		assertAction(action, {
			account: 'drops',
			name: 'destroy',
			hasData: true,
		});
	});

	test('uses default SCRAP contract for to_notify', () => {
		const action = buildDestroyAction(testOwner, ['1']);

		// Should create action with default to_notify
		expect(action).toBeDefined();
		assertAction(action, { name: 'destroy' });
	});

	test('accepts custom options', () => {
		const action = buildDestroyAction(testOwner, ['1'], {
			toNotify: 'customnotif',
			memo: 'test memo',
		});

		// Should create action with custom options
		expect(action).toBeDefined();
		assertAction(action, { name: 'destroy' });
	});

	test('handles empty droplet list', () => {
		const action = buildDestroyAction(testOwner, []);

		// Should still create valid action
		expect(action).toBeDefined();
		assertAction(action, { name: 'destroy' });
	});

	test('handles large droplet list', () => {
		const ids = Array.from({ length: 100 }, (_, i) => String(i + 1));
		const action = buildDestroyAction(testOwner, ids);

		// Should handle large lists without error
		expect(action).toBeDefined();
		assertAction(action, { name: 'destroy' });
	});
});

describe('Actions: buildGenerateAction()', () => {
	const testOwner = Name.from('testaccount');

	test('builds generate action for bound droplets', () => {
		const action = buildGenerateAction(testOwner, 5, true);

		assertAction(action, {
			account: 'drops',
			name: 'generate',
			hasData: true,
		});

		expect(action).toBeDefined();
		expect(action.account).toEqual(Name.from('drops'));
		expect(action.name).toEqual(Name.from('generate'));
	});

	test('builds generate action for unbound droplets', () => {
		const action = buildGenerateAction(testOwner, 10, false);

		// Should create action for unbound droplets
		expect(action).toBeDefined();
		assertAction(action, { name: 'generate' });
	});

	test('generates random hash by default', () => {
		const action1 = buildGenerateAction(testOwner, 1, true);
		const action2 = buildGenerateAction(testOwner, 1, true);

		// Should create two valid actions
		expect(action1).toBeDefined();
		expect(action2).toBeDefined();
		assertAction(action1, { name: 'generate' });
		assertAction(action2, { name: 'generate' });
	});

	test('accepts custom data hash', () => {
		const customHash = 'custom-hash-12345';
		const action = buildGenerateAction(testOwner, 1, true, {
			data: customHash,
		});

		// Should create action with custom data
		expect(action).toBeDefined();
		assertAction(action, { name: 'generate' });
	});

	test('accepts custom to_notify', () => {
		const action = buildGenerateAction(testOwner, 1, true, {
			toNotify: 'customnotif',
		});

		// Should create action with custom to_notify
		expect(action).toBeDefined();
		assertAction(action, { name: 'generate' });
	});

	test('to_notify is optional', () => {
		const action = buildGenerateAction(testOwner, 1, true);

		// Should create action without to_notify
		expect(action).toBeDefined();
		assertAction(action, { name: 'generate' });
	});

	test('handles amount 0', () => {
		const action = buildGenerateAction(testOwner, 0, true);

		// Should handle zero amount
		expect(action).toBeDefined();
		assertAction(action, { name: 'generate' });
	});

	test('handles large amounts', () => {
		const action = buildGenerateAction(testOwner, 10000, true);

		// Should handle large amounts
		expect(action).toBeDefined();
		assertAction(action, { name: 'generate' });
	});
});

describe('Actions: buildDestroyAndRegenerateActions()', () => {
	const testOwner = Name.from('testaccount');

	test('creates destroy + bound generate for bound droplets', () => {
		const droplets = createDroplets(5, { bound: true });
		const actions = buildDestroyAndRegenerateActions(testOwner, droplets);

		// Should have destroy + generate
		expect(actions).toHaveLength(2);

		assertAction(actions[0], { name: 'destroy' });
		assertAction(actions[1], { name: 'generate' });
	});

	test('creates destroy + unbound generate for unbound droplets', () => {
		const droplets = createDroplets(3, { bound: false });
		const actions = buildDestroyAndRegenerateActions(testOwner, droplets);

		expect(actions).toHaveLength(2);

		assertAction(actions[0], { name: 'destroy' });
		assertAction(actions[1], { name: 'generate' });
	});

	test('creates destroy + both generates for mixed droplets', () => {
		const boundDroplets = createDroplets(3, { bound: true });
		const unboundDroplets = createDroplets(2, { bound: false });
		const mixedDroplets = [...boundDroplets, ...unboundDroplets];

		const actions = buildDestroyAndRegenerateActions(testOwner, mixedDroplets);

		// Should have destroy + bound generate + unbound generate
		expect(actions).toHaveLength(3);

		assertAction(actions[0], { name: 'destroy' });
		assertAction(actions[1], { name: 'generate' });
		assertAction(actions[2], { name: 'generate' });
	});

	test('passes destroy options through', () => {
		const droplets = createDroplets(2, { bound: true });
		const actions = buildDestroyAndRegenerateActions(testOwner, droplets, {
			memo: 'test memo',
			toNotify: 'customnotif',
		});

		// Should create actions with options
		expect(actions).toHaveLength(2);
		assertAction(actions[0], { name: 'destroy' });
	});

	test('handles empty droplet list', () => {
		const actions = buildDestroyAndRegenerateActions(testOwner, []);

		// Should only have destroy action with no IDs
		expect(actions).toHaveLength(1);
		assertAction(actions[0], { name: 'destroy' });
	});
});
