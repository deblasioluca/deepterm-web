# DeepTerm Zero-Knowledge Vault API Documentation

## Overview

DeepTerm implements a **zero-knowledge vault system** for SSH credential management, inspired by Bitwarden's architecture. The server never has access to unencrypted vault data - all encryption and decryption happens client-side.

## Base URL

```
https://deepterm.net/api/zk
```

## Authentication

### JWT Bearer Token

All endpoints (except registration, login, and password hint) require a JWT access token:

```http
Authorization: Bearer <access_token>
```

Access tokens expire after 15 minutes. Use the refresh token to obtain new access tokens.

---

## Cryptographic Design

### Key Hierarchy

1. **Master Password** → Never sent to the server
2. **Master Key** = PBKDF2-SHA256(Master Password, email, 600,000 iterations) OR Argon2id
3. **Master Password Hash** = PBKDF2-SHA256(Master Key, Master Password, 1 iteration) → Sent to server for auth
4. **Symmetric Key** = Random 512-bit key, encrypted with Master Key (stored on server as `protectedSymmetricKey`)
5. **RSA Key Pair** (2048-bit) → Private key encrypted with Symmetric Key, public key plaintext
6. **Vault Items** = Encrypted with user's Symmetric Key using AES-256-CBC + HMAC-SHA256

### Organization Sharing Flow

1. Organization has its own Symmetric Key
2. When inviting a user, the Org Key is encrypted with their RSA public key
3. User decrypts: their Private Key → Org Key → Vault Items

---

## API Endpoints

### Accounts

#### Register

```http
POST /accounts/register
Content-Type: application/json

{
  "email": "user@example.com",
  "masterPasswordHash": "<base64 encoded hash>",
  "protectedSymmetricKey": "<encrypted key blob>",
  "publicKey": "<RSA public key PEM>",
  "encryptedPrivateKey": "<encrypted RSA private key>",
  "kdfType": 0,
  "kdfIterations": 600000,
  "kdfMemory": null,
  "kdfParallelism": null,
  "passwordHint": "optional hint"
}
```

**Response (201):**
```json
{
  "id": "user_id"
}
```

#### Login

```http
POST /accounts/login
Content-Type: application/json

{
  "email": "user@example.com",
  "masterPasswordHash": "<base64 encoded hash>",
  "deviceName": "MacBook Pro",
  "deviceType": "desktop"
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "random_refresh_token",
  "expiresIn": 900,
  "protectedSymmetricKey": "...",
  "publicKey": "...",
  "encryptedPrivateKey": "...",
  "kdfType": 0,
  "kdfIterations": 600000,
  "kdfMemory": null,
  "kdfParallelism": null,
  "user": {
    "id": "...",
    "email": "user@example.com",
    "emailVerified": false
  }
}
```

#### Refresh Token

```http
POST /accounts/token/refresh
Content-Type: application/json

{
  "refreshToken": "<refresh_token>"
}
```

**Response (200):**
```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "expiresIn": 900
}
```

#### Logout

```http
POST /accounts/logout
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "message": "Logged out successfully"
}
```

#### Delete Account

```http
DELETE /accounts
Authorization: Bearer <token>
Content-Type: application/json

{
  "masterPasswordHash": "<current password hash>"
}
```

#### Password Hint

```http
POST /accounts/password-hint
Content-Type: application/json

{
  "email": "user@example.com"
}
```

#### Get Keys

```http
GET /accounts/keys
Authorization: Bearer <token>
```

**Response:**
```json
{
  "publicKey": "...",
  "encryptedPrivateKey": "...",
  "protectedSymmetricKey": "...",
  "kdfType": 0,
  "kdfIterations": 600000
}
```

#### Update Keys

```http
POST /accounts/keys
Authorization: Bearer <token>
Content-Type: application/json

{
  "protectedSymmetricKey": "...",
  "encryptedPrivateKey": "...",

  // Optional but recommended when transitioning from password-based setup
  // to hash-based login (/accounts/login):
  "masterPasswordHash": "<base64 encoded hash>",
  "kdfType": 0,
  "kdfIterations": 600000,
  "kdfMemory": null,
  "kdfParallelism": null
}
```

**Notes:**
- `POST /accounts/login` verifies `masterPasswordHash` against the server-stored bcrypt hash.
- Accounts originally created via the password-based login path may have a server-stored hash derived from the plain password.
- To enable hash-based login in future sessions, the client should submit `masterPasswordHash` (and KDF params) when uploading/rotating keys.

#### Initialize Keys (first-time setup)

Use this after logging in via the password-based flow when the server returns `hasKeys: false`.

```http
POST /accounts/keys/initialize
Authorization: Bearer <token>
Content-Type: application/json

{
  "protectedSymmetricKey": "<encrypted symmetric key blob>",
  "publicKey": "<RSA public key PEM>",
  "encryptedPrivateKey": "<encrypted RSA private key>",

  // Optional but recommended:
  "masterPasswordHash": "<base64 encoded hash>",
  "kdfType": 0,
  "kdfIterations": 600000,
  "kdfMemory": null,
  "kdfParallelism": null
}
```

**Response (200):**
```json
{
  "message": "Encryption keys initialized successfully",
  "hasKeys": true
}
```

#### Change Password

```http
POST /accounts/password/change
Authorization: Bearer <token>
Content-Type: application/json

{
  "currentMasterPasswordHash": "...",
  "newMasterPasswordHash": "...",
  "newProtectedSymmetricKey": "...",
  "newEncryptedPrivateKey": "...",
  "kdfIterations": 600000
}
```

---

### Sync

```http
GET /sync
Authorization: Bearer <token>
Query: ?since=2024-01-01T00:00:00Z&excludeDeleted=false
```

**Response:**
```json
{
  "profile": {
    "id": "...",
    "email": "...",
    "publicKey": "...",
    "encryptedPrivateKey": "...",
    "protectedSymmetricKey": "..."
  },
  "organizations": [{
    "id": "...",
    "name": "...",
    "role": "owner",
    "encryptedOrgKey": "..."
  }],
  "vaults": [{
    "id": "...",
    "name": "<encrypted>",
    "organizationId": null,
    "isPersonal": true
  }],
  "items": [{
    "id": "...",
    "vaultId": "...",
    "type": 0,
    "name": "<encrypted>",
    "encryptedData": "<encrypted JSON blob>",
    "revisionDate": "2024-01-01T00:00:00Z",
    "deletedAt": null
  }],
  "devices": [],
  "serverTimestamp": "2024-01-01T00:00:00Z"
}
```

---

### Vault Items

#### List Items

```http
GET /vault-items
Authorization: Bearer <token>
Query: ?vaultId=xxx&includeDeleted=false
```

#### Create Item

```http
POST /vault-items
Authorization: Bearer <token>
Content-Type: application/json

{
  "vaultId": "...",
  "type": 0,
  "name": "<encrypted name>",
  "encryptedData": "<encrypted JSON blob>"
}
```

**Response (201):**
```json
{
  "id": "...",
  "revisionDate": "2024-01-01T00:00:00Z"
}
```

#### Get Item

```http
GET /vault-items/{id}
Authorization: Bearer <token>
```

#### Update Item

```http
PUT /vault-items/{id}
Authorization: Bearer <token>
If-Match: 2024-01-01T00:00:00Z
Content-Type: application/json

{
  "name": "<encrypted name>",
  "encryptedData": "<encrypted JSON blob>"
}
```

**Response (409 on conflict):**
```json
{
  "error": "Conflict",
  "message": "The item has been modified. Please sync and retry.",
  "currentRevisionDate": "2024-01-01T00:01:00Z"
}
```

#### Delete Item

```http
DELETE /vault-items/{id}
Authorization: Bearer <token>
Query: ?permanent=false
```

#### Bulk Operations

```http
POST /vault-items/bulk
Authorization: Bearer <token>
Content-Type: application/json

{
  "create": [{
    "vaultId": "...",
    "name": "...",
    "encryptedData": "...",
    "clientId": "temp-id-1"
  }],
  "update": [{
    "id": "...",
    "name": "...",
    "encryptedData": "...",
    "revisionDate": "2024-01-01T00:00:00Z"
  }],
  "delete": [{
    "id": "...",
    "permanent": false
  }]
}
```

**Response:**
```json
{
  "created": [{ "id": "...", "clientId": "temp-id-1", "revisionDate": "..." }],
  "updated": [{ "id": "...", "revisionDate": "..." }],
  "deleted": ["..."],
  "conflicts": [{ "id": "...", "currentRevisionDate": "...", "operation": "update" }],
  "errors": []
}
```

---

### Vaults (Collections)

#### List Vaults

```http
GET /vaults
Authorization: Bearer <token>
```

**Response:**
```json
[{
  "id": "...",
  "name": "<encrypted>",
  "organizationId": null,
  "isPersonal": true,
  "itemCount": 5
}]
```

#### Create Vault

```http
POST /vaults
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "<encrypted name>",
  "organizationId": null
}
```

#### Get Vault

```http
GET /vaults/{id}
Authorization: Bearer <token>
```

#### Update Vault

```http
PUT /vaults/{id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "<encrypted name>"
}
```

#### Delete Vault

```http
DELETE /vaults/{id}
Authorization: Bearer <token>
```

---

### Organizations

#### List Organizations

```http
GET /organizations
Authorization: Bearer <token>
```

#### Create Organization

```http
POST /organizations
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "My Team",
  "billingEmail": "billing@example.com",
  "encryptedOrgKey": "<org key encrypted with your public key>"
}
```

#### Get Organization

```http
GET /organizations/{orgId}
Authorization: Bearer <token>
```

#### Update Organization

```http
PUT /organizations/{orgId}
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Name",
  "billingEmail": "new@example.com"
}
```

#### Delete Organization

```http
DELETE /organizations/{orgId}
Authorization: Bearer <token>
```

---

### Organization Members

#### List Members

```http
GET /organizations/{orgId}/members
Authorization: Bearer <token>
```

**Response:**
```json
[{
  "id": "membership_id",
  "userId": "...",
  "email": "member@example.com",
  "publicKey": "...",
  "role": "member",
  "status": "confirmed"
}]
```

#### Invite Member

```http
POST /organizations/{orgId}/members/invite
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "newmember@example.com",
  "role": "member",
  "encryptedOrgKey": "<org key encrypted with invitee's public key>"
}
```

#### Confirm Membership

```http
POST /organizations/{orgId}/members/{memberId}/confirm
Authorization: Bearer <token>
Content-Type: application/json

{
  "encryptedOrgKey": "<optional: re-encrypted org key>"
}
```

#### Update Member Role

```http
PUT /organizations/{orgId}/members/{memberId}
Authorization: Bearer <token>
Content-Type: application/json

{
  "role": "admin"
}
```

#### Remove Member

```http
DELETE /organizations/{orgId}/members/{memberId}
Authorization: Bearer <token>
```

---

### Audit Log

```http
GET /organizations/{orgId}/audit-log
Authorization: Bearer <token>
Query: ?page=1&limit=50&eventType=vault_item_created&start=2024-01-01&end=2024-12-31
```

**Response:**
```json
{
  "data": [{
    "id": "...",
    "userId": "...",
    "userEmail": "...",
    "eventType": "vault_item_created",
    "targetType": "vault_item",
    "targetId": "...",
    "ipAddress": "1.2.3.4",
    "timestamp": "2024-01-01T00:00:00Z"
  }],
  "total": 100,
  "page": 1,
  "limit": 50,
  "totalPages": 2
}
```

---

### License / Subscription

#### Get Current Subscription

Retrieve the authenticated user's current subscription, plan features, and usage limits. This is the primary endpoint for the desktop/mobile app to determine feature availability.

Supports both **Stripe** (web) and **Apple IAP** subscriptions. When both are active, the higher-tier plan takes precedence.

```http
GET /accounts/license
Authorization: Bearer <token>
```

**Response (active subscription):**
```json
{
  "user": {
    "id": "zk_abc123",
    "email": "user@example.com",
    "name": "Jane Doe"
  },
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

**Response (no subscription / free tier):**
```json
{
  "user": {
    "id": "zk_abc123",
    "email": "user@example.com",
    "name": null
  },
  "license": {
    "valid": false,
    "plan": "starter",
    "status": "free",
    "expiresAt": null,
    "currentPeriodStart": null,
    "currentPeriodEnd": null,
    "cancelAtPeriodEnd": false,
    "seats": 1,
    "teamId": null,
    "teamName": null,
    "source": "none"
  },
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
  "limits": {
    "maxHosts": 5,
    "maxVaults": 1,
    "maxDevices": 1
  }
}
```

**Field reference:**

| Field | Type | Description |
|-------|------|-------------|
| `license.valid` | boolean | Whether the user has an active paid subscription |
| `license.plan` | string | Effective plan: `starter`, `pro`, `team`, `business` |
| `license.status` | string | `active`, `trialing`, `past_due`, `canceled`, `free` |
| `license.expiresAt` | string \| null | ISO 8601 subscription expiry (latest of Stripe/Apple) |
| `license.currentPeriodStart` | string \| null | ISO 8601 current billing period start |
| `license.currentPeriodEnd` | string \| null | ISO 8601 current billing period end |
| `license.cancelAtPeriodEnd` | boolean | If true, subscription won't renew |
| `license.seats` | number | Number of seats in the plan |
| `license.teamId` | string \| null | Team ID (null for individual plans) |
| `license.teamName` | string \| null | Team name |
| `license.source` | string | `stripe`, `apple`, or `none` |
| `features.*` | boolean | Feature flags for the effective plan |
| `limits.maxHosts` | number | Max hosts allowed (-1 = unlimited) |
| `limits.maxVaults` | number | Max vaults allowed (-1 = unlimited) |
| `limits.maxDevices` | number | Max devices allowed (-1 = unlimited) |

**Errors:**

| Status | Error | Description |
|--------|-------|-------------|
| 401 | `Unauthorized` | Missing or invalid Bearer token |
| 404 | `User not found` | ZK user record not found |

---

## Vault Item Types

| Type | Value | Description |
|------|-------|-------------|
| SSH Password | 0 | Username/password authentication |
| SSH Key | 1 | Private key authentication |
| SSH Certificate | 2 | Certificate-based authentication |

---

## Encrypted Data Schema

The `encryptedData` field contains an encrypted JSON blob with the following structure (after decryption):

```json
{
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

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Bad Request",
  "message": "Detailed error message"
}
```

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 204 | No Content (successful delete) |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict |
| 429 | Too Many Requests |
| 500 | Internal Server Error |

---

## Rate Limiting

Authentication endpoints are rate-limited:

- **5 attempts per 15 minutes** per email/IP combination
- After exceeding, blocked for 15 minutes

Rate limit headers:
```http
X-RateLimit-Remaining: 4
X-RateLimit-Reset: 2024-01-01T00:15:00Z
Retry-After: 900
```

---

## Security Considerations

1. **HTTPS Only** - All API traffic must use HTTPS
2. **Double Hashing** - masterPasswordHash is hashed again with bcrypt (cost 12) on the server
3. **Token Rotation** - Refresh tokens are rotated on each use
4. **Audit Logging** - All sensitive operations are logged
5. **Soft Delete** - Vault items are soft-deleted (recoverable for 30 days)
6. **Input Validation** - All inputs are validated server-side
7. **CORS** - Restricted to known client origins
