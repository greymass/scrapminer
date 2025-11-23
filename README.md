# Scrapminer

Automated SCRAP token claimer for multiple accounts. Monitors the SCRAP API and claims available tokens from the Drops contract.

## Features

- 🔄 **Two-Scheduler Architecture**: Separate sync (hourly) and claim (1-minute) schedulers
- 💾 **In-Memory Cache**: Efficient droplet storage reduces API calls
- 🔑 **Auto-Discovery**: Automatically discovers account names and permissions from private keys
- ⚡ **Batch Processing**: Configurable batch sizes for efficient claiming
- 🔁 **Auto-Reclaim**: Automatically reclaims after generating new drops
- ♻️ **Auto-Generate**: Maintains constant droplet balance by regenerating after claiming (mirrors scrap-ui)
- 📊 **Structured Logging**: Winston-based logging with context
- 🛡️ **Graceful Shutdown**: Proper cleanup on SIGINT/SIGTERM

## Architecture

```
┌─────────────────────────────────────────┐
│         SCRAPMINER SERVICE              │
├─────────────────────────────────────────┤
│  ┌──────────────┐  ┌─────────────────┐ │
│  │ Sync         │  │ Claim           │ │
│  │ Scheduler    │  │ Scheduler       │ │
│  │ (Hourly)     │  │ (1 minute)      │ │
│  └──────┬───────┘  └────────┬────────┘ │
│         │                   │          │
│         ▼                   ▼          │
│  ┌──────────────┐  ┌─────────────────┐ │
│  │ Sync Module  │  │ Claimer Module  │ │
│  │ (WebSocket)  │  │ (Blockchain)    │ │
│  └──────┬───────┘  └────────┬────────┘ │
│         │                   │          │
│         ▼                   ▼          │
│  ┌─────────────────────────────────┐  │
│  │     Droplet Cache (Memory)      │  │
│  │   Map<account, Droplet[]>       │  │
│  └─────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) runtime (latest)
- Private key with `claim` permission for your account
- Access to SCRAP API (production or local)

### Installation

```bash
# Install dependencies
bun install

# Copy and configure environment
cp .env.example .env
# Edit .env with your private key and configuration
```

### Configuration

Create a `.env` file:

```bash
# Chain Configuration
CHAIN_NAME=EOS                                  # Chain to connect to
LEAP_API=https://eos.greymass.com               # Optional: Override chain API
CONTRACT_NAME=drops                             # Drops contract account
SCRAP_CONTRACT=scrap                            # SCRAP token contract

# SCRAP API Configuration  
SCRAP_API_URL=https://scrap-api.greymass.com    # SCRAP API endpoint

# Account Configuration
PRIVATE_KEY=5K...                               # Private key (auto-discovers account@permission)

# Sync Configuration (Populate Cache)
SYNC_INTERVAL=3600000                           # Sync interval (ms) - 1 hour default
SYNC_ON_STARTUP=true                            # Sync on startup
SYNC_TIMEOUT=30000                              # WebSocket timeout (ms) - 30s default

# Claim Configuration (Process Cache)
CLAIM_ENABLED=false                             # MUST be 'true' to broadcast (safety flag)
CLAIM_INTERVAL=60000                            # Claim check interval (ms) - 1 minute default
CLAIM_BATCH_SIZE=2500                           # Max droplets per claim transaction
AUTO_RECLAIM=true                               # Auto-claim after generate operations
AUTO_GENERATE=false                             # Auto-regenerate droplets after claiming (maintains balance)
BATCH_DELAY=5000                                # Delay between batches (ms) - 5sec default

# Logging Configuration
LOG_LEVEL=info                                  # debug | info | warn | error
```

### Usage

#### Development Mode

```bash
# Run with hot reload
bun run --hot src/index.ts start

# Check configuration
bun run src/index.ts config

# Run once (sync + claim all, then exit)
bun run src/index.ts once
```

#### Production Build

```bash
# Build standalone binary
bun build src/index.ts --compile --outfile scrapminer

# Run binary
./scrapminer start
./scrapminer once
./scrapminer config
```

#### Make Commands

```bash
make dev          # Run with hot reload
make build        # Compile standalone binary
make start        # Run production binary
make config       # Show configuration
make once         # Run once mode
make lint         # Run biome checks
make test         # Run tests
```

## Commands

### `start`

Runs the service with both schedulers:
- **Sync Scheduler**: Fetches droplets hourly and stores in cache
- **Claim Scheduler**: Processes cache every minute

```bash
./scrapminer start [--no-sync] [--no-claim]
```

**Flags**:
- `--no-sync`: Skip sync scheduler (claim-only mode)
- `--no-claim`: Skip claim scheduler (sync-only mode)

### `once`

Runs a single sync + claim cycle for all accounts, then exits:
1. Syncs droplets for each account sequentially
2. Claims droplets in batches (respects `CLAIM_BATCH_SIZE`)
3. Continues until all accounts have 0 cached droplets
4. Exits

```bash
./scrapminer once
```

**Use case**: Cron jobs, manual runs, testing

### `config`

Displays current configuration including discovered account details:

```bash
./scrapminer config
```

### `setup`

Generates a Unicove signing request to create and link the claim permission:

```bash
./scrapminer setup [--permission <name>]
```

**What it does**:
1. Checks if claim permission exists
2. Verifies permission has correct key
3. Checks if permission is linked to `drops::destroy` and `drops::generate`
4. Generates Unicove URL to complete missing setup steps

**Output**: Clickable Unicove URL to sign the permission setup transaction

## Operation Modes

### Daemon Mode (Recommended)

Runs continuously with two independent schedulers:

```bash
./scrapminer start
```

**Sync Scheduler**:
- Runs every hour (configurable via `SYNC_INTERVAL`)
- Fetches all droplets for each account via WebSocket
- Stores droplet IDs in cache
- Runs on startup if `SYNC_ON_STARTUP=true`

**Claim Scheduler**:
- Runs every minute (configurable via `CLAIM_INTERVAL`)
- Checks cache for each account
- Claims droplets in batches (up to `CLAIM_BATCH_SIZE`)
- Removes claimed droplets from cache

### Once Mode

Runs a complete sync + claim cycle:

```bash
./scrapminer once
```

**Process**:
1. For each account:
   - Sync droplets (WebSocket)
   - Claim all droplets in batches
   - Repeat until cache empty
2. Exit when all accounts processed

**Use case**: Cron scheduling, manual execution

### Claim-Only Mode

Runs claim scheduler without syncing:

```bash
./scrapminer start --no-sync
```

**Use case**: When you want to manually control sync timing or have another process populating the cache.

### Sync-Only Mode

Runs sync scheduler without claiming:

```bash
./scrapminer start --no-claim
```

**Use case**: Testing, cache pre-population, monitoring droplet generation.

## How It Works

### 1. Account Discovery

On startup, the private key is used to query the blockchain API to discover:
- Account name
- Permission name (e.g., `claimer@claim`)

This eliminates the need to manually configure account names.

### 2. Sync Phase

The sync scheduler:
1. Connects to SCRAP API WebSocket (`wss://scrap-api.greymass.com`)
2. Sends `get_droplets` command for each account
3. Receives `set_droplets` response with droplet IDs
4. Stores droplet IDs in cache (replaces existing)
5. Disconnects

### 3. Claim Phase

The claim scheduler:
1. Checks cache for each account
2. If droplets exist:
   - Takes up to `CLAIM_BATCH_SIZE` droplets
   - Builds `destroy` action with droplet IDs
   - If `AUTO_GENERATE=true`:
     - Filters droplets by bound/unbound status
     - Adds `generate` action(s) to regenerate same count
   - Submits transaction to blockchain
   - Removes claimed droplets from cache
3. If `AUTO_RECLAIM=true` and destroy generated new drops:
   - Re-syncs droplets
   - Claims again in next cycle

### 4. Caching Strategy

**Why Cache?**
- Reduces WebSocket connections (hourly vs. every minute)
- Faster claim checks (in-memory vs. network)
- More reliable (no websocket dependency for claims)
- Better separation of concerns

**Cache Structure**:
```typescript
Map<string, Droplet[]>

interface Droplet {
  _id: string;        // Droplet ID
  owner: string;      // Account name
  bound: boolean;     // RAM source (true = contract RAM, false = user RAM)
  created: string;    // Creation timestamp
}

// Example:
{
  "claimer@claim": [
    { _id: "123", owner: "claimer", bound: true, created: "2025-11-23T..." },
    { _id: "456", owner: "claimer", bound: false, created: "2025-11-23T..." }
  ]
}
```

## Configuration Details

### Sync Interval

```bash
SYNC_INTERVAL=3600000  # 1 hour (recommended)
```

**Recommendations**:
- **Production**: 3600000 (1 hour) - Balances freshness and API load
- **Testing**: 300000 (5 minutes) - Faster iteration
- **High-frequency**: 600000 (10 minutes) - If you generate drops often

### Claim Interval

```bash
CLAIM_INTERVAL=60000  # 1 minute (recommended)
```

**Recommendations**:
- **Production**: 60000 (1 minute) - Fast claiming without spam
- **Low-priority**: 300000 (5 minutes) - Reduce blockchain transactions
- **Instant**: 30000 (30 seconds) - Maximum responsiveness

### Batch Size

```bash
CLAIM_BATCH_SIZE=2500  # Maximum droplets per transaction
```

**Recommendations**:
- **Default**: 2500 - Balances transaction size and claim speed
- **Conservative**: 1000 - Smaller transactions, more claims
- **Aggressive**: 5000 - Larger transactions (may hit CPU limits)

**Note**: Blockchain CPU limits may prevent very large batches.

### Auto-Reclaim

```bash
AUTO_RECLAIM=true  # Recommended
```

When enabled:
- After claiming bound drops (which generates unbound drops)
- Automatically re-syncs to fetch new droplets
- Claims new droplets in next cycle

**Disable if**: You want to manually control when generated drops are claimed.

### Auto-Generate

```bash
AUTO_GENERATE=false  # Set to true to maintain constant droplet balance
```

When enabled:
- After destroying droplets to claim SCRAP tokens
- Automatically regenerates the same number of droplets
- Maintains constant droplet balance (mirrors scrap-ui behavior)
- Separates bound and unbound droplets for proper RAM accounting

**How it works**:
1. Destroy droplets → claim SCRAP tokens
2. Filter destroyed droplets by `bound` flag
3. Generate new bound droplets (if any bound were destroyed)
4. Generate new unbound droplets (if any unbound were destroyed)
5. Each droplet regenerated maintains its bound status

**Transaction structure**:
```typescript
{
  actions: [
    { name: 'destroy', data: { droplet_ids: [...] } },
    { name: 'generate', data: { bound: true, count: X } },   // If bound droplets destroyed
    { name: 'generate', data: { bound: false, count: Y } }   // If unbound droplets destroyed
  ]
}
```

**Why separate bound/unbound?**
- Bound droplets use RAM from contract
- Unbound droplets use RAM from user account
- Preserves RAM accounting by regenerating with same bound status

**Disable if**: You want your droplet count to decrease as you claim SCRAP.

## Security

### Dedicated Permission

**CRITICAL**: Use a dedicated `claim` or `claimer` permission, NOT `active` or `owner`.

```bash
# ✅ CORRECT - Limited permission
PRIVATE_KEY=5K...  # Key for claimer@claim permission

# ❌ WRONG - Too much authority
PRIVATE_KEY=5K...  # Key for claimer@active permission
```

**Why?**
- If key is compromised, attacker can only claim drops
- Cannot transfer tokens, change permissions, or perform destructive actions

**How to create claim permission**:
```bash
# Create permission
cleos set account permission claimer claim \
  '{"threshold":1,"keys":[{"key":"PUB_K1_...","weight":1}]}' \
  active -p claimer@active

# Link to destroy action
cleos set action permission claimer drops destroy claim -p claimer@active
```

### Key Storage

- **Never commit** `.env` file to git (already in `.gitignore`)
- Store private keys in secure environment (KMS, vault, encrypted storage)
- Rotate keys periodically
- Monitor blockchain activity for unexpected transactions

## Troubleshooting

### Nothing to Claim

**Symptom**: Logs show "No droplets in cache"

**Solutions**:
1. Verify account has generated drops at https://scrapload.io
2. Check `SCRAP_API_URL` is correct
3. Run sync manually: `./scrapminer once`
4. Verify account name with: `./scrapminer config`

### Insufficient Authority

**Symptom**: "missing authority" error

**Solutions**:
1. Verify private key matches the permission
2. Check permission exists: `cleos get account <account>`
3. Verify permission is linked to `destroy` action
4. Ensure using `claim` permission, not `active`

### WebSocket Timeout

**Symptom**: "WebSocket timeout" during sync

**Solutions**:
1. Increase `SYNC_TIMEOUT` (default: 30000ms)
2. Check SCRAP API is reachable
3. Verify network connectivity
4. Try once mode: `./scrapminer once`

### Scheduler Not Running

**Symptom**: No activity after startup

**Solutions**:
1. Check logs for errors
2. Verify schedulers are enabled (no `--no-sync` or `--no-claim` flags)
3. Increase `LOG_LEVEL=debug` for detailed output
4. Check both schedulers started successfully in logs

### High CPU Usage

**Symptom**: Binary using excessive CPU

**Solutions**:
1. Increase `CLAIM_INTERVAL` (claim less frequently)
2. Reduce `CLAIM_BATCH_SIZE` (smaller transactions)
3. Check for transaction failures causing retries
4. Monitor for stuck websocket connections

## Logging

### Log Levels

```bash
LOG_LEVEL=debug   # All logs including debug messages
LOG_LEVEL=info    # Standard operation logs (recommended)
LOG_LEVEL=warn    # Warnings and errors only
LOG_LEVEL=error   # Errors only
```

### Log Output

**Console**: All logs go to stdout with structured JSON format

**Key log events**:
- `service.start` - Service starting with configuration
- `sync.start` - Sync operation beginning
- `sync.complete` - Sync completed with droplet count
- `claim.start` - Claim operation beginning
- `claim.success` - Successful claim with transaction ID
- `claim.error` - Claim failed with error details

### Example Logs

```json
{"level":"info","message":"Starting scrapminer service","mode":"daemon","accounts":1}
{"level":"info","message":"Sync started","account":"claimer@claim"}
{"level":"info","message":"Sync completed","account":"claimer@claim","droplets":1234}
{"level":"info","message":"Claim started","account":"claimer@claim","batch":2500}
{"level":"info","message":"Claim success","account":"claimer@claim","txid":"abc123...","droplets":2500}
```

## Monitoring

### Health Checks

Monitor log output for:
- Successful syncs every hour
- Successful claims when droplets exist
- No persistent errors or timeouts

### Metrics to Track

- **Droplets synced**: Count per sync operation
- **Droplets claimed**: Count per claim operation
- **Claim success rate**: Successful claims / total attempts
- **Sync duration**: Time to complete sync
- **Claim duration**: Time to complete claim

### Alerting

Set up alerts for:
- No successful syncs for > 2 hours
- Claim errors for > 10 minutes
- WebSocket timeouts
- "Insufficient authority" errors (permission issue)

## Development

### Running Tests

```bash
bun test
```

### Code Quality

```bash
# Run biome linter
bun run biome check src/

# Auto-fix issues
bun run biome check --write src/
```

### Project Structure

```
scrapminer/
├── src/
│   ├── lib/
│   │   ├── contracts/       # Generated contract types
│   │   │   ├── drops.ts
│   │   │   └── scrap.ts
│   │   ├── api.ts          # SCRAP API client
│   │   ├── cache.ts        # Droplet cache
│   │   ├── claimer.ts      # Claim operations
│   │   ├── config.ts       # Account loading
│   │   ├── logger.ts       # Winston logger
│   │   ├── sync.ts         # Sync operations
│   │   ├── utils.ts        # Account discovery
│   │   ├── websocket.ts    # WebSocket wrapper
│   │   └── wharf.ts        # Session management
│   ├── cli.ts              # Command-line interface
│   ├── config.ts           # Environment variables
│   ├── index.ts            # Entry point
│   └── service.ts          # Main service with schedulers
├── test/                   # Unit tests
├── .env.example            # Configuration template
├── Makefile                # Build commands
├── package.json
├── tsconfig.json
└── README.md
```

## FAQ

### How do I claim for multiple accounts?

Currently, scrapminer is configured for single-account operation. To run multiple accounts:

1. Run separate instances with different `.env` files:
```bash
./scrapminer start  # Uses .env
DOTENV_CONFIG_PATH=.env.account2 ./scrapminer start
```

2. Or modify `src/lib/config.ts` to support `ACCOUNT1_KEY`, `ACCOUNT2_KEY`, etc.

### Can I run this as a systemd service?

Yes! Example unit file:

```ini
[Unit]
Description=Scrapminer SCRAP Token Claimer
After=network.target

[Service]
Type=simple
User=scrapminer
WorkingDirectory=/opt/scrapminer
ExecStart=/opt/scrapminer/scrapminer start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Does this work with testnets?

Yes! Change configuration:

```bash
CHAIN_NAME=JUNGLE4
LEAP_API=https://jungle4.greymass.com
SCRAP_API_URL=http://localhost:3000  # Run local scrap-api
```

### How do I monitor in production?

1. **Logging**: Pipe logs to monitoring system (e.g., Datadog, Splunk)
2. **Metrics**: Parse logs for metrics (claims/hour, success rate)
3. **Alerting**: Alert on error patterns or missing activity
4. **Health checks**: Monitor process liveness and log output

### Can I use a different blockchain library?

The project uses `@wharfkit` libraries. To use something else (e.g., `eosjs`), you'd need to rewrite:
- `src/lib/wharf.ts` - Session management
- `src/lib/claimer.ts` - Transaction building

## Contributing

This is a production tool for the Shipload ecosystem. Contributions welcome!

### Guidelines

- Follow existing code style (Biome enforced)
- Add tests for new features
- Update this README for user-facing changes
- Keep dependencies minimal
- Maintain TypeScript strict mode

## License

MIT

## Support

- **Issues**: [GitHub Issues](https://github.com/your-org/scrapminer/issues)
- **Docs**: This README
- **Community**: [Discord/Telegram]

---

**Built with ❤️ for the Shipload community**
