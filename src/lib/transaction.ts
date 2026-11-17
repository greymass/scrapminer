/**
 * Transaction Execution Utility
 *
 * Provides centralized transaction execution with consistent logging,
 * error handling, and dry-run support.
 */

import type { Action, Session, TransactResult } from '@wharfkit/session';
import type { Logger } from 'winston';
import { objectify } from './utils';

/**
 * Configuration for transaction execution
 */
export interface TransactionConfig {
	/**
	 * Whether to broadcast the transaction (false = dry run)
	 * @default true
	 */
	broadcast?: boolean;

	/**
	 * Logger instance for transaction messages
	 */
	logger?: Logger;

	/**
	 * Context for logging (e.g. { account: 'myaccount', batch: 1 })
	 */
	logContext?: Record<string, any>;

	/**
	 * Description of the transaction for logging
	 */
	description?: string;
}

/**
 * Result from transaction execution
 */
export interface TransactionExecutionResult {
	success: boolean;
	transactionId: string | null;
	broadcasted: boolean;
	result?: TransactResult;
	error?: Error;
}

/**
 * Execute a transaction with consistent logging and error handling
 *
 * @param session - Wharf session to execute transaction
 * @param actions - Single action or array of actions
 * @param config - Transaction configuration
 * @returns Transaction execution result
 *
 * @example
 * ```typescript
 * const result = await executeTransaction(
 *   session,
 *   destroyAction,
 *   {
 *     broadcast: !DRY_RUN,
 *     logger: myLogger,
 *     logContext: { account: 'myaccount', batch: 1 },
 *     description: 'Destroy 500 droplets'
 *   }
 * );
 *
 * if (result.success) {
 *   console.log('Transaction ID:', result.transactionId);
 * }
 * ```
 */
export async function executeTransaction(
	session: Session,
	actions: Action | Action[],
	config: TransactionConfig = {}
): Promise<TransactionExecutionResult> {
	const { broadcast = true, logger, logContext = {}, description = 'transaction' } = config;

	const actionArray = Array.isArray(actions) ? actions : [actions];
	const account = String(session.actor);

	// Log transaction details before execution
	if (logger) {
		const logMsg = broadcast
			? `Broadcasting ${description}`
			: `DRY RUN: ${description} not broadcast`;

		logger.debug(
			logMsg,
			objectify({
				account,
				...logContext,
				actions: actionArray.length,
				broadcast
			})
		);
	}

	try {
		// Execute transaction with broadcast flag
		const result = await session.transact({ actions: actionArray }, { broadcast });

		const txId = String(result.response?.transaction_id || '');

		// Log successful execution
		if (logger) {
			if (broadcast) {
				logger.debug(`Transaction broadcast successfully`, {
					account,
					...logContext,
					transactionId: txId,
					actions: actionArray.length
				});
			} else {
				logger.debug(`Transaction simulated successfully (DRY RUN)`, {
					account,
					...logContext,
					actions: actionArray.length
				});
			}
		}

		return {
			success: true,
			transactionId: txId || null,
			broadcasted: broadcast,
			result
		};
	} catch (error) {
		// Log error
		if (logger) {
			logger.error(`Transaction failed`, {
				account,
				...logContext,
				error: error.message,
				broadcast
			});
		}

		return {
			success: false,
			transactionId: null,
			broadcasted: false,
			error: error instanceof Error ? error : new Error(String(error))
		};
	}
}

/**
 * Execute a transaction and throw on error (for fail-fast scenarios)
 *
 * @param session - Wharf session to execute transaction
 * @param actions - Single action or array of actions
 * @param config - Transaction configuration
 * @returns Transaction ID (null if dry run)
 * @throws Error if transaction fails
 */
export async function executeTransactionOrThrow(
	session: Session,
	actions: Action | Action[],
	config: TransactionConfig = {}
): Promise<string | null> {
	const result = await executeTransaction(session, actions, config);

	if (!result.success) {
		throw result.error || new Error('Transaction failed');
	}

	return result.transactionId;
}
