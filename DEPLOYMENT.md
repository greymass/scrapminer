# Scrapminer Production Deployment Guide

## Quick Start (Production)

### 1. Build Binary

```bash
make build
# Creates: ./dist/scrapminer
```

### 2. Configure Environment

```bash
# Copy binary to production location
cp dist/scrapminer /opt/scrapminer/

# Create production .env
cat > /opt/scrapminer/.env << 'EOF'
# Production Configuration
CHAIN_NAME=EOS
LEAP_API=https://eos.greymass.com
CONTRACT_NAME=drops
SCRAP_CONTRACT=scrap

# SCRAP API (Production)
SCRAP_API_URL=wss://scrap-api.greymass.com

# Sync Configuration
SYNC_INTERVAL=3600000
SYNC_ON_STARTUP=true
SYNC_TIMEOUT=30000

# Claim Configuration
CLAIM_ENABLED=true                 # ⚠️ IMPORTANT: Set to true for production
CLAIM_INTERVAL=60000
CLAIM_BATCH_SIZE=2500
AUTO_RECLAIM=true
AUTO_GENERATE=true                 # ✅ Maintains constant droplet balance
BATCH_DELAY=5000

# Your Account
PRIVATE_KEY=5K...                  # Replace with your claim permission key

# Logging
LOG_LEVEL=info
EOF
```

### 3. Test Configuration

```bash
cd /opt/scrapminer
./scrapminer config
# Verify account discovery and settings
```

### 4. Run Once Mode (Test)

```bash
# Test with a single claim cycle
./scrapminer once

# Check logs
tail -f logs/scrapminer.log
```

### 5. Start Daemon Mode

```bash
# Run in background
nohup ./scrapminer start > scrapminer.out 2>&1 &

# Or use systemd (see below)
```

---

## Systemd Service (Recommended)

### Create Service File

```bash
sudo tee /etc/systemd/system/scrapminer.service > /dev/null << 'EOF'
[Unit]
Description=Scrapminer SCRAP Token Claimer
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=scrapminer
Group=scrapminer
WorkingDirectory=/opt/scrapminer
ExecStart=/opt/scrapminer/scrapminer start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/scrapminer/logs

[Install]
WantedBy=multi-user.target
EOF
```

### Create Dedicated User

```bash
sudo useradd -r -s /bin/false -d /opt/scrapminer scrapminer
sudo mkdir -p /opt/scrapminer/logs
sudo chown -R scrapminer:scrapminer /opt/scrapminer
sudo chmod 600 /opt/scrapminer/.env  # Protect private key
```

### Enable and Start

```bash
sudo systemctl daemon-reload
sudo systemctl enable scrapminer
sudo systemctl start scrapminer
```

### Monitor Service

```bash
# Check status
sudo systemctl status scrapminer

# View logs
sudo journalctl -u scrapminer -f

# View application logs
sudo tail -f /opt/scrapminer/logs/scrapminer.log
```

### Control Service

```bash
sudo systemctl stop scrapminer
sudo systemctl restart scrapminer
sudo systemctl disable scrapminer  # Prevent auto-start
```

---

## Configuration Profiles

### Profile 1: Aggressive Claiming (Recommended)

**Goal**: Maximum claiming speed, maintain droplet balance

```bash
CLAIM_ENABLED=true
CLAIM_INTERVAL=60000           # Check every 1 minute
CLAIM_BATCH_SIZE=2500          # Max batch size
AUTO_RECLAIM=true              # Claim newly generated droplets
AUTO_GENERATE=true             # Maintain constant balance
BATCH_DELAY=5000               # 5s between batches
SYNC_INTERVAL=3600000          # Sync hourly
```

**Best for**: Accounts with high droplet generation, want to maximize SCRAP claiming

### Profile 2: Conservative Claiming

**Goal**: Reduce transaction frequency, preserve droplets

```bash
CLAIM_ENABLED=true
CLAIM_INTERVAL=300000          # Check every 5 minutes
CLAIM_BATCH_SIZE=1000          # Smaller batches
AUTO_RECLAIM=false             # Don't claim generated drops automatically
AUTO_GENERATE=false            # Let droplet count decrease
BATCH_DELAY=10000              # 10s between batches
SYNC_INTERVAL=7200000          # Sync every 2 hours
```

**Best for**: Low priority accounts, want fewer blockchain transactions

### Profile 3: Balanced Claiming

**Goal**: Balance between claiming speed and transaction frequency

```bash
CLAIM_ENABLED=true
CLAIM_INTERVAL=180000          # Check every 3 minutes
CLAIM_BATCH_SIZE=2500          # Max batch size
AUTO_RECLAIM=true              # Claim generated drops
AUTO_GENERATE=false            # Let balance decrease over time
BATCH_DELAY=5000               # 5s between batches
SYNC_INTERVAL=3600000          # Sync hourly
```

**Best for**: Normal use, claim regularly but don't maintain constant droplet count

---

## Monitoring & Alerts

### Key Metrics to Monitor

1. **Claim Success Rate**: Should be >95%
2. **Sync Failures**: Should be 0
3. **Average Claim Time**: <10 seconds per batch
4. **Droplet Balance**: Stable (if AUTO_GENERATE=true)
5. **Transaction Errors**: Monitor for authority/CPU errors

### Log Patterns to Alert On

```bash
# No successful claims in last hour
grep -c "Claim successful" logs/scrapminer.log | awk '$1 == 0'

# Authority errors (permission issue)
grep "insufficient authority" logs/error.log

# Websocket connection failures
grep "WebSocket error" logs/error.log

# Scheduler stopped
grep "Scheduler stopped" logs/scrapminer.log
```

### Health Check Script

```bash
#!/bin/bash
# /opt/scrapminer/health-check.sh

LOG_FILE="/opt/scrapminer/logs/scrapminer.log"
ERROR_FILE="/opt/scrapminer/logs/error.log"
ALERT_EMAIL="admin@example.com"

# Check if process is running
if ! pgrep -f "scrapminer start" > /dev/null; then
    echo "ERROR: Scrapminer process not running" | mail -s "Scrapminer Alert" $ALERT_EMAIL
    exit 1
fi

# Check for recent activity (last 10 minutes)
if ! find $LOG_FILE -mmin -10 | grep -q .; then
    echo "WARNING: No log activity in last 10 minutes" | mail -s "Scrapminer Alert" $ALERT_EMAIL
fi

# Check for errors in last hour
ERROR_COUNT=$(grep -c "ERROR" $ERROR_FILE | tail -100)
if [ $ERROR_COUNT -gt 5 ]; then
    echo "WARNING: $ERROR_COUNT errors in last 100 lines" | mail -s "Scrapminer Alert" $ALERT_EMAIL
fi
```

### Cron Health Check

```bash
# Add to crontab: crontab -e
*/10 * * * * /opt/scrapminer/health-check.sh
```

---

## Troubleshooting Production Issues

### Issue: Service Won't Start

**Check logs**:
```bash
sudo journalctl -u scrapminer -n 50
```

**Common causes**:
- Missing `.env` file
- Invalid private key
- Wrong file permissions
- Port conflicts

**Solutions**:
```bash
# Verify .env exists
ls -la /opt/scrapminer/.env

# Test binary directly
cd /opt/scrapminer
sudo -u scrapminer ./scrapminer config

# Check permissions
sudo chown -R scrapminer:scrapminer /opt/scrapminer
sudo chmod 600 /opt/scrapminer/.env
```

### Issue: No Claims Happening

**Symptoms**: Service running but no transactions

**Check**:
```bash
# 1. Verify CLAIM_ENABLED=true
grep CLAIM_ENABLED /opt/scrapminer/.env

# 2. Check cache has droplets
tail -f /opt/scrapminer/logs/scrapminer.log | grep "dropletCount"

# 3. Verify sync is working
tail -f /opt/scrapminer/logs/scrapminer.log | grep "Sync completed"

# 4. Check account has droplets at scrapload.io
```

**Solutions**:
```bash
# Force a sync
sudo systemctl restart scrapminer

# Run once mode to debug
cd /opt/scrapminer
sudo -u scrapminer ./scrapminer once
```

### Issue: Transaction Failures

**Symptoms**: "Claim failed" errors in logs

**Check error type**:
```bash
tail -f /opt/scrapminer/logs/error.log
```

**Common errors**:

1. **"insufficient authority"**
   - Private key doesn't match claim permission
   - Permission not linked to destroy/generate actions
   - Solution: Run `./scrapminer setup` to generate permission setup URL

2. **"CPU usage exceeded"**
   - Batch size too large
   - Solution: Reduce `CLAIM_BATCH_SIZE` to 1000

3. **"datastream attempted to read past the end"**
   - Contract types out of date
   - Solution: Run `make contracts` to regenerate

### Issue: High Memory Usage

**Check memory**:
```bash
ps aux | grep scrapminer
```

**If memory is high**:
- Check cache size in logs
- Reduce `SYNC_INTERVAL` (sync less frequently)
- Restart service to clear cache

### Issue: Websocket Disconnections

**Symptoms**: "WebSocket error" in logs

**Solutions**:
```bash
# Increase timeout
echo "SYNC_TIMEOUT=60000" >> /opt/scrapminer/.env

# Verify API is reachable
curl -I https://scrap-api.greymass.com

# Restart service
sudo systemctl restart scrapminer
```

---

## Backup & Recovery

### Backup Configuration

```bash
# Backup .env (contains private key!)
sudo tar czf scrapminer-backup-$(date +%Y%m%d).tar.gz \
    /opt/scrapminer/.env \
    /opt/scrapminer/logs

# Store securely
sudo mv scrapminer-backup-*.tar.gz /secure/backup/location/
```

### Restore Configuration

```bash
# Extract backup
sudo tar xzf scrapminer-backup-20251123.tar.gz -C /

# Fix permissions
sudo chown -R scrapminer:scrapminer /opt/scrapminer
sudo chmod 600 /opt/scrapminer/.env

# Restart service
sudo systemctl restart scrapminer
```

---

## Security Checklist

- [ ] Using dedicated `claim` permission (NOT `active` or `owner`)
- [ ] Private key stored in `.env` with `600` permissions
- [ ] Service runs as non-root user (`scrapminer`)
- [ ] `.env` file is in `.gitignore` and not committed
- [ ] Binary verified with `./scrapminer config` before starting
- [ ] Systemd hardening options enabled (`ProtectSystem`, `PrivateTmp`)
- [ ] Log files only writable by `scrapminer` user
- [ ] Monitoring alerts configured for errors

---

## Performance Tuning

### For High-Volume Accounts (>10,000 droplets)

```bash
# Increase batch size
CLAIM_BATCH_SIZE=2500

# Reduce claim interval (claim more frequently)
CLAIM_INTERVAL=30000  # 30 seconds

# Increase sync timeout for large datasets
SYNC_TIMEOUT=60000  # 60 seconds

# Enable auto-reclaim for continuous processing
AUTO_RECLAIM=true
```

### For Low-Volume Accounts (<1,000 droplets)

```bash
# Smaller batches
CLAIM_BATCH_SIZE=1000

# Less frequent checking
CLAIM_INTERVAL=300000  # 5 minutes

# Sync less often
SYNC_INTERVAL=7200000  # 2 hours
```

### For RAM-Constrained Systems

```bash
# Reduce sync frequency (smaller cache)
SYNC_INTERVAL=7200000  # 2 hours

# Disable auto-generate if not needed
AUTO_GENERATE=false

# Smaller batches
CLAIM_BATCH_SIZE=1000
```

---

## Updating to New Version

### 1. Build New Binary

```bash
cd /path/to/scrapminer/source
git pull
make build
```

### 2. Stop Service

```bash
sudo systemctl stop scrapminer
```

### 3. Backup Current Binary

```bash
sudo cp /opt/scrapminer/scrapminer /opt/scrapminer/scrapminer.backup
```

### 4. Replace Binary

```bash
sudo cp dist/scrapminer /opt/scrapminer/
sudo chown scrapminer:scrapminer /opt/scrapminer/scrapminer
sudo chmod +x /opt/scrapminer/scrapminer
```

### 5. Test Configuration

```bash
cd /opt/scrapminer
sudo -u scrapminer ./scrapminer config
```

### 6. Start Service

```bash
sudo systemctl start scrapminer
sudo systemctl status scrapminer
```

### 7. Monitor Logs

```bash
sudo journalctl -u scrapminer -f
```

---

## Multi-Account Setup

To run scrapminer for multiple accounts:

### Option 1: Multiple Instances (Recommended)

```bash
# Account 1
mkdir -p /opt/scrapminer/account1
cp dist/scrapminer /opt/scrapminer/account1/
cp .env /opt/scrapminer/account1/.env
# Edit .env with account1 private key

# Account 2
mkdir -p /opt/scrapminer/account2
cp dist/scrapminer /opt/scrapminer/account2/
cp .env /opt/scrapminer/account2/.env
# Edit .env with account2 private key

# Create separate systemd services
sudo cp /etc/systemd/system/scrapminer.service /etc/systemd/system/scrapminer-account1.service
sudo cp /etc/systemd/system/scrapminer.service /etc/systemd/system/scrapminer-account2.service

# Edit WorkingDirectory in each service file
sudo vim /etc/systemd/system/scrapminer-account1.service
# WorkingDirectory=/opt/scrapminer/account1

sudo systemctl daemon-reload
sudo systemctl enable scrapminer-account1 scrapminer-account2
sudo systemctl start scrapminer-account1 scrapminer-account2
```

### Option 2: Single Binary, Multiple Configs

```bash
# Run with different config files
DOTENV_CONFIG_PATH=/opt/scrapminer/account1.env ./scrapminer start &
DOTENV_CONFIG_PATH=/opt/scrapminer/account2.env ./scrapminer start &
```

---

## Production Checklist

Before deploying to production:

- [ ] Built binary with `make build`
- [ ] Tested with `./scrapminer once` in dry-run mode (`CLAIM_ENABLED=false`)
- [ ] Verified account discovery with `./scrapminer config`
- [ ] Set `CLAIM_ENABLED=true` for production
- [ ] Configured AUTO_GENERATE based on strategy (true to maintain balance)
- [ ] Created systemd service file
- [ ] Set up dedicated user with proper permissions
- [ ] Configured monitoring and alerts
- [ ] Tested service start/stop/restart
- [ ] Verified logs are being written correctly
- [ ] Documented any custom configuration
- [ ] Backed up `.env` file securely
- [ ] Set up log rotation (if needed)
- [ ] Tested recovery procedure

---

**Ready to deploy!** 🚀

For questions or issues, see the main [README.md](./README.md) or check logs at `/opt/scrapminer/logs/`.
