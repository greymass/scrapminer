/**
 * Scrapminer CLI
 *
 * Command-line interface for flexible operation modes:
 * - start: Run as daemon with scheduler (default)
 * - once: Run single claim cycle and exit
 * - config: Display current configuration
 */

import { Command } from 'commander';
import { ACCOUNT_SYNC_INTERVAL, CLAIM_INTERVAL, SCRAP_API_URL, SYNC_INTERVAL } from './config';
import { loadAccounts } from './lib/config';
import { generalLog } from './lib/logger';
import { ScrapMinerService } from './service';

const packageJson = {
	version: '1.0.0',
	name: 'scrapminer',
	description: 'Automated SCRAP Token Claimer'
};

export function prompt() {
	const program = new Command();

	program
		.version(packageJson.version)
		.name(packageJson.name)
		.description(packageJson.description);

	// Start command - run as daemon with schedulers
	program
		.command('start')
		.description('Start the scrapminer service with sync and claim schedulers (daemon mode)')
		.option('--no-sync', 'Disable sync scheduler (hourly droplet fetch)')
		.option('--no-claim', 'Disable claim scheduler (1-minute cache check)')
		.option('--no-account-sync', 'Disable account sync scheduler (hourly account re-discovery)')
		.option('--sync-interval <ms>', 'Sync interval in milliseconds', String(SYNC_INTERVAL))
		.option(
			'--claim-interval <ms>',
			'Claim check interval in milliseconds',
			String(CLAIM_INTERVAL)
		)
		.option(
			'--account-sync-interval <ms>',
			'Account sync interval in milliseconds',
			String(ACCOUNT_SYNC_INTERVAL)
		)
		.action(async (options) => {
			const service = new ScrapMinerService({
				useSyncScheduler: options.sync !== false,
				useClaimScheduler: options.claim !== false,
				useAccountSyncScheduler: options.accountSync !== false,
				syncInterval: options.syncInterval ? Number(options.syncInterval) : SYNC_INTERVAL,
				claimInterval: options.claimInterval
					? Number(options.claimInterval)
					: CLAIM_INTERVAL,
				accountSyncInterval: options.accountSyncInterval
					? Number(options.accountSyncInterval)
					: ACCOUNT_SYNC_INTERVAL
			});

			// Graceful shutdown handlers
			process.on('SIGINT', async () => {
				generalLog.info('Received SIGINT, shutting down gracefully');
				await service.stop();
				process.exit(0);
			});

			process.on('SIGTERM', async () => {
				generalLog.info('Received SIGTERM, shutting down gracefully');
				await service.stop();
				process.exit(0);
			});

			try {
				await service.start();
			} catch (error) {
				generalLog.error('Failed to start service', { error: error.message });
				process.exit(1);
			}
		});

	// Once command - run single sync + claim cycle and exit
	program
		.command('once')
		.description('Run a single sync + claim cycle and exit (no schedulers)')
		.action(async () => {
			try {
				await ScrapMinerService.runOnce();
				process.exit(0);
			} catch (error) {
				generalLog.error('Cycle failed', { error: error.message });
				process.exit(1);
			}
		});

	// Config command - display current configuration
	program
		.command('config')
		.description('Display current configuration and discovered accounts')
		.action(async () => {
			const accounts = loadAccounts();

			console.log('\n=== Scrapminer Configuration ===\n');
			console.log(`SCRAP API URL: ${SCRAP_API_URL}`);
			console.log(`Sync Interval: ${SYNC_INTERVAL}ms (${SYNC_INTERVAL / 1000 / 60} minutes)`);
			console.log(`Claim Interval: ${CLAIM_INTERVAL}ms (${CLAIM_INTERVAL / 1000} seconds)`);
			console.log(
				`Account Sync Interval: ${ACCOUNT_SYNC_INTERVAL}ms (${ACCOUNT_SYNC_INTERVAL / 1000 / 60} minutes)`
			);
			console.log(`\nConfigured Private Keys: ${accounts.length}`);
			console.log('\nDiscovering accounts from private keys...\n');

			try {
				const { createSessions } = await import('./lib/wharf');
				const sessions = await createSessions(accounts);

				console.log('Discovered Accounts:');
				for (let i = 0; i < sessions.length; i++) {
					const session = sessions[i];
					console.log(
						`  ${i + 1}. ${String(session.actor)}@${String(session.permission)}`
					);
				}

				generalLog.debug('Configuration displayed', {
					scrapApiUrl: SCRAP_API_URL,
					syncInterval: SYNC_INTERVAL,
					claimInterval: CLAIM_INTERVAL,
					accountSyncInterval: ACCOUNT_SYNC_INTERVAL,
					discoveredAccounts: sessions.map((s) => ({
						actor: String(s.actor),
						permission: String(s.permission)
					}))
				});
			} catch (error) {
				console.error(`\nError discovering accounts: ${error.message}`);
				generalLog.error('Failed to discover accounts', { error: error.message });
				process.exit(1);
			}

			console.log('\n');
		});

	// Sync command - fetch droplets and output as JSON
	program
		.command('sync')
		.description('Sync droplets from SCRAP API and output as JSON (for piping)')
		.option(
			'-a, --account <name>',
			'Specific account to sync (default: first configured account)'
		)
		.option('-l, --limit <number>', 'Maximum number of droplets to fetch (default: all)', '0')
		.option('--pretty', 'Pretty-print JSON output')
		.option('--revealed', 'Only include revealed droplets')
		.option('--unrevealed', 'Only include unrevealed droplets')
		.action(async (options) => {
			await ScrapMinerService.runSync(options);
		});

	// Setup command - create permission configuration signing request
	program
		.command('setup')
		.description('Generate a signing request to setup the claim permission')
		.option('-p, --permission <name>', 'Permission name to create (default: claim)', 'claim')
		.requiredOption('-a, --account <name>', 'Account name')
		.action(async (options) => {
			const accounts = loadAccounts();
			if (accounts.length === 0) {
				console.error('\nError: No private key configured. Set PRIVATE_KEY in .env\n');
				process.exit(1);
			}

			try {
				const { generateSetupRequestForAccount } = await import('./lib/setup');
				const privateKey = accounts[0].privkey;

				console.log('\n=== Permission Setup ===\n');
				console.log(`Account: ${options.account}`);
				console.log(`Permission: ${options.permission}\n`);

				const result = await generateSetupRequestForAccount(
					options.account,
					privateKey,
					options.permission
				);

				if (result.alreadyConfigured) {
					console.log('✅ Permission already configured correctly');
					console.log(`   - Permission exists: ${result.status.exists}`);
					console.log(`   - Has correct key: ${result.status.hasCorrectKey}`);
					console.log(
						`   - Linked to drops::destroy: ${result.status.isLinkedToDestroy}`
					);
					console.log(
						`   - Linked to drops::generate: ${result.status.isLinkedToGenerate}`
					);
					console.log('\nNo action needed.\n');
					return;
				}

				console.log('📋 Current status:');
				console.log(`   - Permission exists: ${result.status.exists ? '✅' : '❌'}`);
				console.log(`   - Has correct key: ${result.status.hasCorrectKey ? '✅' : '❌'}`);
				console.log(
					`   - Linked to drops::destroy: ${result.status.isLinkedToDestroy ? '✅' : '❌'}`
				);
				console.log(
					`   - Linked to drops::generate: ${result.status.isLinkedToGenerate ? '✅' : '❌'}`
				);
				console.log('\n🔧 Action required:');

				if (!result.status.exists || !result.status.hasCorrectKey) {
					console.log(
						`   - ${!result.status.exists ? 'Create' : 'Update'} ${options.permission} permission`
					);
				}
				if (!result.status.isLinkedToDestroy) {
					console.log('   - Link to drops::destroy action');
				}
				if (!result.status.isLinkedToGenerate) {
					console.log('   - Link to drops::generate action');
				}

				console.log('\n🔗 Complete setup with this transaction:\n');
				console.log(`   ${result.url}\n`);

				if (result.status.existingKeys.length > 0 && !result.status.hasCorrectKey) {
					console.log('⚠️  Note: Existing keys on this permission will be retained.\n');
				}

				generalLog.info('Setup command completed', {
					account: options.account,
					permission: options.permission
				});
			} catch (error) {
				console.error(`\nError: ${error.message}\n`);
				generalLog.error('Setup command failed', { error: error.message });
				process.exit(1);
			}
		});

	// Destroy command - destroy droplets for an account
	program
		.command('destroy')
		.description('Destroy droplets for an account (specify IDs or amount)')
		.requiredOption('-a, --account <name>', 'Account name that owns the droplets')
		.option('-d, --droplets <ids>', 'Comma-separated droplet IDs to destroy')
		.option(
			'-n, --amount <number>',
			'Number of droplets to destroy (auto-fetches IDs from cache/API)'
		)
		.option('--memo <text>', 'Transaction memo')
		.option(
			'--notify <account>',
			'Account to notify (default: scrap contract for token minting)'
		)
		.option('--dry-run', 'Force dry-run mode (preview without broadcasting)')
		.option('--no-dry-run', 'Disable dry-run mode (broadcast transactions)')
		.action(async (options) => {
			// Validate: must provide either --droplets or --amount, but not both
			if (!options.droplets && !options.amount) {
				generalLog.error('Must specify either --droplets (IDs) or --amount (number)');
				process.exit(1);
			}
			if (options.droplets && options.amount) {
				generalLog.error('Cannot specify both --droplets and --amount (choose one)');
				process.exit(1);
			}
			await ScrapMinerService.runDestroy(options);
		});

	// Generate command - generate new droplets for an account
	program
		.command('generate')
		.description('Generate new droplets for an account')
		.requiredOption('-a, --account <name>', 'Account name to generate droplets for')
		.requiredOption('-n, --amount <number>', 'Number of droplets to generate')
		.requiredOption('-t, --type <bound|unbound>', 'Droplet type (bound or unbound)')
		.option(
			'--data <string>',
			'Custom data/hash for generation (auto-generated if not provided)'
		)
		.option('--notify <account>', 'Account to notify after generation')
		.option('--dry-run', 'Force dry-run mode (preview without broadcasting)')
		.option('--no-dry-run', 'Disable dry-run mode (broadcast transactions)')
		.action(async (options) => {
			await ScrapMinerService.runGenerate(options);
		});

	program.parse(process.argv);

	// If no command specified, show help
	if (!process.argv.slice(2).length) {
		program.outputHelp();
	}
}
