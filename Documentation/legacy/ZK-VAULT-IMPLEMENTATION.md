# DeepTerm Zero-Knowledge Vault System
## Comprehensive Implementation Documentation

**Version:** 1.0.0  
**Last Updated:** February 2026  
**Architecture:** Zero-Knowledge End-to-End Encrypted Vault

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Cryptographic Design](#3-cryptographic-design)
4. [Database Schema](#4-database-schema)
5. [API Layer](#5-api-layer)
6. [Authentication System](#6-authentication-system)
7. [Security Mechanisms](#7-security-mechanisms)
8. [Core Library](#8-core-library)
9. [Organization & Sharing](#9-organization--sharing)
10. [Audit & Compliance](#10-audit--compliance)
11. [Deployment](#11-deployment)
12. [Configuration Reference](#12-configuration-reference)

---

## 1. Executive Summary

### Purpose

The DeepTerm Zero-Knowledge (ZK) Vault System is a secure credential management solution designed specifically for SSH connections. It enables users to store, sync, and share SSH credentials (passwords, private keys, certificates) across devices while maintaining **true zero-knowledge encryption** — the server never has access to unencrypted data.

### Key Features

| Feature | Description |
|---------|-------------|
| **Zero-Knowledge Encryption** | All encryption/decryption happens client-side |
| **Multi-Device Sync** | Seamless synchronization across desktop/mobile clients |
| **Team Sharing** | Secure credential sharing via RSA key exchange |
| **Optimistic Concurrency** | Conflict detection for concurrent edits |
| **Comprehensive Audit Logging** | Full audit trail for compliance |
| **Rate Limiting** | Protection against brute-force attacks |
| **Soft Delete** | 30-day recovery window for deleted items |

### Technology Stack

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT SIDE                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │  macOS/iOS/Android App                          │   │
│  │  • PBKDF2/Argon2id Key Derivation              │   │
│  │  • AES-256-CBC + HMAC-SHA256 Encryption        │   │
│  │  • RSA-2048 Key Pair Management                │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼ HTTPS (TLS 1.3)
┌─────────────────────────────────────────────────────────┐
│                    SERVER SIDE                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Next.js 14 API Routes                          │   │
│  │  • JWT Authentication (15min access tokens)     │   │
│  │  • Bcrypt Password Hashing (12 rounds)         │   │
│  │  • Rate Limiting (5 attempts/15min)            │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Prisma ORM + SQLite/PostgreSQL                 │   │
│  │  • Encrypted blobs stored as-is                │   │
│  │  • No plaintext credential data                │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Redis (Optional)                               │   │
│  │  • Rate limiting cache                         │   │
│  │  • Session management                          │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Architecture Overview

### System Components

```
┌────────────────────────────────────────────────────────────────┐
│                     DEEPTERM ZK VAULT                          │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │   Accounts   │  │    Sync      │  │    Vault Items       │ │
│  │   Service    │  │   Service    │  │    Service           │ │
│  ├──────────────┤  ├──────────────┤  ├──────────────────────┤ │
│  │ • Register   │  │ • Full sync  │  │ • CRUD operations    │ │
│  │ • Login      │  │ • Delta sync │  │ • Bulk operations    │ │
│  │ • Logout     │  │ • Device     │  │ • Concurrency ctrl   │ │
│  │ • Keys mgmt  │  │   tracking   │  │ • Soft delete        │ │
│  │ • Password   │  │              │  │                      │ │
│  │   change     │  │              │  │                      │ │
│  └──────────────┘  └──────────────┘  └──────────────────────┘ │
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │   Vaults     │  │Organizations │  │    Security          │ │
│  │   Service    │  │   Service    │  │    Layer             │ │
│  ├──────────────┤  ├──────────────┤  ├──────────────────────┤ │
│  │ • Collections│  │ • Teams      │  │ • JWT validation     │ │
│  │ • Personal   │  │ • Members    │  │ • Rate limiting      │ │
│  │ • Shared     │  │ • Invites    │  │ • Audit logging      │ │
│  │              │  │ • Audit logs │  │ • CORS handling      │ │
│  └──────────────┘  └──────────────┘  └──────────────────────┘ │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│                      DATA LAYER                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Prisma ORM                                              │ │
│  │  Models: ZKUser, ZKVault, ZKVaultItem, Organization,     │ │
│  │          OrganizationUser, Device, RefreshToken,         │ │
│  │          ZKAuditLog, RateLimitEntry                      │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### Request Flow

```
Client Request
      │
      ▼
┌─────────────────┐
│  CORS Handler   │ ──────▶ OPTIONS requests
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Rate Limiter    │ ──────▶ 429 Too Many Requests
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ JWT Validator   │ ──────▶ 401 Unauthorized
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Request Handler │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Audit Logger    │
└────────┬────────┘
         │
         ▼
     Response
```

---

## 3. Cryptographic Design

### Key Hierarchy

The system implements a Bitwarden-inspired key hierarchy that ensures true zero-knowledge security:

```
┌─────────────────────────────────────────────────────────────┐
│                    KEY HIERARCHY                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Level 0: Master Password                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  User's master password (NEVER leaves the client)   │   │
│  └──────────────────────────┬──────────────────────────┘   │
│                             │                               │
│                             ▼ KDF (PBKDF2/Argon2id)         │
│                                                             │
│  Level 1: Master Key                                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  masterKey = KDF(masterPassword, email, iterations)  │   │
│  └──────────────────────────┬──────────────────────────┘   │
│                             │                               │
│          ┌──────────────────┼──────────────────┐           │
│          ▼                  ▼                  ▼           │
│                                                             │
│  Level 2A: Password Hash    │   Level 2B: Symmetric Key    │
│  ┌─────────────────────┐    │   ┌────────────────────────┐ │
│  │ masterPasswordHash  │    │   │ symmetricKey (512-bit) │ │
│  │ = KDF(masterKey,    │    │   │ = random()             │ │
│  │   masterPassword,1) │    │   │                        │ │
│  │                     │    │   │ Stored encrypted as:   │ │
│  │ → Sent to server    │    │   │ protectedSymmetricKey  │ │
│  │ → Hashed again with │    │   │ = AES(symmetricKey,    │ │
│  │   bcrypt(12 rounds) │    │   │        masterKey)      │ │
│  └─────────────────────┘    │   └───────────┬────────────┘ │
│                             │               │              │
│                             │               ▼              │
│                             │                              │
│  Level 3: RSA Key Pair      │   Level 3: Vault Items      │
│  ┌─────────────────────┐    │   ┌────────────────────────┐ │
│  │ RSA 2048-bit        │    │   │ encryptedData =        │ │
│  │                     │    │   │   AES-256-CBC(data,    │ │
│  │ publicKey: stored   │    │   │     symmetricKey)      │ │
│  │   as plaintext      │    │   │   + HMAC-SHA256        │ │
│  │                     │    │   │                        │ │
│  │ privateKey: stored  │    │   │ Opaque to server       │ │
│  │   encrypted with    │    │   └────────────────────────┘ │
│  │   symmetricKey      │    │                              │
│  └──────────┬──────────┘    │                              │
│             │               │                              │
│             ▼               │                              │
│                             │                              │
│  Level 4: Organization Keys │                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ encryptedOrgKey = RSA_Encrypt(orgSymmetricKey,      │   │
│  │                               userPublicKey)         │   │
│  │                                                      │   │
│  │ Enables secure sharing without server knowledge     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Key Derivation Functions

| Type | ID | Parameters | Use Case |
|------|----|-----------:|----------|
| **PBKDF2-SHA256** | 0 | 600,000 iterations | Default, widely compatible |
| **Argon2id** | 1 | 64MB memory, 4 threads, 3 iterations | Recommended for high security |

### Encryption Algorithms

| Purpose | Algorithm | Key Size | Notes |
|---------|-----------|----------|-------|
| Vault data encryption | AES-256-CBC | 256-bit | With HMAC-SHA256 authentication |
| Key encryption | AES-256-CBC | 256-bit | Symmetric key encrypted with master key |
| Organization sharing | RSA-OAEP | 2048-bit | Org key encrypted with user's public key |

---

## 4. Database Schema

### Entity Relationship Diagram

```
┌─────────────────────┐       ┌─────────────────────┐
│       ZKUser        │       │    Organization     │
├─────────────────────┤       ├─────────────────────┤
│ id (PK)             │       │ id (PK)             │
│ email (unique)      │       │ name                │
│ masterPasswordHash  │       │ billingEmail        │
│ protectedSymmetric  │       │ plan                │
│   Key               │◄──────│ maxMembers          │
│ publicKey           │       │ maxVaults           │
│ encryptedPrivateKey │       │ createdAt           │
│ kdfType             │       │ updatedAt           │
│ kdfIterations       │       └─────────┬───────────┘
│ kdfMemory           │                 │
│ kdfParallelism      │                 │
│ passwordHint        │                 │
│ emailVerified       │      ┌──────────┴──────────┐
│ createdAt           │      │  OrganizationUser   │
│ updatedAt           │      ├─────────────────────┤
└─────────┬───────────┘      │ id (PK)             │
          │                  │ organizationId (FK) │
          │                  │ userId (FK)         │
          ├──────────────────│ role                │
          │                  │ encryptedOrgKey     │
          │                  │ status              │
          │                  │ createdAt           │
          │                  │ updatedAt           │
          │                  └─────────────────────┘
          │
          │       ┌─────────────────────┐
          │       │       ZKVault       │
          │       ├─────────────────────┤
          ├──────►│ id (PK)             │
          │       │ userId (FK)         │◄─────┐
          │       │ organizationId (FK) │      │
          │       │ name (encrypted)    │      │
          │       │ createdAt           │      │
          │       │ updatedAt           │      │
          │       └─────────┬───────────┘      │
          │                 │                  │
          │                 │                  │
          │       ┌─────────┴───────────┐      │
          │       │     ZKVaultItem     │      │
          │       ├─────────────────────┤      │
          │       │ id (PK)             │      │
          │       │ vaultId (FK)        │──────┘
          │       │ userId (FK)         │
          │       │ type (0,1,2)        │
          │       │ name (encrypted)    │
          │       │ encryptedData       │
          │       │ revisionDate        │
          │       │ deletedAt           │
          │       │ createdAt           │
          │       │ updatedAt           │
          │       └─────────────────────┘
          │
          │       ┌─────────────────────┐
          ├──────►│       Device        │
          │       ├─────────────────────┤
          │       │ id (PK)             │
          │       │ userId (FK)         │
          │       │ name                │
          │       │ deviceType          │
          │       │ identifier (unique) │
          │       │ pushToken           │
          │       │ lastActive          │
          │       │ createdAt           │
          │       └─────────────────────┘
          │
          │       ┌─────────────────────┐
          ├──────►│    RefreshToken     │
          │       ├─────────────────────┤
          │       │ id (PK)             │
          │       │ userId (FK)         │
          │       │ deviceId            │
          │       │ tokenHash (unique)  │
          │       │ expiresAt           │
          │       │ isRevoked           │
          │       │ createdAt           │
          │       │ lastUsedAt          │
          │       └─────────────────────┘
          │
          │       ┌─────────────────────┐
          └──────►│     ZKAuditLog      │
                  ├─────────────────────┤
                  │ id (PK)             │
                  │ userId (FK)         │
                  │ organizationId (FK) │
                  │ eventType           │
                  │ targetType          │
                  │ targetId            │
                  │ ipAddress           │
                  │ userAgent           │
                  │ deviceInfo (JSON)   │
                  │ metadata (JSON)     │
                  │ timestamp           │
                  └─────────────────────┘
```

### Model Details

#### ZKUser
Primary user model with cryptographic credentials.

```typescript
model ZKUser {
  id                      String    @id @default(cuid())
  email                   String    @unique
  masterPasswordHash      String    // Bcrypt hash of client-side hash
  protectedSymmetricKey   String    // AES-encrypted symmetric key
  publicKey               String    // RSA public key (PEM format)
  encryptedPrivateKey     String    // RSA private key (encrypted)
  kdfType                 Int       @default(0)  // 0=PBKDF2, 1=Argon2id
  kdfIterations           Int       @default(600000)
  kdfMemory               Int?      // Argon2id memory (KB)
  kdfParallelism          Int?      // Argon2id threads
  passwordHint            String?
  emailVerified           Boolean   @default(false)
  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt
}
```

#### ZKVaultItem
Encrypted credential storage.

```typescript
model ZKVaultItem {
  id              String    @id @default(cuid())
  vaultId         String
  userId          String
  type            Int       @default(0)  // 0=password, 1=key, 2=cert
  name            String    // Encrypted display name
  encryptedData   String    // Encrypted JSON blob
  revisionDate    DateTime  @default(now())  // For concurrency
  deletedAt       DateTime? // Soft delete
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@index([vaultId])
  @@index([userId])
  @@index([revisionDate])
  @@index([deletedAt])
}
```

#### Vault Item Types

| Type | Value | Description |
|------|:-----:|-------------|
| SSH Password | 0 | Username/password authentication |
| SSH Key | 1 | Private key (RSA, Ed25519, ECDSA) |
| SSH Certificate | 2 | Certificate-based authentication |

#### Encrypted Data Schema (Client-Side)

```json
{
  "host": "server.example.com",
  "port": 22,
  "username": "admin",
  "password": "secret123",
  "privateKey": "-----BEGIN OPENSSH PRIVATE KEY-----\n...",
  "passphrase": "key-passphrase",
  "certificate": "-----BEGIN CERTIFICATE-----\n...",
  "notes": "Production web server",
  "tags": ["production", "web", "critical"]
}
```

---

## 5. API Layer

### Base URL

```
https://deepterm.net/api/zk
```

### Endpoint Reference

#### Account Management

| Endpoint | Method | Auth | Description |
|----------|--------|:----:|-------------|
| `/accounts/register` | POST | ❌ | Register new user with encrypted keys |
| `/accounts/login` | POST | ❌ | Authenticate and receive token pair |
| `/accounts/logout` | POST | ✅ | Revoke all refresh tokens |
| `/accounts` | DELETE | ✅ | Delete account (requires password) |
| `/accounts/password-hint` | POST | ❌ | Request password hint |
| `/accounts/keys` | GET | ✅ | Retrieve encryption keys |
| `/accounts/keys` | POST | ✅ | Update encryption keys |
| `/accounts/password/change` | POST | ✅ | Change master password |
| `/accounts/token/refresh` | POST | ❌ | Refresh access token |

#### Data Sync

| Endpoint | Method | Auth | Description |
|----------|--------|:----:|-------------|
| `/sync` | GET | ✅ | Full or delta sync of all data |

**Query Parameters:**
- `since`: ISO8601 timestamp for delta sync
- `excludeDeleted`: Boolean to exclude soft-deleted items

#### Vaults

| Endpoint | Method | Auth | Description |
|----------|--------|:----:|-------------|
| `/vaults` | GET | ✅ | List all accessible vaults |
| `/vaults` | POST | ✅ | Create new vault |
| `/vaults/{id}` | GET | ✅ | Get vault with items |
| `/vaults/{id}` | PUT | ✅ | Update vault |
| `/vaults/{id}` | DELETE | ✅ | Delete vault and contents |

#### Vault Items

| Endpoint | Method | Auth | Description |
|----------|--------|:----:|-------------|
| `/vault-items` | POST | ✅ | Create new item |
| `/vault-items/{id}` | GET | ✅ | Get specific item |
| `/vault-items/{id}` | PUT | ✅ | Update item |
| `/vault-items/{id}` | DELETE | ✅ | Delete item |
| `/vault-items/bulk` | POST | ✅ | Bulk operations |

**Optimistic Concurrency:**
```http
PUT /vault-items/{id}
If-Match: 2026-02-09T12:00:00.000Z
```

#### Organizations

| Endpoint | Method | Auth | Description |
|----------|--------|:----:|-------------|
| `/organizations` | GET | ✅ | List user's organizations |
| `/organizations` | POST | ✅ | Create organization |
| `/organizations/{orgId}` | GET | ✅ | Get organization details |
| `/organizations/{orgId}` | PUT | ✅ | Update organization |
| `/organizations/{orgId}` | DELETE | ✅ | Delete organization |
| `/organizations/{orgId}/members` | GET | ✅ | List members |
| `/organizations/{orgId}/members/invite` | POST | ✅ | Invite user |
| `/organizations/{orgId}/members/{id}` | PUT | ✅ | Update member role |
| `/organizations/{orgId}/members/{id}` | DELETE | ✅ | Remove member |
| `/organizations/{orgId}/members/{id}/confirm` | POST | ✅ | Accept invitation |
| `/organizations/{orgId}/audit-log` | GET | ✅ | View audit logs |

### Response Format

#### Success Response
```json
{
  "id": "cmlep231p000082hgoovenid4",
  "data": { ... }
}
```

#### Error Response
```json
{
  "error": "Bad Request",
  "message": "Detailed error description"
}
```

### HTTP Status Codes

| Code | Meaning |
|:----:|---------|
| 200 | Success |
| 201 | Created |
| 204 | No Content (delete success) |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict (concurrency) |
| 429 | Too Many Requests |
| 500 | Internal Server Error |

---

## 6. Authentication System

### Registration Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    REGISTRATION FLOW                        │
└─────────────────────────────────────────────────────────────┘

  CLIENT                                              SERVER
    │                                                    │
    │  1. Generate cryptographic keys                    │
    │  ┌──────────────────────────────┐                 │
    │  │ masterKey = KDF(password,    │                 │
    │  │              email, 600000)  │                 │
    │  │ symmetricKey = random(512)   │                 │
    │  │ RSA keypair = generate()     │                 │
    │  └──────────────────────────────┘                 │
    │                                                    │
    │  2. Encrypt keys                                   │
    │  ┌──────────────────────────────┐                 │
    │  │ protectedSymmetricKey =      │                 │
    │  │   AES(symmetricKey,masterKey)│                 │
    │  │ encryptedPrivateKey =        │                 │
    │  │   AES(privateKey,symmetricKey│                 │
    │  │ masterPasswordHash =         │                 │
    │  │   KDF(masterKey,password,1)  │                 │
    │  └──────────────────────────────┘                 │
    │                                                    │
    │  POST /accounts/register                           │
    │  {                                                 │
    │    email, masterPasswordHash,                      │
    │    protectedSymmetricKey, publicKey,               │
    │    encryptedPrivateKey, kdfType,                   │
    │    kdfIterations                                   │
    │  }                                                 │
    │ ─────────────────────────────────────────────────► │
    │                                                    │
    │                     3. Hash again with bcrypt(12)  │
    │                     ┌─────────────────────────┐    │
    │                     │ storedHash = bcrypt(    │    │
    │                     │   masterPasswordHash,12)│    │
    │                     └─────────────────────────┘    │
    │                                                    │
    │                     4. Create user + default vault │
    │                                                    │
    │                     5. Audit log: user_registered  │
    │                                                    │
    │ ◄───────────────────────────────────────────────── │
    │  { id: "user_id" }                                 │
    │                                                    │
```

### Login Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      LOGIN FLOW                             │
└─────────────────────────────────────────────────────────────┘

  CLIENT                                              SERVER
    │                                                    │
    │  1. Derive master password hash                    │
    │  ┌──────────────────────────────┐                 │
    │  │ masterKey = KDF(password,    │                 │
    │  │              email, stored)  │                 │
    │  │ masterPasswordHash =         │                 │
    │  │   KDF(masterKey,password,1)  │                 │
    │  └──────────────────────────────┘                 │
    │                                                    │
    │  POST /accounts/login                              │
    │  { email, masterPasswordHash,                      │
    │    deviceName, deviceType }                        │
    │ ─────────────────────────────────────────────────► │
    │                                                    │
    │                     2. Check rate limit            │
    │                     ┌─────────────────────────┐    │
    │                     │ key = email:ip          │    │
    │                     │ if attempts > 5 → 429   │    │
    │                     └─────────────────────────┘    │
    │                                                    │
    │                     3. Verify password             │
    │                     ┌─────────────────────────┐    │
    │                     │ bcrypt.compare(         │    │
    │                     │   hash, storedHash)     │    │
    │                     └─────────────────────────┘    │
    │                                                    │
    │                     4. Generate token pair         │
    │                     ┌─────────────────────────┐    │
    │                     │ accessToken = JWT(15min)│    │
    │                     │ refreshToken = random() │    │
    │                     │ store(hash(refresh))    │    │
    │                     └─────────────────────────┘    │
    │                                                    │
    │                     5. Register/update device      │
    │                                                    │
    │                     6. Reset rate limit            │
    │                                                    │
    │                     7. Audit log: login_success    │
    │                                                    │
    │ ◄───────────────────────────────────────────────── │
    │  {                                                 │
    │    accessToken, refreshToken, expiresIn,           │
    │    protectedSymmetricKey, publicKey,               │
    │    encryptedPrivateKey, kdfType, kdfIterations,    │
    │    user: { id, email, emailVerified }              │
    │  }                                                 │
    │                                                    │
    │  2. Decrypt keys locally                           │
    │  ┌──────────────────────────────┐                 │
    │  │ symmetricKey = AES.decrypt(  │                 │
    │  │   protectedSymmetricKey,     │                 │
    │  │   masterKey)                 │                 │
    │  │ privateKey = AES.decrypt(    │                 │
    │  │   encryptedPrivateKey,       │                 │
    │  │   symmetricKey)              │                 │
    │  └──────────────────────────────┘                 │
    │                                                    │
```

### Token Management

#### Access Token (JWT)

```typescript
// Payload structure
{
  userId: string,
  email: string,
  deviceId?: string,
  orgIds: string[],
  iat: number,
  exp: number  // 15 minutes from iat
}

// Signing algorithm: HS256
// Secret: JWT_SECRET or NEXTAUTH_SECRET
```

#### Refresh Token

```typescript
// Generation
refreshToken = crypto.randomBytes(64).toString('base64url')

// Storage (server-side)
tokenHash = crypto.createHash('sha256')
                  .update(refreshToken)
                  .digest('hex')

// Properties
expiresAt = Date.now() + 30 days
isRevoked = false
```

#### Token Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                   TOKEN LIFECYCLE                           │
└─────────────────────────────────────────────────────────────┘

  Login
    │
    ▼
┌─────────────────┐    Access Token Expires (15min)
│  Access Token   │───────────────────────────────────┐
│  Refresh Token  │                                   │
└────────┬────────┘                                   │
         │                                            │
         │ API Request                                │
         ▼                                            ▼
┌─────────────────┐                        ┌─────────────────┐
│  Validate JWT   │                        │ POST /token/    │
│  - Check expiry │                        │   refresh       │
│  - Verify sig   │                        │                 │
└─────────────────┘                        │ - Validate hash │
                                           │ - Delete old    │
                                           │ - Create new    │
                                           │ - Return pair   │
                                           └─────────────────┘

  Logout or Password Change
         │
         ▼
┌─────────────────┐
│ Revoke ALL      │
│ refresh tokens  │
└─────────────────┘
```

---

## 7. Security Mechanisms

### Rate Limiting

```typescript
// Configuration
RATE_LIMIT_WINDOW = 15 minutes
MAX_ATTEMPTS = 5
BLOCK_DURATION = 15 minutes

// Rate limit key
key = `${email.toLowerCase()}:${clientIP}`

// Behavior
if (attempts > MAX_ATTEMPTS) {
  block until (now + BLOCK_DURATION)
  return 429 Too Many Requests
}
```

#### Response Headers

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 900
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 2026-02-09T12:15:00.000Z
```

### IP Detection

Priority order for client IP detection:

1. `X-Forwarded-For` (first IP)
2. `X-Real-IP`
3. `CF-Connecting-IP` (Cloudflare)
4. Fallback: `127.0.0.1`

### Password Security

| Layer | Implementation |
|-------|----------------|
| Client | PBKDF2-SHA256 (600K iterations) or Argon2id |
| Network | TLS 1.3 encryption |
| Server | Bcrypt (12 rounds) |

### CORS Configuration

```typescript
// Headers added to all responses
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-Device-Type
Access-Control-Max-Age: 86400
```

### Input Validation

- Email format validation
- Required field checking
- Type validation via TypeScript
- SQL injection prevention via Prisma ORM

---

## 8. Core Library

### Module Structure

```
src/lib/zk/
├── index.ts        # Exports and constants
├── jwt.ts          # JWT token management
├── rate-limit.ts   # Rate limiting logic
├── audit.ts        # Audit logging
└── middleware.ts   # Request helpers
```

### Constants and Types

```typescript
// Vault Item Types
enum VaultItemType {
  SSH_PASSWORD = 0,
  SSH_KEY = 1,
  SSH_CERTIFICATE = 2,
}

// Key Derivation Functions
enum KDFType {
  PBKDF2 = 0,
  ARGON2ID = 1,
}

// Organization Roles
enum OrganizationRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
  READONLY = 'readonly',
}

// Membership Status
enum OrganizationUserStatus {
  INVITED = 'invited',
  ACCEPTED = 'accepted',
  CONFIRMED = 'confirmed',
  REVOKED = 'revoked',
}

// Default KDF Parameters
const DEFAULT_PBKDF2_ITERATIONS = 600000;
const DEFAULT_ARGON2_MEMORY = 65536;     // 64 MB
const DEFAULT_ARGON2_PARALLELISM = 4;
const DEFAULT_ARGON2_ITERATIONS = 3;
```

### JWT Module (`jwt.ts`)

```typescript
// Token generation
generateAccessToken(payload): string
generateRefreshToken(): string
hashRefreshToken(token): string

// Token verification
verifyAccessToken(token): JWTPayload | null

// Token pair management
createTokenPair(userId, email, deviceId?, orgIds?): Promise<TokenPair>
refreshTokenPair(refreshToken): Promise<TokenPair | null>

// Revocation
revokeAllTokens(userId): Promise<void>
revokeToken(refreshToken): Promise<boolean>

// Maintenance
cleanupExpiredTokens(): Promise<number>
```

### Rate Limit Module (`rate-limit.ts`)

```typescript
// Key generation
getRateLimitKey(email, ip): string

// Rate checking
checkRateLimit(key): Promise<RateLimitResult>
resetRateLimit(key): Promise<void>
cleanupRateLimits(): Promise<number>

// Response helpers
rateLimitResponse(result): NextResponse
getClientIP(request): string
```

### Audit Module (`audit.ts`)

```typescript
// Logging
createAuditLog(data: AuditLogData): Promise<void>

// Querying
getUserAuditLogs(userId, options): Promise<AuditResult>
getOrganizationAuditLogs(orgId, options): Promise<AuditResult>

// Maintenance
cleanupAuditLogs(retentionDays?): Promise<number>
```

### Middleware Module (`middleware.ts`)

```typescript
// Authentication
getAuthFromRequest(request): JWTPayload | null
withAuth(handler): (request) => Promise<NextResponse>
requireOrgMembership(auth, orgId): boolean

// Request helpers
getRequestMetadata(request): { ipAddress, userAgent }
parseRequestBody<T>(request): Promise<T | null>
validateRequiredFields(body, fields): string[]

// Response helpers
errorResponse(message, status?, details?): NextResponse
successResponse<T>(data, status?): NextResponse
addRateLimitHeaders(response, remaining, resetAt): NextResponse
addCorsHeaders(response): NextResponse
handleCorsPreflightRequest(): NextResponse
```

---

## 9. Organization & Sharing

### Sharing Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  ORGANIZATION SHARING                        │
└─────────────────────────────────────────────────────────────┘

  OWNER (Alice)                                    MEMBER (Bob)
      │                                                 │
      │  1. Create organization                         │
      │  ┌──────────────────────────────┐              │
      │  │ orgSymmetricKey = random()   │              │
      │  │ encryptedOrgKey = RSA(       │              │
      │  │   orgSymmetricKey,           │              │
      │  │   alice.publicKey)           │              │
      │  └──────────────────────────────┘              │
      │                                                 │
      │  2. Invite Bob                                  │
      │  ┌──────────────────────────────┐              │
      │  │ GET Bob's public key         │              │
      │  │ encryptedOrgKey = RSA(       │              │
      │  │   orgSymmetricKey,           │              │
      │  │   bob.publicKey)             │              │
      │  └──────────────────────────────┘              │
      │                                                 │
      │  POST /organizations/{id}/members/invite        │
      │  { email: bob, encryptedOrgKey }               │
      │ ────────────────────────────────────────────►  │
      │                                                 │
      │                          3. Bob accepts invite  │
      │                          ┌────────────────────┐ │
      │                          │ POST /confirm      │ │
      │                          │ status: confirmed  │ │
      │                          └────────────────────┘ │
      │                                                 │
      │  4. Create shared vault                         │
      │  ┌──────────────────────────────┐              │
      │  │ vaultName = AES(name,        │              │
      │  │             orgSymmetricKey) │              │
      │  │ POST /vaults                 │              │
      │  │ { name, organizationId }     │              │
      │  └──────────────────────────────┘              │
      │                                                 │
      │                          5. Bob accesses vault  │
      │                          ┌────────────────────┐ │
      │                          │ orgKey = RSA(      │ │
      │                          │   encryptedOrgKey, │ │
      │                          │   bob.privateKey)  │ │
      │                          │                    │ │
      │                          │ vaultName = AES(   │ │
      │                          │   encrypted,       │ │
      │                          │   orgKey)          │ │
      │                          └────────────────────┘ │
      │                                                 │
```

### Role Permissions Matrix

| Action | Owner | Admin | Member | Readonly |
|--------|:-----:|:-----:|:------:|:--------:|
| View organization | ✅ | ✅ | ✅ | ✅ |
| View members | ✅ | ✅ | ✅ | ✅ |
| View audit logs | ✅ | ✅ | ❌ | ❌ |
| Create org vaults | ✅ | ✅ | ❌ | ❌ |
| Delete org vaults | ✅ | ✅ | ❌ | ❌ |
| Create vault items | ✅ | ✅ | ✅ | ❌ |
| Update vault items | ✅ | ✅ | ✅ | ❌ |
| View vault items | ✅ | ✅ | ✅ | ✅ |
| Invite members | ✅ | ✅ | ❌ | ❌ |
| Remove members | ✅ | ✅ | ❌ | ❌ |
| Promote to admin | ✅ | ❌ | ❌ | ❌ |
| Update org settings | ✅ | ✅ | ❌ | ❌ |
| Delete organization | ✅ | ❌ | ❌ | ❌ |

### Membership States

```
┌─────────────────────────────────────────────────────────────┐
│                  MEMBERSHIP LIFECYCLE                        │
└─────────────────────────────────────────────────────────────┘

                    ┌──────────┐
         Invite     │ INVITED  │
         ─────────► │          │
                    └────┬─────┘
                         │
          Accept         │
          ───────────────┼────────────────────┐
                         ▼                    │
                    ┌──────────┐              │
                    │ ACCEPTED │              │
                    │          │              │
                    └────┬─────┘              │
                         │                    │
          Confirm        │                    │
          ───────────────┤                    │
                         ▼                    │
                    ┌──────────┐              │
                    │CONFIRMED │◄─────────────┘
                    │          │     Re-invite
                    └────┬─────┘
                         │
          Remove/Leave   │
          ───────────────┤
                         ▼
                    ┌──────────┐
                    │ REVOKED  │
                    │          │
                    └──────────┘
```

---

## 10. Audit & Compliance

### Event Types

| Category | Event | Description |
|----------|-------|-------------|
| **Authentication** | `user_registered` | New user registration |
| | `login_success` | Successful login |
| | `login_failed` | Failed login attempt |
| | `logout` | User logout |
| | `password_changed` | Master password changed |
| | `keys_rotated` | Encryption keys updated |
| **Vaults** | `vault_created` | New vault created |
| | `vault_updated` | Vault metadata updated |
| | `vault_deleted` | Vault deleted |
| **Items** | `vault_item_created` | New credential added |
| | `vault_item_read` | Credential accessed |
| | `vault_item_updated` | Credential modified |
| | `vault_item_deleted` | Credential deleted |
| | `vault_item_restored` | Credential restored |
| **Organizations** | `org_created` | Organization created |
| | `org_updated` | Organization settings changed |
| | `org_deleted` | Organization deleted |
| | `user_invited` | Member invitation sent |
| | `user_confirmed` | Member accepted invite |
| | `user_removed` | Member removed |
| | `user_role_changed` | Member role updated |
| **System** | `sync_performed` | Data sync executed |
| | `token_refreshed` | Token refresh |
| | `token_revoked` | Token revocation |
| | `bulk_operation` | Bulk create/update/delete |

### Audit Log Entry Structure

```typescript
{
  id: string,
  userId: string | null,
  organizationId: string | null,
  eventType: string,
  targetType: 'user' | 'vault' | 'vault_item' | 'organization' | 'device' | 'token',
  targetId: string | null,
  ipAddress: string | null,
  userAgent: string | null,
  deviceInfo: {
    deviceId: string,
    deviceName: string,
    deviceType: string
  } | null,
  metadata: Record<string, unknown> | null,
  timestamp: Date
}
```

### Retention Policy

- Default retention: **90 days**
- Configurable via `AUDIT_LOG_RETENTION_DAYS`
- Automatic cleanup available

```typescript
// Cleanup old logs
await cleanupAuditLogs(90); // Delete logs older than 90 days
```

---

## 11. Deployment

### Docker Compose Architecture

```yaml
services:
  app:
    image: deepterm-app
    ports: ["3000:3000"]
    depends_on: [redis]
    environment:
      - DATABASE_URL
      - NEXTAUTH_SECRET
      - JWT_SECRET
      - REDIS_URL
    volumes:
      - ./prisma:/app/prisma
      - ./logs:/app/logs

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    command: redis-server --appendonly yes

  nginx:
    image: nginx:alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./nginx/deepterm.conf:/etc/nginx/conf.d/default.conf
      - ./nginx/ssl:/etc/nginx/ssl
    depends_on: [app]
```

### Network Architecture

```
                   Internet
                      │
                      ▼
              ┌───────────────┐
              │    Nginx      │
              │  (SSL/TLS)    │
              │   :80/:443    │
              └───────┬───────┘
                      │
         ┌────────────┴────────────┐
         ▼                         ▼
┌─────────────────┐      ┌─────────────────┐
│    DeepTerm     │      │    DeepTerm     │
│    App #1       │      │    App #2       │
│    :3000        │      │    :3000        │
└────────┬────────┘      └────────┬────────┘
         │                        │
         └──────────┬─────────────┘
                    │
         ┌──────────┴──────────┐
         ▼                     ▼
┌─────────────────┐   ┌─────────────────┐
│     Redis       │   │   PostgreSQL    │
│     :6379       │   │     :5432       │
└─────────────────┘   └─────────────────┘
```

### Dockerfile Stages

```dockerfile
# Stage 1: Builder
FROM node:20-alpine AS builder
- Install dependencies
- Generate Prisma client
- Build Next.js application

# Stage 2: Runner
FROM node:20-alpine AS runner
- Copy standalone build
- Create non-root user
- Configure health check
- Start server
```

### Health Check

```http
GET /api/health

Response (200):
{
  "status": "healthy",
  "timestamp": "2026-02-09T12:00:00.000Z",
  "version": "1.0.0",
  "services": {
    "database": "connected"
  }
}
```

---

## 12. Configuration Reference

### Environment Variables

#### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Database connection | `file:./prisma/deepterm.db` |
| `NEXTAUTH_URL` | Application URL | `https://deepterm.net` |
| `NEXTAUTH_SECRET` | Session encryption key | `openssl rand -base64 32` |
| `JWT_SECRET` | JWT signing key | `openssl rand -base64 32` |
| `WEBAUTHN_RP_ID` | WebAuthn relying party | `deepterm.net` |

#### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection | - |
| `SMTP_HOST` | SMTP server | - |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | SMTP username | - |
| `SMTP_PASSWORD` | SMTP password | - |
| `EMAIL_FROM` | Sender email | - |
| `X_API_KEY` | App API key | - |

#### Security Tuning

| Variable | Description | Default |
|----------|-------------|---------|
| `BCRYPT_ROUNDS` | Bcrypt cost factor | `12` |
| `ACCESS_TOKEN_EXPIRY` | JWT expiry | `15m` |
| `REFRESH_TOKEN_EXPIRY_DAYS` | Refresh token life | `30` |
| `RATE_LIMIT_MAX_ATTEMPTS` | Max login attempts | `5` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | `900000` |
| `RATE_LIMIT_BLOCK_DURATION_MS` | Block duration | `900000` |
| `AUDIT_LOG_RETENTION_DAYS` | Log retention | `90` |

### File Structure

```
deepterm/
├── src/
│   ├── app/
│   │   └── api/
│   │       └── zk/
│   │           ├── accounts/
│   │           │   ├── register/route.ts
│   │           │   ├── login/route.ts
│   │           │   ├── logout/route.ts
│   │           │   ├── route.ts
│   │           │   ├── password-hint/route.ts
│   │           │   ├── keys/route.ts
│   │           │   ├── password/change/route.ts
│   │           │   └── token/refresh/route.ts
│   │           ├── sync/route.ts
│   │           ├── vaults/
│   │           │   ├── route.ts
│   │           │   └── [id]/route.ts
│   │           ├── vault-items/
│   │           │   ├── route.ts
│   │           │   ├── [id]/route.ts
│   │           │   └── bulk/route.ts
│   │           └── organizations/
│   │               ├── route.ts
│   │               └── [orgId]/
│   │                   ├── route.ts
│   │                   ├── members/
│   │                   │   ├── route.ts
│   │                   │   ├── invite/route.ts
│   │                   │   └── [memberId]/
│   │                   │       ├── route.ts
│   │                   │       └── confirm/route.ts
│   │                   └── audit-log/route.ts
│   └── lib/
│       └── zk/
│           ├── index.ts
│           ├── jwt.ts
│           ├── rate-limit.ts
│           ├── audit.ts
│           └── middleware.ts
├── prisma/
│   └── schema.prisma
├── docker-compose.yml
├── Dockerfile
├── .env.example
└── Documentation/
    ├── ZK-VAULT-API.md
    └── ZK-VAULT-IMPLEMENTATION.md
```

---

## Appendix A: Quick Reference

### API Endpoints Summary

| Category | Endpoints |
|----------|-----------|
| Accounts | 9 endpoints |
| Sync | 1 endpoint |
| Vaults | 5 endpoints |
| Vault Items | 5 endpoints |
| Organizations | 11 endpoints |
| **Total** | **31 endpoints** |

### Security Checklist

- [x] Zero-knowledge encryption (client-side)
- [x] Double password hashing (KDF + bcrypt)
- [x] JWT with short expiry (15 min)
- [x] Rotating refresh tokens
- [x] Rate limiting (5 attempts/15 min)
- [x] Audit logging
- [x] HTTPS enforcement
- [x] CORS protection
- [x] Input validation
- [x] Soft delete (30-day recovery)
- [x] Optimistic concurrency control

### Database Tables

| Table | Purpose |
|-------|---------|
| `ZKUser` | User credentials and keys |
| `ZKVault` | Vault/collection metadata |
| `ZKVaultItem` | Encrypted credentials |
| `Organization` | Team/org metadata |
| `OrganizationUser` | Membership + encrypted keys |
| `Device` | Multi-device tracking |
| `RefreshToken` | Token management |
| `ZKAuditLog` | Audit trail |
| `RateLimitEntry` | Rate limiting |

---

*This documentation covers the complete Zero-Knowledge Vault implementation for DeepTerm. For API-specific details, see [ZK-VAULT-API.md](ZK-VAULT-API.md).*
