# DeepTerm — Persistent Auth (Server) for App Relaunch

This document describes the server-side behavior needed so the app does **not** require 2FA on every launch.

Biometric vault unlock is **device-only** and not a server concern.

---

## What the server must guarantee

### 1) Refresh tokens are long-lived

- The app stores the refresh token in Keychain / Secure Storage and uses it on every app launch.
- In this repo, refresh tokens are stored in DB as a SHA-256 hash (never stored plaintext) and have an expiry date.

Implementation:
- Refresh token TTL is controlled by `REFRESH_TOKEN_EXPIRY_DAYS`.
- Default: **90 days** (configurable).

Set it in your environment:

- `REFRESH_TOKEN_EXPIRY_DAYS=90`

Code:
- Token generation / storage is in [src/lib/zk/jwt.ts](../src/lib/zk/jwt.ts)

### 2) Refresh endpoint must NOT require password or 2FA

The refresh endpoint is the proof that the user previously authenticated (including 2FA when required).

- `POST /api/zk/accounts/token/refresh`
  - Input: `{ "refreshToken": "<token>" }`
  - Output: `{ accessToken, refreshToken, expiresIn }`

This endpoint must only validate:
- token exists in DB
- token not expired
- token not revoked

Implementation:
- [src/app/api/zk/accounts/token/refresh/route.ts](../src/app/api/zk/accounts/token/refresh/route.ts)

### 3) Refresh token rotation is required (already implemented)

On refresh, the server should rotate tokens:
- delete/revoke the old refresh token
- create a new refresh token
- return the new pair

Implementation:
- [src/lib/zk/jwt.ts](../src/lib/zk/jwt.ts) (`refreshTokenPair`)

Notes:
- Reuse detection (“token family” replay detection) is not implemented as a separate feature; a reused token simply won’t be found after rotation.

### 4) Revoke refresh tokens on password/master-password change (already implemented)

When the master password changes, all sessions should be invalidated.

Implementation:
- [src/app/api/zk/accounts/password/change/route.ts](../src/app/api/zk/accounts/password/change/route.ts) calls `revokeAllTokens(...)`.

### 5) Logout revokes refresh tokens (already implemented)

Implementation:
- [src/app/api/zk/accounts/logout/route.ts](../src/app/api/zk/accounts/logout/route.ts) calls `revokeAllTokens(...)`.

---

## What the server does NOT need to do

- No biometric logic
- No storage of vault unlock keys
- No awareness of whether the client unlocked with master password or biometrics

---

## Expected end-to-end behavior

On app relaunch:
1) App reads refreshToken from Keychain
2) App calls `POST /api/zk/accounts/token/refresh`
3) Server returns new accessToken + refreshToken
4) App stores new refreshToken in Keychain
5) App uses accessToken as `Authorization: Bearer <token>` for all API calls
6) 2FA is requested only when refresh token is missing/invalid/expired/revoked
