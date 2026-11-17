/**
 * Centralized Configuration Module
 *
 * All environment variables are validated and exported as typed constants.
 * This module will throw errors at startup if required config is missing,
 * following the fail-fast principle from resource-provider.
 */

import { isENVTrue } from './lib/utils';

// ============================================================================
// BLOCKCHAIN CONFIGURATION
// ============================================================================

export const CHAIN_NAME = process.env.CHAIN_NAME;
export const LEAP_API = process.env.LEAP_API;
export const CONTRACT_NAME = process.env.CONTRACT_NAME ?? 'drops';
export const SCRAP_CONTRACT = process.env.SCRAP_CONTRACT ?? 'scrap';

if (!CHAIN_NAME) {
	throw new Error('CHAIN_NAME is required in .env');
}

// ============================================================================
// SCRAP API CONFIGURATION
// ============================================================================

export const SCRAP_API_URL = process.env.SCRAP_API_URL;

if (!SCRAP_API_URL) {
	throw new Error('SCRAP_API_URL is required in .env');
}

if (!SCRAP_API_URL.startsWith('ws://') && !SCRAP_API_URL.startsWith('wss://')) {
	throw new Error('SCRAP_API_URL must be a websocket URL (ws:// or wss://)');
}

// ============================================================================
// CLAIM CONFIGURATION
// ============================================================================

// DRY_RUN controls whether transactions are broadcast (true = preview only, false = broadcast)
// Defaults to true for safety - must explicitly set to false to broadcast
export const DRY_RUN = isENVTrue(process.env.DRY_RUN ?? 'true');

export const CLAIM_INTERVAL = process.env.CLAIM_INTERVAL
	? Number(process.env.CLAIM_INTERVAL)
	: 60000; // 1 minute default
export const SYNC_INTERVAL = process.env.SYNC_INTERVAL
	? Number(process.env.SYNC_INTERVAL)
	: 3600000; // 1 hour default
export const SYNC_ON_STARTUP = isENVTrue(process.env.SYNC_ON_STARTUP ?? 'true');
export const SYNC_TIMEOUT = process.env.SYNC_TIMEOUT ? Number(process.env.SYNC_TIMEOUT) : 30000; // 30 seconds default
export const CLAIM_BATCH_SIZE = process.env.CLAIM_BATCH_SIZE
	? Number(process.env.CLAIM_BATCH_SIZE)
	: 2500;
export const AUTO_RECLAIM = isENVTrue(process.env.AUTO_RECLAIM ?? 'false');
export const AUTO_GENERATE = isENVTrue(process.env.AUTO_GENERATE ?? 'false');
export const BATCH_DELAY = process.env.BATCH_DELAY ? Number(process.env.BATCH_DELAY) : 5000; // milliseconds

// ============================================================================
// ACCOUNT SYNC CONFIGURATION
// ============================================================================

// Re-discover accounts from private keys to keep session list in sync with permission changes
export const ACCOUNT_SYNC_INTERVAL = process.env.ACCOUNT_SYNC_INTERVAL
	? Number(process.env.ACCOUNT_SYNC_INTERVAL)
	: 3600000; // 1 hour default (same as droplet sync)
export const ACCOUNT_SYNC_ON_STARTUP = isENVTrue(process.env.ACCOUNT_SYNC_ON_STARTUP ?? 'false'); // Disabled by default since initial discovery happens at startup

// Warn if in dry-run mode (suppress for sync/destroy/generate commands that have their own warnings)
const isSyncCommand = process.argv.includes('sync');
const isDestroyCommand = process.argv.includes('destroy');
const isGenerateCommand = process.argv.includes('generate');

if (DRY_RUN && !isSyncCommand && !isDestroyCommand && !isGenerateCommand) {
	console.warn('⚠️  WARNING: DRY_RUN=true (transactions will not be broadcast)');
}

// Warn for destroy/generate commands
if (DRY_RUN && (isDestroyCommand || isGenerateCommand)) {
	console.warn(
		'⚠️  WARNING: DRY_RUN=true (transactions will not be broadcast unless --no-dry-run is specified)'
	);
}

// ============================================================================
// LOGGING CONFIGURATION
// ============================================================================

export const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';

// ============================================================================
// ACCOUNT CONFIGURATION
// Note: Accounts are loaded via loadAccounts() function in lib/config.ts
// This keeps the account loading logic separate since it's more complex
// ============================================================================
