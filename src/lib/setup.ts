/**
 * Permission Setup Module
 *
 * Creates signing requests for permission configuration
 */

import { ABICache } from '@wharfkit/abicache';
import { KeyWeight, PrivateKey, type Session } from '@wharfkit/session';
import { SigningRequest } from '@wharfkit/signing-request';
import { chain, client } from './wharf';

const EXPLORERS: Record<string, string> = {
	// EOS Mainnet
	aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906: 'https://unicove.com',
	// Jungle4 Testnet
	'73e4385a2708e6d7048834fbc1079f2fabb17b3c125b146af438971e90716c4d':
		'https://jungle4.unicove.com',
	// Telos
	'4667b205c6838ef70ff7988f6e8257e8be0e1284a2f59699054a018f743b1d11': 'https://telos.unicove.com',
	// WAX
	'1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01aea5a4': 'https://wax.unicove.com',
	// Kylin
	'5fff1dae8dc8e2fc4d5b23b2c7665c97f9e9d8edf2b6485a86ba311c25639191': 'https://kylin.unicove.com'
};

interface PermissionStatus {
	exists: boolean;
	hasCorrectKey: boolean;
	isLinkedToDestroy: boolean;
	isLinkedToGenerate: boolean;
	existingKeys: KeyWeight[];
}

/**
 * Check if the claim permission exists and is properly configured
 */
export async function checkPermissionStatus(
	session: Session,
	permissionName = 'claim'
): Promise<PermissionStatus> {
	const account = await client.v1.chain.get_account(session.actor);
	const permission = account.permissions.find((p) => p.perm_name.equals(permissionName));

	const status: PermissionStatus = {
		exists: !!permission,
		hasCorrectKey: false,
		isLinkedToDestroy: false,
		isLinkedToGenerate: false,
		existingKeys: []
	};

	if (permission) {
		const publicKey = PrivateKey.from(session.walletPlugin.data.privateKey).toPublic();
		status.hasCorrectKey = permission.required_auth.keys.some((k) => k.key.equals(publicKey));
		status.existingKeys = permission.required_auth.keys.map((k) =>
			KeyWeight.from({ key: k.key, weight: k.weight })
		);

		// Check if permission is linked to required actions
		// Links are stored in the permission's linked_actions array
		if (permission.linked_actions) {
			status.isLinkedToDestroy = permission.linked_actions.some(
				(link) => link.account.equals('drops') && link.action.equals('destroy')
			);
			status.isLinkedToGenerate = permission.linked_actions.some(
				(link) => link.account.equals('drops') && link.action.equals('generate')
			);
		}
	}

	return status;
}

/**
 * Create updateauth action to create or update the claim permission
 */
export async function makeUpdateAuthAction(
	session: Session,
	permissionName: string,
	existingKeys: KeyWeight[] = []
) {
	const publicKey = PrivateKey.from(session.walletPlugin.data.privateKey).toPublic();
	const keys: KeyWeight[] = [KeyWeight.from({ key: publicKey, weight: 1 })];

	// Retain existing keys (if any) to avoid locking out other keys
	for (const existingKey of existingKeys) {
		if (!existingKey.key.equals(publicKey)) {
			keys.push(existingKey);
		}
	}

	return {
		account: 'eosio',
		name: 'updateauth',
		authorization: [
			{
				actor: session.actor,
				permission: 'active'
			}
		],
		data: {
			account: session.actor,
			permission: permissionName,
			parent: 'active',
			auth: {
				threshold: 1,
				keys,
				accounts: [],
				waits: []
			}
		}
	};
}

/**
 * Create linkauth action to link permission to contract action
 */
export async function makeLinkAuthAction(
	session: Session,
	permissionName: string,
	contractName: string,
	actionName: string
) {
	return {
		account: 'eosio',
		name: 'linkauth',
		authorization: [
			{
				actor: session.actor,
				permission: 'active'
			}
		],
		data: {
			account: session.actor,
			code: contractName,
			type: actionName,
			requirement: permissionName
		}
	};
}

/**
 * Generate a Unicove signing request URL for permission setup (without needing session)
 */
export async function generateSetupRequestForAccount(
	accountName: string,
	privateKey: string,
	permissionName = 'claim'
): Promise<{
	url: string | null;
	status: PermissionStatus;
	alreadyConfigured: boolean;
}> {
	const account = await client.v1.chain.get_account(accountName);
	const publicKey = PrivateKey.from(privateKey).toPublic();

	const permission = account.permissions.find((p) => p.perm_name.equals(permissionName));

	const status: PermissionStatus = {
		exists: !!permission,
		hasCorrectKey: false,
		isLinkedToDestroy: false,
		isLinkedToGenerate: false,
		existingKeys: []
	};

	if (permission) {
		status.hasCorrectKey = permission.required_auth.keys.some((k) => k.key.equals(publicKey));
		status.existingKeys = permission.required_auth.keys.map((k) =>
			KeyWeight.from({ key: k.key, weight: k.weight })
		);

		// Check if permission is linked to required actions
		// Links are stored in the permission's linked_actions array
		if (permission.linked_actions) {
			status.isLinkedToDestroy = permission.linked_actions.some(
				(link) => String(link.account) === 'drops' && String(link.action) === 'destroy'
			);
			status.isLinkedToGenerate = permission.linked_actions.some(
				(link) => String(link.account) === 'drops' && String(link.action) === 'generate'
			);
		}
	}

	// Check if already configured
	if (
		status.exists &&
		status.hasCorrectKey &&
		status.isLinkedToDestroy &&
		status.isLinkedToGenerate
	) {
		return { url: null, status, alreadyConfigured: true };
	}

	const actions = [];

	// Create or update the permission if needed
	if (!status.exists || !status.hasCorrectKey) {
		const keys: KeyWeight[] = [KeyWeight.from({ key: publicKey, weight: 1 })];

		// Retain existing keys
		for (const existingKey of status.existingKeys) {
			if (!existingKey.key.equals(publicKey)) {
				keys.push(existingKey);
			}
		}

		actions.push({
			account: 'eosio',
			name: 'updateauth',
			authorization: [{ actor: accountName, permission: 'active' }],
			data: {
				account: accountName,
				permission: permissionName,
				parent: 'active',
				auth: {
					threshold: 1,
					keys,
					accounts: [],
					waits: []
				}
			}
		});
	}

	// Link to drops::destroy if not already linked
	if (!status.isLinkedToDestroy) {
		actions.push({
			account: 'eosio',
			name: 'linkauth',
			authorization: [{ actor: accountName, permission: 'active' }],
			data: {
				account: accountName,
				code: 'drops',
				type: 'destroy',
				requirement: permissionName
			}
		});
	}

	// Link to drops::generate if not already linked
	if (!status.isLinkedToGenerate) {
		actions.push({
			account: 'eosio',
			name: 'linkauth',
			authorization: [{ actor: accountName, permission: 'active' }],
			data: {
				account: accountName,
				code: 'drops',
				type: 'generate',
				requirement: permissionName
			}
		});
	}

	const abiCache = new ABICache(client);
	const request = await SigningRequest.create(
		{ actions },
		{
			abiProvider: abiCache,
			zlib: {
				deflateRaw: (data: Uint8Array) => Bun.deflateSync(Buffer.from(data)),
				inflateRaw: (data: Uint8Array) => Bun.inflateSync(Buffer.from(data))
			}
		}
	);
	const chainId = String(chain.id);
	const explorerUrl = EXPLORERS[chainId];

	let url: string;
	if (explorerUrl) {
		url = `${explorerUrl}/prompt/${request.encode(false, false, '')}`;
	} else {
		url = `esr:${request.encode()}`;
	}

	return { url, status, alreadyConfigured: false };
}
