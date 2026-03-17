# Vaults — Complete App Implementation Guide

This document is written for the **native DeepTerm app's Xcode LLM**. It covers everything needed to implement both personal and team vault functionality: what is automatic, what requires action, what to validate, and full API reference.

---

## 1. Vault Concepts

DeepTerm has two vault types:

| Type | Description | Owner |
|------|-------------|-------|
| **Personal vault** | Belongs to a single user. Credentials encrypted with the user's own symmetric key. | `ZKVault.userId` |
| **Team vault** | Belongs to an Organization. Credentials encrypted with the org's shared key. Any confirmed org member can access. | `ZKVault.organizationId` |

A user can have:
- **1 default personal vault** (auto-created at registration — requires no action)
- **N additional personal vaults** (created on demand — no organisation required)
- **N team vaults** (one per org, requires the org to exist first)

---

## 2. What Already Exists After Registration — No Vault Setup Needed

When a user registers via `POST /api/zk/accounts/register`, the server **automatically creates**:

1. A `ZKUser` record with the user's encryption keys
2. A `ZKVault` record with `isDefault: true`, `userId = user.id`, `organizationId = null`, and `name = ""` (empty — set by app on first use)

**The registration response includes `defaultVaultId`:**
```json
{
  "data": {
    "id": "user_abc123",
    "defaultVaultId": "vault_xyz789",
    "encryptedSymmetricKey": "...",
    "encryptedRSAPrivateKey": "...",
    "rsaPublicKey": "..."
  }
}
```

**App must store `defaultVaultId` immediately after registration.** This is the vault ID for all personal credential operations.

**Sync safety net:** If the default vault is ever missing (e.g. after data migration), `GET /api/zk/sync` automatically creates a new one and returns it. The `defaultVaultId` field in the sync response is always authoritative.

### hasKeys flag (OAuth / web-created accounts)

If a user was created via web sign-up or OAuth (not via the native app), their encryption keys may not be initialised. After login, check the `hasKeys` field:

```json
{
  "data": {
    "hasKeys": false,
    "accessToken": "...",
    ...
  }
}
```

If `hasKeys: false`:
1. Generate a new symmetric key, RSA key pair, and KDF parameters (client-side)
2. Call `POST /api/zk/accounts/keys/initialize` with the keys
3. Proceed normally — the default vault already exists server-side

If `hasKeys: true`: proceed directly to sync. No key setup needed.

---

## 3. Cryptographic Architecture

### Key Hierarchy (Personal Vault)

```
Master Password (user-entered, never stored)
    │
    ▼ PBKDF2-SHA256 (600k iterations) or Argon2id (3 iter, 64MB, 4 threads)
Master Key (256-bit, client-only)
    │
    ├── Hash once more (PBKDF2, 1 iteration) → masterPasswordHash → sent to server for login/register
    │
    ├── Decrypt protectedSymmetricKey ──────────────────────────────────┐
    │   (stored on server, AES-256 encrypted with master key)           │
    │                                                                    ▼
    │                                                           Symmetric Key (256-bit)
    │                                                               │
    │                                                   Encrypt/decrypt vault item data
    │                                                   Encrypt/decrypt vault names
    │
    └── Decrypt encryptedPrivateKey ────────────────────────────────────┐
        (stored on server, AES-256 encrypted with symmetric key)        │
                                                                        ▼
                                                               RSA Private Key
                                                                   │
                                                        Decrypt encryptedOrgKey
                                                        (team vaults only)
```

### Key Hierarchy (Team Vault — additional layer)

```
(after login, user has symmetric key + RSA private key in memory)
    │
    └── Decrypt OrganizationUser.encryptedOrgKey using RSA private key
            │
            ▼
        Org Symmetric Key (256-bit, in memory only)
            │
        Encrypt/decrypt ZKVaultItem.encryptedData for team vault items
```

### Encryption Rules — Summary

| What | Encrypted With | Where Stored |
|------|---------------|-------------|
| Vault item in **personal vault** | User's symmetric key | `ZKVaultItem.encryptedData` |
| Vault item in **team vault** | Org symmetric key | `ZKVaultItem.encryptedData` |
| Vault name | User's symmetric key (personal) or org key (team) | `ZKVault.name` |
| User's symmetric key (at rest) | Master-derived key | `ZKUser.protectedSymmetricKey` |
| User's RSA private key (at rest) | User's symmetric key | `ZKUser.encryptedPrivateKey` |
| Org key (at rest, per member) | Each member's RSA public key | `OrganizationUser.encryptedOrgKey` |

**Server never sees plaintext.** All encryption and decryption happens client-side on the device.

---

## 4. Authentication

All ZK vault endpoints require a Bearer token:

```
Authorization: Bearer <access_token>
```

Access tokens expire in **15 minutes**. Refresh silently using:

```
POST /api/zk/accounts/token/refresh
```

The JWT payload contains `orgIds: string[]` — the confirmed org memberships at the time the token was issued. This is used server-side for team vault access control. **After accepting an org invitation, the user must refresh their token** to include the new org.

---

## 5. Personal Vaults

### 5a. Default Vault — Automatic, No Action Required

The default vault is created at registration. The app only needs to:

1. Store `defaultVaultId` from the registration response
2. On sync, use `response.data.defaultVaultId` as the canonical vault ID
3. On first use, optionally update the vault name: `PUT /api/zk/vaults/{defaultVaultId}` with `{"name": "<encrypted name>"}`

**Do not create a new vault on registration.** One already exists.

### 5b. Creating Additional Personal Vaults

No organisation is required. Any authenticated user can create personal vaults:

```
POST /api/zk/vaults
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "<AES-256 encrypted vault name>"
}
```

**No `organizationId` field** → personal vault.

**Response `201`:**
```json
{
  "data": { "id": "vault_abc123" }
}
```

**Pre-conditions:** None beyond a valid access token.

**Validation (client-side):**
- Name must not be empty (server enforces this too)
- Encrypt the display name before sending
- There is no server-enforced limit on number of personal vaults

### 5c. Naming a Vault

Vault names are stored as-is by the server — treat them as opaque blobs. Encrypt vault names with the user's symmetric key (personal) or org key (team) before sending.

```
PUT /api/zk/vaults/{vaultId}
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "<encrypted name blob>"
}
```

### 5d. Creating Personal Vault Items

```
POST /api/zk/vault-items
Authorization: Bearer <token>
Content-Type: application/json

{
  "vaultId": "vault_abc123",
  "type": 0,
  "encryptedData": "<AES-256-GCM encrypted credential JSON>"
}
```

**The `type` field** is stored as server-side metadata (not encrypted). It enables admin filtering and statistics without decrypting vault data. Always include it when creating or updating items.

The `encryptedData` blob should be the AES-256-GCM encryption of:
```json
{
  "type": 0,
  "name": "My Server",
  "host": "server.example.com",
  "port": 22,
  "username": "admin",
  "password": "secret",
  "privateKey": "-----BEGIN OPENSSH PRIVATE KEY-----...",
  "passphrase": "key-passphrase",
  "certificate": "-----BEGIN CERTIFICATE-----...",
  "notes": "any notes",
  "tags": ["production"]
}
```

**Item types:**

| Type | Value | Description |
|------|-------|-------------|
| SSH Password | `0` | Host + username + password |
| SSH Key | `1` | Host + username + private key |
| SSH Certificate | `2` | Host + username + certificate + key |
| Managed Key | `10` | Managed SSH key (no host binding) |
| Identity | `11` | User identity profile |
| Host Group | `12` | Group of hosts |

**Important:** The `type` value must be sent both inside the encrypted blob AND as a top-level field in the API request body. The server stores it as metadata for admin panel filtering.

**Response `201`:** New item created.
**Response `200`:** Exact duplicate detected (same vault + same encryptedData blob) — returns existing item. No duplicate is stored.

**Server-enforced pre-conditions:**
- `vaultId` must be accessible to the authenticated user (personal vault must belong to user)
- `encryptedData` must not be empty
- Plan vault item limit must not be exceeded → returns `403` if over limit

**Do not re-encrypt the same item contents twice and expect the server to deduplicate by plaintext** — deduplication is based on the exact ciphertext blob. Always generate a fresh IV per item.

### 5e. Updating a Personal Vault Item

```
PUT /api/zk/vault-items/{itemId}
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": 0,
  "encryptedData": "<new encrypted blob>",
  "vaultId": "vault_abc123"
}
```

Include `type` if the item type has changed or to ensure it is set (e.g. migrating older items that were created before type tracking). If `type` is omitted, the existing server-side value is preserved.

Server updates `revisionDate` automatically.

### 5f. Deleting a Personal Vault Item (Soft-Delete)

```
DELETE /api/zk/vault-items/{itemId}
Authorization: Bearer <token>
```

Sets `deletedAt` timestamp — item is recoverable for 30 days. Not returned in sync unless `?since=` includes the deletion period or `includeDeleted=true`.

To permanently delete: there is no dedicated endpoint — items are hard-deleted automatically by the server after 30 days.

---

## 6. Team Vaults

### Pre-Conditions for Team Vaults

1. **An Organisation must exist first** — call `POST /api/zk/organizations` before creating a team vault
2. The user creating the vault must be a **confirmed `owner` or `admin`** of the organisation
3. The organisation must not have reached its `maxVaults` limit
4. The organisation's plan must support team vaults (`team`, `business`, `enterprise` — not `starter` or `pro`)

### 6a. Create the Organisation

Generate the org key **client-side** first — it is never sent in plaintext:

```swift
// 1. Generate random 256-bit org symmetric key (client-side, in memory)
let orgKeyData = SymmetricKey(size: .bits256)

// 2. Encrypt with own RSA public key so creator can decrypt it later
let encryptedOrgKey = try RSA_OAEP_Encrypt(publicKeyPEM: myPublicKey, plaintext: orgKeyData)
```

```
POST /api/zk/organizations
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Engineering Team",
  "billingEmail": "billing@company.com",   // optional
  "encryptedOrgKey": "<base64 encrypted org key>"
}
```

**Response `201`:**
```json
{
  "data": { "id": "org_abc123" }
}
```

The creator automatically becomes the org `owner` with `status: confirmed`. Their `encryptedOrgKey` is stored in `OrganizationUser`.

### 6b. Create a Team Vault

```
POST /api/zk/vaults
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "<AES-256 encrypted vault name, using ORG KEY>",
  "organizationId": "org_abc123"
}
```

**Response `201`:**
```json
{
  "data": { "id": "vault_xyz789" }
}
```

### 6c. Invite a Member (3 sub-steps)

**Step 1 — Look up invitee's RSA public key:**

```
GET /api/zk/accounts/public-key?email=alice@example.com
Authorization: Bearer <token>
```

**Response `200`:**
```json
{
  "data": { "publicKey": "<RSA public key PEM>" }
}
```

Returns `404` if the user does not exist or has never set up encryption keys (i.e. `hasKeys: false` and never called `keys/initialize`). Show error: *"This user must sign in through the app at least once before they can be invited."*

**Step 2 — Encrypt the org key for the invitee (client-side):**

```swift
// Decrypt own encryptedOrgKey first (you stored this at org creation or from sync)
let orgKey = try RSA_OAEP_Decrypt(privateKey: myPrivateKey, ciphertext: myEncryptedOrgKey)

// Re-encrypt for Alice using her public key
let encryptedOrgKeyForAlice = try RSA_OAEP_Encrypt(publicKeyPEM: alice.publicKey, plaintext: orgKey)
```

**Step 3 — Send the invite:**

```
POST /api/zk/organizations/{orgId}/members/invite
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "alice@example.com",
  "role": "member",
  "encryptedOrgKey": "<base64 org key encrypted with alice's public key>"
}
```

Roles: `owner` | `admin` | `member` | `readonly`

**Response `201`:**
```json
{
  "data": { "message": "Invitation sent successfully" }
}
```

Alice's membership status is now `invited`.

### 6d. Accept an Invitation (invitee's perspective)

Invitations appear in `GET /api/zk/sync` under `organizations` (only confirmed memberships are included — separately fetch pending invitations):

```
GET /api/zk/organizations
Authorization: Bearer <alice's token>
```

Returns all orgs including `status: invited`.

To get `memberId` (the `OrganizationUser.id` needed to confirm):

```
GET /api/zk/organizations/{orgId}/members
Authorization: Bearer <alice's token>
```

Find the entry where `member.email === alice.email` or `member.userId === alice.userId`.

Confirm acceptance:

```
POST /api/zk/organizations/{orgId}/members/{memberId}/confirm
Authorization: Bearer <alice's token>
Content-Type: application/json

{}
```

**Response `200`:**
```json
{
  "data": { "message": "Membership confirmed successfully" }
}
```

**Critical — refresh the JWT immediately after confirming:**

```
POST /api/zk/accounts/token/refresh
```

The refreshed token's `orgIds` will include the new org. Without this, team vault API calls will return `403` until the token is refreshed.

### 6e. Reading Team Vault Items

After confirming membership and refreshing the token, Alice's sync includes the org's vaults and items:

```
GET /api/zk/sync
Authorization: Bearer <alice's refreshed token>
```

Team vault items are decrypted with the org key:

```swift
// Decryption chain:
// 1. masterKey → decrypt protectedSymmetricKey → symmetric key
// 2. symmetric key → decrypt encryptedPrivateKey → RSA private key
// 3. RSA private key → decrypt encryptedOrgKey (from sync.organizations[].encryptedOrgKey) → org key
// 4. org key → decrypt item.encryptedData → plaintext credential
```

**Cache the org key in memory per session. Never persist it to disk.**

### 6f. Writing Team Vault Items

```
POST /api/zk/vault-items
Authorization: Bearer <token>
Content-Type: application/json

{
  "vaultId": "vault_xyz789",
  "type": 0,
  "encryptedData": "<AES-256-GCM credential JSON, encrypted with ORG KEY>"
}
```

**Critical: Items in a team vault must be encrypted with the ORG KEY, not the user's personal symmetric key.** Other members will decrypt using their own copy of the org key. Using the wrong key makes the item unreadable to other members.

---

## 7. Identifying Vault Types in Sync Response

Every vault in the sync response has:

```json
{
  "id": "vault_abc",
  "name": "<encrypted blob>",
  "userId": "user_123",       // null for team vaults
  "organizationId": null,     // set for team vaults
  "isDefault": true,          // true only for the user's auto-created default vault
  "isPersonal": true,         // userId === auth.userId AND no organizationId
  "createdAt": "...",
  "updatedAt": "..."
}
```

| Vault type | `userId` | `organizationId` | `isDefault` | `isPersonal` | Decrypt with |
|------------|:--------:|:----------------:|:-----------:|:------------:|:------------:|
| Default personal | user's ID | `null` | `true` | `true` | User symmetric key |
| Additional personal | user's ID | `null` | `false` | `true` | User symmetric key |
| Team vault | `null` | org's ID | `false` | `false` | Org key |

**Determine which key to use before decrypting any item:** check `vault.organizationId`. If set → org key. If null → user symmetric key.

---

## 8. Sync Behaviour

`GET /api/zk/sync` is the single source of truth. Call it on every app launch and after login.

**Full sync (first load):**
```
GET /api/zk/sync
```

**Delta sync (subsequent syncs):**
```
GET /api/zk/sync?since=2026-03-01T10:00:00Z
```

Delta sync filters vault items by `updatedAt >= since`. Vaults themselves are always returned in full (lightweight). Organizations are always returned in full.

**Sync response structure:**
```json
{
  "data": {
    "profile": {
      "id": "...",
      "email": "...",
      "publicKey": "...",
      "encryptedPrivateKey": "...",
      "protectedSymmetricKey": "...",
      "kdfType": 0,
      "kdfIterations": 600000,
      "kdfMemory": null,
      "kdfParallelism": null
    },
    "organizations": [
      {
        "id": "org_abc",
        "name": "Engineering Team",
        "role": "member",
        "encryptedOrgKey": "<base64>",
        "plan": "team",
        "maxMembers": 5,
        "maxVaults": 10
      }
    ],
    "defaultVaultId": "vault_xyz",
    "vaults": [ ... ],
    "items": [ ... ],
    "devices": [ ... ],
    "serverTimestamp": "2026-03-03T10:00:00Z"
  }
}
```

**Store `serverTimestamp` after each sync** — use it as the `since` parameter for the next delta sync.

**Deleted items:** Items with `deletedAt != null` are included in delta sync so the app can remove them locally. Do not show deleted items to the user.

---

## 9. Full API Reference

### Personal & Shared Vaults

| Method | Endpoint | Who | Purpose |
|--------|----------|-----|---------|
| `GET` | `/api/zk/vaults` | any user | List personal + all accessible org vaults |
| `POST` | `/api/zk/vaults` | any user (personal) / owner+admin (team) | Create vault |
| `GET` | `/api/zk/vaults/{id}` | member | Get vault + items |
| `PUT` | `/api/zk/vaults/{id}` | owner/admin | Rename vault |
| `DELETE` | `/api/zk/vaults/{id}` | owner/admin | Delete vault + cascade items |

### Vault Items

| Method | Endpoint | Who | Purpose |
|--------|----------|-----|---------|
| `GET` | `/api/zk/vault-items` | member | List items (filter: `?vaultId=...`) |
| `GET` | `/api/zk/vault-items` | member | Include soft-deleted: `?includeDeleted=true` |
| `POST` | `/api/zk/vault-items` | member (not readonly) | Create item |
| `GET` | `/api/zk/vault-items/{id}` | member | Get single item |
| `PUT` | `/api/zk/vault-items/{id}` | member (not readonly) | Update item |
| `DELETE` | `/api/zk/vault-items/{id}` | member (not readonly) | Soft-delete item |
| `POST` | `/api/zk/vault-items/bulk` | member | Bulk create/update/delete |

### Sync

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/zk/sync` | Full sync |
| `GET` | `/api/zk/sync?since={ISO8601}` | Delta sync (items only) |
| `GET` | `/api/zk/sync?excludeDeleted=true` | Sync excluding soft-deleted items |

### Encryption Keys

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/zk/accounts/keys` | Get public key + encrypted private key + KDF params |
| `POST` | `/api/zk/accounts/keys` | Update keys after master password change |
| `GET` | `/api/zk/accounts/keys/initialize` | Check if keys are initialised (`hasKeys` bool) |
| `POST` | `/api/zk/accounts/keys/initialize` | Set keys for first time (web/OAuth accounts) |

### Organisations

| Method | Endpoint | Who | Purpose |
|--------|----------|-----|---------|
| `POST` | `/api/zk/organizations` | any user | Create org (caller becomes owner) |
| `GET` | `/api/zk/organizations` | member | List orgs (all statuses) |
| `GET` | `/api/zk/organizations/{orgId}` | confirmed member | Get org details |
| `PUT` | `/api/zk/organizations/{orgId}` | owner/admin | Update name / billingEmail |
| `DELETE` | `/api/zk/organizations/{orgId}` | owner | Delete org + cascade all |

### Organisation Members

| Method | Endpoint | Who | Purpose |
|--------|----------|-----|---------|
| `GET` | `/api/zk/organizations/{orgId}/members` | confirmed member | List members (includes their `publicKey`) |
| `POST` | `/api/zk/organizations/{orgId}/members/invite` | owner/admin | Invite user |
| `GET` | `/api/zk/organizations/{orgId}/members/{memberId}` | confirmed member | Get member |
| `PUT` | `/api/zk/organizations/{orgId}/members/{memberId}` | owner/admin | Change role |
| `DELETE` | `/api/zk/organizations/{orgId}/members/{memberId}` | owner/admin | Remove member |
| `POST` | `/api/zk/organizations/{orgId}/members/{memberId}/confirm` | invitee (self only) | Accept invitation |

### Public Key Lookup

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/zk/accounts/public-key?email={email}` | Fetch RSA public key for invite flow |

---

## 10. Organisation Roles

| Role | Invite | Manage vaults | View items | Edit items | Remove members | Delete org |
|------|:------:|:-------------:|:----------:|:----------:|:--------------:|:----------:|
| `owner` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `admin` | ✓ | ✓ | ✓ | ✓ | ✓ (non-admin only) | ✗ |
| `member` | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ |
| `readonly` | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |

Roles are **enforced server-side**. The app should surface appropriate UI based on role but does not need to enforce access itself.

---

## 11. Plan Limits

| Plan | Team vaults | Max members | Max vaults per org |
|------|:-----------:|:-----------:|:-----------------:|
| `starter` | ✗ | 5 | 10 |
| `pro` | ✗ | — | 10 |
| `team` | ✓ | 5 | unlimited |
| `business` | ✓ | unlimited | unlimited |
| `enterprise` | ✓ | unlimited | unlimited |

Check `org.plan`, `org.maxMembers`, `org.maxVaults` from sync. Show an upgrade prompt for `starter`/`pro` users attempting to create a team vault.

Vault item limits are per-user across all personal vaults (plan-dependent). Server returns `403` with a descriptive message when exceeded.

---

## 12. Member Removal & Key Rotation

When a member is removed (`DELETE /api/zk/organizations/{orgId}/members/{memberId}`):
- Their `encryptedOrgKey` is cleared server-side
- Their status is set to `revoked`
- Their JWT's `orgIds` will not include this org on next refresh → all team vault calls return `403`

**There is no server-side key rotation.** After removing an untrusted member, the app should perform a **client-side key rotation ceremony**:
1. Decrypt all items in the team vault with the old org key
2. Generate a new org key
3. Re-encrypt all items with the new org key
4. Re-encrypt the new org key for each remaining confirmed member
5. Update each member's `encryptedOrgKey` via `PUT /api/zk/organizations/{orgId}/members/{memberId}`
6. Update all items via bulk `POST /api/zk/vault-items/bulk`

This ceremony is optional but recommended after removing a member for security reasons.

---

## 13. Error Codes

| HTTP | Condition |
|------|-----------|
| `400` | Missing required field, invalid format, or keys already initialised |
| `401` | Missing or expired access token |
| `403` | Insufficient role, plan limit reached, or not a confirmed member |
| `404` | Vault / item / org / member not found, or insufficient permissions |
| `409` | Email already registered; item already exists in a different vault |
| `429` | Rate limit exceeded (auth endpoints) |
| `500` | Server error |

---

## 14. Validation Checklist for the Xcode LLM

### Things the SERVER validates (app does NOT need to re-implement):
- [ ] Access token validity and expiry
- [ ] Org membership role and confirmed status
- [ ] Vault item limit per plan
- [ ] Org vault count vs `maxVaults`
- [ ] Duplicate item detection (same vault + same ciphertext)
- [ ] FK relationships (vault must exist before item can be created)

### Things the APP must validate before calling the API:
- [ ] `name` must not be empty or blank before creating a vault
- [ ] `encryptedData` must not be empty before creating an item
- [ ] `organizationId` provided only when intending to create a team vault
- [ ] Invitee's `publicKey` was retrieved successfully before attempting to encrypt org key
- [ ] Org key decrypted successfully in memory before encrypting for invitee
- [ ] JWT refreshed after accepting an org invitation (before accessing team vault items)

### Things the app does NOT need to worry about:
- [ ] Creating a default vault — it already exists after registration
- [ ] Creating a `WebUser` or `Team` — done server-side at registration
- [ ] Managing `isDefault` flag — set automatically, never changes
- [ ] Polling for org invitations separately — included in sync response via `GET /api/zk/organizations`

---

## 15. Implementation Quickstart

### Scenario A — First app launch after registration

```
1. Store defaultVaultId from registration response
2. GET /api/zk/sync
3. Decrypt protectedSymmetricKey → symmetric key (in memory)
4. Decrypt encryptedPrivateKey with symmetric key → RSA private key (in memory)
5. For each vault: check isPersonal → use symmetric key to decrypt items
6. Display credentials to user
```

### Scenario B — Create additional personal vault

```
1. PUT /api/zk/vaults (no organizationId)
2. Store returned vault ID
3. (optional) PUT /api/zk/vaults/{id} to set encrypted name
```

### Scenario C — Create team vault

```
1. Generate org key (client-side, random 256-bit key)
2. Encrypt org key with own RSA public key → encryptedOrgKey
3. POST /api/zk/organizations with {name, encryptedOrgKey}
4. Store orgId and plaintext org key in memory
5. POST /api/zk/vaults with {name (encrypted with org key), organizationId}
```

### Scenario D — Invite a member to the team

```
1. GET /api/zk/accounts/public-key?email=alice@example.com
2. Decrypt own encryptedOrgKey (from sync or in memory) → plaintext org key
3. Encrypt org key with alice's public key → encryptedOrgKeyForAlice
4. POST /api/zk/organizations/{orgId}/members/invite with {email, role, encryptedOrgKey}
```

### Scenario E — Accept an invitation (Alice's device)

```
1. GET /api/zk/organizations → find org with status: invited
2. GET /api/zk/organizations/{orgId}/members → find own memberId
3. POST /api/zk/organizations/{orgId}/members/{memberId}/confirm
4. POST /api/zk/accounts/token/refresh  ← mandatory
5. GET /api/zk/sync  ← now includes team vault + items
```

---

## 16. Account Switching & Local Data Isolation

**Critical:** The app must detect when a different user logs in and wipe all local vault data. Failure to do so causes stale items from the previous account to be pushed under the new account's auth, resulting in bulk errors ("Vault not found or access denied").

### Required Flow: Login with Account-Change Detection

```
1. Login → POST /api/zk/accounts/login → receive { userId, accessToken, ... }
2. Read locally stored lastUserId from persistent storage
3. IF userId ≠ lastUserId (account switch detected):
   ├── Delete ALL local vault items from local database
   ├── Delete ALL local vaults from local database
   ├── Delete ALL cached org keys from memory/keychain
   ├── Clear any stored serverTimestamp (force full sync)
   └── Store userId as new lastUserId
4. Full sync: GET /api/zk/sync (no ?since= parameter)
5. Replace local state entirely with sync response:
   ├── Vaults = response.vaults
   ├── Items = response.items
   ├── defaultVaultId = response.defaultVaultId
   └── Store response.serverTimestamp for future delta syncs
6. Proceed normally
```

### Safeguard: Pre-filter Before Bulk Push

Even without an account switch, the app should **never bulk-push items with unknown vault IDs**. Before any bulk operation:

```swift
// Build set of valid vault IDs from the last sync response
let validVaultIds = Set(syncResponse.vaults.map { $0.id })

// Filter out items that don't belong to any known vault
let itemsToSync = localDirtyItems.filter { validVaultIds.contains($0.vaultId) }

// Only push validated items
if !itemsToSync.isEmpty {
    POST /api/zk/vault-items/bulk with { create: itemsToSync }
}
```

Items that fail this filter should be logged locally and **not retried** — they indicate stale data from a previous account or a deleted vault.

### Handling Bulk Errors

The bulk endpoint returns per-item errors. The app must handle them:

```json
{
  "data": {
    "created": [...],
    "updated": [...],
    "deleted": [...],
    "conflicts": [...],
    "errors": [
      { "id": "item_abc", "error": "Vault not found or access denied", "operation": "create" },
      { "clientId": "local_xyz", "error": "Vault item limit reached (10). Upgrade your plan.", "operation": "create" }
    ]
  }
}
```

**Error handling rules:**
- `"Vault not found or access denied"` → Remove item from local store. It belongs to a vault the user cannot access (stale data or wrong account).
- `"Vault item limit reached"` → Show upgrade prompt. Do not retry.
- `"Item exists but access denied"` → Remove from local store. The item ID collides with another user's item.
- `"Failed to create item"` → Retry once. If still fails, log and skip.

**Never retry the same failed batch in a loop.** If a bulk push returns errors, handle them, then proceed with the next sync cycle.

---

*Last updated: March 2026*
