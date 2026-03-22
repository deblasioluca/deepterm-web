# Project Guidelines for AI Assistants

This file contains **CRITICAL** guidelines for AI assistants working on the DeepTerm **web application** (Next.js). Read this FIRST to avoid duplicating code or breaking architectural decisions when context windows reset.

---

## Product Context

DeepTerm is a professional SSH client platform. This repository is the **web application** — it serves the marketing site, user dashboard, admin panel, and REST API for the native macOS desktop app. The native app is a separate SwiftUI codebase.

**Supported platforms:** macOS (Apple Silicon only — M1/M2/M3), Windows, Linux, and iOS. Intel Macs and Android are **not** supported. The macOS native app is a separate SwiftUI codebase.

---

## Tech Stack

| Category | Technology |
|----------|-----------|
| **Framework** | Next.js 14 (App Router) |
| **Language** | TypeScript 5.3 (strict mode) |
| **Runtime** | Node.js 20 LTS |
| **Styling** | Tailwind CSS 3.4 (custom dark theme) |
| **Animations** | Framer Motion 11 |
| **Icons** | Lucide React 0.330 |
| **Database** | SQLite via Prisma ORM 5.10 |
| **Auth (Web)** | NextAuth.js v5 beta (JWT sessions) |
| **Auth (App/Vault)** | Custom JWT (HS256) with refresh token rotation |
| **Auth (Admin)** | Intranet-only session cookies |
| **2FA** | OTPAuth (TOTP) + SHA-256 backup codes |
| **Passkeys** | SimpleWebAuthn (server + browser) |
| **Email** | Nodemailer (SMTP) |
| **Billing** | Stripe |
| **Caching** | Redis (ioredis) |
| **Validation** | Zod |
| **Process Manager** | PM2 |
| **Reverse Proxy** | Nginx (TLS 1.2+1.3) |

---

## Critical Architectural Decisions

### Prisma Client Singleton
**DO NOT create new PrismaClient instances!** Use the existing singleton:

```typescript
// CORRECT: Use the singleton
import { prisma } from '@/lib/prisma';

// WRONG: Creates a new connection per import
const prisma = new PrismaClient(); // NO!
```

**File:** `src/lib/prisma.ts` — uses `globalThis` pattern to prevent hot-reload connection leaks.

### Three Separate Auth Systems
The app has **three independent authentication systems**. DO NOT mix them:

| System | Cookie Name | Purpose | Lifetime |
|--------|-----------|---------|----------|
| **NextAuth (Web)** | `authjs.session-token` | Browser dashboard | 30 days |
| **ZK Vault JWT** | `Authorization: Bearer` header | Desktop/mobile app API | 15 min access + 90 day refresh |
| **Admin Session** | `admin-session` | Admin panel (intranet only) | 24 hours |

```typescript
// CORRECT: Web dashboard auth check
import { auth } from '@/lib/auth';
const session = await auth();

// CORRECT: ZK vault API auth check
import { withAuth } from '@/lib/zk/middleware';
export const POST = withAuth(async (request, auth) => { ... });

// CORRECT: Organization routes that serve both app AND web dashboard
import { getAuthFromRequestOrSession } from '@/lib/zk';
const auth = await getAuthFromRequestOrSession(request);
// Tries Bearer token first (app), falls back to NextAuth session → ZKUser lookup (web)

// WRONG: Using ZK JWT for admin panel
// WRONG: Creating a fourth auth system
```

**Exception — Organization routes:** The `/api/zk/organizations/*` endpoints serve both the macOS app (Bearer token) and the web collaboration dashboard (NextAuth session). These routes use `getAuthFromRequestOrSession()` which tries Bearer auth first, then falls back to session-based auth by resolving the linked `ZKUser`. This is intentional — the web dashboard needs to display organization membership, members, and teams. Vault item encryption/decryption still happens exclusively client-side.

### Admin Panel is Intranet-Only
**ALL `/admin` and `/api/admin` routes are restricted to private IPs.** This is enforced at two layers:

1. **Nginx:** Blocks external access to admin routes
2. **Middleware (`src/middleware.ts`):** Validates IP is private (10.x, 172.16-31.x, 192.168.x, 127.x, IPv6 link-local)

Non-intranet admin access returns **404** (not 401/403) to avoid leaking the admin interface existence. A security event is fired.

**DO NOT:**
- Remove the intranet restriction
- Change 404 to a different status code
- Add public-facing admin routes

### Zero-Knowledge Vault Architecture
The server **NEVER** sees plaintext credentials. All encryption/decryption happens client-side:

- `ZKVaultItem.encryptedData` — AES-256 encrypted blob (host, port, username, password, keys, notes, tags)
- `ZKUser.encryptedPrivateKey` — RSA private key encrypted with symmetric key
- `ZKUser.protectedSymmetricKey` — Symmetric key encrypted with master-derived key

**DO NOT:**
- Add server-side decryption of vault items
- Store plaintext credential metadata
- Log vault item contents

### Double-Hashing for ZK Login
Master password is hashed **twice**: client-side (PBKDF2/Argon2id), then server-side (bcrypt cost 12). Always maintain this pattern.

```
Client: masterPasswordHash = PBKDF2(masterKey, password, 1)
Server: storedHash = bcrypt(masterPasswordHash, 12)
```

### Database Schema
**File:** `prisma/schema.prisma` — 26 models. Key relationships:

- `User` (web) ≠ `ZKUser` (vault) ≠ `AdminUser` (admin) — three separate user models
- `ZKUser` has optional linked `User` (for web dashboard access)
- Deleting a `User` cascades to `Session`, `Vote`, `Idea`, `Issue` but NOT `ZKUser` (SetNull)
- `ZKVaultItem` uses soft-delete (`deletedAt`) with 30-day recovery window

**DO NOT:**
- Merge user models into a single table
- Add direct FK between `AdminUser` and `User`/`ZKUser`
- Remove the soft-delete pattern on vault items

### Single Next.js Process Serves Everything
One app handles: public marketing site, protected dashboard, admin panel, and REST API. Keep this monolithic-but-modular approach.

---

## Project Structure

```
deepterm/
├── prisma/
│   ├── schema.prisma          # Database schema (26 models)
│   ├── seed.ts                # Database seeding (admin + test data)
│   └── deepterm.db            # SQLite database file (gitignored)
│
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── api/
│   │   │   ├── admin/         # Admin APIs (intranet-only)
│   │   │   ├── app/           # Desktop/mobile app API (x-api-key auth)
│   │   │   ├── auth/          # NextAuth.js routes + 2FA + passkeys
│   │   │   ├── billing/       # Subscription offerings
│   │   │   ├── downloads/     # App release info (public)
│   │   │   ├── health/        # Health check endpoint
│   │   │   ├── ideas/         # Feature voting board
│   │   │   ├── internal/      # Internal-only routes (security events)
│   │   │   ├── issues/        # Bug reports / support tickets
│   │   │   ├── stripe/        # Billing webhooks + checkout
│   │   │   ├── team/          # Team management
│   │   │   ├── vaults/        # Web vault browser
│   │   │   ├── version/       # App version endpoint
│   │   │   └── zk/            # Zero-Knowledge vault APIs
│   │   │       ├── accounts/  # Login, register, keys, password change
│   │   │       ├── iap/       # Apple IAP verification
│   │   │       ├── organizations/ # Team sharing
│   │   │       ├── sync/      # Delta sync
│   │   │       ├── vault-items/   # Credential CRUD
│   │   │       └── vaults/    # Vault management
│   │   ├── admin/             # Admin panel pages (intranet-only)
│   │   ├── dashboard/         # Protected user dashboard
│   │   │   └── get-the-app/   # Download page (Apple Silicon only!)
│   │   ├── login/             # Login page
│   │   ├── register/          # Registration page
│   │   ├── pricing/           # Pricing page
│   │   ├── product/           # Product showcase
│   │   ├── enterprise/        # Enterprise contact
│   │   ├── security/          # Security page
│   │   └── layout.tsx         # Root layout
│   │
│   ├── components/
│   │   ├── layout/            # Navbar, Footer, Sidebar
│   │   ├── sections/          # Page sections (Hero, Features, Pricing, etc.)
│   │   ├── ui/                # Reusable components (Button, Card, Modal, Tabs, etc.)
│   │   ├── i18n/              # LocaleProvider, LanguageSelector
│   │   └── Providers.tsx      # Root context providers
│   │
│   ├── lib/
│   │   ├── auth.ts            # NextAuth.js configuration
│   │   ├── prisma.ts          # Prisma client singleton
│   │   ├── stripe.ts          # Stripe API wrapper
│   │   ├── email.ts           # Nodemailer service + email templates
│   │   ├── 2fa.ts             # TOTP setup/verification
│   │   ├── webauthn.ts        # Passkey registration/authentication
│   │   ├── admin-session.ts   # Admin cookie management
│   │   ├── intrusion.ts       # Security event detection + alerting
│   │   ├── issues.ts          # Issue attachment handling
│   │   ├── utils.ts           # Utility functions
│   │   ├── i18n/              # Localization data
│   │   └── zk/
│   │       ├── jwt.ts         # Token creation/verification/rotation
│   │       ├── rate-limit.ts  # Auth endpoint rate limiting
│   │       ├── audit.ts       # Vault operation audit logging
│   │       └── middleware.ts  # ZK API authentication middleware
│   │
│   ├── middleware.ts          # Edge middleware (auth routing, locale, intrusion)
│   └── styles/                # Global CSS
│
├── nginx/
│   └── deepterm.conf          # Nginx reverse proxy config
│
├── Documentation/             # All documentation goes here
├── ecosystem.config.js        # PM2 configuration
├── docker-compose.yml         # Docker Compose (app + redis + nginx)
├── Dockerfile                 # Multi-stage Node.js Alpine build
├── setup.sh                   # Raspberry Pi automated setup
├── tailwind.config.ts         # Custom dark theme
├── next.config.js             # Next.js configuration
├── tsconfig.json              # TypeScript strict mode
├── package.json               # Dependencies & scripts
├── .env.example               # Environment variable template
└── CLAUDE.md                  # This file
```

---

## Documentation

### DO:
- **All documentation goes in the `Documentation/` folder**
- Key docs:
  - `Documentation/01-PRODUCT-OVERVIEW.md` — Pricing, features, tech stack
  - `Documentation/02-ARCHITECTURE.md` — System design, auth, DB, API
  - `Documentation/03-API-REFERENCE.md` — Complete API endpoint docs
  - `Documentation/04-APP-IMPLEMENTATION-GUIDE.md` — Native app dev guide
  - `Documentation/05-DEPLOYMENT-OPERATIONS.md` — DevOps, setup, troubleshooting

### DO NOT:
- Create or update docs outside of `Documentation/`
- Create MD files in project root (except CLAUDE.md and README.md)
- Create MD files in `src/` folders
- Scatter documentation across the codebase

---

## Code Style

### TypeScript
- Strict mode enabled — no `any` types
- Path alias: `@/*` maps to `./src/*`
- camelCase for variables/functions, PascalCase for types/components
- Use `const` by default, `let` only when mutation is needed
- Prefer named exports for components, default exports for pages

### API Routes
```typescript
// Standard pattern for API routes
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const data = await prisma.model.findMany();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
```

### Error Response Format
```typescript
// Always use this format for errors
{ error: "Short Error Name", message: "Human-readable explanation" }

// Status codes:
// 400 — Bad Request (validation failure)
// 401 — Unauthorized (missing/invalid auth)
// 403 — Forbidden (insufficient permissions)
// 404 — Not Found
// 409 — Conflict (duplicate resource)
// 429 — Rate Limited
// 500 — Internal Server Error
```

### Tailwind Theme
The app uses a custom dark theme. Use semantic color names, NOT hex values:

```tsx
// CORRECT: Use theme tokens
className="bg-background-primary text-text-primary border-border"
className="text-accent-primary hover:text-accent-primary-hover"

// WRONG: Use raw hex values
className="bg-[#0A0A0F] text-[#F0F0F5]"
```

**Key colors:**
- `background-primary` (#0A0A0F) — near black
- `accent-primary` (#6C5CE7) — purple
- `accent-secondary` (#00D4AA) — teal
- `accent-warning` (#FDCB6E) — yellow
- `accent-danger` (#FF6B6B) — red

---

## Key Dependencies (DO NOT Duplicate)

| What | Use This | DO NOT |
|------|----------|--------|
| **Database access** | `import { prisma } from '@/lib/prisma'` | Create new PrismaClient instances |
| **Web auth** | `import { auth } from '@/lib/auth'` | Create custom session management |
| **ZK vault auth** | `import { withAuth } from '@/lib/zk/middleware'` | Roll your own JWT verification |
| **Token management** | `src/lib/zk/jwt.ts` | Create separate token utilities |
| **Email sending** | `src/lib/email.ts` | Import nodemailer directly |
| **Stripe billing** | `src/lib/stripe.ts` | Import stripe directly |
| **2FA** | `src/lib/2fa.ts` | Import otpauth directly |
| **Passkeys** | `src/lib/webauthn.ts` | Import @simplewebauthn directly |
| **Rate limiting** | `src/lib/zk/rate-limit.ts` | Create new rate limiters |
| **Audit logging** | `src/lib/zk/audit.ts` | Create separate audit systems |
| **Intrusion detection** | `src/lib/intrusion.ts` | Create separate security event systems |
| **AI triage** | `src/lib/ai-triage.ts` | Create separate triage/review logic |

---

## Middleware Flow

Edge middleware (`src/middleware.ts`) runs on every matched route:

```
Request
  │
  ├─ Resolve locale (query ?lang → cookie deepterm_locale → default "en")
  │
  ├─ /admin/login, /api/admin/auth/login
  │   └─ Block if NOT intranet IP → 404 + security event
  │
  ├─ /admin/*, /api/admin/* (except /api/admin/auth)
  │   └─ Require admin-session cookie → redirect or 401
  │   └─ Validate token expiry → security event if malformed
  │
  ├─ /dashboard/*
  │   └─ Require authjs.session-token cookie → redirect to /login
  │
  └─ /login, /register
      └─ If already logged in → redirect to /dashboard
```

**Matcher:** `['/dashboard/:path*', '/admin/:path*', '/api/admin/:path*', '/login', '/register']`

---

## Internationalization (i18n)

**Supported locales:** `en`, `de`, `fr`, `es`

**Resolution priority:**
1. URL param: `?lang=en`
2. Cookie: `deepterm_locale`
3. Fallback: `en`

**Components:**
- `src/components/i18n/LocaleProvider.tsx` — React Context
- `src/components/i18n/LanguageSelector.tsx` — Language switcher
- `src/lib/i18n/` — Translation data

**Usage in components:**
```tsx
import { useLocale } from '@/components/i18n/LocaleProvider';

export function MyComponent() {
  const { messages } = useLocale();
  return <h1>{messages.home.heroTitle}</h1>;
}
```

---

## Rate Limiting

**ZK vault login endpoints:**
- 5 attempts per 15-minute window per email+IP
- 30-second block when exceeded
- Backend: Redis (primary), SQLite `RateLimitEntry` (fallback)

**Nginx layer (additional):**
- Auth endpoints: 5 req/sec burst 10
- ZK vault: 30 req/sec burst 60
- General API: 20 req/sec burst 40

---

## Important Gotchas

1. **Middleware runs on Edge Runtime** — cannot import Prisma, Nodemailer, or Node.js crypto. Security events are reported via fire-and-forget `fetch()` to `/api/internal/security-event`.

2. **NextAuth v5 is beta** — API may differ from v4 docs. Check `src/lib/auth.ts` for the actual configuration.

3. **Admin tokens are NOT JWTs** — they're base64-encoded JSON with `exp` field. Decoded with `atob()` + `JSON.parse()`, not `jwt.verify()`.

4. **Audit logs are non-blocking** — `createAuditLog()` catches errors internally. Audit failure never breaks the main operation.

5. **Intrusion detection is in-memory** — the `tracker` Map in `intrusion.ts` is per-process. Multi-instance PM2 would need Redis.

6. **Email failures are silent** — if SMTP is misconfigured, emails fail silently (logged but not thrown). App continues to function.

7. **No ENV validation on boot** — missing environment variables only fail when the feature is first used, not at startup.

8. **Seed data uses weak passwords** — demo users use `password123`. Never use seed script in production with default values.

9. **`onDelete: Cascade` on User** — deleting a `User` cascades to Sessions, Votes, Ideas, Issues. `ZKUser` link is set to `SetNull`.

10. **File uploads go to disk** — app binaries to `/var/www/deepterm-downloads/`, issues to `/var/www/deepterm-issues/`. Nginx serves downloads directly.

11. **Two session cookie names** — NextAuth uses `authjs.session-token` (HTTP) or `__Secure-authjs.session-token` (HTTPS). Always check both.

12. **Platform references** — The native app supports **Apple Silicon Macs only** (M1/M2/M3). Do not add Windows, Linux, Intel Mac, iOS, or Android platform entries to any user-facing pages.

---

## Build & Development

### Scripts
```bash
npm run dev          # Development server (port 3000)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint check
npm run db:push      # Push schema changes to database
npm run db:seed      # Seed database with test data
```

### After Schema Changes
```bash
npx prisma db push       # Apply schema changes
npx prisma generate      # Regenerate Prisma client
```

### PM2 Commands (Production)
```bash
pm2 start ecosystem.config.js --env production
pm2 logs deepterm        # View logs
pm2 restart deepterm     # Restart
pm2 reload deepterm      # Zero-downtime reload
pm2 status               # Process status
```

### Docker
```bash
docker compose up -d --build        # Start all services
docker compose logs -f app          # View app logs
docker compose exec app npx prisma db push  # Run migrations
```

---

## Deployment

### Raspberry Pi (Current)
- Setup: `sudo bash setup.sh` (automated)
- Process: PM2 single instance, 512MB max heap
- Proxy: Nginx with self-signed SSL
- Access: `https://deepterm.local`

### Docker Compose (Production)
- Services: app (Next.js) + redis + nginx
- TLS: Nginx terminates SSL
- Volumes: prisma DB, logs, SSL certs, Redis data

### Environment Variables (Required)
```env
DATABASE_URL="file:./prisma/deepterm.db"
NEXTAUTH_URL="https://deepterm.net"
NEXTAUTH_SECRET="<openssl rand -base64 32>"
X_API_KEY="<app api key>"
WEBAUTHN_RP_ID="deepterm.net"
```

See `.env.example` for the complete list.

---

## Common Pitfalls to Avoid

### DON'T Create New Auth Systems
```typescript
// WRONG — Creating custom session management
class MySessionManager { ... }

// CORRECT — Use existing auth
import { auth } from '@/lib/auth';          // Web
import { withAuth } from '@/lib/zk/middleware'; // App/vault
```

### DON'T Duplicate Database Access
```typescript
// WRONG — New PrismaClient
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

// CORRECT — Shared singleton
import { prisma } from '@/lib/prisma';
```

### DON'T Decrypt Vault Items Server-Side
```typescript
// WRONG — Server decrypting vault data
const decrypted = decrypt(vaultItem.encryptedData, key);

// CORRECT — Server stores/returns encrypted blobs as-is
return NextResponse.json({ encryptedData: vaultItem.encryptedData });
```

### DON'T Expose Admin Routes Publicly
```typescript
// WRONG — Admin endpoint without intranet check
export async function GET(request: Request) {
  return NextResponse.json(await prisma.adminUser.findMany());
}

// CORRECT — Middleware enforces intranet + admin session
// Just ensure routes are under /api/admin/ path
```

### DON'T Add Non-Apple-Silicon Platform Support
```tsx
// WRONG — Adding Windows/Linux/Intel platforms
const platforms = [
  { name: 'macOS', ... },
  { name: 'Windows', ... },  // NO!
  { name: 'Linux', ... },    // NO!
];

// CORRECT — Apple Silicon Macs only
const platforms = [
  {
    name: 'macOS',
    description: 'Native SwiftUI app for Apple Silicon Macs (M1/M2/M3)',
    requirements: 'Apple Silicon Mac (M1/M2/M3), macOS 12.0 or later',
  },
];
```

---

## Quick Reference

### Where is...?

| What | Where |
|------|-------|
| **Prisma client** | `src/lib/prisma.ts` |
| **Database schema** | `prisma/schema.prisma` |
| **NextAuth config** | `src/lib/auth.ts` |
| **Edge middleware** | `src/middleware.ts` |
| **ZK vault JWT** | `src/lib/zk/jwt.ts` |
| **ZK auth middleware** | `src/lib/zk/middleware.ts` |
| **Rate limiting** | `src/lib/zk/rate-limit.ts` |
| **Audit logging** | `src/lib/zk/audit.ts` |
| **Email service** | `src/lib/email.ts` |
| **2FA (TOTP)** | `src/lib/2fa.ts` |
| **Passkeys/WebAuthn** | `src/lib/webauthn.ts` |
| **Stripe billing** | `src/lib/stripe.ts` |
| **Intrusion detection** | `src/lib/intrusion.ts` |
| **Admin session** | `src/lib/admin-session.ts` |
| **Tailwind theme** | `tailwind.config.ts` |
| **PM2 config** | `ecosystem.config.js` |
| **Nginx config** | `nginx/deepterm.conf` |
| **Docker config** | `docker-compose.yml` + `Dockerfile` |
| **Setup script** | `setup.sh` |
| **Cockpit actions** | `src/app/api/admin/cockpit/actions/route.ts` |
| **Planning API (epics)** | `src/app/api/admin/cockpit/planning/epics/` |
| **Planning API (stories)** | `src/app/api/admin/cockpit/planning/stories/` |
| **AI Dev Mac tasks** | `src/app/api/internal/ai-dev/tasks/route.ts` |
| **AI Dev Mac status** | `src/app/api/internal/ai-dev/task-status/route.ts` |
| **Admin AI panel** | `src/components/admin/AdminAIPanel.tsx` |
| **Admin AI context** | `src/components/admin/AdminAIContext.tsx` |
| **Admin AI chat lib** | `src/lib/admin-ai/chat.ts` |
| **Admin AI tools** | `src/lib/admin-ai/tools.ts` |
| **Admin AI system prompt** | `src/lib/admin-ai/context.ts` |
| **Admin AI chat API** | `src/app/api/admin/ai/chat/route.ts` |
| **Admin AI config (DB)** | `AdminAIConfig` model — singleton, id `"singleton"` |
| **AI triage** | `src/lib/ai-triage.ts` |
| **AI activities registry** | `src/lib/ai-activities.ts` |
| **Idea detail page (user)** | `src/app/dashboard/ideas/[id]/page.tsx` |
| **Admin feedback detail** | `src/app/admin/feedback/[id]/page.tsx` |
| **Ideas API** | `src/app/api/ideas/` |
| **Issues API (web)** | `src/app/api/issues/` |
| **Admin feedback API** | `src/app/api/admin/feedback/` |
| **MCP server library** | `src/lib/mcp/server.ts` |
| **MCP API route** | `src/app/api/mcp/route.ts` |

### Internal API — AI Dev Mac

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/internal/ai-dev/tasks` | GET | `x-api-key` | Fetch planned/in-progress Stories with GitHub issue context |
| `/api/internal/ai-dev/task-status` | POST | `x-api-key` | Update Story status (planned → in_progress → done) |

**Env var:** `AI_DEV_API_KEY` (falls back to `NODE_RED_API_KEY` if not set).

### What uses what?

```
Web Dashboard ──→ NextAuth (authjs.session-token cookie)
                    └─→ prisma.user
                    └─→ src/lib/auth.ts

Desktop/Mobile App ──→ ZK JWT (Authorization: Bearer header)
                         └─→ src/lib/zk/middleware.ts
                         └─→ src/lib/zk/jwt.ts
                         └─→ prisma.zkUser, prisma.zkVault, prisma.zkVaultItem

Admin Panel ──→ Admin Session (admin-session cookie, intranet-only)
                  └─→ src/lib/admin-session.ts
                  └─→ prisma.adminUser

MCP Server ──→ ZK JWT (Authorization: Bearer header)
                 └─→ src/lib/zk/middleware.ts (getAuthFromRequest)
                 └─→ src/lib/mcp/server.ts (13 read-only tools)
                 └─→ prisma.zkUser, prisma.zkVault, prisma.zkVaultItem (metadata only)
```

### Data Flow: ZK Vault Login

```
Client: hash password → masterPasswordHash
    ↓
POST /api/zk/accounts/login (+ rate limit check)
    ↓
Server: bcrypt.compare(masterPasswordHash, storedHash)
    ↓
Generate access token (15min) + refresh token (90 days)
    ↓
Return: tokens + encrypted vault keys + user metadata
    ↓
Client: decrypt symmetric key → decrypt vault items
```

---

## Feature Integration Checklist

When adding a new API endpoint:

- [ ] Place under correct path (`/api/zk/` for vault, `/api/admin/` for admin, etc.)
- [ ] Use appropriate auth (`withAuth` for ZK, `auth()` for web, admin-session for admin)
- [ ] Add Zod validation for request body
- [ ] Return proper error format: `{ error: string, message: string }`
- [ ] Add audit logging for sensitive operations (`createAuditLog()`)
- [ ] Consider rate limiting for auth-related endpoints
- [ ] Use `prisma` singleton (not new PrismaClient)
- [ ] Handle errors with try-catch, log with `console.error()`

When adding a new page:

- [ ] Place under correct path (`/dashboard/` for protected, `/admin/` for admin)
- [ ] Use `'use client'` directive if component uses hooks/state
- [ ] Use Tailwind theme tokens (not raw colors)
- [ ] Support i18n via `useLocale()` where appropriate
- [ ] Use existing UI components from `src/components/ui/`

---

## When Context Resets

If you lose context mid-task:

1. **Read this file FIRST** — Critical decisions above
2. Check `prisma/schema.prisma` — Database models and relationships
3. Check `src/middleware.ts` — Auth routing and protection
4. Review the file you were modifying
5. Check git diff to see what changed
6. Search for existing patterns before creating new code

**Remember:**
- Three auth systems: NextAuth (web) / ZK JWT (app) / Admin session (intranet)
- Prisma singleton only: `import { prisma } from '@/lib/prisma'`
- Zero-knowledge: server never decrypts vault items
- Apple Silicon Macs only: no Windows/Linux/Intel references
- Admin panel: intranet-only, returns 404 to external IPs
- All docs go in `Documentation/` folder

---

**Last Updated:** February 21, 2026
**For:** AI Assistants working on DeepTerm Web Application
**Purpose:** Prevent code duplication and architectural violations during context resets
