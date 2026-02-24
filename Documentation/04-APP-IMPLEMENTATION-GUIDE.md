# DeepTerm — App Implementation Guide

> **For the macOS / iOS / desktop app team.**
>
> This guide covers how the native app should implement authentication, vault encryption, sync, biometric unlock, and token persistence. All server-side endpoints are documented in [03-API-REFERENCE.md](03-API-REFERENCE.md).

---

## Table of Contents

1. [Core Principles](#1-core-principles)
2. [Login Flow](#2-login-flow)
3. [Account Check Decision Tree](#3-account-check-decision-tree)
4. [Cryptographic Key Derivation](#4-cryptographic-key-derivation)
5. [Key Initialization (First-Time Setup)](#5-key-initialization-first-time-setup)
6. [Token Management](#6-token-management)
7. [Vault Sync](#7-vault-sync)
8. [Biometric Unlock](#8-biometric-unlock)
9. [App Identity (License Checks)](#9-app-identity-license-checks)
    - [Tier Catalogue (GET /api/app/tiers)](#tier-catalogue-available-plans--pricing)
10. [Multi-Device Login](#10-multi-device-login)
11. [Sign-In vs Unlock (UX Semantics)](#11-sign-in-vs-unlock-ux-semantics)
12. [Credential Storage Reference](#12-credential-storage-reference)
13. [Error Handling & Diagnostics](#13-error-handling--diagnostics)
14. [Implementation Checklist](#14-implementation-checklist)

---

## 1. Core Principles

1. **One account, one login.** The user never sees "vault account" vs "web account." There is one DeepTerm account. Behind the scenes, authentication touches two systems (identity + encrypted vault), but this is invisible to the user.

2. **Password field is always "Password."** Never label it "Master Password." The app derives the cryptographic master key from the user's password behind the scenes.

3. **2FA is prompted at most once per session.** After the initial 2FA-authenticated login, the refresh token proves prior authentication. The user is never asked for 2FA again until the refresh token expires or is revoked.

4. **No response envelope wrapper.** All `/api/zk/*` endpoints return JSON objects directly — **not** wrapped in `{ "data": ... }`. Client decoders must not require a `data` wrapper.

---

## 2. Login Flow

### Overview

```
┌────────────────────────────────────────────────────────────────┐
│                       APP LAUNCH                               │
│                                                                │
│  1. Read refreshToken from Keychain                            │
│     ├── Found → POST /accounts/token/refresh                   │
│     │   ├── Success → tokens valid, skip to step 3             │
│     │   └── 401 → delete tokens, show login screen             │
│     └── Not found → show login screen                          │
│                                                                │
│  2. Login screen: email + password (+ 2FA if required)         │
│     → POST /accounts/check → determine login method            │
│     → authenticate → receive tokens + encryption keys          │
│                                                                │
│  3. Vault unlock                                               │
│     ├── Biometric key in Keychain → prompt biometrics          │
│     └── No biometric key → derive from password in memory      │
│                                                                │
│  4. GET /sync → full vault sync                                │
│  5. GET /accounts/license → feature flags + plan info          │
└────────────────────────────────────────────────────────────────┘
```

### Step-by-Step: Fresh Login (No 2FA)

1. User enters email and password.
2. App calls `POST /api/zk/accounts/check` with `{ email }`.
3. Server returns `loginMethod`:
   - `"zk_login"` → user has encryption keys. Derive `masterPasswordHash` client-side, call `POST /api/zk/accounts/login`.
   - `"password_login"` → user has a web account but no encryption keys yet. Call `POST /api/zk/accounts/login-password` with plaintext password.
   - `"register"` → no account. Show registration form.
4. Server returns `accessToken`, `refreshToken`, and encryption keys.
5. Store `refreshToken` in Keychain (device-only).
6. If `user.hasKeys === false`: generate encryption keys and call `POST /api/zk/accounts/keys/initialize` (see [Section 5](#5-key-initialization-first-time-setup)).
7. Decrypt vault keys in memory using the derived master key.
8. Call `GET /api/zk/sync` for full vault sync.

### Step-by-Step: Fresh Login (With 2FA)

1. User enters email and password.
2. `POST /api/zk/accounts/check` returns `loginMethod: "password_login"` and `requires2FA: true`.
3. App calls `POST /api/zk/accounts/login-password` → server returns **200 OK** with `{ requires2FA: true }`.
   > **Critical:** This is a success response (200), not an error. Detect `requires2FA: true` in the response body.
4. App shows 2FA input field.
5. User enters TOTP code (or backup code).
6. App calls `POST /api/zk/accounts/login-password-2fa` with email, password, and code.
7. Continue from step 4 of the "No 2FA" flow.

### Step-by-Step: App Relaunch (Token Exists)

1. Read `refreshToken` from Keychain.
2. Call `POST /api/zk/accounts/token/refresh`.
3. If success: store new `refreshToken`, keep `accessToken` in memory.
4. If biometric unlock is enabled: prompt biometrics → read vault unlock key from Keychain → unlock vault.
5. If biometric unlock is disabled: prompt for password → derive master key → unlock vault.
6. No 2FA required.

### Step-by-Step: Access Token Expired

1. An API call returns `401`.
2. Call `POST /api/zk/accounts/token/refresh` with stored `refreshToken`.
3. Store the new token pair (both access and refresh tokens are rotated).
4. Retry the failed API call with the new `accessToken`.
5. If refresh also fails with `401`: clear tokens, show login screen.

### Step-by-Step: Password Change

1. User changes password in app.
2. App re-derives all encryption keys with the new password.
3. App calls `POST /api/zk/accounts/password/change`.
4. Server revokes **all** refresh tokens on **all** devices and returns a new token pair.
5. App stores the new token pair immediately. All other devices are signed out.

### Step-by-Step: Logout

1. App calls `POST /api/zk/accounts/logout`.
2. Server revokes all refresh tokens for the user on **all devices**.
3. App deletes `refreshToken` and `wrappedVaultKey` from Keychain.
4. App clears all in-memory keys.
5. User must re-authenticate (with password + 2FA) on every device.

> **Lock vs Logout:** If you want "lock vault" (local only), do **not** call the server logout endpoint. Just clear the in-memory symmetric key and show "Unlock vault." Tokens remain valid.

---

## 3. Account Check Decision Tree

```
POST /api/zk/accounts/check { email }
  │
  ├── loginMethod: "zk_login"
  │     User's encryption keys are set up.
  │     Response includes: kdfType, kdfIterations, kdfMemory, kdfParallelism
  │     → Derive masterKey from password using returned KDF params
  │     → Derive masterPasswordHash = PBKDF2(masterKey, password, 1 iter)
  │     → POST /api/zk/accounts/login { email, masterPasswordHash, deviceName, deviceType }
  │
  ├── loginMethod: "password_login"
  │     User has a web account but no encryption keys.
  │     Response includes: requires2FA
  │     → POST /api/zk/accounts/login-password { email, password, deviceName, deviceType }
  │     → If response has requires2FA: true → prompt for code
  │     → POST /api/zk/accounts/login-password-2fa { email, password, code, deviceName, deviceType }
  │     → If response.user.hasKeys === false → generate keys (Section 5)
  │
  └── loginMethod: "register"
        No account found.
        → Show registration screen
        → POST /api/zk/accounts/register (with keys generated client-side)
```

---

## 4. Cryptographic Key Derivation

### Key Hierarchy

```
  User Password + Email (as salt, lowercased)
          │
          ▼
  ┌─────────────────────────────────────┐
  │ PBKDF2-SHA256 (600,000 iterations)  │  ← or Argon2id (3 iter, 64MB, 4 threads)
  │ OR per user's kdfType               │
  └───────────────┬─────────────────────┘
                  │
                  ▼
           Master Key (256-bit)
           │         │
           │         ▼
           │   PBKDF2-SHA256(masterKey, password, 1 iteration)
           │         │
           │         ▼
           │   masterPasswordHash → sent to server (never stored client-side)
           │
           ▼
    ┌──────────────────────┐
    │ Decrypt              │
    │ protectedSymmetricKey│ → Symmetric Key (512-bit)
    │ using AES-256-CBC    │
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ Decrypt              │
    │ encryptedPrivateKey  │ → RSA Private Key
    │ using AES-256-CBC    │
    └──────────────────────┘
```

### KDF Parameters

| KDF Type | Value | Iterations | Memory | Parallelism |
|----------|-------|------------|--------|-------------|
| PBKDF2-SHA256 | 0 | 600,000 | — | — |
| Argon2id | 1 | 3 | 65,536 KB (64 MB) | 4 |

The KDF parameters are returned by the server in the `/accounts/check` response (for `zk_login`) and in login responses. **Always use the server-provided values**, not hardcoded defaults.

### Master Password Hash

The `masterPasswordHash` is a **double derivation**:

```
masterKey     = KDF(password, email, iterations)        ← expensive (600K or Argon2id)
passwordHash  = PBKDF2-SHA256(masterKey, password, 1)   ← cheap (1 iteration)
```

The server then bcrypt-hashes the `passwordHash` for storage. The original password never touches the server.

---

## 5. Key Initialization (First-Time Setup)

When `login-password` returns `user.hasKeys === false`, the app must generate encryption keys transparently.

### Steps

```
1. masterKey = KDF(password, email.lowercase(), 600,000)
2. symmetricKey = random(64 bytes = 512 bits)
3. protectedSymmetricKey = AES-256-CBC-Encrypt(symmetricKey, masterKey) + HMAC
4. (publicKey, privateKey) = RSA-2048-GenerateKeyPair()
5. encryptedPrivateKey = AES-256-CBC-Encrypt(privateKey, symmetricKey)
6. masterPasswordHash = PBKDF2-SHA256(masterKey, password, 1 iteration)
7. POST /api/zk/accounts/keys/initialize {
     protectedSymmetricKey, publicKey, encryptedPrivateKey,
     masterPasswordHash, kdfType: 0, kdfIterations: 600000
   }
8. Save masterKey, symmetricKey to protected memory / Keychain for session use.
9. Clear password from memory.
```

### UX During Key Setup

Show a brief spinner ("Setting up your vault..."). This takes 1-2 seconds. The user does not need to do anything.

After key initialization, future logins for this user will return `loginMethod: "zk_login"` from `/accounts/check`, and the app will use the `masterPasswordHash` flow.

---

## 6. Token Management

### Token Types

| Token | Storage | Purpose | Lifetime |
|-------|---------|---------|----------|
| ZK Access Token (JWT) | Memory only | Authorize all `/api/zk/*` calls | 15 minutes (`expiresIn: 900`) |
| ZK Refresh Token | Keychain (device-only) | Obtain new access token | 90 days default (server-configurable) |

### Storage Rules

- **Access token:** Memory only. Optionally in Keychain for quick resume, but not required.
- **Refresh token:** Keychain with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`. Never synced to iCloud Keychain.
- **Never store:** email, password, 2FA codes, master key (persistently), decrypted private key (on disk).

### Refresh Token Rotation

The refresh token **rotates** on every use. After calling `/accounts/token/refresh`:
- The old refresh token is immediately invalid.
- You receive a new `accessToken` AND a new `refreshToken`.
- **Both** must be stored / updated.

### HTTP Interceptor Pattern

```
On any API call returning 401:
  1. Call POST /accounts/token/refresh with stored refreshToken
  2. If success:
     - Store new refreshToken in Keychain
     - Keep new accessToken in memory
     - Retry the original request with new accessToken
  3. If refresh fails (401):
     - Delete all tokens from Keychain
     - Show login screen
     - Do NOT retry
```

---

## 7. Vault Sync

### Full Sync (First Launch / New Device)

```
GET /api/zk/sync
Authorization: Bearer <accessToken>
```

Response includes: `profile`, `vaults`, `items`, `devices`, `organizations`, `serverTimestamp`.

- All `encryptedData` fields are opaque encrypted blobs. Decrypt with the symmetric key to access type, name, host, credentials, etc.
- Store `serverTimestamp` for subsequent delta syncs.

### Delta Sync (Subsequent Syncs)

```
GET /api/zk/sync?since=<serverTimestamp>
```

- Returns only items modified since the timestamp.
- All vaults are always returned (they're lightweight).
- Soft-deleted items (with `deletedAt`) are included — use them to remove local copies.

### Pushing Changes

```
POST /api/zk/vault-items/bulk
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "create": [...],
  "update": [...],
  "delete": [...]
}
```

**Deduplication strategies:**
- Set `id` on create operations with a client-generated UUID. If the server already has that ID in the same vault, it upserts.
- The server also deduplicates by `(vaultId, encryptedData)` — returns the existing item silently.

**Conflict resolution:** If `revisionDate` is provided on an update and doesn't match the server's version, the item appears in the `conflicts` array. Server version wins.

### Sync Cadence

- Full sync on first launch / new device.
- Delta sync after push, at regular intervals (e.g., every 5 minutes), and on app resume.

---

## 8. Biometric Unlock

### Goal

After initial login, the user can unlock the vault using Face ID / Touch ID (with device passcode fallback) without re-entering the password.

### Architecture

```
┌──────────────────────────────────┐     ┌──────────────────────────────┐
│  AUTHENTICATION (server)         │     │  VAULT UNLOCK (local only)   │
│                                  │     │                              │
│  refreshToken in Keychain        │     │  wrappedVaultKey in Keychain │
│  → POST /token/refresh           │     │  protected by .userPresence  │
│  → No 2FA, no password           │     │  → biometric prompt          │
│  → Returns new access token      │     │  → vault keys in memory      │
│                                  │     │                              │
│  Server doesn't know about       │     │  Server doesn't know about   │
│  biometrics                      │     │  biometrics                  │
└──────────────────────────────────┘     └──────────────────────────────┘
```

### Setting: "Unlock with Face ID / Touch ID"

Toggle in app preferences. When enabled:

**On successful password unlock:**
1. Obtain the vault unlock key (the derived master key or symmetric key) in memory.
2. Store it in Keychain with `SecAccessControl`:
   - Accessibility: `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
   - Flags: `.userPresence` (biometrics with device passcode fallback)
   - Service: `net.deepterm.zk`
   - Account: `wrappedVaultKey:<userId>`
3. Clear password from memory.

**On subsequent app launch:**
1. Refresh the server token (no password/2FA needed).
2. Attempt Keychain read of `wrappedVaultKey` — triggers biometric/passcode prompt.
3. If success: load vault keys into memory → vault is unlocked.
4. If user cancels or fails: show "Enter password" fallback.

### When Biometric Enrollment Changes

If the Keychain item becomes invalid (e.g., fingerprint added/removed):
- Treat as locked.
- Prompt for password.
- After successful unlock, re-save the wrapped vault key.

### What to Store in Keychain

| Item | Keychain Protection | Purpose |
|------|-------------------|---------|
| `refreshToken` | `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` | Server auth on relaunch |
| `wrappedVaultKey` | `.userPresence` + `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` | Vault unlock via biometrics |
| `userId`, `email` | UserDefaults (non-secret) | Pre-fill UI, Keychain key construction |

### What to NEVER Store

| Item | Reason |
|------|--------|
| Password / master password | Derived keys are sufficient |
| Derived master key (on disk, unprotected) | Must be biometric-protected or memory-only |
| Decrypted private key | Must only exist in memory |
| 2FA codes | One-time use |

---

## 9. App Identity (License Checks)

The app needs to check the user's subscription plan and feature availability for UI gating.

### Primary: ZK License Endpoint

```
GET /api/zk/accounts/license
Authorization: Bearer <accessToken>
```

Returns `user`, `license` (plan, status, expiry, source), `features` (boolean flags), `limits` (maxHosts, maxVaults, maxDevices).

**When to call:**
- On app startup (after auth)
- After plan changes
- Periodically (e.g., alongside token refresh)

### Tier Catalogue: Available Plans & Pricing

To show an upgrade screen, paywall, or pricing comparison inside the app, fetch the full tier catalogue instead of hardcoding plan data:

```
GET /api/app/tiers
x-api-key: <APP_API_KEY>
```

**No user session required.** This endpoint is safe to call before login (e.g., on the registration screen or from a "Compare plans" sheet).

Returns an ordered array of all tiers (`starter → pro → team → business`), each containing:
- `key`, `name`, `description` — identifiers and display strings
- `highlights` — human-readable feature bullets for display
- `features` — the same boolean feature-flag map returned by `/api/zk/accounts/license`
- `limits` — `maxHosts`, `maxVaults`, `maxDevices` (-1 = unlimited)
- `pricing.monthly` / `pricing.yearly` — `priceCents`, `currency`, and `stripePriceId` (from the server's live pricing configuration)

**When to call:**
- When rendering an upgrade/paywall screen
- When showing a plan comparison sheet
- On first launch, to cache plan metadata for offline display

**Caching recommendation:** Cache the response locally (e.g., 1-hour TTL). Pricing is admin-configurable but changes infrequently. Always re-fetch before initiating a purchase to use the latest `stripePriceId`.

**Example response (abbreviated):**
```json
{
  "tiers": [
    {
      "key": "starter",
      "name": "Starter",
      "pricing": {
        "monthly": { "priceCents": 0, "currency": "usd", "stripePriceId": null },
        "yearly":  { "priceCents": 0, "currency": "usd", "stripePriceId": null }
      },
      "limits": { "maxHosts": 5, "maxVaults": 1, "maxDevices": 1 },
      "features": { "unlimitedHosts": false, "aiAssistant": false, "cloudVault": false, "..." : false }
    },
    {
      "key": "pro",
      "name": "Pro",
      "pricing": {
        "monthly": { "priceCents": 1299, "currency": "usd", "stripePriceId": "price_pro_monthly" },
        "yearly":  { "priceCents": 1000, "currency": "usd", "stripePriceId": "price_pro_yearly" }
      },
      "limits": { "maxHosts": -1, "maxVaults": 10, "maxDevices": -1 },
      "features": { "unlimitedHosts": true, "aiAssistant": true, "cloudVault": true, "teamVaults": false, "..." : false }
    }
  ]
}
```

### Alternative: App Identity Endpoints

If the app already has a ZK access token, it can call app identity endpoints using Bearer auth:

```
POST /api/app/login
x-api-key: <APP_API_KEY>
Authorization: Bearer <accessToken>
```

No body required — user is derived from the access token. Returns user info + license (same feature set but different response shape).

> **Important:** Do NOT call `/api/app/login` with email/password if you already have a ZK access token. This avoids prompting the user for 2FA twice.

---

## 10. Multi-Device Login

When a user adds the app on a second device:

1. `/accounts/check` returns `loginMethod: "zk_login"` — keys already exist.
2. User enters password → app derives `masterPasswordHash` using KDF params from check.
3. Server returns encrypted keys (`protectedSymmetricKey`, `encryptedPrivateKey`, `publicKey`).
4. App decrypts them locally with the master key.
5. A new `Device` record is created on the server.
6. `GET /sync` pulls all vaults and items.

**No device-to-device transfer is needed.** Encrypted keys live on the server. Any device with the correct password can decrypt them.

### Device Tracking

Each login creates/updates a `Device` record via `deviceName` + `deviceType` fields in the login request. The server generates a unique identifier `userId:deviceName:deviceType`. Users can see their devices in the web dashboard.

---

## 11. Sign-In vs Unlock (UX Semantics)

### Two Distinct Concepts

| Concept | What it does | When prompted |
|---------|-------------|---------------|
| **Sign In** | Authenticates with the server, obtains ZK tokens | When no valid refresh token exists (first launch, after logout, after token expiry) |
| **Unlock Vault** | Decrypts the symmetric key into memory | On every cold launch (unless biometric unlock is enabled) |

### UX Rules

- **Sign In screen:** Email + Password + optional 2FA. Label: "Log in to DeepTerm".
- **Unlock screen:** Password only (email pre-filled). Label: "Unlock your vault".
- When biometric unlock is enabled, the unlock screen is replaced with a biometric prompt.
- **Never** label vault unlock as "sign in" — it confuses users into thinking they have two accounts.

### State Machine

```
┌──────────┐   no refreshToken   ┌──────────────┐
│ SIGNED   │ ──────────────────▶ │ SIGN IN      │
│ OUT      │ ◀────── logout ──── │ SCREEN       │
└──────────┘                     └──────┬───────┘
                                        │ auth success
                                        ▼
┌──────────┐   token refresh ok  ┌──────────────┐
│ LOCKED   │ ◀── app relaunch ── │ AUTHENTICATED│
│          │                     │ (vault locked)│
└────┬─────┘                     └──────────────┘
     │ password or biometric               ▲
     ▼                                     │
┌──────────────┐                           │
│ UNLOCKED     │ ── lock vault ────────────┘
│ (full access)│
└──────────────┘
```

---

## 12. Credential Storage Reference

| Credential / Factor | Where Stored | What It Unlocks | How Often Required |
|---------------------|--------------|-----------------|--------------------|
| Email + Password | User's memory | Server authentication + vault key derivation | First login; after logout or token expiry |
| 2FA code (TOTP) | Authenticator app | Proves identity when required by server | First login with 2FA; not on refresh |
| ZK Access Token | Memory | API access (15 min) | Auto-refreshed; transparent to user |
| ZK Refresh Token | Keychain (device-only) | New access tokens without re-auth | Valid for 90 days; rotates on each use |
| Vault Unlock Key | Keychain (biometric-protected) | Decrypt vault without password | Biometric prompt on each cold launch |
| Symmetric Key | Memory only | Encrypt/decrypt vault items | Derived on unlock; cleared on lock |
| RSA Private Key | Memory only (encrypted on server) | Organization key exchange | Derived on unlock; cleared on lock |

---

## 13. Error Handling & Diagnostics

### Common Error Responses

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `401` on any ZK endpoint | Access token expired | Refresh token → retry |
| `401` on token refresh | Refresh token expired or revoked | Show login screen |
| `2FA_REQUIRED` from `/api/app/login` | Called app endpoint with password for 2FA user | Use Bearer auth instead, or collect 2FA code |
| Response decoding error after `login-password` | Client expects `{ data: ... }` wrapper | Decode response body directly (no wrapper) |
| `requires2FA: true` in login-password response | 2FA user, need second step | Call `/login-password-2fa` with code |
| `hasKeys: false` in login response | New user without encryption keys | Generate keys + call `/keys/initialize` |
| "Startup token probe → no token" in logs | No refresh token persisted | Check Keychain write after login |
| Vault shows "no account" after login | App called `/api/app/login` but not ZK auth | ZK auth is required for vault access; app identity doesn't grant vault tokens |

### Diagnostic Checklist

If the app shows two sign-in prompts, check:
1. **Missing token persistence** — is the refresh token being saved to Keychain after login?
2. **Calling `/api/app/*` in password mode despite having a ZK token** — use Bearer auth instead.
3. **Treating "vault locked" as "signed out"** — these are different states (see [Section 11](#11-sign-in-vs-unlock-ux-semantics)).
4. **Keychain service/account key mismatch** between write and read paths.

### Logout Implications

`POST /api/zk/accounts/logout` revokes **all** refresh tokens on **all** devices. Communicate this in UX: "Signing out will sign you out on all devices."

For "lock vault" without signing out: clear in-memory keys only, do not call the server.

---

## 14. Implementation Checklist

### Authentication
- [ ] Single login screen (email + password), no "vault login" vs "app login"
- [ ] `POST /accounts/check` before prompting for password
- [ ] Handle all three `loginMethod` values: `zk_login`, `password_login`, `register`
- [ ] Handle `requires2FA: true` response (200 OK, not an error)
- [ ] Handle `hasKeys: false` → generate and upload keys transparently
- [ ] Decode ZK responses directly (no `{ data: ... }` wrapper)

### Token Management
- [ ] Store refresh token in Keychain (device-only)
- [ ] Access token in memory only
- [ ] HTTP interceptor: 401 → refresh → retry → or show login
- [ ] Store **both** new tokens after every refresh (rotation)
- [ ] Delete tokens on logout

### Vault
- [ ] Full sync on first launch (`GET /sync`)
- [ ] Delta sync on subsequent launches (`GET /sync?since=...`)
- [ ] Push via `POST /vault-items/bulk` with client-generated UUIDs
- [ ] Encrypt item name + data client-side before sending
- [ ] Decrypt items after receiving from server

### Biometric Unlock
- [ ] Toggle: "Unlock with Face ID / Touch ID"
- [ ] Save vault key in biometric-protected Keychain on password unlock
- [ ] Read vault key via biometric prompt on relaunch
- [ ] Fallback to password if biometrics fail or are disabled
- [ ] Re-save vault key when biometric enrollment changes

### App Identity
- [ ] Call `GET /accounts/license` for feature flags and plan info
- [ ] Use `Authorization: Bearer <accessToken>` for `/api/app/*` endpoints (skip password/2FA)
- [ ] Gate features based on `features.*` and `limits.*` from license response
- [ ] Call `GET /api/app/tiers` (with `x-api-key`) to populate upgrade/pricing screens
- [ ] Cache tier catalogue locally (≤1 hour); re-fetch before initiating a purchase

### Security
- [ ] Master password never stored (derived keys only)
- [ ] All Keychain items: `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
- [ ] Vault key Keychain item: `.userPresence` (requires biometrics or passcode)
- [ ] Clear in-memory keys on lock/logout
- [ ] Clear password from memory immediately after key derivation
