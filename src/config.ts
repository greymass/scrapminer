/**
 * Centralized Configuration Module
 *
 * All environment variables are validated and exported as typed constants.
 * This module will throw errors at startup if required config is missing,
 * following the fail-fast principle from resource-provider.
 */

import { isENVTrue } from './lib/utils';

// ============================================================================
// ENVIRONMENT DETECTION
// ============================================================================

export const ENVIRONMENT = process.env.ENVIRONMENT ?? 'production';

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
export const USE_WEBSOCKET = isENVTrue(process.env.USE_WEBSOCKET ?? 'true');

if (!SCRAP_API_URL) {
	throw new Error('SCRAP_API_URL is required in .env');
}

if (!SCRAP_API_URL.startsWith('ws://') && !SCRAP_API_URL.startsWith('wss://')) {
	throw new Error('SCRAP_API_URL must be a websocket URL (ws:// or wss://)');
}

// ============================================================================
// CLAIM CONFIGURATION
// ============================================================================

export const CLAIM_ENABLED = isENVTrue(process.env.CLAIM_ENABLED ?? 'false');
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
export const BATCH_DELAY = process.env.BATCH_DELAY ? Number(process.env.BATCH_DELAY) : 5000; // milliseconds

// Warn if claims are disabled in production (suppress for sync command)
const isSyncCommand = process.argv.includes('sync');
if (!CLAIM_ENABLED && ENVIRONMENT === 'production' && !isSyncCommand) {
	console.warn('⚠️  WARNING: Running in production with CLAIM_ENABLED=false (DRY RUN mode)');
}

// ============================================================================
// LOGGING CONFIGURATION
// ============================================================================

export const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
export const SERVICE_INFO_LOG = process.env.SERVICE_INFO_LOG ?? './logs/scrapminer.log';
export const SERVICE_ERROR_LOG = process.env.SERVICE_ERROR_LOG ?? './logs/error.log';

// ============================================================================
// ACCOUNT CONFIGURATION
// Note: Accounts are loaded via loadAccounts() function in lib/config.ts
// This keeps the account loading logic separate since it's more complex
// ============================================================================
