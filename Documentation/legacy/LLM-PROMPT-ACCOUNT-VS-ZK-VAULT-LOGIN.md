# LLM Prompt — Explain DeepTerm Account vs ZK Vault Login (Detailed)

You are a senior engineer and technical writer.

This is NOT a generic documentation task: you must **review an existing app implementation** (client code) against the server API behavior described below, identify mismatches, and propose **concrete corrections** (code diffs / exact changes). The detailed explanation is a deliverable, but only after the implementation review.

Your main job: explain **and** verify the client implementation is correct.

## Audience
- Product + engineering (mixed technical level)
- The goal is clarity and correctness, not marketing.

## What you are reviewing
You are reviewing a desktop/mobile app’s authentication + vault sync implementation.

### Inputs you will receive
- Client-side code snippets (Swift/TS/etc.) for:
   - Login / validate calls
   - ZK vault login + token refresh calls
   - Sync pull (`GET /api/zk/sync`) and push (`POST /api/zk/vault-items/bulk`)

### How to behave
- Treat this as a code review + correction request.
- If a required snippet/file is missing, ask for it explicitly (file/class/function name).
- Do not answer with “based on spec” only — you must point out concrete mismatches and how to fix them.

### Implementation requirement (non-negotiable)
You must **implement** the fixes, not only describe them.

- If you have access to the client repository/files: make the changes directly and show what you changed.
- If you do NOT have write access: output **ready-to-apply patches** in `git apply` unified diff format for every required file.
- Do not stop after recommendations. Your output must contain either:
   - “Applied changes” + list of modified files, or
   - “Patches” + one unified diff per file.

### Completion checklist
Before finishing, include a short checklist showing:
- [ ] Fixes implemented (or patches provided)
- [ ] Token storage updated where required
- [ ] Bearer-empty-body behavior aligned with server
- [ ] Vault sync create uses stable `id` where applicable
- [ ] Verification steps executed (if possible) or provided

## Resolved open questions (confirmed by current server code)
Use these as **ground truth** unless the server team says they plan to change behavior.

1) Empty body with Bearer (`POST /api/app/login`, `POST /api/app/validate`)
- `/api/app/login`: a completely empty body is acceptable when using Bearer, because the Bearer branch does not call `request.json()`.
- `/api/app/validate`: a completely empty body is acceptable when using Bearer, because `request.json()` is wrapped in `try/catch` and falls back to `{}`.
- Practical guidance: the client should still send `x-api-key` and `Authorization: Bearer ...`; `Content-Type` may be omitted for the Bearer-only case.

2) Access token TTL configurability
- Access token TTL is currently fixed at **15 minutes** in server code (not env-configurable) and `expiresIn` is returned as 900 seconds.
- Practical guidance: clients should treat `expiresIn` as authoritative, but can expect 900 unless the server code changes.

3) Logout revocation scope (`POST /api/zk/accounts/logout`)
- Logout revokes **all refresh tokens for the user (all devices)**, not just the current session.
- Practical guidance: UX should communicate “logging out signs you out everywhere” if this endpoint is used.

4) Password change response shape (`POST /api/zk/accounts/password/change`)
- Password change revokes all refresh tokens (all devices) and returns a **new token pair in the same response** (`accessToken`, `refreshToken`, `expiresIn`).
- Practical guidance: the client does not need to re-authenticate immediately after a successful password change; it should replace stored tokens with the returned ones.

## If the app still shows “two different logins”
Treat this as a key acceptance criterion: **the user should not have to enter email/password/2FA twice**.

### Important distinction
- **Sign-in (account authentication)**: obtaining a valid ZK access/refresh token pair (and, optionally, linking/creating ZK account) using the user’s credentials.
- **Unlock (vault decryption)**: deriving/decrypting the in-memory symmetric key needed to decrypt vault items.

Vault unlock may be required again after app restart (because the symmetric key is memory-only), but that should be presented as **Unlock vault**, not a second “login to another account”.

### What “one login” means in practice
After the user completes ZK auth and receives a valid `accessToken`, the app should:
1) Persist the ZK token pair (Keychain).
2) Call `POST /api/app/login` or `POST /api/app/validate` using `Authorization: Bearer <ZK accessToken>` + `x-api-key`.
3) NEVER prompt for the web account password/2FA again just to call `/api/app/*` endpoints.

### Critical clarification: `/api/app/login` is NOT a vault login
- `POST /api/app/login` / `POST /api/app/validate` authenticate the app for **user+license** and can enforce web 2FA in password mode.
- They do **not** mint ZK vault tokens.
- Vault sync requires ZK tokens from `/api/zk/*` endpoints.

If the app implements “account login” by calling `/api/app/login` with email+password, and then expects vault sync to work, it will still have **no ZK access/refresh tokens** and the Vault screen will show “No account” / “not logged in”.

### Map common log symptoms to root cause
Use this mapping during implementation review:

- Log: `DeepTermAPI: Login failed [401] 2FA_REQUIRED`
   - Meaning: client called `/api/app/login` (password mode) for a user with 2FA enabled but did not send `twoFactorCode`.
   - Correct fix: either collect `twoFactorCode` for `/api/app/login` OR (preferred) don’t use password mode once you have ZK tokens—use Bearer.

- UI: Vault login fails with a generic decoding error (e.g. “The data couldn’t be read because it is missing…”) immediately after submitting email+password
   - Likely meaning: client attempted `/api/zk/accounts/login-password` but tried to decode the response as a token payload.
   - The server can return `{ requires2FA: true, email, message }` (success) when 2FA is enabled, which must be handled as a distinct response type.

- Log: `AppAuthSession: Startup token probe → no token`
   - Meaning: no ZK token pair was persisted to Keychain OR it was cleared by logout.

### Logout implications (prevents “why do I need to login again?”)
- ZK logout revokes refresh tokens for **all devices**. If your UI has an “Account → Log out” action that calls ZK logout, it will also log the user out of vault sync.
- If you want “log out of cloud sync” to also log out of vault sync: that’s OK, but then it’s expected the user must sign in again before syncing.
- If you want “lock vault” (local) without logging out of cloud sync: do NOT call server logout; just clear the in-memory symmetric key and show “Unlock vault”.

### Diagnostic checklist (implementation review must do this)
If the app shows two sign-in prompts, identify which one is caused by:
- Missing token persistence (e.g., startup logs like “Startup token probe → no token”).
- Calling `/api/app/login` or `/api/app/validate` in password mode even though a ZK token exists.
- Treating “vault locked” as “no account” instead of a separate unlock state.
- Mismatched Keychain keys / service identifiers between write and read.

Your output must:
- Name the exact client functions responsible.
- Provide diffs to change the flow to: **ZK auth first → app identity via Bearer → vault unlock UI as separate step**.

## Key question to answer
Do users need **two separate accounts**?
- (A) A “server account” for the DeepTerm app
- (B) A “ZK Vault account” for encrypted vault access

## Requirements
1) Be explicit: **one DeepTerm user account** vs **two independent accounts**.
2) Describe the **two stages** the user may experience:
   - Identity authentication (email/password + optional 2FA/passkey)
   - Vault unlock / ZK token issuance (master password / vault auth)
3) Explain token types and what they authorize:
   - Web session / NextAuth (browser)
   - ZK Vault JWT access token (short-lived)
   - ZK refresh token (rotating DB-backed token)
   - Include the actual current TTLs: access token is **15 minutes**; refresh token expiry is `REFRESH_TOKEN_EXPIRY_DAYS` (default 90 days).
4) Explain how the **desktop/mobile app** should avoid making the user do 2FA twice:
   - When the app already has a valid ZK access token, it can call app endpoints using:
     - `Authorization: Bearer <ZK accessToken>`
   - Password-based flows should enforce 2FA when user has it enabled.
5) Include **step-by-step flows** (numbered) for these scenarios:
   - Fresh login with 2FA enabled
   - Fresh login without 2FA
   - User already has a valid ZK access token
   - Access token expired → refresh flow
   - Password change / logout → token revocation expectations
6) Include a short “What the user sees” section describing UX:
   - When they will be prompted for email/password
   - When they will be prompted for 2FA
   - When they will be prompted for the vault master password
7) Provide a concise table:
   - **Credential / Factor** | **Where stored** | **What it unlocks** | **How often required**
8) Call out common confusions and the correct phrasing:
   - “It’s not a second account; it’s an additional vault unlock step for the same user.”
9) Keep it accurate to these known API behaviors:
   - App endpoints can accept `Authorization: Bearer <ZK accessToken>` to avoid re-entering email/password/2FA.
   - Refresh tokens rotate; server can revoke on logout/password change.

## API description (include in the explanation)

You must describe these APIs precisely (headers, request JSON, response shape, and key errors). All JSON keys are **camelCase**.

### App-facing identity endpoints (used by the desktop/mobile app)

#### `POST /api/app/login`
- **Headers**:
   - `x-api-key: <APP_API_KEY>` (required)
   - `Authorization: Bearer <ZK accessToken>` (optional; if present and invalid => `401 INVALID_ACCESS_TOKEN`)
- **Body (password flow)**:
   - `{ "email": string, "password": string, "twoFactorCode"?: string }`
   - If the user has 2FA enabled and `twoFactorCode` is missing => `401 2FA_REQUIRED`
   - If `twoFactorCode` is wrong => `401 INVALID_2FA_CODE`
- **Body (already-authenticated flow)**:
   - May omit body when Bearer token is present (server derives the user from the token and does **not** need JSON parsing in this branch)
- **Success response (shape)**:
   - `{ success: true, message: string, user: { id, name, email, role, twoFactorEnabled, createdAt }, license: { valid, plan, status, teamId, teamName, seats, expiresAt, features } }`

#### `POST /api/app/validate`
- **Headers**:
   - `x-api-key: <APP_API_KEY>` (required)
   - `Authorization: Bearer <ZK accessToken>` (optional; if present and invalid => `401 INVALID_ACCESS_TOKEN`)
- **Body**:
   - `{ "email": string, "password"?: string, "twoFactorCode"?: string }` (body may be empty if using Bearer)
- **Behavior**:
   - With Bearer: returns `valid: true, authenticated: true` plus user + license.
   - With password: validates password; if user has 2FA enabled then enforces `twoFactorCode` like `/api/app/login`.
   - If Bearer is valid but provided `email` does not match token user => `403 TOKEN_EMAIL_MISMATCH`.
- **Success response (shape)**:
   - `{ valid: true, authenticated: boolean, user: {...}, license: {...} }`

### ZK Vault authentication + tokens

#### `POST /api/zk/accounts/login`
- **Purpose**: authenticate to the vault (same user, vault unlock step) and mint ZK tokens.
- **2FA note**:
   - This endpoint does **not** enforce the web user’s 2FA setting; it only verifies `masterPasswordHash` against the stored ZK user hash.
   - If you need a flow that enforces web-account 2FA, use the password-based endpoints (`/api/zk/accounts/login-password` → `/api/zk/accounts/login-password-2fa`).
- **Body**:
   - `{ "email": string, "masterPasswordHash": string, "deviceName"?: string, "deviceType"?: "desktop" | string }`
- **Success response includes**:
   - `{ accessToken: string, refreshToken: string, expiresIn: number, protectedSymmetricKey, publicKey, encryptedPrivateKey, kdfType, kdfIterations, kdfMemory, kdfParallelism, user: { id, email, emailVerified } }`
- **Errors**:
   - `401` for invalid credentials; may rate-limit repeated attempts.

#### `POST /api/zk/accounts/login-password`
- **Purpose**: login to ZK vault using the web account password (and enforce web 2FA if enabled). May auto-create/link the ZK user to the web user.
- **Body**:
   - `{ "email": string, "password": string, "deviceName"?: string, "deviceType"?: string }`
- **Success response (2FA required case)**:
   - `{ "requires2FA": true, "email": string, "message": string }`
   - Important: this is a **success** response (HTTP 200) and does not include tokens.
- **Success response (no 2FA required)**:
   - Returns tokens and user info directly (no envelope):
   - `{ defaultVaultId, accessToken, refreshToken, expiresIn, user: { id, email, name, hasKeys }, ...(keys if present), device, subscription }`

#### `POST /api/zk/accounts/login-password-2fa`
- **Purpose**: complete password login by verifying TOTP/backup code.
- **Body**:
   - `{ "email": string, "password": string, "code": string, "deviceName"?: string, "deviceType"?: string }`
- **Success response**:
   - Returns tokens and user info directly (no envelope):
   - `{ defaultVaultId, accessToken, refreshToken, expiresIn, user: { id, email, name, hasKeys }, ...(keys if present), device, subscription, usedBackupCode }`

#### `POST /api/zk/accounts/token/refresh`
- **Body**: `{ "refreshToken": string }`
- **Success response**: `{ accessToken: string, refreshToken: string, expiresIn: number }`
- **Errors**: `401` if refresh token is invalid/expired.
- **TTL note**:
   - Refresh token expiry is controlled by `REFRESH_TOKEN_EXPIRY_DAYS` (default 90 days) and is a sliding window because refresh rotates tokens (new refresh token gets a new expiry).
   - Access token TTL is currently 15 minutes (clients should plan for frequent refresh during long-running desktop sessions).

### Password change / logout token revocation (important)
- Changing the ZK master password revokes **all** refresh tokens for the user (all devices) and issues a new token pair for the current session.
- Logging out also revokes **all** refresh tokens for the user (all devices).

### Subscription / License retrieval

#### `GET /api/zk/accounts/license`
- **Purpose**: retrieve the authenticated user's current subscription, plan features, and usage limits. This is the **primary endpoint** for the app to determine what features are available.
- **Headers**: `Authorization: Bearer <ZK accessToken>` (required)
- **Body**: none (GET request)
- **Success response (shape)**:
   - `{ user: { id, email, name }, license: { valid, plan, status, expiresAt, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, seats, teamId, teamName, source }, features: { unlimitedHosts, aiAssistant, cloudVault, allDevices, sftpClient, portForwarding, prioritySupport, teamVaults, sso, auditLogs, roleBasedAccess }, limits: { maxHosts, maxVaults, maxDevices } }`
- **Key fields**:
   - `license.source`: `"stripe"`, `"apple"`, or `"none"` — indicates which payment provider the active subscription comes from.
   - `license.plan`: effective plan (`starter`, `pro`, `team`, `business`). When both Stripe and Apple IAP are active, the higher-tier plan wins.
   - `features.*`: boolean feature flags the app should use to gate functionality.
   - `limits.*`: usage limits (`-1` = unlimited).
- **Errors**: `401` if token is missing/invalid. `404` if ZK user not found.
- **Usage guidance**: call this on app startup (after ZK auth), after plan changes, and periodically (e.g., every 15 minutes alongside token refresh) to stay current.

### Vault sync (read + push)

#### `GET /api/zk/sync`
- **Headers**: `Authorization: Bearer <ZK accessToken>` (required)
- **Query params**:
   - `since=<ISO8601>` (optional; delta sync)
   - `excludeDeleted=true|false` (optional; default false)
- **Success response includes**:
   - `profile`, `organizations`, `defaultVaultId`, `vaults[]`, `items[]`, `devices[]`, `serverTimestamp` (ISO8601)

#### `POST /api/zk/vault-items/bulk`
- **Headers**: `Authorization: Bearer <ZK accessToken>` (required)
- **Body**:
   - `{ "create": BulkCreateItem[], "update": BulkUpdateItem[], "delete": BulkDeleteItem[] }`
   - `BulkCreateItem`: `{ "id"?: string, "vaultId": string, "type"?: number, "name": string, "encryptedData": string, "clientId"?: string }`
      - Important: if `id` is provided and already exists, the server **updates** instead of creating (upsert-by-id). This is the intended way to prevent duplicates across sync runs.
   - `BulkUpdateItem`: `{ "id": string, "vaultId"?: string, "type"?: number, "name"?: string, "encryptedData"?: string, "revisionDate"?: string (ISO8601) }`
      - `revisionDate` is used for optimistic concurrency; mismatches produce a conflict entry.
   - `BulkDeleteItem`: `{ "id": string, "permanent"?: boolean }`
- **Success response (shape)**:
   - `{ created: [{ id, clientId?, revisionDate }], updated: [{ id, revisionDate }], deleted: string[], conflicts: [{ id, currentRevisionDate, operation }], errors: [{ id?, clientId?, error, operation }] }`

### Device trust / “remember this device”
- Do **not** assume a trusted-device 2FA bypass exists.
- Devices may be recorded for activity/auditing (e.g., `deviceName`/`deviceType`), but 2FA enforcement in the app password-flow is not conditional on device trust.

## Response envelope rule (prevents decoding bugs)
For `/api/zk/*` endpoints, do NOT assume a `{ "data": ... }` wrapper.

- The server’s `successResponse(...)` returns the object you pass **directly** as JSON.
- Therefore, clients must decode the response body as the expected object directly.
- If the client has legacy code that expects `{ data: ... }`, it must either be removed or must support both shapes (wrapped and bare) without making a second network call.

This is especially important for `/api/zk/accounts/login-password`, where `{ requires2FA: true, ... }` is a valid success response and will fail decoding if the client insists on `{ data: ... }`.

## Output format
Use these sections:
- Implementation Review (must come first)
   - Findings (mismatches / risks)
   - Required code changes (exact diffs or copy/paste patches)
   - Verification steps (what to log on the wire, expected responses)
- Explanation (for product + engineering)
   - Summary (2–4 bullets)
   - Definitions (Account vs Vault Auth)
   - Tokens & Sessions
   - User Flows (with numbered steps)
   - What the User Sees (UX)
   - Table of Credentials/Factors
   - Edge Cases & Failure Modes
   - Recommended wording for UI/help docs

## Constraints
- Do not invent features not stated.
- If something is uncertain, label it as an assumption and list what to verify.

## Optional (nice)
Include one Mermaid sequence diagram showing the “already-authenticated app using Bearer token” flow.
