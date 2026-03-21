# DeepTerm — MCP Server for End-Users

> **Model Context Protocol (MCP) server** that allows LLM clients (Claude Desktop, Cursor, VS Code Copilot, etc.) to query your DeepTerm account data — vaults, subscriptions, payments, issues, and more.

---

## Table of Contents

1. [Overview](#overview)
2. [Setup](#setup)
   - [Claude Desktop](#claude-desktop)
   - [Cursor](#cursor)
   - [VS Code (GitHub Copilot)](#vs-code-github-copilot)
   - [Other MCP Clients](#other-mcp-clients)
3. [Authentication](#authentication)
4. [Available Tools](#available-tools)
5. [Tool Reference](#tool-reference)
6. [Security](#security)
7. [Troubleshooting](#troubleshooting)

---

## Overview

The DeepTerm MCP server exposes a set of **read-only** tools that let you query your account data through any MCP-compatible LLM client. This enables natural language queries like:

- *"How many hosts do I have in my vault?"*
- *"What's my subscription status?"*
- *"Show me my recent support tickets."*
- *"List my registered devices."*

**Endpoint:** `https://deepterm.net/api/mcp`
**Protocol:** MCP Streamable HTTP (JSON-RPC over HTTP)
**Auth:** Bearer token (ZK JWT access token)

---

## Setup

### Generating an Access Token

You need a long-lived JWT access token. Generate one from the DeepTerm app or request one from your account settings. The token is a standard JWT Bearer token — the same type used by the desktop/mobile app.

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "deepterm": {
      "url": "https://deepterm.net/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN_HERE"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

### Cursor

Add to your Cursor MCP config (`.cursor/mcp.json` in your project or `~/.cursor/mcp.json` globally):

```json
{
  "mcpServers": {
    "deepterm": {
      "url": "https://deepterm.net/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN_HERE"
      }
    }
  }
}
```

### VS Code (GitHub Copilot)

Add to your VS Code settings (`.vscode/mcp.json`):

```json
{
  "servers": {
    "deepterm": {
      "type": "http",
      "url": "https://deepterm.net/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN_HERE"
      }
    }
  }
}
```

### Other MCP Clients

Any MCP client that supports Streamable HTTP transport can connect:

- **URL:** `https://deepterm.net/api/mcp`
- **Method:** POST
- **Headers:**
  - `Authorization: Bearer YOUR_TOKEN_HERE`
  - `Content-Type: application/json`
  - `Accept: application/json, text/event-stream`

---

## Authentication

The MCP server uses the same ZK JWT authentication as the DeepTerm desktop/mobile app:

- Tokens are signed with HS256
- Standard access tokens expire in 15 minutes
- For MCP client configuration, use a long-lived token (up to 1 year)
- Each request is authenticated independently (stateless server)

If the token is missing or invalid, the server returns a JSON-RPC error:

```json
{
  "jsonrpc": "2.0",
  "error": { "code": -32001, "message": "Unauthorized — provide a valid Bearer token." },
  "id": null
}
```

---

## Available Tools

| Tool | Description |
|------|-------------|
| `get_profile` | Account profile, subscription status, team, and devices |
| `list_vaults` | All vaults with item counts broken down by type |
| `vault_summary` | Detailed item metadata for a specific vault (no encrypted data) |
| `get_subscription` | Subscription plan, billing period, payment method |
| `list_invoices` | Billing invoices from Stripe |
| `list_payment_events` | Payment history — purchases, renewals, cancellations |
| `list_issues` | Your bug reports and support tickets |
| `get_issue` | Single issue with admin updates and attachments |
| `list_ideas` | Feature requests on the voting board |
| `list_notifications` | Your notifications |
| `list_announcements` | Product announcements and updates |
| `list_subscription_plans` | Available plans and pricing |
| `list_devices` | Your registered devices |

---

## Tool Reference

### `get_profile`

Returns your full account profile including vault account details, web dashboard account, team membership, and registered devices.

**Parameters:** None

**Response includes:**
- Vault account: ID, email, KDF settings, creation date
- Web account: name, email, plan, subscription source/expiry, 2FA status
- Team: name, plan, seats, subscription status, period end
- Devices: name, type, last active date

---

### `list_vaults`

Lists all your vaults with item count summaries.

**Parameters:** None

**Response includes:** For each vault:
- ID, name, default flag, creation/update dates
- Total items count, deleted items count
- Items broken down by type (host, identity, group, snippet, port_forward)

---

### `vault_summary`

Detailed metadata about items in a specific vault. Returns item types, modification dates, and deleted item info — but **never** encrypted data.

**Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `vaultId` | string | *(first vault)* | Vault ID to inspect |

---

### `get_subscription`

Returns your current subscription details.

**Parameters:** None

**Response includes:**
- Plan name, subscription status, source (stripe/apple)
- Billing period end date
- Stripe payment method (last4, brand) if applicable
- Apple IAP receipt info if applicable

---

### `list_invoices`

Lists your billing invoices.

**Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `limit` | number | 20 | Max invoices to return (1–100) |

---

### `list_payment_events`

Lists payment events — purchases, renewals, cancellations, refunds.

**Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `limit` | number | 20 | Max events to return (1–100) |

---

### `list_issues`

Lists your bug reports and support tickets.

**Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `status` | string | *(all)* | Filter by status: open, in_progress, resolved, closed |
| `limit` | number | 20 | Max issues to return (1–50) |

---

### `get_issue`

Returns a single issue with full details, admin updates, and attachments.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `issueId` | string | Yes | Issue ID |

---

### `list_ideas`

Lists feature ideas from the voting board.

**Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `status` | string | *(all)* | Filter: pending, approved, planned, in_progress, completed, declined |
| `limit` | number | 20 | Max ideas to return (1–50) |

---

### `list_notifications`

Lists your notifications.

**Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `limit` | number | 20 | Max notifications to return (1–50) |

---

### `list_announcements`

Lists product announcements.

**Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `limit` | number | 10 | Max announcements to return (1–20) |

---

### `list_subscription_plans`

Lists all available subscription plans and pricing.

**Parameters:** None

---

### `list_devices`

Lists your registered devices.

**Parameters:** None

**Response includes:** For each device:
- ID, name, device type, last active date

---

## Security

The MCP server is **read-only** and follows DeepTerm's zero-knowledge architecture:

- **No encrypted data is exposed.** Vault items return only metadata (type, creation date, modification date, deletion status) — never `encryptedData`, `name`, or crypto keys.
- **No write operations.** You cannot create, modify, or delete data through the MCP server.
- **No credential exposure.** Master password hashes, symmetric keys, private keys, and Stripe customer IDs are never returned.
- **Per-request authentication.** Each request is independently authenticated — no session state is maintained.
- **Standard JWT auth.** Uses the same HS256 JWT tokens as the desktop/mobile app.

---

## Troubleshooting

### "Unauthorized — provide a valid Bearer token."
- Check that your token is correct and hasn't expired
- Ensure the `Authorization` header includes `Bearer ` prefix (with space)

### "User not found."
- The token references a ZK user that no longer exists
- Generate a new token from your account

### "Not Acceptable: Client must accept both application/json and text/event-stream"
- Your MCP client must send `Accept: application/json, text/event-stream` header
- Most MCP clients handle this automatically

### Empty or no response
- Verify the server is reachable: `curl -I https://deepterm.net/api/mcp`
- Check that your MCP client supports Streamable HTTP transport (not just stdio)

### "Session termination not supported"
- The server is stateless — DELETE requests return 405. This is expected behavior.
