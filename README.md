# Scrapminer

Automatically claims SCRAP tokens from your Drops on EOS.

## Prerequisites

- [Bun](https://bun.sh) runtime
- An EOS account with Drops to claim
- A dedicated private key for claiming (see [Permission Setup](#1-permission-setup))

## Getting Started

### 1. Permission Setup

For security, create a dedicated `claim` permission on your account so this key can **only** claim drops - nothing else. Scrapminer has a built-in setup helper:

```bash
bun install
cp .env.example .env
```

Add your private key to `.env`:

```bash
PRIVATE_KEY=5K...
```

Then run the setup command:

```bash
bun src/index.ts setup --account <youraccountname>
```

This checks your account's permissions and gives you a link to sign any missing setup steps through Unicove.

### 2. Configure

The defaults in `.env.example` work for most users. The only value you **must** set is `PRIVATE_KEY`. Everything else is optional:

| Variable | Default | Description |
|---|---|---|
| `PRIVATE_KEY` | _(required)_ | Private key for your `claim` permission |
| `DRY_RUN` | `true` | Set to `false` to actually broadcast transactions |
| `AUTO_GENERATE` | `false` | Set to `true` to regenerate drops after claiming (maintains your drop count) |
| `AUTO_RECLAIM` | `true` | Automatically re-claims after generating new drops |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, or `error` |

### 3. Test with Dry Run

Verify everything works before broadcasting real transactions:

```bash
bun src/index.ts once
```

This syncs your drops and simulates claiming without broadcasting. Check the output to confirm your account is discovered and drops are found.

### 4. Start Mining

Once you're satisfied, disable dry-run and start the miner:

```bash
DRY_RUN=false bun src/index.ts start
```

Or set `DRY_RUN=false` in your `.env` and run:

```bash
bun src/index.ts start
```

The miner will sync your drops every hour and claim them every minute, running continuously until stopped with Ctrl+C.

## Commands

| Command | Description |
|---|---|
| `start` | Run continuously (syncs hourly, claims every minute) |
| `once` | Run a single sync + claim cycle, then exit |
| `config` | Show current configuration and discovered accounts |
| `setup --account <name>` | Generate permission setup transaction |
| `sync` | Fetch drops and output as JSON |
| `destroy --account <name> --droplets <ids>` | Manually destroy specific drops |
| `generate --account <name> --amount <n> --type <bound\|unbound>` | Manually generate new drops |

## Multi-Account Support

Scrapminer auto-discovers **all** accounts your key can claim for. If your key controls `alice@claim` and `bob@claim`, both accounts are mined automatically - no extra configuration needed.

For accounts with different keys, run separate instances with separate `.env` files:

```bash
DOTENV_CONFIG_PATH=.env.key2 bun src/index.ts start
```

## Building a Binary

Optionally compile to a standalone binary:

```bash
bun build src/index.ts --compile --minify --outfile scrapminer
./scrapminer start
```

## Security

**Always use a dedicated `claim` permission** - never put your `active` or `owner` key in this tool. The `setup` command creates a permission that can only call `drops::destroy` and `drops::generate`, so a compromised key cannot transfer tokens or change account settings.

## License

MIT
