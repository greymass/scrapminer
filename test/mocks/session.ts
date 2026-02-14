/**
 * Mock Session for Testing
 *
 * Provides mock Session object and transact() behavior for testing
 * blockchain interactions without actual network calls.
 */

import type { Action, Session, TransactResult } from '@wharfkit/session';
import { Name, Transaction } from '@wharfkit/antelope';

/**
 * Configuration for mock session behavior
 */
export interface MockSessionConfig {
	/**
	 * Account name for the session
	 * @default 'testaccount'
	 */
	actor?: string;

	/**
	 * Permission for the session
	 * @default 'claim'
	 */
	permission?: string;

	/**
	 * Whether transact() should succeed
	 * @default true
	 */
	shouldSucceed?: boolean;

	/**
	 * Error to throw if shouldSucceed is false
	 */
	error?: Error;

	/**
	 * Custom transaction ID to return
	 * @default random hex string
	 */
	transactionId?: string;

	/**
	 * Delay in ms before resolving (simulates network latency)
	 * @default 0
	 */
	delay?: number;
}

/**
 * Mock TransactResult for testing
 */
export function createMockTransactResult(
	transactionId: string = generateRandomTxId()
): TransactResult {
	return {
		chain: {
			id: '73e4385a2708e6d7048834fbc1079f2fabb17b3c125b146af438971e90716c4d',
			url: 'https://jungle4.greymass.com',
		},
		request: {} as any,
		resolved: null,
		response: {
			transaction_id: transactionId,
			processed: {
				id: transactionId,
				block_num: 123456,
				block_time: new Date().toISOString(),
				producer_block_id: null,
				receipt: {
					status: 'executed',
					cpu_usage_us: 100,
					net_usage_words: 10,
				},
				elapsed: 100,
				net_usage: 10,
				scheduled: false,
				action_traces: [],
				account_ram_delta: null,
			},
		},
		revisions: [],
		signatures: [],
		signer: Name.from('testaccount'),
		// Provide minimal transaction object that won't trigger decoding
		transaction: {
			actions: [],
			context_free_actions: [],
			expiration: new Date(),
			ref_block_num: 0,
			ref_block_prefix: 0,
			max_cpu_usage_ms: 0,
			max_net_usage_words: 0,
			delay_sec: 0,
			transaction_extensions: [],
		} as any,
	} as TransactResult;
}

/**
 * Generate random transaction ID (64-char hex string)
 */
function generateRandomTxId(): string {
	return Array.from({ length: 64 }, () =>
		Math.floor(Math.random() * 16).toString(16)
	).join('');
}

/**
 * Create a mock Session for testing
 *
 * @param config - Configuration for mock behavior
 * @returns Mock Session object
 */
export function createMockSession(config: MockSessionConfig = {}): Session {
	const {
		actor = 'testaccount',
		permission = 'claim',
		shouldSucceed = true,
		error = new Error('Mock transaction failed'),
		transactionId = generateRandomTxId(),
		delay = 0,
	} = config;

	// Mock transact function
	const transact = async (
		args: { action: Action | Action[] },
		options?: { broadcast?: boolean }
	): Promise<TransactResult> => {
		// Simulate network delay
		if (delay > 0) {
			await new Promise((resolve) => setTimeout(resolve, delay));
		}

		// Throw error if configured to fail
		if (!shouldSucceed) {
			throw error;
		}

		// Return mock result
		return createMockTransactResult(transactionId);
	};

	// Create mock session object
	const session = {
		actor: Name.from(actor),
		permission: Name.from(permission),
		transact,
		// Add other Session properties as needed for tests
		chain: {
			id: '73e4385a2708e6d7048834fbc1079f2fabb17b3c125b146af438971e90716c4d',
			url: 'https://jungle4.greymass.com',
		},
	} as Session;

	return session;
}

/**
 * Create multiple mock sessions for multi-account testing
 *
 * @param actors - Array of account names
 * @param config - Shared configuration for all sessions
 * @returns Array of mock sessions
 */
export function createMockSessions(
	actors: string[],
	config: Omit<MockSessionConfig, 'actor'> = {}
): Session[] {
	return actors.map((actor) =>
		createMockSession({
			...config,
			actor,
		})
	);
}

/**
 * Mock session that tracks transact() calls for verification
 */
export class MockSessionRecorder {
	public calls: Array<{
		actions: Action[];
		broadcast: boolean;
		timestamp: Date;
	}> = [];

	constructor(private config: MockSessionConfig = {}) {}

	get session(): Session {
		const baseSession = createMockSession(this.config);

		// Wrap transact to record calls
		const originalTransact = baseSession.transact;
		baseSession.transact = async (args, options) => {
			const actions = Array.isArray(args.action) ? args.action : [args.action];
			this.calls.push({
				actions,
				broadcast: options?.broadcast ?? true,
				timestamp: new Date(),
			});

			return originalTransact(args, options);
		};

		return baseSession;
	}

	/**
	 * Get number of transact() calls made
	 */
	get callCount(): number {
		return this.calls.length;
	}

	/**
	 * Get last transact() call
	 */
	get lastCall() {
		return this.calls[this.calls.length - 1];
	}

	/**
	 * Reset call history
	 */
	reset(): void {
		this.calls = [];
	}
}
