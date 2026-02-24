# DeepTerm App (macOS + iOS) — Persistent Auth + Biometric Unlock (Passcode Fallback)

This document is meant to be pasted as a **single prompt** into the app-side coding agent / LLM.

---

## App LLM Prompt (copy/paste as-is)

You are implementing DeepTerm’s macOS + iOS “persistent login + biometric unlock” UX. The user should NOT need to re-enter 2FA after app restart, and should NOT need to re-enter the ZK master password if they enabled “Unlock with biometrics”. Use biometrics with device passcode fallback (Touch ID / Face ID with passcode fallback).

### Goals
1) Persist server authentication across app restarts without prompting for 2FA every time.
2) Persist vault “unlock” across restarts using biometrics+passcode fallback, without ever storing the master password.
3) Keep security properties: master password never stored; decrypted keys are not written to disk unprotected; all stored secrets are device-bound and non-migratable.

---

## Part A — Persist server authentication (no 2FA every launch)

### Tokens and endpoints
- ZK login (requires 2FA): `POST /api/zk/accounts/login-password-2fa`
  - returns `accessToken`, `refreshToken`, `expiresIn`, `user`, etc.
- Refresh (no 2FA prompt): `POST /api/zk/accounts/token/refresh`
  - body: `{ "refreshToken": "<refreshToken>" }`
  - returns new `accessToken`, new `refreshToken`, `expiresIn`

### Storage rules
- Store `refreshToken` in Keychain (device-only).
- Store `accessToken` in memory only (optional to store in Keychain too, but not required).
- Never store email/password/2FA codes.

### Launch flow (must implement)
On app launch:
1) Read `refreshToken` from Keychain.
2) If missing → user is “signed out”; show login UI (password + 2FA).
3) If present → call refresh endpoint.
   - If refresh succeeds: update stored `refreshToken`, keep `accessToken` in memory, proceed without any 2FA prompt.
   - If refresh fails with 401: delete tokens from Keychain and show login UI (password + 2FA).

### Networking rule
For app APIs that accept Bearer auth, always send:
- `Authorization: Bearer <accessToken>`
- plus `x-api-key: <APP_API_KEY>` where required by `/api/app/*`

---

## Part B — Persist vault unlock (no master password every launch)

### Key idea
- The master password is only used to derive/decrypt a “vault unlock key” in memory.
- If user enables “Unlock with biometrics”, you wrap (encrypt) that vault unlock key with a Keychain item protected by biometrics+passcode.
- On next launch you use LocalAuthentication to unwrap and unlock without prompting for master password.
- Master password is NEVER saved.

### Required user setting
Add a toggle:
- “Unlock with Face ID / Touch ID”
- If enabled: store a wrapped vault key in Keychain protected by `.userPresence` (biometrics + passcode fallback).
- If disabled: require master password to unlock on each cold launch.

### iOS Keychain requirements
Use Keychain with `SecAccessControl` requiring **biometrics with passcode fallback**:
- `SecAccessControlCreateWithFlags` with:
  - accessibility: `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
  - flags: `.userPresence`

Store the wrapped vault key as a generic password item.

Suggested identifiers:
- service: `net.deepterm.zk`
- account: `wrappedVaultKey:<userId>`

### macOS requirements
Use the same approach via Keychain + LocalAuthentication:
- Protect the wrapped key using `SecAccessControl` with `.userPresence` (Touch ID when available, otherwise system password).
- Use `LAContext` and pass it to Keychain queries via `kSecUseAuthenticationContext`.

### What to store
Store ONLY:
- `wrappedVaultKey` (bytes/base64) in Keychain protected by `.userPresence`
- `refreshToken` in Keychain (device-only)

Optionally store:
- `userId`, `email` (non-secret) in UserDefaults for convenience

Do NOT store:
- master password
- derived master key
- decrypted private key
- plaintext vault keys

---

## Part C — Concrete flows to implement

### 1) First successful unlock with master password
When user enters master password successfully and vault is unlocked:
1) Derive/obtain `vaultUnlockKey` in memory.
2) If “Unlock with biometrics” is enabled:
   - Store `vaultUnlockKey` directly as a Keychain-protected secret (protected by `.userPresence`).
   - This is acceptable and simplest: the OS enforces user presence and protects at rest.
3) Clear master password from memory ASAP.

### 2) Next app launch (auto-unlock)
On app launch after token refresh:
1) If wrapped vault key exists in Keychain:
   - Prompt via biometrics (with passcode fallback) using LocalAuthentication.
   - If user succeeds: read the key → load vault keys into memory → app is “unlocked”.
   - If user cancels/fails: remain locked; offer “Use master password instead”.
2) If no wrapped vault key: require master password.

### 3) Logout / disable biometrics
If user logs out or disables “Unlock with biometrics”:
- Delete `wrappedVaultKey` from Keychain.
- Delete `refreshToken` from Keychain.
- Clear memory.

### 4) If biometrics changes / Keychain access denied
If Keychain item becomes invalid (e.g., biometric enrollment changed):
- Treat as locked state.
- Ask for master password.
- After successful unlock, re-save the wrapped vault key.

---

## Part D — UX rules
- 2FA is only requested during explicit login when `refreshToken` is missing/invalid.
- Biometrics prompt is used only for “unlock vault”; it should not be required for background token refresh.
- Provide a “Lock now” action that clears only in-memory decrypted keys but keeps tokens and wrapped vault key.

---

## Part E — Error handling requirements
- If refresh fails: clear tokens and show login.
- If Bearer-protected app API returns `401 INVALID_ACCESS_TOKEN`: refresh once and retry once, otherwise show login.
- If biometric unlock fails: do not wipe tokens; just remain locked and allow manual master password unlock.

---

## Deliverables
Implement:
1) Keychain storage helpers for:
   - `refreshToken`
   - `vaultUnlockKey` protected with `.userPresence`
2) Launch-time refresh flow
3) Unlock flows (biometrics+passcode fallback, master password fallback)
4) Toggle UI for “Unlock with biometrics”
5) Clear-secret-memory best practices

---

## Acceptance criteria
- After closing and reopening the app:
  - No 2FA prompt if refreshToken is valid.
  - If “Unlock with biometrics” enabled: biometric prompt appears and unlocks without master password.
  - If “Unlock with biometrics” disabled: master password is required (expected).
- Master password is never stored.
- All stored secrets are device-only and protected by user presence.
