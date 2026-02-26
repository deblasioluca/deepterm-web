# DeepTerm — Architecture Guide

## System Overview

DeepTerm is a Next.js 14 web application that serves three roles:

1. **Marketing website** — public pages (landing, pricing, product, security)
2. **User dashboard** — account management, billing, team admin, vault browser
3. **API server** — REST endpoints for the desktop/mobile app and ZK vault operations

All three roles run in a single Next.js process behind an Nginx reverse proxy, with Redis for caching/rate limiting and SQLite for persistence.

```
┌──────────────────────────────────────────────────────────────────┐
│                         Internet                                  │
└──────────────┬──────────────────────┬────────────────────────────┘
               │                      │
        HTTPS (443)            HTTPS (443)
               │                      │
      ┌────────▼────────┐    ┌────────▼────────┐
      │  Web Browsers   │    │  DeepTerm App   │
      │  (Dashboard)    │    │  (macOS/iOS)    │
      └────────┬────────┘    └────────┬────────┘
               │                      │
               └──────────┬───────────┘
                          │
                ┌─────────▼─────────┐
                │   Nginx (TLS)     │  :443 → :3000
                │   Reverse Proxy   │
                └─────────┬─────────┘
                          │
                ┌─────────▼──────────┐
                │   Next.js 14       │  :3000
                │   (App Router)     │
                │                    │
                │  ┌──────────────┐  │
                │  │ API Routes   │  │
                │  │ Pages / SSR  │  │
                │  │ Static Files │  │
                │  └──────┬───────┘  │
                └─────────┼──────────┘
                    ┌─────┼──────┐
                    │     │      │
              ┌─────▼─┐ ┌▼────┐ ┌▼─────┐
              │SQLite │ │Redis│ │Stripe│
              │(Prisma│ │  7  │ │ API  │
              │  ORM) │ │     │ │      │
              └───────┘ └─────┘ └──────┘
```

---

## Infrastructure

### Services (Docker Compose)

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| **app** | Custom Dockerfile (Node 20 Alpine) | 3000 | Next.js application |
| **redis** | `redis:7-alpine` | 6379 | Rate limiting, caching |
| **nginx** | `nginx:alpine` | 80, 443 | TLS termination, reverse proxy, static file serving |

### Production Deployment

Two deployment modes are supported:

**Docker Compose** (recommended for production servers):
```
docker-compose.yml → deepterm-app (3000) + deepterm-redis (6379) + deepterm-nginx (80/443)
```

**PM2** (used on the Raspberry Pi development server):
```
ecosystem.config.js → single Next.js instance, 512MB max memory, 1 process
```

### Network Architecture

```
Internet → Nginx (:443 TLS) → Next.js (:3000)
                                    ├── SQLite (file: /app/prisma/deepterm.db)
                                    ├── Redis (redis://redis:6379)
                                    └── Stripe API (outbound HTTPS)
```

### Nginx Configuration

| Feature | Configuration |
|---------|---------------|
| TLS | TLS 1.2 + 1.3, custom cert at `/etc/ssl/certs/deepterm.crt` |
| Compression | gzip level 6 (text, CSS, JSON, JS, SVG) |
| Caching | `/_next/static` → 1 year immutable; `/_next/image` → 1 day |
| WebSocket | `/ws` path with upgrade headers, 24h read timeout |
| Downloads | `/downloads/` → direct Nginx serving from `/var/www/deepterm-downloads/` |
| Admin access | `/admin/login` and `/api/admin/auth/login` restricted to private IPs only |
| Security headers | X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, CSP, Referrer-Policy |
| Dotfile blocking | `~ /\.` → deny all; explicit blocks for `.env`, `.git`, `package.json`, `tsconfig.json` |

### Health Checks

| Check | Endpoint | Interval |
|-------|----------|----------|
| Docker | `curl -f http://localhost:3000/api/health` | 30s (3 retries, 40s start period) |
| Nginx | `/health` proxied to app | accessed externally |

---

## Authentication Architecture

DeepTerm has **three authentication systems** serving different clients:

### 1. Web Authentication (NextAuth v5)

For browser-based dashboard access.

| Setting | Value |
|---------|-------|
| Provider | Credentials (email + password + optional TOTP) |
| Session strategy | JWT |
| Session lifetime | 30 days |
| Cookie | `authjs.session-token` / `__Secure-authjs.session-token` |
| 2FA | TOTP (SHA1, 6 digits, 30s period, ±1 window) + SHA-256 hashed backup codes |
| Passkeys | WebAuthn / FIDO2 (Touch ID, hardware keys) |

### 2. ZK Vault Authentication (Custom JWT)

For the desktop/mobile app and all vault operations.

| Setting | Value |
|---------|-------|
| Access token | JWT (HS256), 15-minute expiry |
| Refresh token | 64 random bytes (base64url), stored as SHA-256 hash in DB |
| Refresh token lifetime | Configurable via `REFRESH_TOKEN_EXPIRY_DAYS` (default 90 days, instance set to 365) |
| Token rotation | Yes — refresh issues new pair, revokes old |
| Logout scope | Revokes **all** refresh tokens for the user (all devices) |
| Password change | Revokes all tokens, returns new pair in same response |

**Login endpoints:**

| Endpoint | When to use |
|----------|-------------|
| `POST /api/zk/accounts/login` | Master password hash login (no web 2FA enforcement) |
| `POST /api/zk/accounts/login-password` | Web password login (enforces 2FA if enabled) |
| `POST /api/zk/accounts/login-password-2fa` | Complete 2FA step for password login |
| `POST /api/zk/accounts/token/refresh` | Silent token renewal |

### 3. Admin Authentication

For the admin panel (intranet-only).

| Setting | Value |
|---------|-------|
| Cookie | `admin-session` (base64 JSON with `exp` timestamp) |
| Access restriction | Private IPs only (10.x, 172.16-31.x, 192.168.x, 127.x, IPv6 link-local) |
| 2FA | TOTP + passkeys supported |

### Request Middleware Flow

```
Request
  │
  ├── /admin/login, /api/admin/auth/login
  │     → Intranet IP check → 404 if external
  │
  ├── /admin/*, /api/admin/*
  │     → admin-session cookie check → 401/redirect if expired
  │
  ├── /dashboard/*
  │     → NextAuth session cookie check → redirect to /login if missing
  │
  ├── /login, /register
  │     → redirect to /dashboard if session cookie present
  │
  └── /api/app/*
        → x-api-key header validation
        → Optional: Authorization: Bearer <ZK token>
```

---

## Database Architecture

### ORM & Provider

- **Prisma** (v5.10) with SQLite provider
- Database file: `./prisma/deepterm.db` (Docker: `/app/prisma/deepterm.db`)
- Schema: `prisma/schema.prisma`

### Entity Relationship Overview

```
┌─────────┐     ┌─────────┐     ┌──────────────┐
│  User   │────▶│  Team   │◀────│   Invoice    │
│ (web)   │     │(billing)│     │  (Stripe)    │
└────┬────┘     └────┬────┘     └──────────────┘
     │               │
     │          ┌────▼────────┐
     │          │PaymentMethod│
     │          └─────────────┘
     │
┌────▼────┐     ┌──────────┐     ┌─────────────┐
│ ZKUser  │────▶│  Device  │     │RefreshToken │
│ (vault) │     └──────────┘     └─────────────┘
└────┬────┘
     │
┌────▼─────┐     ┌────────────┐     ┌─────────────┐
│ ZKVault  │────▶│ZKVaultItem │     │ ZKAuditLog  │
│          │     │(encrypted) │     │             │
└──────────┘     └────────────┘     └─────────────┘
     │
┌────▼──────────┐     ┌──────────────────┐
│ Organization  │────▶│OrganizationUser  │
│               │     │(role + status)   │
└───────────────┘     └──────────────────┘

┌──────────┐     ┌──────────────┐
│   Epic   │────▶│    Story     │
│(planning)│     │(deliverable) │
└──────────┘     └──────────────┘
```

### Key Models

| Model | Records | Purpose |
|-------|---------|---------|
| **User** | Web user accounts | Email, password hash, role, team membership, 2FA config |
| **Team** | Billing entities | Stripe subscription, plan, seats, SSO config |
| **ZKUser** | Vault identities | Master password hash, encryption keys (public/private/symmetric), KDF params, linked to User |
| **ZKVault** | Credential containers | Named vaults (encrypted names), per-user or per-org |
| **ZKVaultItem** | SSH credentials | Encrypted data blob, soft-delete support, typed (password/key/cert) |
| **Device** | App installations | Device name, type, push token for multi-device sync |
| **RefreshToken** | Auth tokens | SHA-256 hashed token, expiry, revocation flag, device link |
| **Organization** | Team vaults | Shared vault groups with member roles and encrypted org keys |
| **AdminUser** | Admin accounts | Separate from User, with own 2FA and passkeys |
| **SubscriptionOffering** | Plan pricing | Admin-managed pricing (draft/live stages) with Stripe price IDs |
| **Release** | App versions | Platform-specific release metadata, checksums, download paths |
| **Issue** | Bug reports | In-app submitted issues with attachments and status tracking |
| **Epic** | Planning initiatives | Large bodies of work (e.g., "Auth v2"), status/priority/sort order |
| **Story** | Planning deliverables | Smaller units within an Epic, linked to GitHub issue numbers |

### Encryption at Rest

All vault data is encrypted client-side before reaching the server:

| Field | Encryption |
|-------|-----------|
| `ZKVaultItem.encryptedData` | AES-256 (client-side, random IV per item) |

| `ZKVault.name` | AES-256 (client-side) |
| `ZKUser.protectedSymmetricKey` | RSA-encrypted symmetric key |
| `ZKUser.encryptedPrivateKey` | AES-256-encrypted RSA private key |
| `User.passwordHash` | bcrypt (cost 12) |
| `ZKUser.masterPasswordHash` | bcrypt (cost 12) — hash of hash (client hashes first with PBKDF2) |
| `RefreshToken.tokenHash` | SHA-256 |

---

## Cryptographic Architecture

### Key Hierarchy (Per-User)

```
Master Password (user-entered, never stored)
    │
    ├── PBKDF2-SHA256 (600,000 iterations) or Argon2id (3 iterations, 64MB, 4 threads)
    │
    ▼
Master Key (256-bit, derived on client)
    │
    ├── Hash again with PBKDF2(1 iteration) → masterPasswordHash → sent to server for auth
    │
    ├── Encrypt → protectedSymmetricKey (AES-256, stored on server)
    │   │
    │   ▼
    │   Symmetric Key (256-bit, random)
    │       ├── Encrypt vault item data
    │       ├── Encrypt vault names
    │       └── Encrypt shared org keys
    │
    └── Encrypt → encryptedPrivateKey (AES-256, stored on server)
        │
        ▼
        RSA Key Pair (2048/4096-bit)
            ├── Public key → stored plaintext on server (for org sharing)
            └── Private key → decrypt org keys shared by other members
```

### KDF Options

| Parameter | PBKDF2 | Argon2id |
|-----------|--------|----------|
| KDF type | 0 | 1 |
| Iterations | 600,000 | 3 |
| Memory | — | 65,536 KB (64 MB) |
| Parallelism | — | 4 |
| Output | 256-bit key | 256-bit key |

### Vault Item Encryption

Each vault item's `encryptedData` is an AES-256 encrypted JSON blob containing all credential metadata and secrets:

```json
{
  "type": 0,
  "name": "Production Web Server",
  "host": "server.example.com",
  "port": 22,
  "username": "admin",
  "password": "secret",
  "privateKey": "-----BEGIN OPENSSH PRIVATE KEY-----...",
  "passphrase": "key-passphrase",
  "certificate": "-----BEGIN CERTIFICATE-----...",
  "notes": "Server notes",
  "tags": ["production", "web"]
}
```

Item types (inside blob): `SSH_PASSWORD` (0), `SSH_KEY` (1), `SSH_CERTIFICATE` (2).

The server stores only `encryptedData` — no `type` or `name` columns exist on the model. This means the server has zero metadata about credential contents.

---

## API Architecture

### Route Groups

| Base Path | Auth Method | Purpose |
|-----------|-------------|---------|
| `/api/app/*` | `x-api-key` + optional Bearer | Desktop/mobile app identity endpoints |
| `/api/zk/*` | Bearer (ZK JWT) | Zero-knowledge vault operations |
| `/api/auth/*` | NextAuth session | Web authentication (login, 2FA, passkeys) |
| `/api/stripe/*` | NextAuth session / webhook signature | Billing operations |
| `/api/admin/*` | Admin session cookie (intranet only) | Admin panel operations |
| `/api/team/*` | NextAuth session | Team management |
| `/api/ideas/*` | NextAuth session | Feature ideas & voting |
| `/api/issues/*` | NextAuth session | Support issues |
| `/api/billing/*` | Public (read-only) | Subscription offerings |
| `/api/health` | None | Health check |
| `/api/downloads/*` | None / varies | App download info & release metadata |

### Complete Route Map

```
/api/
├── admin/
│   ├── analytics/          GET            Dashboard stats
│   ├── announcements/      GET, POST      Manage announcements
│   ├── audit-logs/         GET            Admin audit trail
│   ├── auth/
│   │   ├── 2fa/            POST           Admin 2FA setup/verify
│   │   ├── check/          GET            Check admin session
│   │   ├── login/          POST           Admin login
│   │   ├── logout/         POST           Admin logout
│   │   └── passkey/        GET, POST      Admin passkey management
│   ├── downloads/          GET, POST      Manage app downloads
│   ├── feedback/           GET            View user feedback
│   ├── cockpit/            GET            Aggregated cockpit data (health, builds, events, stats, planning)
│   │   ├── actions/        POST           Triage, CI triggers, releases, WhatsApp test
│   │   └── planning/
│   │       ├── epics/      GET, POST      List/create epics
│   │       │   └── [id]/   PATCH, DELETE  Update/delete epic
│   │       ├── stories/    GET, POST      List/create stories
│   │       │   └── [id]/   PATCH, DELETE  Update/delete story
│   │       └── reorder/    POST           Batch sort order update
│   ├── issues/             GET, PATCH     Manage support issues
│   ├── licenses/           GET, PATCH     Manage user licenses
│   ├── releases/           GET, POST, DELETE  App release management
│   ├── settings/           GET, PATCH     System settings
│   ├── stats/              GET            System statistics
│   ├── subscription-offerings/  GET, POST, PUT  Pricing management
│   ├── subscriptions/      GET            View all subscriptions
│   ├── teams/              GET, POST      Team management
│   │   └── [id]/           GET, PATCH, DELETE
│   └── users/              GET            User management
│       └── [id]/           GET, PATCH, DELETE
│
├── app/
│   ├── issues/submit       POST           In-app bug reports
│   ├── login/              POST           App login (Bearer or password)
│   ├── register/           POST           App registration
│   ├── updates/            GET            Check for app updates
│   └── validate/           GET, POST      Validate credentials / license
│
├── auth/
│   ├── [...nextauth]/      GET, POST      NextAuth endpoints
│   ├── 2fa/                               TOTP setup/verify
│   ├── passkey/                           WebAuthn registration/auth
│   └── pre-login/          POST           Check login method before auth
│
├── billing/
│   └── offerings/          GET            Public pricing data
│
├── downloads/
│   ├── info/               GET            Download page info
│   └── releases/           GET            Release metadata
│
├── health/                 GET            Health check
│
├── ideas/                  GET, POST      Feature ideas
│   └── [id]/               GET, PATCH, DELETE, POST (vote)
│
├── internal/
│   ├── ai-dev/
│   │   ├── tasks/          GET            Stories for AI Dev Mac (x-api-key)
│   │   └── task-status/    POST           Update Story status (x-api-key)
│   ├── node-red/
│   │   ├── triage-response/ POST          WhatsApp triage callback (x-api-key)
│   │   └── command/        POST           System info query (x-api-key)
│   └── security-event/     POST           Security event logging
│
├── issues/                 GET, POST      Support issues
│   └── [id]/               GET, PATCH     Issue details & updates
│
├── register/               POST           Web registration
│
├── stripe/
│   ├── checkout/           POST           Create checkout session
│   ├── payment-methods/    GET, POST, DELETE  Payment method management
│   ├── portal/             POST           Stripe customer portal
│   ├── subscription/       GET, PATCH     Subscription management
│   └── webhook/            POST           Stripe webhook handler
│
├── team/
│   ├── invitations/        GET, POST, PATCH  Team invitations
│   └── members/            GET, PATCH, DELETE  Team member management
│
├── vaults/                 GET, POST      Web vault management
│   └── [id]/               GET, PATCH, DELETE
│
└── zk/
    ├── accounts/
    │   ├── check/          POST           Check if account exists
    │   ├── keys/           GET, POST      Get/update encryption keys
    │   │   └── initialize/ POST           First-time key setup
    │   ├── license/        GET            Subscription & feature info
    │   ├── login/          POST           Master password login
    │   ├── login-password/ POST           Web password login (+ 2FA)
    │   ├── login-password-2fa/ POST       Complete 2FA for password login
    │   ├── logout/         POST           Revoke all tokens
    │   ├── password/
    │   │   ├── change/     POST           Change master password
    │   │   └── hint/       POST           Get password hint
    │   ├── register/       POST           Create ZK account
    │   └── token/
    │       └── refresh/    POST           Refresh access token
    ├── iap/
    │   └── verify/         POST           Apple IAP receipt verification
    ├── organizations/      GET, POST      List/create organizations
    │   └── [orgId]/        GET, PATCH, DELETE
    │       ├── audit-log/  GET            Organization audit log
    │       └── members/    GET, POST, PATCH, DELETE
    ├── sync/               GET            Full/delta vault sync
    ├── vault-items/        GET, POST      List/create vault items
    │   ├── [id]/           GET, PATCH, DELETE
    │   └── bulk/           POST           Bulk create/update/delete
    └── vaults/             GET, POST      List/create vaults
        └── [id]/           GET, PATCH, DELETE
```

---

## Admin Cockpit Architecture

The admin cockpit (`/admin/cockpit`) is a real-time operations dashboard, structured into 7 tabs. All data is fetched in a single `GET /api/admin/cockpit` call and rendered client-side — tab switching is instant with no re-fetching. Auto-refresh runs every 30 seconds.

### Tab Structure

| Tab | Purpose | Data Source |
|-----|---------|-------------|
| **Overview** | Quick stats (issues, ideas, releases, users), revenue metrics, compact health summary | DB aggregates + Stripe data |
| **Backlog** | GitHub Issues with state (open/closed/all) and label filtering | GitHub API (live) |
| **Triage** | Pending bug reports and feature ideas with approve/defer/reject actions | `Issue` + `Idea` models |
| **Planning** | Epic/Story management — bundling, prioritization, status workflow, release | `Epic` + `Story` models |
| **System Health** | Raspberry Pi, CI Mac runner, Node-RED status with uptime/memory details | Process stats + HTTP probes |
| **Builds** | Recent CI build history with conclusions and durations | `CiBuild` model |
| **Activity** | GitHub push, PR, and workflow events | `GithubEvent` model |

### Planning Data Model

```
Epic (1) ──────▶ (N) Story
  │                    │
  ├── title            ├── title
  ├── description      ├── description
  ├── status           ├── status
  ├── priority         ├── priority
  ├── sortOrder        ├── sortOrder
  └── stories[]        ├── epicId (nullable — unassigned stories)
                       └── githubIssueNumber (links to GitHub issue)
```

**Status workflow:** `backlog` → `planned` → `in_progress` → `done` → `released`

**Priority levels:** `critical`, `high`, `medium`, `low`

Stories can optionally link to a GitHub issue number for traceability between the backlog and planning views. Deleting an Epic un-parents its stories (`onDelete: SetNull`) rather than deleting them.

### File Structure

```
src/app/admin/cockpit/
├── page.tsx                          # Main page: header, tab bar, data fetching
├── types.ts                          # All TypeScript interfaces
├── utils.ts                          # formatUptime(), formatTimeAgo()
└── components/
    ├── shared.tsx                    # StatusBadge, PriorityBadge, LabelBadge, etc.
    ├── OverviewTab.tsx               # Stats + Revenue + Health summary
    ├── GithubIssuesTab.tsx           # Backlog with label/state filters
    ├── TriageQueueTab.tsx            # Pending items with action buttons
    ├── PlanningTab.tsx               # Epic/Story CRUD, reorder, release
    ├── SystemHealthTab.tsx           # Pi, CI Mac, Node-RED detail cards
    ├── BuildsTab.tsx                 # CI builds list
    └── GithubActivityTab.tsx         # GitHub events timeline
```

### Quick Actions (Shared Across Tabs)

| Action | What it does |
|--------|-------------|
| **Trigger CI Build** | Dispatches a GitHub Actions workflow via API |
| **Test WhatsApp** | Sends a test notification through Node-RED |
| **Triage approve/defer/reject** | Updates Issue/Idea status, notifies Node-RED |
| **Release Epic/Story** | Sets status to `released`, notifies Node-RED |

---

## Payment Architecture

### Stripe Integration

```
User (Dashboard)                  Server                          Stripe
     │                              │                               │
     ├── Select plan ──────────────▶│                               │
     │                              ├── Create Checkout Session ───▶│
     │◀── Redirect to Stripe ──────┤                               │
     │                              │                               │
     ├── Complete payment ─────────────────────────────────────────▶│
     │                              │◀── Webhook: checkout.complete─┤
     │                              ├── Update Team (plan, seats)   │
     │                              ├── Create Invoice record       │
     │                              │                               │
     │◀── Redirect to billing page─┤                               │
```

### Stripe Products & Prices

| Product | Monthly Price | Yearly Price |
|---------|--------------|-------------|
| DeepTerm Pro | $12.99/seat | $120/seat ($10/mo) |
| DeepTerm Team | $24.99/seat | $240/seat ($20/mo) |
| DeepTerm Business | $39.99/seat | $360/seat ($30/mo) |

### Webhook Events Handled

- `checkout.session.completed` — new subscription activated
- `customer.subscription.updated` — plan/seat changes, renewals
- `customer.subscription.deleted` — cancellation
- `invoice.paid` — record invoice
- `invoice.payment_failed` — mark as past_due

### Apple IAP

Apple In-App Purchase verification is handled via `POST /api/zk/iap/verify`. The server validates the receipt with Apple and stores subscription details on the ZKUser record (`appleOriginalTransactionId`, `appleExpiresDate`, `appleProductId`).

---

## Internationalization

- Supported locales: `en`, `de`, `fr`, `es`
- Resolution order: `?lang=` query parameter → `deepterm_locale` cookie → default `en`
- Implemented in middleware (`src/middleware.ts`)
- Components: `LanguageSelector`, `LocaleProvider`

---

## Security Architecture

### Defense Layers

| Layer | Mechanism |
|-------|-----------|
| Transport | TLS 1.2/1.3 only, HSTS |
| API auth | API key + JWT Bearer tokens |
| Web auth | NextAuth JWT sessions + CSRF |
| Admin auth | Session cookie + intranet IP restriction |
| Rate limiting | 5 attempts / 15 minutes per email+IP (Redis-backed) |
| Password storage | bcrypt cost 12 |
| Vault encryption | AES-256 client-side (zero-knowledge) |
| Token storage | SHA-256 hashed in DB, token rotation on refresh |
| Input validation | Zod schema validation |
| Headers | CSP, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection |
| Soft delete | Vault items recoverable for 30 days |
| Audit logging | All sensitive operations logged with IP, user agent, device info |

### Rate Limiting

| Setting | Value |
|---------|-------|
| Window | 15 minutes |
| Max attempts | 5 per window |
| Block duration | 30 seconds |
| Key format | `{email}:{ip}` |
| Backend | Redis (fallback: SQLite `RateLimitEntry` table) |

### CORS

Configured per-endpoint in the ZK API layer. Preflight (`OPTIONS`) handlers return appropriate headers for cross-origin app requests.
