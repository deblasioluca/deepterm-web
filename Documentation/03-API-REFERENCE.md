# DeepTerm — API Reference

> **For the desktop/mobile app implementation team.**
>
> This document covers every API endpoint the app needs, organized by domain. All endpoints are on `https://deepterm.net`. JSON keys are **camelCase** unless stated otherwise.

---

## Table of Contents

1. [Conventions](#conventions)
2. [Account Check & Login Flow](#1-account-check--login-flow)
3. [App Identity Endpoints](#2-app-identity-endpoints)
4. [ZK Vault Authentication](#3-zk-vault-authentication)
5. [Encryption Key Management](#4-encryption-key-management)
6. [Vault Sync](#5-vault-sync)
7. [Vault Management](#6-vault-management)
8. [Vault Items](#7-vault-items)
9. [License & Subscription](#8-license--subscription)
10. [Stripe Billing (Web Dashboard)](#9-stripe-billing-web-dashboard)
11. [Organizations](#10-organizations)
12. [In-App Support](#11-in-app-support)
13. [Downloads & Updates](#12-downloads--updates)
14. [Error Format](#error-format)
15. [Rate Limiting](#rate-limiting)
16. [Plans & Feature Reference](#plans--feature-reference)
    - [`GET /api/app/tiers` — Tier catalogue](#get-apiapptiers)

---

## Conventions

### Response Envelope

**ZK endpoints** (`/api/zk/*`) return the data object **directly** as the JSON body — there is **no** `{ "data": ... }` wrapper.

```json
// ✅ Correct: decode the body directly
{ "accessToken": "...", "refreshToken": "...", "expiresIn": 900 }

// ❌ Wrong: do NOT expect this wrapper
{ "data": { "accessToken": "...", ... } }
```

**Error responses** from ZK endpoints follow this shape:
```json
{ "error": "Unauthorized", "message": "Invalid or expired refresh token" }
```

**App endpoints** (`/api/app/*`) return raw JSON objects — shape varies per endpoint (documented below).

### Authentication Headers

| Header | When to use |
|--------|-------------|
| `x-api-key: <APP_API_KEY>` | All `/api/app/*` endpoints |
| `Authorization: Bearer <ZK accessToken>` | All `/api/zk/*` endpoints (except register, login, check, refresh) |
| `Authorization: Bearer <ZK accessToken>` | Optional on `/api/app/*` — lets you skip email/password/2FA |

### Token Lifetimes

| Token | Lifetime | Notes |
|-------|----------|-------|
| ZK access token (JWT) | 15 minutes | `expiresIn` (seconds) returned with every token pair |
| ZK refresh token | 90 days (default) | Configurable via `REFRESH_TOKEN_EXPIRY_DAYS`; rotates on each use |

---

## 1. Account Check & Login Flow

Before prompting the user for credentials, the app should call **Account Check** to determine which login flow to use.

### Decision Tree

```
POST /api/zk/accounts/check { email }
  │
  ├── loginMethod: "zk_login"
  │     User has encryption keys set up.
  │     → Show master password prompt
  │     → POST /api/zk/accounts/login
  │
  ├── loginMethod: "password_login"
  │     User exists but has no encryption keys yet.
  │     → Show web password prompt (+ 2FA if requires2FA: true)
  │     → POST /api/zk/accounts/login-password
  │     → (if requires2FA) POST /api/zk/accounts/login-password-2fa
  │     → After login, if hasKeys === false:
  │         → Generate keys client-side
  │         → POST /api/zk/accounts/keys/initialize
  │
  └── loginMethod: "register"
        No account found.
        → Show registration form
        → POST /api/zk/accounts/register
```

---

### `POST /api/zk/accounts/check`

Check if an email has an account and which login method to use.

**Auth:** None (public)

**Request:**
```json
{ "email": "user@example.com" }
```

**Response:**
```json
{
  "exists": true,
  "loginMethod": "zk_login",
  "message": "ZK vault login available",
  "kdfType": 0,
  "kdfIterations": 600000,
  "kdfMemory": null,
  "kdfParallelism": null,
  "requires2FA": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `exists` | boolean | Whether the email is registered |
| `loginMethod` | string | `"zk_login"`, `"password_login"`, or `"register"` |
| `kdfType` | number? | KDF type (only when `loginMethod === "zk_login"`): 0=PBKDF2, 1=Argon2id |
| `kdfIterations` | number? | KDF iteration count (only when `loginMethod === "zk_login"`) |
| `kdfMemory` | number? | Argon2 memory in KB (only for Argon2id) |
| `kdfParallelism` | number? | Argon2 threads (only for Argon2id) |
| `requires2FA` | boolean | Whether the user has 2FA enabled (relevant for password_login flow) |

**Errors:** `400` Email is required

---

## 2. App Identity Endpoints

These endpoints authenticate the app for **user identity + license info**. They do **not** mint ZK vault tokens or provide vault access.

> **Important:** If the app already has a valid ZK access token, use `Authorization: Bearer <token>` to skip password/2FA prompts entirely.

### `POST /api/app/register`

Create a new user account from the app.

**Auth:** `x-api-key` (required)

**Request:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "deviceInfo": { "os": "macOS", "version": "14.0", "appVersion": "1.0.0" }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Full name |
| `email` | string | Yes | Email (must be unique) |
| `password` | string | Yes | Min 8 characters |
| `deviceInfo` | object | No | Device/app metadata |

**Response (201):**
```json
{
  "success": true,
  "message": "Account created successfully",
  "user": { "id": "clxyz123", "name": "John Doe", "email": "john@example.com" },
  "license": {
    "valid": true, "plan": "free", "status": "active",
    "features": { "maxVaults": 1, "maxCredentials": 10, "teamMembers": 0, "ssoEnabled": false }
  }
}
```

**Errors:**

| Status | Error | Description |
|--------|-------|-------------|
| 400 | `Name, email, and password are required` | Missing fields |
| 400 | `Password must be at least 8 characters` | Password too short |
| 401 | `Invalid API key` | Wrong or missing `x-api-key` |
| 409 | `An account with this email already exists` | Duplicate email |

---

### `POST /api/app/login`

Login and retrieve user identity + license info.

**Auth:** `x-api-key` (required) + optional `Authorization: Bearer <ZK accessToken>`

**Request (password mode):**
```json
{
  "email": "john@example.com",
  "password": "password123",
  "twoFactorCode": "123456"
}
```

**Request (Bearer mode):**
No body required — user is derived from the ZK access token.

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "id": "clxyz123", "name": "John Doe", "email": "john@example.com",
    "role": "owner", "twoFactorEnabled": true, "createdAt": "2025-01-01T00:00:00.000Z"
  },
  "license": {
    "valid": true, "plan": "pro", "status": "active",
    "teamId": "team_abc", "teamName": "My Team", "seats": 5,
    "expiresAt": "2026-03-01T00:00:00.000Z",
    "features": {
      "maxVaults": -1, "maxCredentials": -1, "maxTeamMembers": -1,
      "ssoEnabled": true, "prioritySupport": true
    }
  }
}
```

**Errors:**

| Status | Error | Description |
|--------|-------|-------------|
| 401 | `Invalid API key` | Wrong `x-api-key` |
| 401 | `INVALID_ACCESS_TOKEN` | Bearer token expired or invalid |
| 400 | `Email and password are required` | Missing email/password in password mode |
| 404 | `User not found` | No user with that email |
| 401 | `Invalid password` | Wrong password |
| 401 | `2FA_REQUIRED` | User has 2FA; must provide `twoFactorCode` |
| 401 | `INVALID_2FA_CODE` | Wrong TOTP or backup code |

---

### `POST /api/app/validate`

Validate credentials and check license (more detailed than login).

**Auth:** `x-api-key` (required) + optional `Authorization: Bearer <ZK accessToken>`

**Request:**
```json
{
  "email": "john@example.com",
  "password": "password123",
  "twoFactorCode": "123456"
}
```

All fields optional when using Bearer auth. With Bearer, providing `email` performs a cross-check (returns `403 TOKEN_EMAIL_MISMATCH` if it doesn't match the token's user).

**Response (200):**
```json
{
  "valid": true,
  "authenticated": true,
  "user": { "id": "...", "name": "...", "email": "...", "role": "...", "twoFactorEnabled": false, "createdAt": "..." },
  "license": { "valid": true, "plan": "pro", "status": "active", "teamId": "...", "teamName": "...", "seats": 5, "expiresAt": "...", "features": { ... } }
}
```

**Errors:** Same as `/api/app/login` plus `403 TOKEN_EMAIL_MISMATCH`.

---

### `GET /api/app/tiers`

Return the full catalogue of all subscription tiers with their features, limits, and live pricing. Use this to populate upgrade/pricing screens inside the app without hardcoding plan data.

**Auth:** `x-api-key` (required)

**Request:** No body or query parameters.

**Response (200):**
```json
{
  "tiers": [
    {
      "key": "starter",
      "name": "Starter",
      "description": "For individuals getting started with DeepTerm.",
      "highlights": ["5 SSH hosts", "Basic terminal", "Single device", "Local vault"],
      "features": {
        "unlimitedHosts": false,
        "aiAssistant": false,
        "cloudVault": false,
        "allDevices": false,
        "sftpClient": false,
        "portForwarding": false,
        "prioritySupport": false,
        "teamVaults": false,
        "sso": false,
        "auditLogs": false,
        "roleBasedAccess": false
      },
      "limits": { "maxHosts": 5, "maxVaults": 1, "maxDevices": 1 },
      "pricing": {
        "monthly": { "priceCents": 0, "currency": "usd", "stripePriceId": null },
        "yearly":  { "priceCents": 0, "currency": "usd", "stripePriceId": null }
      }
    },
    {
      "key": "pro",
      "name": "Pro",
      "description": "For professional developers who need full power and cloud sync.",
      "highlights": ["Unlimited hosts", "AI terminal assistant", "Cloud encrypted vault", "..."],
      "features": { "unlimitedHosts": true, "aiAssistant": true, "cloudVault": true, "..." : true, "teamVaults": false, "sso": false, "auditLogs": false, "roleBasedAccess": false },
      "limits": { "maxHosts": -1, "maxVaults": 10, "maxDevices": -1 },
      "pricing": {
        "monthly": { "priceCents": 1299, "currency": "usd", "stripePriceId": "price_pro_monthly" },
        "yearly":  { "priceCents": 1000, "currency": "usd", "stripePriceId": "price_pro_yearly" }
      }
    }
  ]
}
```

Tiers are always returned in order: `starter → pro → team → business`.

**Field reference:**

| Field | Type | Description |
|-------|------|-------------|
| `key` | string | Plan identifier: `starter`, `pro`, `team`, or `business` |
| `name` | string | Display name |
| `description` | string | Short marketing description |
| `highlights` | string[] | Human-readable feature bullet points for display |
| `features.*` | boolean | Feature flags (same keys as `/api/zk/accounts/license`) |
| `limits.maxHosts` | number | Max SSH hosts (-1 = unlimited) |
| `limits.maxVaults` | number | Max vaults (-1 = unlimited) |
| `limits.maxDevices` | number | Max registered devices (-1 = unlimited) |
| `pricing.monthly` | object? | Monthly price info, or `null` if not available |
| `pricing.yearly` | object? | Annual price info, or `null` if not available |
| `pricing.*.priceCents` | number | Price in cents (e.g., `1299` = $12.99) |
| `pricing.*.currency` | string | ISO 4217 currency code (e.g., `"usd"`) |
| `pricing.*.stripePriceId` | string? | Stripe Price ID for initiating checkout; `null` for free tier |

**Usage:** Pricing is sourced from the admin-configurable `SubscriptionOffering` database table (same data that powers the web pricing page). If a tier has no live offering configured, `pricing.monthly` / `pricing.yearly` will be `null` for that interval.

**Errors:** `401 Invalid API key`

---

### `GET /api/app/validate`

Quick license check — no password validation.

**Auth:** `x-api-key` (required) + optional `Authorization: Bearer <ZK accessToken>`

**Query:** `?email=user@example.com` (required if no Bearer token)

**Response (200):**
```json
{
  "valid": true,
  "exists": true,
  "license": { "valid": true, "plan": "pro", "status": "active", "expiresAt": "...", "features": { ... } }
}
```

---

## 3. ZK Vault Authentication

These endpoints mint ZK access/refresh tokens and manage the vault authentication session.

### `POST /api/zk/accounts/register`

Create a new ZK vault account with encryption keys.

**Auth:** None (public)

**Request:**
```json
{
  "email": "user@example.com",
  "masterPasswordHash": "<PBKDF2(masterKey, password, 1 iteration)>",
  "protectedSymmetricKey": "<AES-256 encrypted symmetric key>",
  "publicKey": "<RSA public key PEM>",
  "encryptedPrivateKey": "<AES-256 encrypted RSA private key>",
  "kdfType": 0,
  "kdfIterations": 600000,
  "kdfMemory": null,
  "kdfParallelism": null,
  "passwordHint": "My pet's name"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | |
| `masterPasswordHash` | string | Yes | Client-side PBKDF2 hash of master password |
| `protectedSymmetricKey` | string | Yes | Symmetric key encrypted with master key |
| `publicKey` | string | Yes | RSA public key (plaintext) |
| `encryptedPrivateKey` | string | Yes | RSA private key encrypted with symmetric key |
| `kdfType` | number | No | 0 = PBKDF2 (default), 1 = Argon2id |
| `kdfIterations` | number | No | Default: 600,000 (PBKDF2) or 3 (Argon2id) |
| `kdfMemory` | number | No | Argon2 memory in KB (default: 65536 = 64MB) |
| `kdfParallelism` | number | No | Argon2 threads (default: 4) |
| `passwordHint` | string | No | Stored in plaintext for recovery |

**Response (201):**
```json
{
  "id": "zk_abc123",
  "defaultVaultId": "vault_def456",
  "encryptedSymmetricKey": "...",
  "encryptedRSAPrivateKey": "...",
  "rsaPublicKey": "..."
}
```

**Errors:** `400` missing fields, `400` invalid email, `409` email already registered.

**Notes:**
- `masterPasswordHash` is double-hashed with bcrypt (12 rounds) on the server.
- If a web User with the same email exists, the ZKUser is automatically linked to it.
- A default vault is created automatically.

---

### `POST /api/zk/accounts/login`

Login with master password hash (no web 2FA enforcement).

**Auth:** None (public). Rate-limited.

**Request:**
```json
{
  "email": "user@example.com",
  "masterPasswordHash": "<PBKDF2 hash>",
  "deviceName": "MacBook Pro",
  "deviceType": "desktop"
}
```

**Response (200):**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "abc123...",
  "expiresIn": 900,
  "protectedSymmetricKey": "...",
  "publicKey": "...",
  "encryptedPrivateKey": "...",
  "kdfType": 0,
  "kdfIterations": 600000,
  "kdfMemory": null,
  "kdfParallelism": null,
  "user": { "id": "zk_abc", "email": "user@example.com", "emailVerified": true }
}
```

**Errors:** `400` missing fields, `401` invalid credentials, `429` rate limited.

---

### `POST /api/zk/accounts/login-password`

Login with web account password. Enforces 2FA if enabled. Auto-creates/links ZK account.

**Auth:** None (public). Rate-limited.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "webPassword123",
  "deviceName": "MacBook Pro",
  "deviceType": "desktop"
}
```

**Response — Success (no 2FA) (200):**
```json
{
  "defaultVaultId": "vault_abc",
  "accessToken": "eyJ...",
  "refreshToken": "abc123...",
  "expiresIn": 900,
  "user": { "id": "zk_abc", "email": "user@example.com", "name": "John Doe", "hasKeys": true },
  "protectedSymmetricKey": "...",
  "publicKey": "...",
  "encryptedPrivateKey": "...",
  "kdfType": 0,
  "kdfIterations": 600000,
  "kdfMemory": null,
  "kdfParallelism": null,
  "device": { "id": "dev_abc", "name": "MacBook Pro", "type": "desktop" },
  "subscription": { "plan": "pro", "status": "active", "teamName": "My Team" }
}
```

**Response — 2FA Required (200):**
```json
{
  "requires2FA": true,
  "email": "user@example.com",
  "message": "Two-factor authentication required"
}
```

> **Critical:** This is a **200 OK** response, not an error. The client must detect `requires2FA: true` and prompt for the TOTP code, then call `/api/zk/accounts/login-password-2fa`.

**Response field notes:**
- `user.hasKeys`: if `false`, the client must generate encryption keys and call `POST /api/zk/accounts/keys/initialize`
- Key fields (`protectedSymmetricKey`, etc.) are only present when `hasKeys === true`
- `subscription` is `null` when no active subscription exists

**Errors:** `400` missing fields, `401` invalid credentials, `429` rate limited.

---

### `POST /api/zk/accounts/login-password-2fa`

Complete the 2FA step for password-based login.

**Auth:** None (public). Rate-limited.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "webPassword123",
  "code": "123456",
  "deviceName": "MacBook Pro",
  "deviceType": "desktop"
}
```

**Response (200):** Same shape as `login-password` success (no 2FA), plus:
```json
{
  "usedBackupCode": false,
  ...
}
```

| Field | Type | Description |
|-------|------|-------------|
| `usedBackupCode` | boolean | `true` if a backup code was used instead of TOTP |

**Errors:** `400` missing fields, `401` invalid credentials, `400` 2FA not configured, `401` invalid 2FA code, `429` rate limited.

---

### `POST /api/zk/accounts/token/refresh`

Obtain a new access token using a refresh token. **Rotates the refresh token** — the old one is invalidated.

**Auth:** None (the refresh token is the credential)

**Request:**
```json
{ "refreshToken": "abc123..." }
```

**Response (200):**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "newToken456...",
  "expiresIn": 900
}
```

**Errors:** `400` missing token, `401` invalid/expired/revoked token.

> **Important:** Both the new `accessToken` and the new `refreshToken` must be stored. The old refresh token is immediately invalid.

---

### `POST /api/zk/accounts/logout`

Revoke all sessions for the user.

**Auth:** `Authorization: Bearer <accessToken>` (required)

**Request:** No body.

**Response (200):**
```json
{ "message": "Logged out successfully" }
```

> **Warning:** This revokes **all** refresh tokens for the user across **all devices**. The user will need to re-authenticate on every device.

---

### `POST /api/zk/accounts/password/change`

Change the master password. Revokes all existing tokens and issues a new pair.

**Auth:** `Authorization: Bearer <accessToken>` (required)

**Request:**
```json
{
  "currentMasterPasswordHash": "<current hash>",
  "newMasterPasswordHash": "<new hash>",
  "newProtectedSymmetricKey": "<re-encrypted with new master key>",
  "newEncryptedPrivateKey": "<re-encrypted with new key>",
  "kdfIterations": 600000,
  "kdfType": 0,
  "kdfMemory": null,
  "kdfParallelism": null
}
```

**Response (200):**
```json
{
  "message": "Password changed successfully",
  "accessToken": "eyJ...",
  "refreshToken": "newToken...",
  "expiresIn": 900
}
```

> The response includes a new token pair — the client should store these immediately. All other sessions are revoked.

---

## 4. Encryption Key Management

### `GET /api/zk/accounts/keys`

Retrieve the user's encryption keys.

**Auth:** `Authorization: Bearer <accessToken>`

**Response (200):**
```json
{
  "publicKey": "...",
  "encryptedPrivateKey": "...",
  "protectedSymmetricKey": "...",
  "kdfType": 0,
  "kdfIterations": 600000,
  "kdfMemory": null,
  "kdfParallelism": null
}
```

---

### `POST /api/zk/accounts/keys`

Update encryption keys (e.g., after key rotation).

**Auth:** `Authorization: Bearer <accessToken>`

**Request:**
```json
{
  "protectedSymmetricKey": "...",
  "encryptedPrivateKey": "...",
  "masterPasswordHash": "...",
  "kdfType": 0,
  "kdfIterations": 600000,
  "kdfMemory": null,
  "kdfParallelism": null
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `protectedSymmetricKey` | string | Yes | New encrypted symmetric key |
| `encryptedPrivateKey` | string | Yes | New encrypted private key |
| `masterPasswordHash` | string | No | If provided, enables master password login; also triggers KDF param update |
| `kdfType`/`kdfIterations`/... | number | No | Only updated when `masterPasswordHash` is also provided |

**Response (200):** `{ "message": "Keys updated successfully" }`

---

### `POST /api/zk/accounts/keys/initialize`

First-time key setup for users created via `login-password` (where `hasKeys === false`).

**Auth:** `Authorization: Bearer <accessToken>`

**Request:**
```json
{
  "protectedSymmetricKey": "...",
  "publicKey": "...",
  "encryptedPrivateKey": "...",
  "masterPasswordHash": "...",
  "kdfType": 0,
  "kdfIterations": 600000
}
```

**Response (200):**
```json
{ "message": "Encryption keys initialized successfully", "hasKeys": true }
```

**Errors:** `400` missing fields, `400` keys already initialized (use password change to rotate), `404` user not found.

---

### `GET /api/zk/accounts/keys/initialize`

Check whether the user has keys set up.

**Auth:** `Authorization: Bearer <accessToken>`

**Response (200):**
```json
{
  "hasKeys": true,
  "publicKey": "...",
  "protectedSymmetricKey": "...",
  "encryptedPrivateKey": "...",
  "kdf": { "type": 0, "iterations": 600000, "memory": null, "parallelism": null }
}
```

---

## 5. Vault Sync

### `GET /api/zk/sync`

Full or delta sync of all vault data.

**Auth:** `Authorization: Bearer <accessToken>`

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `since` | ISO 8601 | — | If provided, returns only items updated since this timestamp (delta sync) |
| `excludeDeleted` | boolean | `false` | If `true`, omit soft-deleted items |

**Response (200):**
```json
{
  "profile": {
    "id": "zk_abc",
    "email": "user@example.com",
    "publicKey": "...",
    "encryptedPrivateKey": "...",
    "protectedSymmetricKey": "...",
    "kdfType": 0,
    "kdfIterations": 600000,
    "kdfMemory": null,
    "kdfParallelism": null,
    "emailVerified": true,
    "createdAt": "...",
    "updatedAt": "..."
  },
  "organizations": [
    { "id": "org_1", "name": "Acme Corp", "role": "admin", "encryptedOrgKey": "...", "plan": "premium", "maxMembers": 50, "maxVaults": 100 }
  ],
  "defaultVaultId": "vault_abc",
  "vaults": [
    { "id": "vault_abc", "name": "<encrypted>", "userId": "zk_abc", "organizationId": null, "isDefault": true, "isPersonal": true, "createdAt": "...", "updatedAt": "..." }
  ],
  "items": [
    { "id": "item_1", "vaultId": "vault_abc", "encryptedData": "<encrypted JSON>", "revisionDate": "...", "deletedAt": null, "createdAt": "...", "updatedAt": "..." }
  ],
  "devices": [
    { "id": "dev_1", "name": "MacBook Pro", "deviceType": "desktop", "lastActive": "...", "createdAt": "..." }
  ],
  "serverTimestamp": "2026-02-19T12:00:00.000Z"
}
```

**Sync protocol:**
1. First sync: call without `since` → full sync
2. Store `serverTimestamp` from the response
3. Subsequent syncs: pass `?since=<serverTimestamp>` → delta sync (only changed items)
4. All vaults are always returned (lightweight), but items are filtered by timestamp
5. Soft-deleted items (with `deletedAt`) are included by default — use this to remove local copies
6. If no default vault exists, the server auto-creates one

---

### `POST /api/zk/vault-items/bulk`

Batch create, update, and delete vault items in a single request.

**Auth:** `Authorization: Bearer <accessToken>`

**Request:**
```json
{
  "create": [
    { "id": "client-uuid-1", "vaultId": "vault_abc", "encryptedData": "<encrypted>", "clientId": "local_ref_1" }
  ],
  "update": [
    { "id": "item_existing", "encryptedData": "<new encrypted data>", "revisionDate": "2026-02-19T00:00:00.000Z" }
  ],
  "delete": [
    { "id": "item_to_delete", "permanent": false }
  ]
}
```

**Create fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | No | Client-generated UUID. If exists on server, **upserts** (updates). This is the recommended way to prevent duplicates. |
| `vaultId` | string | Yes | Target vault |
| `encryptedData` | string | Yes | Encrypted JSON blob (contains type, name, host, credentials, etc.) |
| `clientId` | string | No | Local reference ID (returned in response for correlation) |

**Update fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Server item ID |
| `revisionDate` | string | No | For optimistic concurrency — if provided and doesn't match server's, reported as conflict |
| All other fields | | No | Only provided fields are updated |

**Delete fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Server item ID |
| `permanent` | boolean | No | `true` = hard delete; `false` (default) = soft delete (sets `deletedAt`) |

**Response (200):**
```json
{
  "created": [{ "id": "item_new1", "clientId": "local_ref_1", "revisionDate": "..." }],
  "updated": [{ "id": "item_existing", "revisionDate": "..." }],
  "deleted": ["item_to_delete"],
  "conflicts": [{ "id": "item_existing", "currentRevisionDate": "...", "operation": "update" }],
  "errors": [{ "id": "item_bad", "error": "Vault not found", "operation": "create" }]
}
```

**Important behaviors:**
- Per-item errors don't fail the whole request — they appear in `errors`
- Create with existing `id` in the same vault → upsert (update)
- Create with existing `id` in a different vault → error
- Deduplication: `(vaultId, encryptedData)` match → returns existing item silently
- Conflicts: `revisionDate` mismatch → item appears in `conflicts` (server version wins)

---

## 6. Vault Management

### `GET /api/zk/vaults`

List all vaults the user has access to.

**Auth:** `Authorization: Bearer <accessToken>`

**Response (200):**
```json
[
  {
    "id": "vault_abc",
    "name": "<encrypted>",
    "userId": "zk_abc",
    "organizationId": null,
    "organizationName": null,
    "isPersonal": true,
    "itemCount": 42,
    "createdAt": "...",
    "updatedAt": "..."
  }
]
```

Includes personal vaults + organization vaults where the user has confirmed membership. `itemCount` excludes soft-deleted items.

---

### `POST /api/zk/vaults`

Create a new vault.

**Auth:** `Authorization: Bearer <accessToken>`

**Request:**
```json
{ "name": "<encrypted vault name>", "organizationId": "org_abc" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Encrypted vault name |
| `organizationId` | string | No | If provided, creates an org vault (requires owner/admin role) |

**Response (201):** `{ "id": "vault_new" }`

**Errors:** `400` name required, `403` insufficient org permissions, `403` org vault limit reached.

---

## 7. Vault Items

### `GET /api/zk/vault-items`

List vault items.

**Auth:** `Authorization: Bearer <accessToken>`

**Query:** `?vaultId=<id>` (optional filter), `?includeDeleted=true` (optional)

**Response (200):**
```json
[
  { "id": "item_1", "vaultId": "vault_abc", "encryptedData": "<encrypted>", "revisionDate": "...", "deletedAt": null, "createdAt": "...", "updatedAt": "..." }
]
```

---

### `POST /api/zk/vault-items`

Create a single vault item.

**Auth:** `Authorization: Bearer <accessToken>`

**Request:**
```json
{
  "id": "client-uuid",
  "vaultId": "vault_abc",
  "encryptedData": "<encrypted>"
}
```

**Response (201):** `{ "id": "item_new", "revisionDate": "..." }`

**Notes:** Deduplication by `(vaultId, encryptedData)` — returns existing item with 200 if match found. If `id` is provided and exists in the same vault, upserts.

---

### Encrypted Data Schema

After client-side decryption, vault item `encryptedData` contains:

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
  "notes": "Production web server",
  "tags": ["production", "web"]
}
```

**Item types (inside encrypted blob):**

| Type | Value | Key fields |
|------|-------|------------|
| SSH Password | 0 | host, port, username, password |
| SSH Key | 1 | host, port, username, privateKey, passphrase |
| SSH Certificate | 2 | host, port, username, certificate, privateKey |

> **Note:** `type` and `name` exist only inside the encrypted blob. The server has no metadata columns for these — it stores only the opaque `encryptedData` field.

---

## 8. License & Subscription

### `GET /api/zk/accounts/license`

**Primary endpoint** for the app to check subscription status and feature availability.

**Auth:** `Authorization: Bearer <accessToken>` (ZK token — no `x-api-key` needed)

**Response (200):**
```json
{
  "user": { "id": "zk_abc", "email": "user@example.com", "name": "John Doe" },
  "license": {
    "valid": true,
    "plan": "pro",
    "status": "active",
    "expiresAt": "2026-03-19T00:00:00.000Z",
    "currentPeriodStart": "2026-02-19T00:00:00.000Z",
    "currentPeriodEnd": "2026-03-19T00:00:00.000Z",
    "cancelAtPeriodEnd": false,
    "seats": 1,
    "teamId": "team_xyz",
    "teamName": "My Team",
    "source": "stripe"
  },
  "features": {
    "unlimitedHosts": true,
    "aiAssistant": true,
    "cloudVault": true,
    "allDevices": true,
    "sftpClient": true,
    "portForwarding": true,
    "prioritySupport": true,
    "teamVaults": false,
    "sso": false,
    "auditLogs": false,
    "roleBasedAccess": false
  },
  "limits": {
    "maxHosts": -1,
    "maxVaults": 10,
    "maxDevices": -1
  }
}
```

**Field reference:**

| Field | Type | Description |
|-------|------|-------------|
| `license.valid` | boolean | Whether the user has an active paid subscription |
| `license.plan` | string | `starter`, `pro`, `team`, or `business` |
| `license.status` | string | `active`, `trialing`, `past_due`, `canceled`, `free` |
| `license.source` | string | `stripe`, `apple`, or `none` |
| `license.expiresAt` | string? | ISO 8601 end of current period (latest of Stripe/Apple) |
| `license.currentPeriodStart` | string? | ISO 8601 billing period start |
| `license.currentPeriodEnd` | string? | ISO 8601 billing period end |
| `license.cancelAtPeriodEnd` | boolean | `true` = subscription won't renew |
| `license.seats` | number | Seats in the plan |
| `license.teamId` | string? | Team ID (null for individual) |
| `license.teamName` | string? | Team name |
| `features.*` | boolean | Feature flags — use to gate app functionality |
| `limits.maxHosts` | number | Max SSH hosts (-1 = unlimited) |
| `limits.maxVaults` | number | Max vaults (-1 = unlimited) |
| `limits.maxDevices` | number | Max devices (-1 = unlimited) |

**Usage:**
- Call on app startup (after ZK auth)
- Call after plan changes
- Call periodically (e.g., alongside token refresh every 15 minutes)
- When both Stripe and Apple IAP are active, the higher-tier plan applies

---

## 9. Stripe Billing (Web Dashboard)

These endpoints are used by the **web dashboard** (not the app) and require a NextAuth session cookie.

### `POST /api/stripe/checkout`

Create a Stripe checkout session for purchasing a subscription.

**Auth:** NextAuth session cookie

**Request:**
```json
{ "plan": "pro", "billingPeriod": "yearly", "seats": 1 }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `plan` | string | Yes | `pro`, `team`, or `business` |
| `billingPeriod` | string | No | `monthly` or `yearly` (default: `yearly`) |
| `seats` | number | No | Number of seats (default: 1) |

**Response (200):** `{ "url": "https://checkout.stripe.com/...", "sessionId": "cs_..." }`

---

### `GET /api/stripe/subscription`

Get current subscription details.

**Auth:** NextAuth session cookie

**Response (200):**
```json
{
  "subscription": {
    "status": "active",
    "currentPeriodStart": "...",
    "currentPeriodEnd": "...",
    "cancelAtPeriodEnd": false
  },
  "plan": "pro",
  "seats": 5,
  "usedSeats": 3,
  "members": [{ "id": "...", "name": "...", "email": "...", "role": "owner" }],
  "invoices": [...],
  "paymentMethod": { "brand": "visa", "last4": "4242", "expMonth": 12, "expYear": 2027 }
}
```

Returns `{ subscription: null, plan: "starter", seats: 0, usedSeats: 0 }` when no subscription exists.

---

### `PATCH /api/stripe/subscription`

Manage subscription (cancel, resume, change seats/plan).

**Auth:** NextAuth session cookie. User must be `owner` or `admin`.

**Request:**
```json
{ "action": "change_plan", "plan": "team", "billingPeriod": "yearly" }
```

| Action | Additional fields | Description |
|--------|-------------------|-------------|
| `cancel` | — | Cancel at end of current period |
| `resume` | — | Reverse cancellation |
| `update_seats` | `seats: number` | Change seat count (min = current member count) |
| `change_plan` | `plan`, `billingPeriod` | Upgrade/downgrade to `pro`, `team`, or `business` |

---

### `POST /api/stripe/portal`

Get a Stripe Customer Portal URL for self-service billing management.

**Auth:** NextAuth session cookie

**Response (200):** `{ "url": "https://billing.stripe.com/p/session/..." }`

---

### `GET /api/stripe/payment-methods`

List saved payment methods.

**Auth:** NextAuth session cookie

**Response (200):**
```json
{
  "paymentMethods": [
    { "id": "pm_local_id", "stripeId": "pm_stripe_id", "type": "card", "brand": "visa", "last4": "4242", "expMonth": 12, "expYear": 2027, "email": null, "walletType": null, "isDefault": true, "createdAt": "..." }
  ]
}
```

---

### `POST /api/stripe/payment-methods`

Add a new payment method.

**Auth:** NextAuth session cookie

**Request (SetupIntent mode):**
```json
{ "action": "create_setup_intent" }
```
**Response:** `{ "clientSecret": "seti_..._secret_...", "setupIntentId": "seti_..." }`

**Request (Checkout mode):** Empty body or omit `action`.
**Response:** `{ "url": "https://checkout.stripe.com/...", "sessionId": "cs_..." }`

---

### `PATCH /api/stripe/payment-methods`

Set default payment method.

**Auth:** NextAuth session cookie. User must be `owner` or `admin`.

**Request:** `{ "paymentMethodId": "pm_local_id", "action": "set_default" }`

---

### `DELETE /api/stripe/payment-methods`

Remove a payment method.

**Auth:** NextAuth session cookie. User must be `owner` or `admin`.

**Query:** `?id=<paymentMethodId>`

---

## 10. Organizations

### `GET /api/zk/organizations`

List organizations the user belongs to.

**Auth:** `Authorization: Bearer <accessToken>`

**Response (200):** Array of organizations with member count and user's role.

---

### `POST /api/zk/organizations`

Create a new organization.

**Auth:** `Authorization: Bearer <accessToken>`

**Request:** `{ "name": "Acme Corp", "billingEmail": "billing@acme.com" }`

---

### Organization Members

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/zk/organizations/{orgId}/members` | GET | List members |
| `/api/zk/organizations/{orgId}/members` | POST | Invite member (`{ email, role, encryptedOrgKey }`) |
| `/api/zk/organizations/{orgId}/members` | PATCH | Update role / confirm membership |
| `/api/zk/organizations/{orgId}/members` | DELETE | Remove member (`?userId=...`) |

**Roles:** `owner`, `admin`, `member`, `readonly`

**Membership lifecycle:** invited → accepted → confirmed → (revoked)

---

### Organization Audit Log

`GET /api/zk/organizations/{orgId}/audit-log`

**Query:** `?page=1&limit=50&eventType=vault_item_created&start=2026-01-01&end=2026-12-31`

**Response (200):**
```json
{
  "data": [{ "id": "...", "userId": "...", "userEmail": "...", "eventType": "vault_item_created", "targetType": "vault_item", "targetId": "...", "ipAddress": "...", "timestamp": "..." }],
  "total": 100, "page": 1, "limit": 50, "totalPages": 2
}
```

---

## 11. In-App Support

### `POST /api/app/issues/submit`

Submit a bug report from the app.

**Auth:** `x-api-key` (required). Optionally `Authorization: Bearer <ZK accessToken>` (recommended) or email + password in form fields.

**Content-Type:** `multipart/form-data`

**Form fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | If no Bearer | User email |
| `password` | string | If no Bearer | User password |
| `twoFactorCode` | string | If 2FA enabled + no Bearer | TOTP / backup code |
| `title` | string | Yes | Short summary |
| `description` | string | Yes | Full description / steps to reproduce |
| `area` | string | No | `General`, `SSH Remote Connection`, `SFTP`, `Vault`, `AI Assistant`, `Other` |
| `screenshots` | file[] | No | Up to 5 image files |
| `log` | file | No | Log file |

**Limits:** Max 5 screenshots, 25MB total attachments.

**Response (200):**
```json
{ "success": true, "message": "Issue submitted successfully", "issue": { "id": "clxyz...", "status": "open" } }
```

---

## 12. Downloads & Updates

### `GET /api/downloads/releases`

Get available app releases.

### `GET /api/downloads/info`

Get current download page info and latest version.

---

## Error Format

### ZK API errors (`/api/zk/*`)

```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired refresh token"
}
```

### App API errors (`/api/app/*`)

```json
{ "error": "Invalid API key" }
```
or
```json
{ "success": false, "error": "User not found" }
```

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation errors) |
| 401 | Unauthorized (auth failure) |
| 403 | Forbidden (permission denied, token mismatch) |
| 404 | Not Found |
| 409 | Conflict (duplicate, vault mismatch) |
| 429 | Too Many Requests (rate limited) |
| 500 | Internal Server Error |

---

## Rate Limiting

Authentication endpoints (`/api/zk/accounts/login*`) are rate-limited:

| Setting | Value |
|---------|-------|
| Window | 15 minutes |
| Max attempts | 5 per email+IP combination |
| Block duration | 30 seconds after exceeding |

**Rate limit headers:**
```http
X-RateLimit-Remaining: 4
X-RateLimit-Reset: 2026-01-01T00:15:00Z
Retry-After: 900
```

---

## Plans & Feature Reference

> **Note:** For machine-readable plan data at runtime, call [`GET /api/app/tiers`](#get-apiapptiers). The tables below are a static reference; actual prices served to the app always reflect the current live configuration.

### Plans

| Plan | Price (Annual) | Price (Monthly) |
|------|---------------|-----------------|
| Starter | Free | Free |
| Pro | $10/user/mo | $12.99/user/mo |
| Team | $20/user/mo | $24.99/user/mo |
| Business | $30/user/mo | $39.99/user/mo |

### Feature Flags (from `/api/zk/accounts/license` and `/api/app/tiers`)

| Feature | Starter | Pro | Team | Business |
|---------|---------|-----|------|----------|
| `unlimitedHosts` | false | true | true | true |
| `aiAssistant` | false | true | true | true |
| `cloudVault` | false | true | true | true |
| `allDevices` | false | true | true | true |
| `sftpClient` | false | true | true | true |
| `portForwarding` | false | true | true | true |
| `prioritySupport` | false | true | true | true |
| `teamVaults` | false | false | true | true |
| `sso` | false | false | true | true |
| `auditLogs` | false | false | true | true |
| `roleBasedAccess` | false | false | false | true |

### Limits (from `/api/zk/accounts/license`)

| Limit | Starter | Pro | Team | Business |
|-------|---------|-----|------|----------|
| `maxHosts` | 5 | -1 | -1 | -1 |
| `maxVaults` | 1 | 10 | -1 | -1 |
| `maxDevices` | 1 | -1 | -1 | -1 |

(-1 = unlimited)

### Subscription Status Values

| Status | Description |
|--------|-------------|
| `active` | Subscription is active and valid |
| `trialing` | User is on a trial period |
| `past_due` | Payment failed, grace period active |
| `canceled` | Subscription has been canceled |
| `incomplete` | Initial payment pending |
| `free` | No subscription (Starter plan) |
