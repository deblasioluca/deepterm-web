# ZK Vault — `type` Field Implementation Guide for Swift App

> **Purpose:** This document tells the LLM exactly what to change in the Swift codebase so the native app sends and reads the `type` field on vault items.
> **Server status:** The `type` field is fully deployed on the server as of 2026-03-15.

---

## What Changed on the Server

The `ZKVaultItem` model now has a **server-side `type` column** (`Int?`, nullable). This is a **plaintext metadata field** — not encrypted. It mirrors the `type` value that already exists inside `encryptedData`, enabling the admin panel to filter and show statistics without decrypting anything.

### API Changes

Every vault item endpoint now accepts and returns `type`:

| Endpoint | Method | What changed |
|----------|--------|-------------|
| `/api/zk/vault-items` | POST | Accepts `type` (integer) in request body |
| `/api/zk/vault-items` | GET | Returns `type` (integer or null) per item |
| `/api/zk/vault-items/{id}` | PUT | Accepts `type` (integer) in request body |
| `/api/zk/vault-items/{id}` | GET | Returns `type` (integer or null) |
| `/api/zk/vault-items/bulk` | POST | Accepts `type` per create/update item |
| `/api/zk/sync` | GET | Returns `type` per item in sync response |

### Type Values

| Type | Integer | Description |
|------|---------|-------------|
| SSH Password | `0` | Host + username + password credential |
| SSH Key | `1` | Host + username + private key |
| SSH Certificate | `2` | Host + username + certificate + key |
| Managed Key | `10` | Managed SSH key (no host binding) |
| Identity | `11` | User identity profile |
| Host Group | `12` | Group of hosts |

---

## What the Swift App Must Do

### 1. Update the Vault Item Model

The Swift model for a vault item response must include the `type` field:

```swift
struct VaultItemResponse: Codable {
    let id: String
    let vaultId: String
    let type: Int?           // ← ADD THIS
    let encryptedData: String
    let revisionDate: String
    let deletedAt: String?
    let createdAt: String
    let updatedAt: String
}
```

### 2. Send `type` When Creating Items

When creating a vault item via `POST /api/zk/vault-items` or the bulk endpoint, include `type` as a **top-level field** in the JSON body:

```swift
struct CreateVaultItemRequest: Codable {
    let id: String?          // Client-generated UUID (recommended)
    let vaultId: String
    let type: Int?           // ← ADD THIS
    let encryptedData: String
}
```

**Example JSON body:**
```json
{
  "id": "4959576F-54A0-4A7B-BD74-4AA3DAEB8B5C",
  "vaultId": "vault_abc123",
  "type": 0,
  "encryptedData": "<AES-256-GCM encrypted blob>"
}
```

The `type` value should come from the same `type` field that you already put inside the encrypted data blob. You're sending it in **two places**:
1. Inside `encryptedData` (encrypted, for the client to read after decryption)
2. As a top-level `type` field (plaintext, for the server to store as metadata)

### 3. Send `type` When Updating Items

When updating via `PUT /api/zk/vault-items/{id}`:

```swift
struct UpdateVaultItemRequest: Codable {
    let vaultId: String?
    let type: Int?           // ← ADD THIS
    let encryptedData: String?
}
```

If `type` is omitted (nil), the server preserves the existing value. If provided, it overwrites.

### 4. Send `type` in Bulk Operations

For `POST /api/zk/vault-items/bulk`:

```swift
struct BulkCreateItem: Codable {
    let id: String?
    let vaultId: String
    let type: Int?           // ← ADD THIS
    let encryptedData: String
    let clientId: String?
}

struct BulkUpdateItem: Codable {
    let id: String
    let vaultId: String?
    let type: Int?           // ← ADD THIS  
    let encryptedData: String?
    let revisionDate: String?
}
```

### 5. Read `type` from Sync Response

The sync response (`GET /api/zk/sync`) now includes `type` per item:

```json
{
  "items": [
    {
      "id": "item_1",
      "vaultId": "vault_abc",
      "type": 0,
      "encryptedData": "...",
      "revisionDate": "...",
      "deletedAt": null,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

The app can use this `type` field for:
- **Displaying the correct icon** before decrypting (key vs password vs certificate)
- **Filtering items by type** in the UI
- **Sorting/grouping** (e.g. show all managed keys together)

### 6. Migrate Existing Items (Recommended)

The 35 existing items for the main user currently have `type = null` on the server because they were synced before this change. To fix this:

**Option A — Lazy migration (recommended):** When the app updates an item for any reason, include the `type` field. This gradually fills in types over time.

**Option B — Bulk migration:** On first launch after update, push all items via bulk endpoint with their `type` set:

```swift
// Pseudocode
let items = getAllLocalVaultItems()
let updates: [BulkUpdateItem] = items.map { item in
    BulkUpdateItem(
        id: item.id,
        type: item.decryptedType,  // from the decrypted encryptedData
        encryptedData: nil,         // don't re-upload data, just set type
        revisionDate: nil
    )
}
// POST /api/zk/vault-items/bulk with { "update": updates }
```

---

## How to Determine the `type` Value

The `type` integer is the same value your app already stores inside the encrypted blob. When building the request body, extract it from your local model:

```swift
// Example: your existing VaultCredential model already has a type
enum VaultItemType: Int, Codable {
    case sshPassword = 0
    case sshKey = 1
    case sshCertificate = 2
    case managedKey = 10
    case identity = 11
    case hostGroup = 12
}

// When creating/updating, include it at the top level:
let body: [String: Any] = [
    "id": credential.id.uuidString,
    "vaultId": currentVaultId,
    "type": credential.type.rawValue,    // ← This is the key addition
    "encryptedData": encryptedBlob
]
```

---

## Security Notes

- The `type` field is **not sensitive** — it's an enum integer, not credential data
- All credential details (host, username, password, keys, etc.) remain encrypted inside `encryptedData`
- The server never decrypts `encryptedData` — the `type` field is the only metadata it can see
- Sending `type: null` or omitting it entirely is safe — the server accepts it gracefully

---

## Quick Checklist

- [ ] `VaultItemResponse` model includes `type: Int?`
- [ ] `POST /api/zk/vault-items` body includes `type`
- [ ] `PUT /api/zk/vault-items/{id}` body includes `type`
- [ ] `POST /api/zk/vault-items/bulk` create items include `type`
- [ ] `POST /api/zk/vault-items/bulk` update items include `type`
- [ ] Sync response parsing handles `type` field (may be null for old items)
- [ ] Existing items get `type` set on next update (lazy migration)
- [ ] Item type icons/badges work without decryption (using server-side `type`)

---

*Generated: 2026-03-15 — Server-side type field is live and deployed.*
