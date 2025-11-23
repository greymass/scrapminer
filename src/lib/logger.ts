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
import { LOG_LEVEL } from '../config';

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
	// Add file transports with hardcoded paths
	defaultTransports.push(
		new transports.File({
			level: LOG_LEVEL,
			filename: './logs/scrapminer.log',
			format: logformat
		})
	);

	defaultTransports.push(
		new transports.File({
			level: 'error',
			filename: './logs/error.log',
			format: logformat
		})
	);
}

/**
 * Create a labeled logger instance with JSON format
 */
function makeLogger(labelName: string) {
	return createLogger({
		level: LOG_LEVEL,
		format: combine(label({ label: labelName }), timestamp(), logformat),
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
