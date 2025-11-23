# Scrapminer Deployment Guide

Production deployment guide for scrapminer.

## Prerequisites

- Linux server (Ubuntu 22.04+ recommended)
- Bun runtime installed
- Dedicated user account
- Firewall configured (outbound HTTPS/WSS only)

## Production Setup

### 1. Create Dedicated User

```bash
# Create user without login shell
sudo useradd -r -s /bin/false scrapminer

# Create home directory
sudo mkdir -p /opt/scrapminer
sudo chown scrapminer:scrapminer /opt/scrapminer
```

### 2. Install Bun

```bash
# Install as root/sudo
curl -fsSL https://bun.sh/install | bash

# Verify installation
bun --version
```

### 3. Deploy Application

```bash
# Build on development machine
bun build src/index.ts --compile --outfile scrapminer

# Copy to server
scp scrapminer user@server:/opt/scrapminer/

# Set permissions
sudo chown scrapminer:scrapminer /opt/scrapminer/scrapminer
sudo chmod 755 /opt/scrapminer/scrapminer
```

### 4. Configure Environment

```bash
# Create .env file
sudo -u scrapminer vi /opt/scrapminer/.env
```

**Production .env**:

```bash
# Chain Configuration (EOS Mainnet)
CHAIN_NAME=EOS
LEAP_API=https://eos.greymass.com
CONTRACT_NAME=drops
SCRAP_CONTRACT=scrap

# SCRAP API (Production)
SCRAP_API_URL=https://scrap-api.greymass.com

# Account Configuration
PRIVATE_KEY=5K...  # REPLACE WITH YOUR KEY

# Sync Configuration
SYNC_INTERVAL=3600000     # 1 hour
SYNC_ON_STARTUP=true
SYNC_TIMEOUT=30000

# Claim Configuration
CLAIM_INTERVAL=60000      # 1 minute
CLAIM_BATCH_SIZE=2500
AUTO_RECLAIM=true

# Logging
LOG_LEVEL=info
```

**Secure the file**:

```bash
sudo chmod 600 /opt/scrapminer/.env
sudo chown scrapminer:scrapminer /opt/scrapminer/.env
```

### 5. Create Systemd Service

**Create service file**:

```bash
sudo vi /etc/systemd/system/scrapminer.service
```

**Service configuration**:

```ini
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
SyslogIdentifier=scrapminer

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/scrapminer
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictRealtime=true
RestrictNamespaces=true
LockPersonality=true
MemoryDenyWriteExecute=true
RestrictAddressFamilies=AF_INET AF_INET6

[Install]
WantedBy=multi-user.target
```

**Enable and start**:

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable on boot
sudo systemctl enable scrapminer

# Start service
sudo systemctl start scrapminer

# Check status
sudo systemctl status scrapminer
```

## Monitoring

### View Logs

```bash
# Follow logs in real-time
sudo journalctl -u scrapminer -f

# View recent logs
sudo journalctl -u scrapminer -n 100

# View logs since boot
sudo journalctl -u scrapminer -b

# View logs for specific time range
sudo journalctl -u scrapminer --since "2 hours ago"
```

### Check Service Status

```bash
# Service status
sudo systemctl status scrapminer

# Is service running?
sudo systemctl is-active scrapminer

# Is service enabled?
sudo systemctl is-enabled scrapminer
```

### Manual Operations

```bash
# Stop service
sudo systemctl stop scrapminer

# Restart service
sudo systemctl restart scrapminer

# Reload configuration (after editing .env)
sudo systemctl restart scrapminer

# Disable service
sudo systemctl disable scrapminer
```

## Health Checks

### Automated Monitoring

**Check script** (`/opt/scrapminer/health-check.sh`):

```bash
#!/bin/bash

# Check if service is running
if ! systemctl is-active --quiet scrapminer; then
    echo "ERROR: Scrapminer service is not running"
    exit 1
fi

# Check recent logs for errors
ERROR_COUNT=$(journalctl -u scrapminer --since "5 minutes ago" | grep -c "level.*error")
if [ "$ERROR_COUNT" -gt 5 ]; then
    echo "ERROR: Too many errors in last 5 minutes ($ERROR_COUNT)"
    exit 1
fi

# Check recent logs for successful operations
SUCCESS_COUNT=$(journalctl -u scrapminer --since "1 hour ago" | grep -c "Sync completed\|Claim success")
if [ "$SUCCESS_COUNT" -eq 0 ]; then
    echo "WARNING: No successful operations in last hour"
    exit 1
fi

echo "OK: Scrapminer is healthy"
exit 0
```

**Make executable**:

```bash
sudo chmod +x /opt/scrapminer/health-check.sh
```

**Add to cron** (run every 5 minutes):

```bash
sudo crontab -e
# Add line:
*/5 * * * * /opt/scrapminer/health-check.sh || mail -s "Scrapminer Health Check Failed" admin@example.com
```

### Manual Health Check

```bash
# Test configuration
sudo -u scrapminer /opt/scrapminer/scrapminer config

# Run once mode (test without affecting service)
sudo systemctl stop scrapminer
sudo -u scrapminer /opt/scrapminer/scrapminer once
sudo systemctl start scrapminer
```

## Log Aggregation

### Send Logs to External Service

#### Datadog

Install Datadog agent, then configure:

```yaml
# /etc/datadog-agent/conf.d/scrapminer.d/conf.yaml
logs:
  - type: journald
    service: scrapminer
    source: scrapminer
    include_units:
      - scrapminer.service
```

#### Splunk

```bash
# Forward journald logs
sudo journalctl -u scrapminer -f -o json | \
  /opt/splunkforwarder/bin/splunk add oneshot -source /dev/stdin
```

#### CloudWatch (AWS)

Use CloudWatch agent with journald input:

```json
{
  "logs": {
    "logs_collected": {
      "journals": {
        "filters": [{
          "unit": "scrapminer.service"
        }]
      }
    }
  }
}
```

## Security

### Key Management

**DO NOT store private keys in plain text on production servers.**

Use one of these approaches:

#### AWS Secrets Manager

```bash
# Store key in AWS
aws secretsmanager create-secret \
  --name scrapminer/private-key \
  --secret-string "5K..."

# Fetch in startup script
PRIVATE_KEY=$(aws secretsmanager get-secret-value \
  --secret-id scrapminer/private-key \
  --query SecretString \
  --output text)
```

#### HashiCorp Vault

```bash
# Store key in Vault
vault kv put secret/scrapminer private_key="5K..."

# Fetch in startup script
PRIVATE_KEY=$(vault kv get -field=private_key secret/scrapminer)
```

#### Encrypted File

```bash
# Encrypt .env file
gpg --symmetric --cipher-algo AES256 /opt/scrapminer/.env

# Decrypt on startup
gpg --quiet --batch --decrypt /opt/scrapminer/.env.gpg > /opt/scrapminer/.env
```

### Firewall Rules

```bash
# Only allow outbound HTTPS/WSS
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow out 443/tcp
sudo ufw enable
```

### File Permissions

```bash
# Application binary
sudo chown root:scrapminer /opt/scrapminer/scrapminer
sudo chmod 750 /opt/scrapminer/scrapminer

# Environment file (contains private key)
sudo chown scrapminer:scrapminer /opt/scrapminer/.env
sudo chmod 400 /opt/scrapminer/.env

# Directory
sudo chown scrapminer:scrapminer /opt/scrapminer
sudo chmod 750 /opt/scrapminer
```

## Updating

### Rolling Update (Zero Downtime)

```bash
# Build new binary
bun build src/index.ts --compile --outfile scrapminer

# Upload to server
scp scrapminer user@server:/tmp/scrapminer-new

# Stop service
sudo systemctl stop scrapminer

# Replace binary
sudo mv /tmp/scrapminer-new /opt/scrapminer/scrapminer
sudo chown scrapminer:scrapminer /opt/scrapminer/scrapminer
sudo chmod 755 /opt/scrapminer/scrapminer

# Start service
sudo systemctl start scrapminer

# Verify
sudo systemctl status scrapminer
sudo journalctl -u scrapminer -f
```

### Configuration Update

```bash
# Edit configuration
sudo -u scrapminer vi /opt/scrapminer/.env

# Restart service to apply
sudo systemctl restart scrapminer

# Verify new configuration
sudo journalctl -u scrapminer -n 50 | grep "Starting scrapminer"
```

## Backup

### What to Backup

- `/opt/scrapminer/.env` - Configuration (contains private key!)
- Service logs (if needed for compliance)

**DO NOT backup**:
- Binary (can be rebuilt)
- Cache (in-memory only)

### Backup Script

```bash
#!/bin/bash

# Backup configuration
BACKUP_DIR="/backup/scrapminer/$(date +%Y%m%d)"
mkdir -p "$BACKUP_DIR"

# Copy .env (encrypted)
gpg --symmetric --cipher-algo AES256 \
  -o "$BACKUP_DIR/env.gpg" \
  /opt/scrapminer/.env

# Set permissions
chmod 600 "$BACKUP_DIR/env.gpg"
```

## Troubleshooting

### Service Won't Start

```bash
# Check service status
sudo systemctl status scrapminer

# Check recent logs
sudo journalctl -u scrapminer -n 100

# Check configuration
sudo -u scrapminer /opt/scrapminer/scrapminer config

# Test manually
sudo -u scrapminer /opt/scrapminer/scrapminer once
```

### No Claims Happening

```bash
# Check if syncing
sudo journalctl -u scrapminer | grep "Sync completed"

# Check cache status (run once mode)
sudo systemctl stop scrapminer
sudo -u scrapminer /opt/scrapminer/scrapminer once
# Look for "droplets" count in logs

# Verify account has droplets
curl "https://scrap-api.greymass.com/get/droplets?account=YOURACCOUNTNAME"
```

### High Memory Usage

```bash
# Check current memory
ps aux | grep scrapminer

# Add memory limit to service
sudo systemctl edit scrapminer
# Add:
[Service]
MemoryMax=512M
MemoryHigh=400M

# Reload and restart
sudo systemctl daemon-reload
sudo systemctl restart scrapminer
```

### WebSocket Timeouts

```bash
# Increase timeout
sudo -u scrapminer vi /opt/scrapminer/.env
# Set: SYNC_TIMEOUT=60000

# Restart
sudo systemctl restart scrapminer
```

## Performance Tuning

### High-Frequency Claiming

For accounts that generate many drops:

```bash
SYNC_INTERVAL=600000      # Sync every 10 minutes
CLAIM_INTERVAL=30000      # Claim every 30 seconds
CLAIM_BATCH_SIZE=5000     # Larger batches
```

### Low-Frequency Claiming

For accounts with few drops:

```bash
SYNC_INTERVAL=7200000     # Sync every 2 hours
CLAIM_INTERVAL=300000     # Claim every 5 minutes
CLAIM_BATCH_SIZE=1000     # Smaller batches
```

### Resource Limits

Add to systemd service:

```ini
[Service]
# CPU limit (50% of one core)
CPUQuota=50%

# Memory limit
MemoryMax=512M
MemoryHigh=400M

# Task limit
TasksMax=10
```

## Multi-Account Deployment

To run multiple accounts on one server:

### Option 1: Multiple Service Instances

```bash
# Create separate directories
sudo mkdir -p /opt/scrapminer/account1
sudo mkdir -p /opt/scrapminer/account2

# Copy binary and .env to each
sudo cp /opt/scrapminer/scrapminer /opt/scrapminer/account1/
sudo cp /opt/scrapminer/scrapminer /opt/scrapminer/account2/

# Create separate service files
sudo cp /etc/systemd/system/scrapminer.service \
        /etc/systemd/system/scrapminer-account1.service

# Edit each service to use different WorkingDirectory
# Start both services
sudo systemctl enable scrapminer-account1
sudo systemctl enable scrapminer-account2
sudo systemctl start scrapminer-account1
sudo systemctl start scrapminer-account2
```

### Option 2: Modify for Multi-Account

Modify `src/lib/config.ts` to support multiple accounts:

```typescript
export function loadAccounts(): AccountConfig[] {
  const accounts: AccountConfig[] = []
  let i = 1
  
  while (process.env[`ACCOUNT${i}_KEY`]) {
    accounts.push({
      privkey: process.env[`ACCOUNT${i}_KEY`]!
    })
    i++
  }
  
  return accounts
}
```

Then in `.env`:

```bash
ACCOUNT1_KEY=5K...
ACCOUNT2_KEY=5K...
ACCOUNT3_KEY=5K...
```

## Alerts

### PagerDuty Integration

```bash
# Install PagerDuty agent
curl -O https://packages.pagerduty.com/pdagent/pd-agent.deb
sudo dpkg -i pd-agent.deb

# Configure monitoring script
#!/bin/bash
if ! /opt/scrapminer/health-check.sh; then
    pd-send -k YOUR_INTEGRATION_KEY \
            -t trigger \
            -d "Scrapminer health check failed"
fi
```

### Slack Notifications

```bash
# Add to health check script
SLACK_WEBHOOK="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"

if ! /opt/scrapminer/health-check.sh; then
    curl -X POST "$SLACK_WEBHOOK" \
         -H 'Content-Type: application/json' \
         -d '{"text":"Scrapminer health check failed"}'
fi
```

## Cost Optimization

### CPU Credits (AWS t2/t3)

Monitor CPU usage to avoid credit exhaustion:

```bash
# Check current CPU
top -b -n 1 | grep scrapminer

# If using >20% consistently, upgrade instance or reduce frequency
```

### Network Costs

Scrapminer uses minimal bandwidth:
- WebSocket sync: ~1KB per account per hour
- Blockchain transactions: ~500 bytes per claim

Estimated monthly bandwidth: <100MB per account

### Compute Costs

Recommended instance sizes:
- **AWS**: t3.micro (1-5 accounts), t3.small (5-20 accounts)
- **DigitalOcean**: Basic Droplet $6/month (unlimited accounts)
- **Hetzner**: CX11 €4/month (unlimited accounts)

## Compliance

### Logging Retention

For compliance, retain logs:

```bash
# Set journald retention
sudo vi /etc/systemd/journald.conf
# Set:
SystemMaxUse=2G
SystemMaxFileSize=100M
SystemMaxFiles=100

# Reload journald
sudo systemctl restart systemd-journald
```

### Audit Trail

Enable detailed logging:

```bash
LOG_LEVEL=debug  # Log all operations
```

Export logs regularly:

```bash
# Export last 30 days
journalctl -u scrapminer --since "30 days ago" > scrapminer-audit-$(date +%Y%m).log
```

## Production Checklist

- [ ] Dedicated user created (`scrapminer`)
- [ ] Application deployed to `/opt/scrapminer`
- [ ] `.env` file configured and secured (400 permissions)
- [ ] systemd service created and enabled
- [ ] Service starts without errors
- [ ] Logs show successful sync and claim operations
- [ ] Health check script deployed
- [ ] Monitoring/alerting configured
- [ ] Firewall rules applied
- [ ] Backup strategy implemented
- [ ] Documentation updated with server details
- [ ] Private key secured (not in plain text if possible)
- [ ] Service auto-starts on reboot

## Support

For production issues:
1. Check logs: `sudo journalctl -u scrapminer -n 100`
2. Run health check: `/opt/scrapminer/health-check.sh`
3. Test configuration: `sudo -u scrapminer /opt/scrapminer/scrapminer config`
4. Review this guide for troubleshooting steps

---

**Last Updated**: 2025-01-23
