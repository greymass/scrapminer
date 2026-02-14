/**
 * Mock Wharf Contract for Testing
 *
 * Provides mock contract instances that return test actions
 * without requiring actual contract ABIs or blockchain connection.
 */

import { Action, Name, Serializer, Struct } from '@wharfkit/antelope';
import type { Contract } from '@wharfkit/contract';

/**
 * Mock contract that generates actions with specified name and data
 */
export class MockContract {
	constructor(
		public readonly account: string = 'drops',
		public readonly name: string = 'drops'
	) {}

	/**
	 * Create an action for this contract
	 */
	action(actionName: string, data: any): Action {
		return Action.from({
			account: this.account,
			name: actionName,
			authorization: [],
			data: Serializer.objectify(data),
		});
	}
}

/**
 * Create a mock drops contract
 */
export function createMockDropsContract(account: string = 'drops'): Contract {
	const mock = new MockContract(account, 'drops');

	return {
		account: Name.from(account),
		action: (name: string, data: any) => mock.action(name, data),
	} as unknown as Contract;
}

/**
 * Create a mock SCRAP token contract
 */
export function createMockScrapContract(account: string = 'scrap'): Contract {
	const mock = new MockContract(account, 'scrap');

	return {
		account: Name.from(account),
		action: (name: string, data: any) => mock.action(name, data),
	} as unknown as Contract;
}
