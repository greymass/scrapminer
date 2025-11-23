/**
 * Logger Module with Multiple Labeled Instances
 *
 * Pattern from: resource-provider/src/lib/logger.ts
 *
 * Creates separate logger instances for different subsystems:
 * - generalLog: Application-wide logging
 * - claimerLog: Claim operations
 * - websocketLog: WebSocket connection management
 * - configLog: Configuration loading
 *
 * Each logger is labeled in output for easy filtering.
 */

import { createLogger, format, transports } from 'winston';
import { ENVIRONMENT, LOG_LEVEL, SERVICE_ERROR_LOG, SERVICE_INFO_LOG } from '../config';

const { metadata, combine, timestamp, printf, prettyPrint, label, colorize } = format;

type TransportTypes = transports.ConsoleTransportInstance | transports.FileTransportInstance;

const defaultTransports: TransportTypes[] = [new transports.Console()];

// Custom format for file logs with label
const logformat = printf(({ label, level, message, timestamp, ...rest }) => {
	return `${timestamp} [${label}] ${level}: ${message} ${JSON.stringify({ ...rest })}`;
});

// Only use file transports if NOT bundled (Bun bundler has issues with winston fs usage)
const isBundled = typeof Bun.main === 'string' && !Bun.main.endsWith('.ts');

if (!isBundled) {
	if (SERVICE_INFO_LOG) {
		defaultTransports.push(
			new transports.File({
				level: LOG_LEVEL,
				filename: SERVICE_INFO_LOG,
				format: logformat
			})
		);
	}

	if (SERVICE_ERROR_LOG) {
		defaultTransports.push(
			new transports.File({
				level: 'error',
				filename: SERVICE_ERROR_LOG,
				format: logformat
			})
		);
	}
}

/**
 * Create a labeled logger instance
 *
 * In development: Pretty-printed with colors
 * In production: JSON format for parsing
 */
function makeLogger(labelName: string) {
	return createLogger({
		level: LOG_LEVEL,
		format:
			ENVIRONMENT === 'development'
				? combine(
						label({ label: labelName }),
						metadata({ key: 'data' }),
						timestamp(),
						colorize(),
						prettyPrint({ colorize: true, depth: 10 })
					)
				: combine(label({ label: labelName }), timestamp(), logformat),
		transports: defaultTransports
	});
}

// Export labeled logger instances
export const generalLog = makeLogger('general');
export const claimerLog = makeLogger('claimer');
export const websocketLog = makeLogger('websocket');
export const configLog = makeLogger('config');
export const cacheLog = makeLogger('cache');
export const syncLog = makeLogger('sync');

// Export default logger for backwards compatibility during migration
export const logger = generalLog;
