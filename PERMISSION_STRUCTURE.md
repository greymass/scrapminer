# Claim Permission Structure Guide

**Date**: 2025-11-23  
**Purpose**: Define the appropriate permission structure for automated SCRAP token claiming

---

## Transaction Analysis

### Example Destroy Transaction (with to_notify: scrap)

**Transaction ID**: `03abfd10455dfcae0a21b7498fc460af8642cab6c28d16a8399f7a334b1dcd05`  
**Block**: 469211505  
**Timestamp**: 2025-11-23T06:40:15.500  
**User**: catoneko.gm

### Actions in Transaction Order

```
Order  Contract        Action        Authorization                Creator
-----  --------------  ------------  ---------------------------  --------
1      drops           destroy       catoneko.gm@active           ROOT (user signed)
2      drops           generate      catoneko.gm@active           ROOT (user signed)
3      drops           logdrops      drops@active                 inline from destroy
4      drops           logdrops      drops@active                 inline from destroy
5      drops           logdestroy    drops@active                 inline from destroy
9      scrap           logmint       scrap@active                 inline from scrap action
11     drops           logdrops      drops@active                 inline from generate
12     drops           logdrops      drops@active                 inline from generate
13     drops           loggenerate   drops@active                 inline from generate
```

**Analysis**: `creator_action_ordinal = 0` means ROOT action (user signed)

### Key Observations

1. **User signs TWO actions**: `destroy` AND `generate`
2. **Both are root-level actions** - Not inline, both require user authorization
3. **Notification actions are automatic** - All `log*` actions use contract authority (inline)
4. **Two permissions needed** - User needs authority for BOTH:
   - `drops::destroy`
   - `drops::generate`

---

## Current Permission Usage Analysis

Based on analysis of 100 recent `destroy` actions on the drops contract:

```
Permission Usage:
100% - active permission
0%   - custom permissions
```

**Finding**: Currently, NO users are using custom permissions for destroy actions. Everyone uses `active`.

However, this doesn't mean we should do the same for automation.

---

## Recommended Permission Structure

### For Scrapminer (Automated Claiming)

Create a **dedicated custom permission** called `claim` or `claimer`:

```bash
# Account structure
youraccountname
├── owner (threshold: 1)
│   └── Your owner key
├── active (threshold: 1)
│   └── Your active key
└── claim (threshold: 1)          # ← New dedicated permission
    └── Separate key for claiming only
```

### Permission Configuration

```bash
# 1. Create the claim permission
cleos set account permission youraccountname claim \
  '{"threshold":1,"keys":[{"key":"EOS_YOUR_CLAIM_PUBLIC_KEY","weight":1}]}' \
  active -p youraccountname@active

# 2. Link the permission to BOTH required actions
cleos set action permission youraccountname drops destroy claim \
  -p youraccountname@active

cleos set action permission youraccountname drops generate claim \
  -p youraccountname@active
```

### Why This Structure?

#### ✅ Security Benefits

1. **Limited blast radius**: If the claim key is compromised:
   - ⚠️ Attacker can destroy droplets (claim SCRAP)
   - ⚠️ Attacker can generate new droplets (costs your RAM bytes)
   - ❌ Attacker CANNOT transfer your SCRAP tokens
   - ❌ Attacker CANNOT transfer your EOS tokens
   - ❌ Attacker CANNOT bind/unbind droplets
   - ❌ Attacker CANNOT transfer droplets to another account
   - ❌ Attacker CANNOT change account permissions

2. **Isolated automation**: The key used by scrapminer can ONLY claim

3. **Easy revocation**: If compromised, just unlink the permission:
   ```bash
   cleos set action permission youraccountname drops destroy NULL \
     -p youraccountname@active
   ```

4. **Audit trail**: Permission name makes it clear what the key is for

#### ⚠️ Using `active` Instead (NOT RECOMMENDED for automation)

If you use `active` permission:
- ❌ **Full account control**: Compromised key can do ANYTHING
- ❌ **Transfer tokens**: Attacker can steal all your SCRAP and EOS
- ❌ **Change permissions**: Attacker can lock you out
- ❌ **Stake/unstake**: Attacker can unstake your resources
- ❌ **Execute any contract**: Unlimited damage potential

**Verdict**: NEVER use `active` permission for automated scripts.

---

## Permission Structure Comparison

### Option 1: Dedicated Claim Permission (RECOMMENDED)

```
Account: youraccountname
└── claim (child of active)
    └── Claim key (PUB_K1_...)
    
Linked Actions:
  - drops::destroy
  - drops::generate

If Compromised:
  ⚠️ Can claim SCRAP (destroy droplets)
  ⚠️ Can generate droplets (uses your RAM bytes)
  ❌ Cannot transfer SCRAP
  ❌ Cannot transfer droplets
  ❌ Cannot bind/unbind
  ❌ Cannot change permissions
```

**Risk Level**: 🟢 **LOW** - Limited to claiming only

### Option 2: Active Permission (CURRENT USER BEHAVIOR)

```
Account: youraccountname
└── active (child of owner)
    └── Active key (PUB_K1_...)
    
Linked Actions:
  - ALL actions (default)

If Compromised:
  ❌ Can do EVERYTHING
  ❌ Full account takeover
  ❌ Steal all tokens
  ❌ Change permissions
  ❌ Lock owner out
```

**Risk Level**: 🔴 **CRITICAL** - Full account control

---

## Implementation Steps

### Step 1: Generate New Key Pair

```bash
# Generate a new key pair for claiming
cleos create key --to-console

# Output:
# Private key: 5K... (store securely)
# Public key: PUB_K1_... (use in permission)
```

### Step 2: Create Permission

```bash
# Create 'claim' permission under 'active'
cleos set account permission youraccountname claim \
  '{"threshold":1,"keys":[{"key":"PUB_K1_YOUR_CLAIM_PUBLIC_KEY","weight":1}]}' \
  active \
  -p youraccountname@active
```

**Permission hierarchy**:
```
owner (threshold: 1)
└── active (threshold: 1)
    └── claim (threshold: 1)  ← New permission here
```

### Step 3: Link Permission to Action

```bash
# Link 'claim' permission to 'drops::destroy' action
cleos set action permission youraccountname drops destroy claim \
  -p youraccountname@active
```

### Step 4: Verify Setup

```bash
# Check permission structure
cleos get account youraccountname

# Should show:
# permissions:
#   owner     1:    1 PUB_K1_...
#      active     1:    1 PUB_K1_...
#         claim     1:    1 PUB_K1_...
#
# permission links:
#   claim:
#      drops::destroy
```

### Step 5: Test Permission

```bash
# Try destroying a droplet with claim permission
cleos push action drops destroy \
  '["youraccountname", [123456789], "", "scrap"]' \
  -p youraccountname@claim

# Should succeed if permission is set up correctly
```

### Step 6: Configure Scrapminer

```bash
# In .env file
PRIVATE_KEY=5K_YOUR_CLAIM_PRIVATE_KEY

# Scrapminer will auto-discover:
# Account: youraccountname
# Permission: claim
```

---

## Real-World Examples

### Example 1: teamgreymass (BP Account)

```
permissions:
  owner     1:    1 PUB_K1_...
     active     1:    1 PUB_K1_...
        claim     1:    1 PUB_K1_...
        transfer  1:    1 PUB_K1_...
        vote      1:    1 PUB_K1_...

permission links:
  claim:
     eosio::claimrewards
     eosio.bpay::claimrewards
  transfer:
     eosio.token::transfer
  vote:
     eosio::voteproducer
```

**Analysis**: teamgreymass uses separate permissions for:
- `claim` - Only for claiming BP rewards
- `transfer` - Only for token transfers  
- `vote` - Only for voting

This is **best practice** for production accounts.

### Example 2: aaron.gm (My Account)

```
permissions:
  owner     1:    1 PUB_K1_...
     active     1:    1 PUB_K1_...
        shipload     1:    1 PUB_K1_...

permission links:
  shipload:
     apc.shipload::*
     agc.shipload::*
```

**Analysis**: I use a dedicated `shipload` permission for all Shipload-related contracts. This isolates Shipload actions from my main active key.

---

## FAQ

### Q: Why not just use `active` like everyone else?

**A**: Most users manually claim via web interfaces (scrapload.io), not automated scripts. When you're clicking a button, using `active` is fine because:
- You're present and aware
- You see what you're signing
- The key isn't stored anywhere

For **automation**:
- Private key is stored in a file/server
- Script runs 24/7 unattended
- Higher risk of compromise (server hack, log exposure, etc.)
- **Defense in depth**: Limit damage if things go wrong

### Q: Can I use a different permission name?

**A**: Yes! Common names:
- `claim` - Recommended, clear purpose
- `claimer` - Also clear
- `bot` - Works, but less specific
- `auto` - Works, but less specific

Just update the commands above with your chosen name.

### Q: What if I already use `active` and want to switch?

**A**: Easy process:
1. Create new `claim` permission (Step 2 above)
2. Link it to `drops::destroy` (Step 3)
3. Update scrapminer `.env` with new key
4. Test with small claim
5. Delete old key from server

### Q: Can one permission control multiple actions?

**A**: Yes! You can link multiple actions:
```bash
# Link claim permission to both destroy and generate
cleos set action permission youraccountname drops destroy claim -p youraccountname@active
cleos set action permission youraccountname drops generate claim -p youraccountname@active
```

But for scrapminer, you **only need `drops::destroy`**.

### Q: What happens if I don't link the permission?

**A**: The transaction will fail with:
```
missing authority of youraccountname
```

You MUST link the permission to the action for it to work.

### Q: Can I remove the permission later?

**A**: Yes:
```bash
# Unlink from action first
cleos set action permission youraccountname drops destroy NULL -p youraccountname@active

# Then delete permission
cleos set account permission youraccountname claim NULL -p youraccountname@active
```

---

## Actions Required by Scrapminer

Based on transaction analysis, scrapminer needs authority for:

### Primary Actions (User Must Sign)
- ✅ `drops::destroy` - Destroy droplets to claim SCRAP
- ✅ `drops::generate` - Generate new bound droplets (happens after destroying unbound droplets)

**Important**: Both `destroy` and `generate` are ROOT actions (creator_action_ordinal = 0), meaning they require direct user authorization. They are NOT inline actions.

### Inline Actions (Automatic)
These are called automatically by the contract (no user signature needed):
- `drops::logdrops` - Inline notification
- `drops::logdestroy` - Inline notification  
- `drops::loggenerate` - Inline notification
- `scrap::logmint` - Inline notification (when to_notify is set)

### Actions NOT Needed
- ❌ `drops::transfer` - Scrapminer doesn't transfer droplets
- ❌ `drops::bind` - Scrapminer doesn't bind/unbind
- ❌ `drops::unbind` - Scrapminer doesn't bind/unbind
- ❌ `scrap::transfer` - Scrapminer doesn't transfer SCRAP tokens
- ❌ `eosio.token::transfer` - Scrapminer doesn't transfer EOS

---

## Summary

### Required Permission Links

```bash
# Two actions need to be linked:
cleos set action permission youraccountname drops destroy claim
cleos set action permission youraccountname drops generate claim
```

**Note**: The `generate` action is called as part of the claiming flow when destroying unbound droplets. The contract automatically generates new bound droplets, but this requires user authorization.

### Recommended Structure

```
youraccountname
└── active (threshold: 1)
    └── claim (threshold: 1)
        └── Claim key (used by scrapminer)
        
Permission Links:
  claim → drops::destroy
  claim → drops::generate

Stored in Scrapminer:
  PRIVATE_KEY=5K... (claim permission private key)
```

### Security Principle

**Least Privilege**: The automation key should have the MINIMUM permissions necessary to do its job:
- ✅ Can destroy droplets (claim SCRAP)
- ❌ Cannot do anything else

This follows the security principle of **defense in depth** - even if compromised, damage is limited.

---

## Quick Setup Commands

```bash
# 1. Generate key
cleos create key --to-console

# 2. Create permission (replace with your account and public key)
cleos set account permission YOURACCOUNT claim \
  '{"threshold":1,"keys":[{"key":"PUB_K1_YOURKEY","weight":1}]}' \
  active -p YOURACCOUNT@active

# 3. Link to required actions
cleos set action permission YOURACCOUNT drops destroy claim \
  -p YOURACCOUNT@active

cleos set action permission YOURACCOUNT drops generate claim \
  -p YOURACCOUNT@active

# 4. Verify
cleos get account YOURACCOUNT

# 5. Configure scrapminer
# Edit .env:
PRIVATE_KEY=5K_YOUR_CLAIM_PRIVATE_KEY
```

---

**Recommendation**: Use a dedicated `claim` permission for scrapminer automation. It provides security isolation and follows best practices for production systems.
