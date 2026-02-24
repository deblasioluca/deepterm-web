# Vault Duplicate Cleanup (Client-Side)

**Why this is client-side:** Vault items are zero-knowledge encrypted. The server cannot reliably detect duplicates because encryption typically uses a random IV/salt, so the same plaintext credential can produce different `encryptedData` every time.

## What we observed
A dry-run server script for `luca.deblasio@bluewin.ch` found:
- 15 vault items (not deleted)
- 15 unique `encryptedData` values
- 15 unique encrypted `name` values

So a server-side “group by `encryptedData`” dedupe cannot delete anything.

## Recommended cleanup approach
Implement a one-time cleanup in the app (or a debug tool) that:

1) Pulls all vault items (`GET /api/zk/sync`)
2) Decrypts each item using the in-memory symmetric key
3) Builds a **canonical fingerprint** from decrypted fields that uniquely identify a credential
4) For each fingerprint group, keep the newest item (by `revisionDate`) and permanently delete the rest using:
   - `POST /api/zk/vault-items/bulk` with `delete: [{ id, permanent: true }, ...]`

### Canonical fingerprint suggestions
Pick fields that represent the “same credential” in plaintext. Examples (adjust to your decrypted schema):
- SSH password credential: `type|host|port|username|auth=password`
- SSH key credential: `type|host|port|username|keyFingerprint` (or key identifier)
- If you have a stable client UUID per credential, prefer that.

## Bulk delete API
- Endpoint: `POST /api/zk/vault-items/bulk`
- Auth: `Authorization: Bearer <ZK accessToken>`
- Delete payload:

```json
{
  "create": [],
  "update": [],
  "delete": [
    { "id": "vault_item_id_1", "permanent": true },
    { "id": "vault_item_id_2", "permanent": true }
  ]
}
```

## Safety notes
- Do a dry-run first in the app UI/logs: print planned deletions before sending them.
- Do not delete anything unless the app has successfully decrypted all items and can prove it has at least one “keeper” per fingerprint.
- After cleanup, do a full sync and confirm the server returns only the canonical items.
