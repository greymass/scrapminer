# Logging Summary

## Log Level Guidelines

### INFO Level (User-Facing)
INFO logs show **what's happening** that users care about:
- ✅ Service started/stopped with key configuration
- ✅ Accounts being monitored
- ✅ Droplets found and synced
- ✅ Successful claims with counts
- ✅ Important events (epoch changes, reconnections)
- ✅ Errors that users should know about

### DEBUG Level (Developer-Facing)
DEBUG logs show **how it's working** for troubleshooting:
- 🔧 Websocket connection details
- 🔧 Scheduler initialization
- 🔧 Individual sync/claim cycle starts
- 🔧 Transaction broadcast details
- 🔧 Cache operations
- 🔧 Timing and delays

## Example INFO Output

### Service Start
```
🚀 Scrapminer starting { accounts: 1, syncInterval: '60min', claimInterval: '60s' }
📋 Monitoring 1 account { accounts: [ 'gm@claim' ] }
🔌 Connected to SCRAP API
✅ Service started - monitoring for droplets
```

### Sync Cycle (with droplets)
```
Synced droplets { account: 'gm@claim', droplets: 1234 }
Sync complete { total: 1234, accounts: { 'gm@claim': 1234 } }
```

### Sync Cycle (no droplets)
```
(silent - no logs at INFO level)
```

### Claim Cycle (single batch)
```
✅ Claimed 1234 droplets { account: 'gm@claim' }
```

### Claim Cycle (multiple batches)
```
Claimed batch 1/3 { account: 'gm@claim', droplets: 2500, remaining: 4734 }
Claimed batch 2/3 { account: 'gm@claim', droplets: 2500, remaining: 2234 }
Claimed batch 3/3 { account: 'gm@claim', droplets: 2234, remaining: 0 }
✅ Claimed 7234 droplets { account: 'gm@claim' }
```

### Important Events
```
⏰ Epoch changed - cache cleared
⚠️ Connection lost - reconnecting...
🔌 Connected to SCRAP API
```

### Errors
```
❌ Claim failed { account: 'gm@claim', error: 'insufficient CPU' }
```

### Service Stop
```
🛑 Stopping service
👋 Service stopped
```

## What Was Changed

### Moved to DEBUG
- Websocket connection/disconnection details
- Scheduler start messages
- Individual sync operation starts
- Transaction broadcast confirmations
- Cache operation details
- "Starting sync cycle" / "Starting claim cycle"
- Empty sync results

### Enhanced INFO Messages
- Added emojis for quick visual scanning (🚀 ✅ ❌ ⏰ 🔌 ⚠️)
- Simplified language ("Synced" vs "Droplet sync completed")
- Consolidated batch messages for single batches
- Only show summaries when interesting (droplets found/claimed)
- Cleaner service startup messages

## Benefits

1. **Less noise**: INFO level is quiet when nothing interesting happens
2. **Faster scanning**: Emojis help spot important events quickly
3. **Better UX**: Users see what matters (droplets claimed, errors)
4. **Still debuggable**: Enable DEBUG for detailed troubleshooting
5. **Production-ready**: Clean logs suitable for monitoring systems

## Usage

```bash
# Quiet production logs (recommended)
LOG_LEVEL=info ./scrapminer start

# Detailed troubleshooting
LOG_LEVEL=debug ./scrapminer start

# Only errors
LOG_LEVEL=error ./scrapminer start
```

## Future Improvements

- [ ] Add metrics logging (droplets/hour, success rate)
- [ ] Add structured error codes for alerting
- [ ] Add optional JSON output format for log aggregation
- [ ] Add performance timing for slow operations
