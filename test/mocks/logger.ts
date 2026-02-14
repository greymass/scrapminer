/**
 * Mock Logger for Testing
 *
 * Provides mock winston logger that captures log messages for verification
 * without actually writing to files or console.
 */

import type { Logger } from 'winston';

/**
 * Log entry captured by mock logger
 */
export interface LogEntry {
	level: string;
	message: string;
	meta?: Record<string, any>;
	timestamp: Date;
}

/**
 * Mock logger that records all log calls
 */
export class MockLogger {
	public logs: LogEntry[] = [];

	/**
	 * Create mock logger instance
	 */
	get logger(): Logger {
		const log = (level: string) => (message: string, meta?: Record<string, any>) => {
			this.logs.push({
				level,
				message,
				meta,
				timestamp: new Date(),
			});
		};

		return {
			error: log('error'),
			warn: log('warn'),
			info: log('info'),
			debug: log('debug'),
			// Add child method for context
			child: (context: Record<string, any>) => {
				const childLog = (level: string) => (message: string, meta?: Record<string, any>) => {
					this.logs.push({
						level,
						message,
						meta: { ...context, ...meta },
						timestamp: new Date(),
					});
				};

				return {
					error: childLog('error'),
					warn: childLog('warn'),
					info: childLog('info'),
					debug: childLog('debug'),
					child: () => this.logger,
				} as Logger;
			},
		} as Logger;
	}

	/**
	 * Get all logs of a specific level
	 */
	getLogsForLevel(level: string): LogEntry[] {
		return this.logs.filter((log) => log.level === level);
	}

	/**
	 * Get all error logs
	 */
	get errors(): LogEntry[] {
		return this.getLogsForLevel('error');
	}

	/**
	 * Get all warn logs
	 */
	get warnings(): LogEntry[] {
		return this.getLogsForLevel('warn');
	}

	/**
	 * Get all info logs
	 */
	get infos(): LogEntry[] {
		return this.getLogsForLevel('info');
	}

	/**
	 * Get all debug logs
	 */
	get debugs(): LogEntry[] {
		return this.getLogsForLevel('debug');
	}

	/**
	 * Check if a message was logged
	 */
	hasMessage(message: string, level?: string): boolean {
		const logsToCheck = level ? this.getLogsForLevel(level) : this.logs;
		return logsToCheck.some((log) => log.message === message);
	}

	/**
	 * Check if a message contains substring
	 */
	hasMessageContaining(substring: string, level?: string): boolean {
		const logsToCheck = level ? this.getLogsForLevel(level) : this.logs;
		return logsToCheck.some((log) => log.message.includes(substring));
	}

	/**
	 * Get last log entry
	 */
	get lastLog(): LogEntry | undefined {
		return this.logs[this.logs.length - 1];
	}

	/**
	 * Get log count
	 */
	get count(): number {
		return this.logs.length;
	}

	/**
	 * Reset all captured logs
	 */
	reset(): void {
		this.logs = [];
	}
}

/**
 * Create a simple mock logger for tests that don't need inspection
 */
export function createSilentLogger(): Logger {
	const noop = () => {};
	return {
		error: noop,
		warn: noop,
		info: noop,
		debug: noop,
		child: () => createSilentLogger(),
	} as Logger;
}
