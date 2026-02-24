# DeepTerm — Deployment & Operations Guide

> **For DevOps / sysadmins deploying and maintaining the DeepTerm web server.**

---

## Table of Contents

1. [System Requirements](#1-system-requirements)
2. [Environment Variables](#2-environment-variables)
3. [Deployment Options](#3-deployment-options)
4. [Docker Compose (Recommended)](#4-docker-compose-recommended)
5. [PM2 (Bare-Metal / Raspberry Pi)](#5-pm2-bare-metal--raspberry-pi)
6. [Nginx Configuration](#6-nginx-configuration)
7. [Database](#7-database)
8. [Redis](#8-redis)
9. [SSL / TLS](#9-ssl--tls)
10. [Health Checks & Monitoring](#10-health-checks--monitoring)
11. [Backup & Restore](#11-backup--restore)
12. [Updating / Redeployment](#12-updating--redeployment)
13. [Troubleshooting](#13-troubleshooting)
14. [Security Hardening](#14-security-hardening)

---

## 1. System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 1 core (ARM64/x64) | 2+ cores |
| RAM | 1 GB | 2+ GB |
| Disk | 2 GB free | 10+ GB |
| Node.js | 18.x | 20.x LTS |
| OS | Debian 11+ / Ubuntu 22+ / Alpine 3.18+ | Any Linux with Docker support |

Tested on: Raspberry Pi 4 (4 GB), Ubuntu 22.04 x64, Docker on Linux.

---

## 2. Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Prisma database connection string | `file:./prisma/deepterm.db` |
| `NEXTAUTH_URL` | Public URL of the server | `https://deepterm.net` |
| `NEXTAUTH_SECRET` | Session encryption key (≥32 chars) | `openssl rand -base64 32` |
| `X_API_KEY` | API key for desktop/mobile app auth | Custom string |

### Authentication

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | `NEXTAUTH_SECRET` | Separate secret for ZK JWTs (falls back to NEXTAUTH_SECRET) |
| `WEBAUTHN_RP_ID` | `deepterm.net` | WebAuthn relying party domain |
| `REFRESH_TOKEN_EXPIRY_DAYS` | `90` | Refresh token TTL in days |

### Email

| Variable | Default | Description |
|----------|---------|-------------|
| `SMTP_HOST` | — | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASSWORD` | — | SMTP password |
| `EMAIL_FROM` | — | Sender address (e.g., `noreply@deepterm.net`) |

### Redis

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL (for rate limiting / caching) |

### Stripe (Optional)

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe API secret key |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PRO_MONTHLY_PRICE_ID` | Stripe price ID for Pro monthly |
| `STRIPE_PRO_YEARLY_PRICE_ID` | Stripe price ID for Pro yearly |
| `STRIPE_TEAM_MONTHLY_PRICE_ID` | Stripe price ID for Team monthly |
| `STRIPE_TEAM_YEARLY_PRICE_ID` | Stripe price ID for Team yearly |
| `STRIPE_BUSINESS_MONTHLY_PRICE_ID` | Stripe price ID for Business monthly |
| `STRIPE_BUSINESS_YEARLY_PRICE_ID` | Stripe price ID for Business yearly |

### File Storage

| Variable | Default | Description |
|----------|---------|-------------|
| `DEEPTERM_DOWNLOADS_DIR` | `/var/www/deepterm-downloads` | App binary download directory (served by Nginx) |
| `DEEPTERM_ISSUES_DIR` | `/var/www/deepterm-issues` | Issue attachments storage |

### Security Tuning (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `BCRYPT_ROUNDS` | `12` | bcrypt cost factor |
| `AUDIT_LOG_RETENTION_DAYS` | `90` | Days to retain audit logs |

### `.env` File

Copy `.env.example` to `.env` and fill in production values:

```bash
cp .env.example .env
chmod 600 .env
# Edit with your values
```

---

## 3. Deployment Options

| Method | Best For | Components |
|--------|----------|------------|
| **Docker Compose** | Production servers, CI/CD | app + redis + nginx containers |
| **PM2** | Raspberry Pi, low-resource VPS, bare-metal | PM2 process manager + system Redis + system Nginx |

Both methods produce the same application behavior. Docker Compose is recommended for production.

---

## 4. Docker Compose (Recommended)

### Build & Start

```bash
# Clone the repository
git clone <repo-url> deepterm && cd deepterm

# Create .env file
cp .env.example .env
# Edit .env with production values

# Place SSL certificates (see Section 9)
mkdir -p nginx/ssl
cp /path/to/cert.crt nginx/ssl/deepterm.crt
cp /path/to/cert.key nginx/ssl/deepterm.key

# Build and start all services
docker compose up -d --build
```

### Services

| Service | Container | Port | Description |
|---------|-----------|------|-------------|
| `app` | `deepterm-app` | 3000 (internal) | Next.js application |
| `redis` | `deepterm-redis` | 6379 (internal) | Redis for rate limiting |
| `nginx` | `deepterm-nginx` | 80, 443 | Reverse proxy + TLS |

### Volumes

| Volume | Path | Purpose |
|--------|------|---------|
| `./prisma` → `/app/prisma` | Bind mount | SQLite database persistence |
| `./logs` → `/app/logs` | Bind mount | Application logs |
| `redis-data` | Named volume | Redis AOF persistence |
| `./nginx/ssl` → `/etc/nginx/ssl` | Bind mount (read-only) | TLS certificates |

### Operations

```bash
# View logs
docker compose logs -f app

# Restart app only
docker compose restart app

# Rebuild after code changes
docker compose up -d --build app

# Stop everything
docker compose down

# Stop + remove volumes (DATA LOSS)
docker compose down -v
```

### Dockerfile Summary

Multi-stage build:
1. **Builder stage** (node:20-alpine): installs deps, generates Prisma client, builds Next.js (standalone output).
2. **Runner stage** (node:20-alpine): copies built output, runs as non-root `nextjs` user on port 3000.

---

## 5. PM2 (Bare-Metal / Raspberry Pi)

### Automated Setup

```bash
sudo bash setup.sh
```

The `setup.sh` script handles: system updates, Node.js 20 installation, PM2 + Nginx installation, SSL certificate generation, database setup, application build, and PM2 startup.

### Manual Setup

```bash
# Install dependencies
npm ci --legacy-peer-deps

# Generate Prisma client and push schema
npx prisma generate
npx prisma db push

# Optional: seed database
npx tsx prisma/seed.ts

# Build
npm run build

# Start with PM2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

### `ecosystem.config.js` Key Settings

| Setting | Value | Description |
|---------|-------|-------------|
| `instances` | `1` | Single instance (use `'max'` for multi-core) |
| `exec_mode` | `fork` | Use `cluster` with multiple instances |
| `max_memory_restart` | `500M` | Auto-restart on memory threshold |
| `max-old-space-size` | `512` | Node.js heap limit (conservative for Pi) |

### PM2 Commands

```bash
pm2 status                   # Check process status
pm2 logs deepterm            # View logs (live)
pm2 restart deepterm         # Restart
pm2 reload deepterm          # Zero-downtime reload
pm2 stop deepterm            # Stop
pm2 monit                    # Real-time monitoring
```

---

## 6. Nginx Configuration

Nginx serves as a reverse proxy with TLS termination. Key features of the configuration:

### Route Handling

| Location | Behavior |
|----------|----------|
| `/` | Proxy to app (port 3000) |
| `/api` | Proxy to app, buffering disabled for streaming |
| `/_next/static`, `/static` | Proxy + cache (`max-age=31536000, immutable`) |
| `/_next/image` | Proxy + cache (`max-age=86400`) |
| `/downloads/` | Served directly from disk (`alias /var/www/deepterm-downloads/`) |
| `/ws` | WebSocket proxy with 86400s timeout |
| `/health` | Proxy to app, no access log |

### Admin Route Restriction

Admin login (`/admin/login`, `/api/admin/auth/login`) is restricted to **intranet IPs only**:

```nginx
allow 127.0.0.1;
allow 10.0.0.0/8;
allow 172.16.0.0/12;
allow 192.168.0.0/16;
allow ::1;
allow fc00::/7;
allow fe80::/10;
deny all;
```

This is enforced at both the Nginx level and the Next.js middleware level.

### Security Headers

```
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; ...
```

### Compression

Gzip enabled (`gzip_comp_level 6`) for text, CSS, JSON, JS, SVG. Brotli commented out (enable if module available).

### Cache

Static asset cache: `/var/cache/nginx/deepterm` (10 MB zone, 7-day inactive TTL).

### WWW Redirect

`www.deepterm.net` → `deepterm.net` (301 redirect, both HTTP and HTTPS).

---

## 7. Database

### Engine

SQLite via Prisma 5.10. Database file: `prisma/deepterm.db`.

### Schema Management

```bash
# Push schema changes to database (development)
npx prisma db push

# Generate Prisma client after schema changes
npx prisma generate

# Open Prisma Studio (GUI)
npx prisma studio
```

### Seeding

```bash
npx tsx prisma/seed.ts
```

Creates initial admin user and sample data.

### Model Count

26 Prisma models including: `User`, `Account`, `Session`, `Team`, `TeamMember`, `Subscription`, `Organization`, `OrganizationUser`, `ZKUser`, `ZKVault`, `ZKVaultItem`, `Device`, `RefreshToken`, `PasswordResetToken`, `AdminUser`, `Announcement`, `IdeaSubmission`, `UserFeedback`, `AuditLog`, `ZKAuditLog`, and more.

---

## 8. Redis

Used for rate limiting and session caching. Configuration:

```
redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
```

- **AOF persistence** enabled for durability across restarts.
- **256 MB** memory limit with LRU eviction.
- Application degrades gracefully if Redis is unavailable (rate limiting falls back, caching disabled).

---

## 9. SSL / TLS

### Certificate Placement

| File | Path (Docker) | Path (bare-metal) |
|------|---------------|-------------------|
| Certificate | `nginx/ssl/deepterm.crt` | `/etc/nginx/ssl/deepterm.crt` |
| Private key | `nginx/ssl/deepterm.key` | `/etc/nginx/ssl/deepterm.key` |

### TLS Configuration

```
ssl_protocols TLSv1.2 TLSv1.3;
ssl_session_timeout 1d;
ssl_session_cache shared:SSL:50m;
ssl_prefer_server_ciphers off;
```

Cipher suite: ECDHE + AES-GCM + CHACHA20-POLY1305 (modern browsers only).

### Let's Encrypt (Production)

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d deepterm.net

# Auto-renewal (crontab)
0 0 * * * /usr/bin/certbot renew --quiet
```

### Self-Signed (Development)

The `setup.sh` script generates self-signed certificates automatically. For manual generation:

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout deepterm.key -out deepterm.crt \
  -subj "/CN=deepterm.local"
chmod 600 deepterm.key
```

---

## 10. Health Checks & Monitoring

### Health Endpoint

```
GET /api/health
```

**Response (healthy):**
```json
{ "status": "healthy", "timestamp": "...", "version": "1.0.0", "services": { "database": "connected" } }
```

**Response (unhealthy, 503):**
```json
{ "status": "unhealthy", "timestamp": "...", "error": "Database connection failed" }
```

### Docker Health Check

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

### PM2 Monitoring

```bash
pm2 monit          # Real-time CPU/memory
pm2 status         # Process table
pm2 logs deepterm  # Log stream
```

### Logs

| Location | Content |
|----------|---------|
| `logs/combined.log` | All PM2 output |
| `logs/out.log` | stdout |
| `logs/error.log` | stderr |
| Docker: `docker compose logs -f app` | Container logs |

---

## 11. Backup & Restore

### Database Backup

```bash
# SQLite — simple file copy (stop writes first for consistency)
cp prisma/deepterm.db prisma/deepterm.db.backup.$(date +%Y%m%d)

# Or use SQLite online backup (safe while running)
sqlite3 prisma/deepterm.db ".backup 'prisma/deepterm.db.backup'"
```

### Automated Backup (Cron)

```bash
# Daily backup at 2 AM, keep 30 days
0 2 * * * sqlite3 /home/macan/deepterm/prisma/deepterm.db ".backup '/backups/deepterm-$(date +\%Y\%m\%d).db'" && find /backups -name 'deepterm-*.db' -mtime +30 -delete
```

### Restore

```bash
# Stop the application
pm2 stop deepterm  # or: docker compose stop app

# Replace database
cp /backups/deepterm-20260219.db prisma/deepterm.db

# Restart
pm2 start deepterm  # or: docker compose start app
```

### What to Back Up

| Item | Path | Frequency |
|------|------|-----------|
| Database | `prisma/deepterm.db` | Daily |
| Environment | `.env` | On change |
| SSL certs | `nginx/ssl/` | On renewal |
| Download binaries | `/var/www/deepterm-downloads/` | On release |
| Issue attachments | `/var/www/deepterm-issues/` | Weekly |

---

## 12. Updating / Redeployment

### Docker Compose

```bash
cd ~/deepterm
git pull origin main

# Rebuild and restart
docker compose up -d --build

# Run database migrations if schema changed
docker compose exec app npx prisma db push
```

### PM2

```bash
cd ~/deepterm
git pull origin main

npm ci --legacy-peer-deps
npx prisma generate
npx prisma db push
npm run build

pm2 reload deepterm
```

### Zero-Downtime (PM2 Cluster)

For multi-instance deployments:
```bash
# In ecosystem.config.js, set:
#   instances: 'max'
#   exec_mode: 'cluster'

pm2 reload deepterm  # Rolling restart
```

---

## 13. Troubleshooting

| Issue | Check | Fix |
|-------|-------|-----|
| App won't start | `pm2 logs deepterm` or `docker compose logs app` | Check .env, DATABASE_URL, port conflicts |
| 502 Bad Gateway | Is the app running on port 3000? | `curl http://localhost:3000/api/health` |
| Database locked | Multiple write processes? | Ensure single app instance for SQLite |
| Redis connection refused | Is Redis running? | `redis-cli ping` should return `PONG` |
| Admin panel inaccessible | Accessing from public IP? | Admin is intranet-only; use VPN or SSH tunnel |
| SSL certificate warnings | Self-signed cert | Replace with Let's Encrypt for production |
| High memory usage | Node.js heap growth | Check `max-old-space-size` in ecosystem.config.js |
| Slow first request | Next.js cold start | Expected; subsequent requests are fast |

---

## 14. Security Hardening

### Already Implemented

- [x] Admin routes restricted to intranet IPs (Nginx + middleware)
- [x] HTTPS enforced (HTTP → HTTPS redirect)
- [x] Security headers (X-Frame-Options, CSP, etc.)
- [x] Rate limiting on auth endpoints (5 attempts / 15 min)
- [x] Refresh token rotation (reuse detection)
- [x] bcrypt (12 rounds) for password hashing
- [x] SHA-256 hashed refresh tokens in database
- [x] Non-root container user (Docker)
- [x] Sensitive files blocked by Nginx (`.env`, `.git`, etc.)

### Recommended Additional Steps

- [ ] Enable OCSP stapling (requires CA-signed certificate)
- [ ] Enable Brotli compression (install Nginx module)
- [ ] Set up fail2ban for SSH and Nginx
- [ ] Configure firewall (ufw: allow 80, 443, 22 only)
- [ ] Move to PostgreSQL for production (better concurrent write handling)
- [ ] Set up external monitoring (uptime checks on `/api/health`)
- [ ] Rotate `NEXTAUTH_SECRET` / `JWT_SECRET` periodically
- [ ] Enable Redis authentication (`requirepass`)
