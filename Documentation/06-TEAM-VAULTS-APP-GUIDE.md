# Team Vaults — App Implementation Guide

This document is written for the **native DeepTerm app's AI/LLM developer**. It contains everything needed to implement team vault functionality in the macOS app.

---

## Concept

A **team vault** is a `ZKVault` associated with an `Organization` instead of an individual user. Any confirmed member of the organization can access the vault and its items.

**Model relationships:**

```
Organization
  └── OrganizationUser (junction: userId + organizationId + role + encryptedOrgKey)
  └── ZKVault.organizationId   ← team vault
        └── ZKVaultItem.encryptedData   ← items encrypted with org symmetric key

ZKVault.userId               ← personal vault (existing, unchanged)
```

**Key ZK principle:** The org has a symmetric key. The server stores it encrypted once per member (`encryptedOrgKey` on `OrganizationUser`). Each member independently decrypts it using their own RSA private key. The server never holds the plaintext org key.

---

## Authentication

All ZK endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

Access tokens expire in 15 minutes. Refresh using `POST /api/zk/accounts/token/refresh`.

The JWT payload contains `orgIds: string[]` — an array of org IDs the user is a confirmed member of. This is embedded in the token on login/refresh and is used server-side for access control.

**Important:** After successfully confirming an org invitation (see Step 3 below), the user must refresh their token so `orgIds` includes the new org.

---

## Encryption Architecture

The org uses a symmetric key (AES-256-GCM or equivalent) called the **org key**.

| What | Where Stored | How |
|------|-------------|-----|
| Org key (plaintext) | Never — only in memory | Decrypted client-side each session |
| Org key per member | `OrganizationUser.encryptedOrgKey` | RSA-OAEP encrypted with each member's public key |
| Vault items | `ZKVaultItem.encryptedData` | AES-256-GCM encrypted with the org key |

**Decryption chain for a team vault item:**
```
1. User logs in → decrypts protectedSymmetricKey using master-derived key
2. User decrypts encryptedPrivateKey using symmetric key → gets RSA private key
3. User decrypts encryptedOrgKey using RSA private key → gets org key
4. User decrypts ZKVaultItem.encryptedData using org key → plaintext credential
```

---

## Complete Flow: Create a Team Vault and Share It

### Step 1 — Create the Organization

```
POST /api/zk/organizations
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Engineering Team",
  "billingEmail": "billing@company.com",   // optional
  "encryptedOrgKey": "<base64>"
}
```

**What the app must do before this call:**
1. Generate a random AES-256 org key (client-side, never sent to server)
2. Encrypt the org key with the **creator's own RSA public key** → `encryptedOrgKey`
3. Send the encrypted org key

**Response `201`:**
```json
{
  "data": { "id": "org_abc123" }
}
```

The creator becomes the org `owner` with `status: confirmed` automatically. Their `encryptedOrgKey` is stored in `OrganizationUser`.

---

### Step 2 — Create a Team Vault

```
POST /api/zk/vaults
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "<base64 AES-encrypted vault name>",
  "organizationId": "org_abc123"
}
```

**Notes:**
- `name` can be a plaintext string or an encrypted blob — the server stores it as-is and treats it opaquely (your choice as app developer)
- Only org `owner` or `admin` can create vaults
- Subject to `org.maxVaults` limit

**Response `201`:**
```json
{
  "data": { "id": "vault_xyz789" }
}
```

---

### Step 3 — Invite a Member

This is a 3-sub-step process because of ZK constraints.

#### 3a. Look up the invitee's public key

```
GET /api/zk/accounts/public-key?email=alice@example.com
Authorization: Bearer <token>
```

**Response `200`:**
```json
{
  "data": { "publicKey": "<RSA public key, PEM or JWK>" }
}
```

Returns `404` if the user does not exist or has never set up vault encryption keys. In that case, show an error: the invitee must first sign in through the app to set up their vault before they can be invited.

#### 3b. Encrypt the org key for the invitee (client-side)

```
encryptedOrgKeyForAlice = RSA_OAEP_Encrypt(alice.publicKey, orgKeyPlaintext)
```

The inviting user must have the plaintext org key in memory (decrypted in Step 1 or during their login from `encryptedOrgKey`).

#### 3c. Send the invite

```
POST /api/zk/organizations/{orgId}/members/invite
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "alice@example.com",
  "role": "member",               // "admin" | "member" | "readonly"
  "encryptedOrgKey": "<base64>"   // org key encrypted with alice's public key
}
```

**Response `201`:**
```json
{
  "data": { "message": "Invitation sent successfully" }
}
```

The invitation is now pending. Alice has `status: invited`.

---

### Step 4 — Invitee Accepts the Invitation

Alice opens the app, syncs, and sees a pending invitation in `organizations` (status `invited`).

```
GET /api/zk/sync
Authorization: Bearer <alice's token>
```

In the response, `organizations` includes entries with `status: invited`:
```json
{
  "data": {
    "organizations": [
      {
        "id": "org_abc123",
        "name": "Engineering Team",
        "role": "member",
        "status": "invited",
        "encryptedOrgKey": "<base64>",  // encrypted with Alice's public key
        "plan": "team",
        "maxMembers": 5,
        "maxVaults": 10
      }
    ]
  }
}
```

To get the `memberId` (OrganizationUser ID) needed to confirm:

```
GET /api/zk/organizations/{orgId}/members
Authorization: Bearer <alice's token>
```

Find Alice's own entry in the list — `m.userId === alice.userId`.

Alice confirms acceptance:

```
POST /api/zk/organizations/{orgId}/members/{memberId}/confirm
Authorization: Bearer <alice's token>
Content-Type: application/json

{}
```

(Body can be empty — the `encryptedOrgKey` is already stored from the invite step. Optionally Alice can re-send an updated `encryptedOrgKey` if she wants to re-encrypt it.)

**Response `200`:**
```json
{
  "data": { "message": "Membership confirmed successfully" }
}
```

After confirming, Alice **must refresh her access token** so `orgIds` in the JWT includes the new org:

```
POST /api/zk/accounts/token/refresh
```

---

### Step 5 — Access Team Vault Items

Alice can now see team vaults in sync:

```
GET /api/zk/sync
Authorization: Bearer <alice's token — with orgIds updated>
```

Team vault items come back in `items` with `vaultId` pointing to the org vault. Alice decrypts them using the org key (which she obtained by decrypting `encryptedOrgKey` with her private key).

To add an item to a team vault:

```
POST /api/zk/vault-items
Authorization: Bearer <alice's token>
Content-Type: application/json

{
  "vaultId": "vault_xyz789",
  "encryptedData": "<AES-256-GCM encrypted credential, using ORG KEY>"
}
```

**Critical:** Items in a team vault must be encrypted with the **org key**, not the user's personal symmetric key. Other members must be able to decrypt them.

---

## Full API Reference for Team Vaults

### Organizations

| Method | Endpoint | Auth | Who | Purpose |
|--------|----------|------|-----|---------|
| `POST` | `/api/zk/organizations` | JWT | any user | Create org (caller becomes owner) |
| `GET` | `/api/zk/organizations` | JWT | member | List orgs user belongs to (all statuses) |
| `GET` | `/api/zk/organizations/{orgId}` | JWT | confirmed member | Get org details |
| `PUT` | `/api/zk/organizations/{orgId}` | JWT | owner/admin | Update name / billingEmail |
| `DELETE` | `/api/zk/organizations/{orgId}` | JWT | owner | Delete org + cascade vaults + members |

### Members

| Method | Endpoint | Auth | Who | Purpose |
|--------|----------|------|-----|---------|
| `GET` | `/api/zk/organizations/{orgId}/members` | JWT | confirmed member | List all members with `publicKey` |
| `POST` | `/api/zk/organizations/{orgId}/members/invite` | JWT | owner/admin | Invite user |
| `GET` | `/api/zk/organizations/{orgId}/members/{memberId}` | JWT | confirmed member | Get single member |
| `PUT` | `/api/zk/organizations/{orgId}/members/{memberId}` | JWT | owner/admin | Change role |
| `DELETE` | `/api/zk/organizations/{orgId}/members/{memberId}` | JWT | owner/admin | Remove member |
| `POST` | `/api/zk/organizations/{orgId}/members/{memberId}/confirm` | JWT | invitee (self) | Accept invitation |

### Vaults

| Method | Endpoint | Auth | Who | Purpose |
|--------|----------|------|-----|---------|
| `GET` | `/api/zk/vaults` | JWT | user | List personal + all accessible org vaults |
| `POST` | `/api/zk/vaults` | JWT | owner/admin | Create vault (pass `organizationId` for team vault) |
| `GET` | `/api/zk/vaults/{id}` | JWT | member | Get vault + items |
| `PUT` | `/api/zk/vaults/{id}` | JWT | owner/admin | Rename vault |
| `DELETE` | `/api/zk/vaults/{id}` | JWT | owner/admin | Delete vault + cascade items |

### Vault Items

| Method | Endpoint | Auth | Who | Purpose |
|--------|----------|------|-----|---------|
| `GET` | `/api/zk/vault-items` | JWT | member | List items (filter: `?vaultId=...`) |
| `POST` | `/api/zk/vault-items` | JWT | member | Create item |
| `GET` | `/api/zk/vault-items/{id}` | JWT | member | Get single item |
| `PUT` | `/api/zk/vault-items/{id}` | JWT | member (not readonly) | Update item |
| `DELETE` | `/api/zk/vault-items/{id}` | JWT | member (not readonly) | Soft-delete item |
| `POST` | `/api/zk/vault-items/bulk` | JWT | member | Bulk create/update/delete with conflict tracking |

### Public Key Lookup (for invite flow)

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| `GET` | `/api/zk/accounts/public-key?email={email}` | JWT | Get invitee's RSA public key |

### Sync

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| `GET` | `/api/zk/sync` | JWT | Full / delta sync — includes orgs, vaults, items |
| `GET` | `/api/zk/sync?since={ISO8601}` | JWT | Delta sync — only changes since timestamp |

---

## Organization Roles

| Role | Invite members | Manage vaults | View items | Edit items | Remove members | Delete org |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| `owner` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `admin` | ✓ | ✓ | ✓ | ✓ | ✓ (non-admin) | ✗ |
| `member` | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ |
| `readonly` | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |

Roles are validated server-side. Clients do not need to enforce them — just surface the correct UI based on the user's role returned in sync/organizations.

---

## Plan Limits

| Plan | Team vaults allowed | Max members | Max vaults |
|------|:-----------------:|:-----------:|:----------:|
| `starter` | ✗ | 5 | 10 |
| `pro` | ✗ | — | 10 |
| `team` | ✓ | 5 | unlimited |
| `business` | ✓ | unlimited | unlimited |
| `enterprise` | ✓ | unlimited | unlimited |

Check `org.plan`, `org.maxMembers`, `org.maxVaults` returned in sync. Display upgrade prompts for `starter` / `pro` plan users trying to create an org with team vaults.

---

## Identifying Team vs Personal Vaults

In sync response, each vault has:
```json
{
  "id": "...",
  "userId": null,           // null for team vault
  "organizationId": "...",  // set for team vault
  "isDefault": false,
  "isPersonal": false       // true only for the user's own personal vault
}
```

| Field | Personal vault | Team vault |
|-------|:-:|:-:|
| `userId` | user's ID | `null` |
| `organizationId` | `null` | org's ID |
| `isPersonal` | `true` | `false` |
| `isDefault` | `true` (one only) | `false` |

---

## Member Removal

When a member is removed, the server clears their `encryptedOrgKey` and sets `status: revoked`. They lose access immediately (their JWT no longer includes the `orgId` on next refresh, and the server rejects requests to org vaults).

There is no key rotation — existing items encrypted with the org key remain readable by current members. If rotation is needed for security (after removing an untrusted member), the app should re-encrypt all vault items with a new org key and re-encrypt the new org key for all remaining members (using the same invite-style encryption per member). This is a client-side key rotation ceremony; the server has no special endpoint for it.

---

## Sync Behaviour with Orgs

The sync endpoint returns org data in the response. No separate polling needed:

```json
{
  "data": {
    "organizations": [ ... ],   // all orgs (invited + confirmed)
    "vaults": [ ... ],          // personal + all accessible org vaults
    "items": [ ... ],           // items from personal + org vaults
    ...
  }
}
```

For delta sync (`?since=`), vaults are always returned in full (they're lightweight). Only items are filtered by `updatedAt >= since`.

---

## Error Codes

| HTTP | `error` field | Meaning |
|------|--------------|---------|
| 400 | `Bad Request` | Missing or invalid field |
| 401 | `Unauthorized` | Missing or expired token |
| 403 | `Forbidden` | Insufficient role (e.g. member trying to invite) |
| 403 | `Forbidden` | Plan limit reached |
| 404 | `Not Found` | Org/vault/member not found OR insufficient permissions |
| 409 | `Conflict` | User already a member; item already exists |
| 429 | `Too Many Requests` | Rate limit exceeded |
| 500 | `Internal Server Error` | Server error |

---

## Quick Implementation Checklist

**Creating a team vault:**
- [ ] Generate org key (client-side, in memory)
- [ ] Encrypt org key with own public key → `encryptedOrgKey`
- [ ] `POST /api/zk/organizations` with name + encryptedOrgKey
- [ ] `POST /api/zk/vaults` with name + organizationId

**Inviting a member:**
- [ ] `GET /api/zk/accounts/public-key?email=...` to fetch invitee's public key
- [ ] Decrypt own `encryptedOrgKey` in memory to get plaintext org key
- [ ] Encrypt org key with invitee's public key → `encryptedOrgKeyForInvitee`
- [ ] `POST /api/zk/organizations/{orgId}/members/invite` with email + role + encryptedOrgKey

**Accepting an invitation:**
- [ ] Sync → find org with `status: invited`
- [ ] `GET /api/zk/organizations/{orgId}/members` → find own memberId
- [ ] `POST /api/zk/organizations/{orgId}/members/{memberId}/confirm`
- [ ] Refresh JWT → orgIds now includes new org

**Reading/writing team vault items:**
- [ ] On login/sync: decrypt `encryptedOrgKey` using own RSA private key → plaintext org key
- [ ] Cache org key in memory (never persist)
- [ ] Decrypt `item.encryptedData` using org key to display
- [ ] Encrypt new items with org key before `POST /api/zk/vault-items`

---

*Last updated: March 2026*
