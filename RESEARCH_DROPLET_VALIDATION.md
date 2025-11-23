# Research: Droplet Validation Without SCRAP API

**Date**: 2025-11-23  
**Purpose**: Determine if we can compute droplet validity without relying on the SCRAP API websocket

---

## Current Implementation (SCRAP API WebSocket)

### How SCRAP API Works

The SCRAP API (`/Users/aaron/projects/shipload/scrap-api`) is an **account history follower** that:

1. **Follows blockchain history** using Roborovski (Greymass history API)
   - Queries `/v1/history/get_actions` for the drops contract
   - Processes actions: `generate`, `destroy`, `bind`, `unbind`, `transfer`
   - Maintains `height` to track last processed action

2. **Maintains MongoDB database** of all droplets
   - **Collection**: `droplets` - All active droplets
   - **Fields**: `{ _id: seed, owner, bound, created }`
   - **Indexes**: By owner for fast queries

3. **Computes droplet IDs from `generate` actions**:
   ```typescript
   // From /Users/aaron/projects/shipload/scrap-api/src/index.ts:301-319
   async function generateHash(
     seed: string,
     iteration: number = 0,
     sequence: number = 0
   ): Promise<UInt64> {
     const combined = [String(iteration), String(sequence + iteration), seed].join('');
     const hash = Checksum256.hash(Bytes.from(combined, 'utf8'));
     const number = UInt64.from(hash.array.slice(0, 8));
     return number;
   }
   ```

4. **Processes actions to update droplet state**:
   - `generate` → Adds droplets to database
   - `destroy` → Removes droplets from database
   - `bind`/`unbind` → Updates `bound` flag
   - `transfer` → Updates `owner` field

### WebSocket API

Scrapminer currently uses:
```typescript
ws.send({ command: 'list', account: 'owner@permission' })
// Response: Stream of droplets for that account
```

**Advantages**:
- Fast (pre-indexed by account)
- Accurate (follows blockchain history)
- Real-time (updates every second via scheduler)

**Disadvantages**:
- Requires SCRAP API to be running
- Network dependency (websocket connection)
- Single point of failure

---

## Alternative Approach 1: Direct Blockchain Table Query

### Method

Query the `drop` table directly from the blockchain:

```bash
cleos get table drops drops drop --limit 10000
```

### Drops Table Structure

```cpp
// From /Users/aaron/projects/shipload/drops contract
TABLE drop_row {
    uint64_t seed;           // Primary key - unique droplet ID
    name owner;              // Current owner
    block_timestamp created; // Creation time
    bool bound;              // Bound/unbound status
    
    uint64_t primary_key() const { return seed; }
    uint128_t by_owner() const {
        return (uint128_t{seed} << 64) | owner.value;
    }
};
```

### Implementation

```typescript
import { dropsContract } from './lib/wharf';
import type { Types } from './lib/contracts/drops';

async function getDropletsFromChain(account: string): Promise<number[]> {
    const droplets: number[] = [];
    
    // Query table with secondary index by owner
    // Note: This requires the contract to have a secondary index by owner
    const table = dropsContract.table('drop');
    
    // Cursor-based pagination through all rows
    let cursor = await table.query({
        key_type: 'i128',
        index_position: 'secondary', // by_owner index
        lower_bound: account,
        upper_bound: account
    });
    
    while (!cursor.endReached) {
        const rows = await cursor.next();
        for (const row of rows) {
            if (String(row.owner) === account) {
                droplets.push(Number(row.seed));
            }
        }
    }
    
    return droplets;
}
```

### Pros
✅ **No external dependency** - Direct blockchain query  
✅ **Always up-to-date** - Reads current state  
✅ **No sync required** - No need to follow history  
✅ **Simple implementation** - Just table queries  

### Cons
❌ **Very slow** - Table has ~millions of rows, pagination is expensive  
❌ **High RPC load** - Requires many API calls for pagination  
❌ **No filtering by owner** - Must scan entire table (secondary index may not exist)  
❌ **Rate limits** - Public RPC nodes will throttle/ban  
❌ **Network overhead** - Each query is HTTP request  

### Feasibility: ❌ **NOT RECOMMENDED**

**Why**: The `drop` table contains ALL droplets for ALL accounts (likely millions). Even with a secondary index by owner, querying this for each account every minute would:
- Take 30+ seconds per account
- Generate 1000s of API calls
- Get banned from public RPC nodes
- Consume significant bandwidth

---

## Alternative Approach 2: Local History Follower

### Method

Replicate what SCRAP API does, but locally in scrapminer:

1. **Track last processed action** (store in file/memory)
2. **Query blockchain history** using Roborovski
3. **Maintain in-memory droplet cache** (Map<account, Set<dropletIds>>)
4. **Process actions** to update cache

### Implementation

```typescript
import { RoborovskiClient } from '@wharfkit/roborovski';
import { APIClient } from '@wharfkit/session';

const robo = new RoborovskiClient(new APIClient({ url: chain.url }));
const dropletsByAccount = new Map<string, Set<number>>();
let lastSequence = 0; // Track last processed action

async function syncDropletsFromHistory(account: string): Promise<void> {
    const params = {
        limit: 100,
        start: lastSequence
    };
    
    const result = await robo.get_actions('drops', params);
    
    for (const action of result.actions) {
        const { act } = action.action_trace;
        
        if (act.account === 'drops') {
            switch (act.name) {
                case 'generate': {
                    const { owner, amount, data, bound } = act.data;
                    if (String(owner) === account) {
                        // Compute droplet IDs using same algorithm as contract
                        const sequence = await getSequenceFromAction(action);
                        for (let i = 0; i < amount; i++) {
                            const seed = computeSeed(data, i, sequence);
                            dropletsByAccount.get(account).add(seed);
                        }
                    }
                    break;
                }
                case 'destroy': {
                    const { owner, droplet_ids } = act.data;
                    if (String(owner) === account) {
                        for (const id of droplet_ids) {
                            dropletsByAccount.get(account).delete(Number(id));
                        }
                    }
                    break;
                }
                // Handle bind/unbind/transfer...
            }
        }
        
        lastSequence = Number(action.account_action_seq);
    }
}

function computeSeed(data: string, iteration: number, sequence: number): number {
    // Same algorithm as contract and SCRAP API
    const combined = [String(iteration), String(sequence + iteration), data].join('');
    const hash = Checksum256.hash(Bytes.from(combined, 'utf8'));
    return Number(UInt64.from(hash.array.slice(0, 8)));
}
```

### Sequence Tracking Challenge

**Problem**: The `sequence` value used in droplet generation is stored in the contract's `state` table:

```cpp
TABLE state_row {
    block_timestamp genesis;
    int64_t bytes_per_drop;
    uint64_t sequence;  // <-- This increments with each generate
    bool enabled;
};
```

To compute droplet IDs correctly, we need to:
1. Query `state` table before each `generate` action to get current `sequence`
2. Or maintain our own sequence counter by following history from genesis

**This is why SCRAP API exists** - It maintains this sequence counter in MongoDB.

### Pros
✅ **No external API dependency** - Self-contained  
✅ **Accurate** - Follows same algorithm as contract  
✅ **Can catch up from any point** - Just set starting sequence  
✅ **Works offline** - Once synced, can operate without network  

### Cons
❌ **Complex implementation** - Must replicate SCRAP API logic  
❌ **Requires initial sync** - Must process entire history from genesis  
❌ **Sequence tracking** - Must maintain sequence counter accurately  
❌ **Storage** - Need to persist state between restarts  
❌ **Maintenance** - Must update if contract changes  
❌ **Duplication** - Reinventing the wheel (SCRAP API already does this)  

### Feasibility: ⚠️ **POSSIBLE BUT NOT RECOMMENDED**

**Why**: This essentially **reimplements SCRAP API** inside scrapminer. While technically feasible:
- Adds significant complexity (history following, action processing, sequence tracking)
- Requires persistent storage (last sequence, droplet cache)
- Initial sync could take hours (processing all history from genesis)
- Duplicates existing, working infrastructure

---

## Alternative Approach 3: Hybrid - Cache + Periodic Refresh

### Method

Combine table queries with local caching:

1. **Initial load**: Query blockchain table once at startup
2. **Cache**: Store droplet IDs in memory
3. **Periodic refresh**: Re-query table every N hours
4. **Claim**: Use cached IDs for claiming

### Implementation

```typescript
const dropletCache = new Map<string, Set<number>>();
let lastRefresh = 0;
const REFRESH_INTERVAL = 3600000; // 1 hour

async function getDropletsWithCache(account: string): Promise<number[]> {
    const now = Date.now();
    
    if (!dropletCache.has(account) || now - lastRefresh > REFRESH_INTERVAL) {
        // Refresh from blockchain
        const droplets = await getDropletsFromChain(account);
        dropletCache.set(account, new Set(droplets));
        lastRefresh = now;
    }
    
    return Array.from(dropletCache.get(account) || []);
}
```

### Pros
✅ **Reduced API calls** - Only refresh hourly  
✅ **Faster claims** - Uses cached data  
✅ **Simple** - No history following needed  

### Cons
❌ **Still slow** - Initial query takes 30+ seconds  
❌ **Stale data** - Cache is outdated between refreshes  
❌ **RPC load** - Still queries entire table  
❌ **Inefficient** - Re-queries all data every hour  

### Feasibility: ❌ **NOT RECOMMENDED**

**Why**: Doesn't solve the fundamental problem - querying the entire `drop` table is too expensive.

---

## Alternative Approach 4: Blockchain Event Streaming (Hyperion/dfuse)

### Method

Use a blockchain event streaming service like:
- **Hyperion** (EOS History API)
- **dfuse** (Streaming blockchain data)
- **Chronicle** (History indexer)

These services provide:
- Filtered action streaming
- Account-specific queries
- WebSocket updates

### Implementation

```typescript
// Using Hyperion API
const hyperionUrl = 'https://eos.hyperion.eosrio.io';

async function getDropletsFromHyperion(account: string): Promise<number[]> {
    const response = await fetch(
        `${hyperionUrl}/v2/history/get_actions?account=${account}&filter=drops:generate,drops:destroy&limit=1000`
    );
    const data = await response.json();
    
    // Process actions to build droplet list
    const droplets = new Set<number>();
    for (const action of data.actions) {
        // Process generate/destroy actions
    }
    
    return Array.from(droplets);
}
```

### Pros
✅ **Filtered queries** - Only get actions for specific account  
✅ **Fast** - Pre-indexed by account  
✅ **Well-maintained** - Public infrastructure  
✅ **WebSocket support** - Real-time updates  

### Cons
❌ **External dependency** - Relies on third-party service  
❌ **Availability** - Public endpoints can be unreliable  
❌ **Rate limits** - Free tiers have limits  
❌ **Still requires processing** - Must compute droplet IDs from actions  

### Feasibility: ⚠️ **VIABLE ALTERNATIVE**

**Why**: This is essentially what SCRAP API does, but using a public history service instead of self-hosting. Could work, but:
- Still need to compute droplet IDs (requires sequence tracking)
- Adds dependency on third-party infrastructure
- SCRAP API is already purpose-built for this

---

## Bulk Loading Droplets from Blockchain

### Challenge: No Efficient Bulk Query Method

The Antelope blockchain provides these query methods:

1. **Table Rows** (`/v1/chain/get_table_rows`)
   - Paginated (1000-10000 rows per request)
   - Can use secondary indexes
   - Must iterate through all pages

2. **Table by Scope** (`/v1/chain/get_table_by_scope`)
   - Lists all scopes for a table
   - But `drop` table uses single scope (`drops` contract account)
   - Not useful for filtering by owner

3. **History API** (`/v1/history/get_actions`)
   - Returns actions, not current state
   - Requires processing to reconstruct state

### Best Bulk Loading Method

If you must bulk load from blockchain:

```typescript
import type { Types } from './lib/contracts/drops';

async function bulkLoadAllDroplets(): Promise<Map<string, number[]>> {
    const dropletsByOwner = new Map<string, number[]>();
    const table = dropsContract.table('drop');
    
    // Start pagination from beginning
    let cursor = await table.query({ limit: 10000 });
    let totalRows = 0;
    
    while (!cursor.endReached) {
        const rows = await cursor.next();
        
        for (const row of rows) {
            const owner = String(row.owner);
            const seed = Number(row.seed);
            
            if (!dropletsByOwner.has(owner)) {
                dropletsByOwner.set(owner, []);
            }
            dropletsByOwner.get(owner)!.push(seed);
        }
        
        totalRows += rows.length;
        logger.debug('Loaded rows', { totalRows });
        
        // Add delay to avoid rate limits
        await new Promise(r => setTimeout(r, 100));
    }
    
    return dropletsByOwner;
}
```

**Performance estimate**:
- Table size: ~1-10 million rows
- Page size: 10,000 rows
- Pages needed: 100-1,000
- Time per page: ~500ms
- **Total time: 50 seconds - 8 minutes**

**Feasibility**: Only viable for:
- Initial one-time sync
- Background refresh (not real-time)
- Small number of accounts

---

## Recommended Solution: Keep Using SCRAP API

### Why SCRAP API is the Right Choice

1. **Purpose-built** - Designed specifically for droplet tracking
2. **Optimized** - Pre-indexed MongoDB queries (milliseconds)
3. **Accurate** - Follows blockchain history, maintains sequence
4. **Maintained** - Part of official Shipload infrastructure
5. **Real-time** - Updates every second via history follower
6. **Scalable** - Can handle unlimited accounts

### Comparison

| Method | Speed | Accuracy | Complexity | Dependency |
|--------|-------|----------|------------|------------|
| **SCRAP API WebSocket** | ⚡⚡⚡ Fast | ✅ Perfect | 🟢 Simple | SCRAP API |
| Direct Table Query | 🐌 Very Slow | ✅ Perfect | 🟢 Simple | Blockchain RPC |
| Local History Follower | 🐌 Slow (initial) | ✅ Perfect | 🔴 Complex | Blockchain RPC |
| Hybrid Cache | 🐌 Slow (refresh) | ⚠️ Stale | 🟡 Moderate | Blockchain RPC |
| Hyperion/dfuse | ⚡ Fast | ✅ Perfect | 🟡 Moderate | 3rd party API |

### When to Consider Alternatives

Only if:
- ❌ SCRAP API is unavailable/down
- ❌ Running on isolated network (no access to SCRAP API)
- ❌ Want fully self-contained solution (no external dependencies)

In these cases, the **Local History Follower** approach is best, but requires:
- Significant development effort
- Persistent storage for state
- Robust error handling
- Initial sync period (hours)

---

## Conclusion

### Answer to Research Question

**Can we compute droplet validity without SCRAP API?**

✅ **Yes, technically possible** via:
1. Direct blockchain table queries (slow)
2. Local history follower (complex)
3. Third-party history APIs (adds dependency)

❌ **But NOT RECOMMENDED** because:
- All alternatives are slower, more complex, or add different dependencies
- SCRAP API is purpose-built, optimized, and maintained
- Reimplementing this functionality duplicates existing infrastructure

### Recommendation

**Keep using SCRAP API WebSocket** for production scrapminer.

**Fallback option**: If SCRAP API is down, implement a simple fallback:
```typescript
async function getDropletsWithFallback(account: string): Promise<number[]> {
    try {
        // Try SCRAP API first
        return await getDropletsFromAPI(account);
    } catch (error) {
        logger.warn('SCRAP API unavailable, falling back to blockchain query');
        // Fallback to direct table query (slow but works)
        return await getDropletsFromChain(account);
    }
}
```

### Implementation Priority

1. **Current (Production)**: SCRAP API WebSocket ✅ Already implemented
2. **Enhancement**: Add REST API fallback (if websocket fails)
3. **Optional**: Add local cache for offline operation
4. **Only if needed**: Implement local history follower for full independence

---

**End of Research Document**
