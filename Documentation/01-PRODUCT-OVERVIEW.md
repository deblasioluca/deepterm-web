# DeepTerm — Product Overview

## What Is DeepTerm?

DeepTerm is a professional SSH client platform with a zero-knowledge encrypted vault for credential management. It consists of:

- **Web application** — account management, billing, team administration, and a marketing/product website
- **Desktop app** (macOS) — the SSH client itself, with AI-assisted terminal, SFTP, and encrypted vault sync
- **Mobile app** (planned) — companion app for credential access on the go

Users create **one DeepTerm account** that gives them access to both the web dashboard and the desktop/mobile apps. The same account stores their encrypted vault credentials, managed billing subscription, and team memberships.

---

## Core Features

### SSH Client (Desktop App)
- SSH remote connections with password and key-based auth
- SFTP file transfer
- AI-powered terminal assistant (autocomplete, command suggestions)
- Port forwarding
- Multi-tab / multi-session support
- Snippets & automation

### Zero-Knowledge Vault
- Client-side AES-256 encryption — the server never sees plaintext credentials
- Automatic cloud sync across devices
- Vault types: personal, team, and shared
- Supports SSH passwords, SSH keys, and SSH certificates
- Delta sync for efficient bandwidth usage
- Soft-delete with 30-day recovery

### Team & Enterprise
- Team vaults with shared credentials
- Role-based access (owner, admin, member, readonly)
- SAML SSO integration
- Admin controls and audit logging
- Consolidated billing and seat management
- SOC2 Type II report (Business plan)

### Account Security
- Two-factor authentication (TOTP + backup codes)
- Passkey / WebAuthn support (Touch ID, hardware keys)
- Biometric vault unlock (Touch ID / Face ID on macOS/iOS)
- Session management

---

## Pricing Plans

| Plan | Price (Annual) | Price (Monthly) | Target |
|------|---------------|-----------------|--------|
| **Starter** | Free | Free | Individual, basic usage |
| **Pro** | $10/user/mo | $12.99/user/mo | Professional individual |
| **Team** | $20/user/mo | $24.99/user/mo | Small to medium teams |
| **Business** | $30/user/mo | $39.99/user/mo | Enterprise / compliance |

### Feature Comparison

| Feature | Starter | Pro | Team | Business |
|---------|---------|-----|------|----------|
| SSH & SFTP connections | 5 hosts | Unlimited | Unlimited | Unlimited |
| Devices | 1 | Unlimited | Unlimited | Unlimited |
| Vaults | 1 (local) | 10 (cloud) | Unlimited | Unlimited |
| AI terminal assistant | — | ✓ | ✓ | ✓ |
| Port forwarding | — | ✓ | ✓ | ✓ |
| Priority support | — | ✓ | ✓ | ✓ |
| Team vaults | — | — | ✓ | ✓ |
| SSO / SAML | — | — | ✓ | ✓ |
| Audit logs | — | — | ✓ | ✓ |
| Granular permissions | — | — | — | ✓ |
| SOC2 Type II report | — | — | — | ✓ |
| Dedicated support / SLA | — | — | — | ✓ |

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Web framework | Next.js 14 (App Router) |
| Language | TypeScript |
| UI | React 18, Tailwind CSS, Framer Motion |
| Database | SQLite (via Prisma ORM) |
| Cache / rate limiting | Redis 7 |
| Authentication | NextAuth v5 (web), custom JWT (ZK vault / app) |
| Payments | Stripe (web), Apple IAP (App Store) |
| Email | Nodemailer (SMTP) |
| 2FA | TOTP (otpauth), WebAuthn / Passkeys |
| Crypto | bcryptjs, AES-256, PBKDF2, Argon2id, RSA |
| Runtime | Node.js 20, PM2 (production), Docker |
| Reverse proxy | Nginx with TLS 1.2/1.3 |
| Desktop app | macOS native (Swift) |

---

## User Accounts

### One Account, Two Auth Contexts

Users have **one DeepTerm account** — not two. However, the account operates in two contexts:

1. **Identity authentication** — proving who you are (email + password + optional 2FA)
2. **Vault unlock** — decrypting your vault data (master password / biometric unlock)

The vault unlock step exists because DeepTerm uses **zero-knowledge encryption**: the server stores your credentials in encrypted form and cannot decrypt them. Only you (with your derived encryption key) can. After app restart, the in-memory encryption key is gone and must be re-derived — this is presented as "Unlock vault", not a second login.

### Token Types

| Token | Purpose | Lifetime | Storage |
|-------|---------|----------|---------|
| NextAuth session (web) | Browser dashboard access | 30 days | HTTP-only cookie |
| ZK access token (JWT) | App + vault API authorization | 15 minutes | Keychain (app) |
| ZK refresh token | Obtain new access tokens silently | 90 days (default) | Keychain (app), SHA-256 hash in DB |

### Subscription Sources

DeepTerm supports two payment providers:

- **Stripe** — subscriptions purchased through the web dashboard
- **Apple IAP** — subscriptions purchased through the App Store

When both are active, the higher-tier plan applies. The `GET /api/zk/accounts/license` endpoint reports the effective plan and its source.

---

## Platform URLs

| Environment | URL |
|-------------|-----|
| Production web | `https://deepterm.net` |
| Admin panel | `https://deepterm.net/admin` (intranet-only) |
| App API base | `https://deepterm.net/api/app` |
| ZK Vault API base | `https://deepterm.net/api/zk` |
| Stripe webhooks | `https://deepterm.net/api/stripe/webhook` |
| Health check | `https://deepterm.net/api/health` |
| App downloads | `https://deepterm.net/downloads/releases/` |

---

## Repository Structure

```
deepterm/
├── prisma/               # Database schema + seed + utility scripts
├── public/               # Static assets, app downloads
├── src/
│   ├── app/              # Next.js App Router
│   │   ├── api/          # All API routes
│   │   │   ├── admin/    # Admin panel APIs
│   │   │   ├── app/      # Desktop/mobile app APIs
│   │   │   ├── auth/     # NextAuth + 2FA + passkey
│   │   │   ├── stripe/   # Billing & webhooks
│   │   │   └── zk/       # Zero-knowledge vault APIs
│   │   ├── admin/        # Admin panel pages
│   │   ├── dashboard/    # User dashboard pages
│   │   └── (marketing)   # Landing, pricing, product, etc.
│   ├── components/       # React components (layout, sections, ui)
│   ├── lib/              # Core libraries
│   │   ├── auth.ts       # NextAuth configuration
│   │   ├── prisma.ts     # Database client
│   │   ├── stripe.ts     # Stripe integration
│   │   ├── email.ts      # Email service
│   │   ├── 2fa.ts        # TOTP / backup codes
│   │   ├── webauthn.ts   # Passkey / WebAuthn
│   │   └── zk/           # ZK vault core (jwt, rate-limit, audit, middleware)
│   └── styles/           # Global CSS
├── nginx/                # Reverse proxy config
├── Documentation/        # This documentation
├── docker-compose.yml    # Container orchestration
├── Dockerfile            # Production image
└── ecosystem.config.js   # PM2 process manager config
```
