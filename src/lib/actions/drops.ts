/**
 * Drops Contract Action Builders
 *
 * Centralized action builders for the drops contract.
 * Provides type-safe action construction with consistent defaults.
 */

import { Bytes, Checksum256, Name, UInt32, UInt64 } from '@wharfkit/antelope';
import type { Action } from '@wharfkit/session';
import { SCRAP_CONTRACT } from '../../config';
import { dropsContract } from '../wharf';
import type { Droplet } from '../cache';

/**
 * Generate random name for droplet generation (mirrors scrap-ui implementation)
 */
export function randomName(): string {
	const length = 12;
	const chars = 'abcdefghijklmnopqrstuvwxyz12345';
	let drops = '';
	for (let i = 0; i < length; i++) {
		drops += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return drops;
}

/**
 * Generate random hash for data field
 */
export function generateRandomHash(): string {
	return String(Checksum256.hash(Bytes.from(randomName(), 'utf8')));
}

/**
 * Build destroy action for droplets
 * 
 * @param owner - Account executing the action
 * @param dropletIds - Array of droplet IDs (strings or UInt64)
 * @param options - Optional parameters
 * @returns Wharfkit Action
 */
export function buildDestroyAction(
	owner: Name,
	dropletIds: string[] | UInt64[],
	options: {
		memo?: string;
		toNotify?: string;
	} = {}
): Action {
	// Convert to UInt64 if strings provided
	const ids = dropletIds.map(id => 
		typeof id === 'string' ? UInt64.from(id) : id
	);

	return dropsContract.action('destroy', {
		owner,
		droplet_ids: ids,
		memo: options.memo || undefined,
		to_notify: options.toNotify 
			? Name.from(options.toNotify) 
			: Name.from(SCRAP_CONTRACT) // Default: notify SCRAP contract
	});
}

/**
 * Build generate action for droplets
 * 
 * @param owner - Account executing the action
 * @param amount - Number of droplets to generate
 * @param bound - Whether to generate bound or unbound droplets
 * @param options - Optional parameters
 * @returns Wharfkit Action
 */
export function buildGenerateAction(
	owner: Name,
	amount: number,
	bound: boolean,
	options: {
		data?: string;
		toNotify?: string;
	} = {}
): Action {
	// Generate random hash if not provided
	const data = options.data || generateRandomHash();

	return dropsContract.action('generate', {
		owner,
		bound,
		amount: UInt32.from(amount),
		data,
		to_notify: options.toNotify 
			? Name.from(options.toNotify) 
			: undefined // No default notification for generate
	});
}

/**
 * Build destroy + regenerate actions (for AUTO_GENERATE mode)
 * 
 * Separates bound/unbound droplets and creates appropriate generate actions.
 * Mirrors the scrap-ui implementation exactly.
 * 
 * @param owner - Account executing the actions
 * @param droplets - Array of droplets being destroyed
 * @param options - Optional parameters for destroy action
 * @returns Array of actions [destroy, generate bound?, generate unbound?]
 */
export function buildDestroyAndRegenerateActions(
	owner: Name,
	droplets: Droplet[],
	options: {
		memo?: string;
		toNotify?: string;
	} = {}
): Action[] {
	// Build destroy action
	const destroyAction = buildDestroyAction(
		owner,
		droplets.map(d => d._id),
		options
	);

	const actions: Action[] = [destroyAction];

	// Separate bound and unbound droplets
	const boundDroplets = droplets.filter(d => d.bound === true);
	const unboundDroplets = droplets.filter(d => d.bound === false);

	// Generate bound droplets if any were destroyed
	if (boundDroplets.length > 0) {
		actions.push(
			buildGenerateAction(owner, boundDroplets.length, true)
		);
	}

	// Generate unbound droplets if any were destroyed
	if (unboundDroplets.length > 0) {
		actions.push(
			buildGenerateAction(owner, unboundDroplets.length, false)
		);
	}

	return actions;
}
