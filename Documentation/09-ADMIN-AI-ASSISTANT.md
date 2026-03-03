# Admin AI Assistant

The Admin AI Assistant is an embedded, context-aware AI panel in the DeepTerm admin portal. It gives administrators a conversational interface to Claude with full awareness of the current admin page, project documentation, and infrastructure state. It can execute tools (SSH, GitHub, Airflow, Stripe, etc.) to both retrieve information and take actions.

---

## Implementation Status

| Phase | Scope | Status |
|-------|-------|--------|
| **Phase 1** | Core panel, streaming chat, page context, read-only tools | ✅ Complete |
| **Phase 2** | SSH (RPi), GitHub, Airflow, Node-RED, Stripe tools + vector search | ✅ Complete |
| **Phase 3** | Settings UI — docs CRUD, prompt editor, SSH machines, tool toggles | ✅ Complete |
| **Phase 4** | SSH to CI Mac + AI Dev Mac (after network config), MCP integration | 🔲 Backlog |

---

## Architecture

### Layout

The admin layout is a **3-column push layout**:

```
[Sidebar 72–260px] | [Main content flex-1] | [AI Panel 384px (when open)]
```

The panel pushes the main content (it does not overlay). The panel is collapsible — toggled via `Cmd+Shift+A` (Mac) / `Ctrl+Shift+A` (Windows/Linux) or the toggle button. State persists in `localStorage`.

### System Prompt Construction

On every request the backend builds the system prompt from these layers, in order:

1. **CLAUDE.md** — read from `process.cwd()/CLAUDE.md` at runtime (or the custom override stored in `AdminAIConfig.systemPrompt`)
2. **Role + infrastructure block** — injected by `src/lib/admin-ai/context.ts`, includes machine IPs, repo URLs, current date/time
3. **Current page context** — page name, summary, and key data from the active admin page
4. **Available tools** — list of enabled tools

Documents are NOT auto-loaded (except CLAUDE.md). Claude calls `search_documentation` or `read_documentation` tools on demand.

### Chat Flow

```
User sends message
      │
POST /api/admin/ai/chat  (SSE stream)
      │
  buildSystemPrompt()          ← CLAUDE.md + page context + infra block
      │
  Load conversation history from DB (last 20 messages)
      │
  Anthropic streaming API (claude-opus-4-6 default)
      │
  ┌─ Yield token events → SSE → client (real-time text)
  │
  ├─ stop_reason == "tool_use"?
  │   ├─ Yield tool_start event → client shows tool block
  │   ├─ executeTool() (server-side)
  │   ├─ Yield tool_result event → client updates tool block
  │   └─ Loop: send tool results back to Claude, continue streaming
  │
  └─ stop_reason == "end_turn"?
      ├─ Save assistant message to AdminAIMessage (DB)
      ├─ Log to AIUsageLog (activity: "admin.chat")
      └─ Yield done event → client finalizes message
```

Max tool rounds per turn: **10** (prevents infinite loops).

---

## File Structure

### New Files (Phase 1)

```
src/
├── components/admin/
│   ├── AdminAIContext.tsx          ← React context (pageContext, panel open state)
│   ├── AdminAIPanel.tsx            ← Main chat panel UI component
│   └── AdminAIMessageItem.tsx      ← Individual message + tool block renderer
│
├── lib/admin-ai/
│   ├── context.ts                  ← System prompt builder
│   ├── tools.ts                    ← Tool definitions + executors (Phase 1+2 tools)
│   └── chat.ts                     ← Claude orchestration + tool loop + SSE generator
│
└── app/api/admin/ai/
    ├── chat/route.ts               ← POST — streaming SSE chat endpoint
    ├── conversations/route.ts      ← GET — list conversations
    └── conversations/[id]/route.ts ← GET/DELETE/PATCH — single conversation

Documentation/
└── 09-ADMIN-AI-ASSISTANT.md       ← This file
```

### New Files (Phase 2)

```
src/lib/admin-ai/
├── ssh.ts           ← Local command execution (child_process.exec) + machine registry
├── github.ts        ← GitHub REST API wrapper (PAT-based, read + write)
└── vector-store.ts  ← Voyage AI embeddings (direct REST) + cosine similarity + SQLite
```

### New Files (Phase 3)

```
src/
├── app/admin/settings/components/
│   └── AdminAISettingsTab.tsx      ← Settings UI: model, system prompt, prompt library, tool perms, API keys
│
└── app/api/admin/ai/
    └── settings/route.ts           ← GET/PUT AdminAIConfig singleton (encrypts secrets, masks on read)
```

---

### Modified Files (Phase 1)

```
prisma/schema.prisma               ← +AdminAIConversation, +AdminAIMessage, +AdminAIConfig, +DocumentVector
src/lib/ai-activities.ts           ← +admin.chat activity
src/app/admin/layout.tsx           ← 3-column layout + AdminAIProvider + AdminAIPanel
```

---

## Database Schema

### AdminAIConversation
Stores one conversation per admin user. Title is auto-generated from the first message.

| Field | Type | Notes |
|-------|------|-------|
| id | String | CUID primary key |
| adminUserId | String | FK → AdminUser.id (cascade delete) |
| title | String? | Auto-generated, 60 chars max |
| pageContext | String? | JSON snapshot: `{page, summary, data}` |
| createdAt | DateTime | |
| updatedAt | DateTime | Auto-updated |

### AdminAIMessage
Individual messages within a conversation.

| Field | Type | Notes |
|-------|------|-------|
| id | String | CUID primary key |
| conversationId | String | FK → AdminAIConversation.id |
| role | String | `user` or `assistant` |
| content | String | Text content |
| toolCalls | String? | JSON: `[{id, name, input}]` |
| toolResults | String? | JSON: `[{toolUseId, name, output}]` |
| inputTokens | Int? | |
| outputTokens | Int? | |
| costCents | Float? | Calculated from model fallback costs |

### AdminAIConfig (singleton, id = "singleton")
One row, always upserted. Stores all configuration for the admin AI assistant.

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| modelId | String | `claude-opus-4-6` | Default model for assistant |
| systemPrompt | String? | null | Override for CLAUDE.md |
| additionalPrompts | String? | null | JSON: `[{name, content, shortcut}]` |
| autoLoadDocs | String? | null | JSON: doc filenames to always load |
| toolPermissions | String? | null | JSON: `{tool_name: boolean}` |
| sshMachines | String? | null | JSON: SSH machine configs (Phase 2) |
| mcpServers | String? | null | JSON: MCP server configs (Phase 4) |
| githubPat | String? | null | Encrypted GitHub PAT (Phase 2) |
| voyageApiKey | String? | null | Encrypted Voyage AI key (Phase 2) |
| maxTokensPerMessage | Int | 8000 | Per-request max tokens |
| conversationTtlDays | Int | 30 | Auto-delete after N days |

### DocumentVector (Phase 2)
Document chunks with embeddings for semantic search.

| Field | Type | Notes |
|-------|------|-------|
| id | String | CUID |
| filename | String | Documentation filename |
| chunkIndex | Int | 0-based chunk number |
| chunkText | String | ~600 token text chunk |
| embedding | String? | JSON float[] from Voyage AI |

---

## Tools

### Phase 1 Tools (Read-only, no confirmation required)

| Tool | Description | Input |
|------|-------------|-------|
| `list_documentation` | List all files in `Documentation/` | — |
| `read_documentation` | Read a documentation file | `filename: string` |
| `get_system_health` | DB counts + process memory + uptime | — |
| `get_ai_usage` | AI cost/usage stats | `period: today\|week\|month` |

### Phase 2 Tools (Implemented)

| Tool | Description | Auth source |
|------|-------------|------------|
| `ssh_exec` | Run command on webapp RPi via `child_process.exec` | Local (no auth required) |
| `github_read` | Read repos, issues, PRs, workflows, commits, files | `GITHUB_AI_PAT` env / `AdminAIConfig.githubPat` |
| `github_act` | Create issues, add comments, close issues, trigger workflows | Same as above |
| `airflow_api` | List/trigger/pause DAGs via Airflow REST API v1 | `AIRFLOW_API_URL` + Basic auth |
| `node_red_api` | List flows, get state, send webhooks, generic HTTP calls | Node-RED at `NODE_RED_URL` |
| `stripe_api` | Revenue summary, subscriptions, customers, invoices | `STRIPE_SECRET_KEY` (existing) |
| `search_documentation` | Semantic vector search across indexed docs | `VOYAGE_API_KEY` env / `AdminAIConfig.voyageApiKey` |
| `index_documentation` | Chunk + embed a doc file into the vector store | Same as above |
| `list_indexed_documents` | See what's indexed in the vector store | — |

### Phase 4 (Backlog — SSH not yet reachable)

| Tool | Machine | Blocker |
|------|---------|---------|
| `ssh_exec` on CI Mac | `lucadeblasio@192.168.1.248` | Firewall/port config needed |
| `ssh_exec` on AI Dev Mac | `luca@192.168.1.249` | Firewall/port config needed |

---

## API Reference

### `POST /api/admin/ai/chat`

Streams an SSE response. Requires `admin-session` cookie.

**Request body:**
```json
{
  "conversationId": "clxxx...",   // null = new conversation
  "message": "What's the system health?",
  "pageContext": {
    "page": "Cockpit",
    "summary": "Viewing system health dashboard",
    "data": { "activeAlerts": 0 }
  },
  "modelOverride": "claude-sonnet-4-6"  // null = use configured default
}
```

**SSE event stream:**
```
data: {"type":"token","text":"The system is "}
data: {"type":"token","text":"currently healthy."}
data: {"type":"tool_start","tool":"get_system_health","input":{},"toolUseId":"tu_abc"}
data: {"type":"tool_result","tool":"get_system_health","output":"{...}","toolUseId":"tu_abc"}
data: {"type":"token","text":"Here are the stats:"}
data: {"type":"done","conversationId":"clxxx","messageId":"clyyy","inputTokens":450,"outputTokens":320}
```

### `GET /api/admin/ai/conversations`

Returns paginated list of conversations for the authenticated admin.

**Query params:** `page` (default 1), `limit` (default 20)

**Response:**
```json
{
  "conversations": [
    { "id": "clxxx", "title": "System health check", "updatedAt": "2026-03-03T...", "messageCount": 4 }
  ],
  "total": 12,
  "page": 1
}
```

### `GET /api/admin/ai/conversations/:id`

Returns a full conversation with all messages.

### `DELETE /api/admin/ai/conversations/:id`

Deletes a conversation and all its messages.

### `PATCH /api/admin/ai/conversations/:id`

Updates conversation title.

---

## Configuration

### Environment Variables

No new ENV vars needed for Phase 1.

For Phase 2, add to `.env`:
```env
# Phase 2 tools
VOYAGE_API_KEY="pa-..."         # For document vector embeddings (Voyage AI voyage-3-large)
GITHUB_AI_PAT="ghp_..."         # GitHub PAT for AI tool (scopes: repo, workflow, read:org, read:user)
AIRFLOW_API_URL="http://..."    # Airflow REST API base URL (e.g. http://192.168.1.x:8080)
AIRFLOW_USERNAME="airflow"      # Airflow basic auth username
AIRFLOW_PASSWORD="airflow"      # Airflow basic auth password
```

`STRIPE_SECRET_KEY` is already required by the app. `NODE_RED_URL` already exists (defaults to `http://192.168.1.30:1880`).

SSH keys are configured via the admin settings UI (Phase 3), stored encrypted in `AdminAIConfig.sshMachines`.

### API Keys — How to Obtain

#### GitHub PAT (Personal Access Token)

The GitHub PAT allows the AI assistant to read repos, issues, PRs, workflow runs, and file contents, and to create/close issues and trigger workflows.

1. Go to **github.com** → your profile → **Settings**
2. Scroll to the bottom of the left sidebar → **Developer settings**
3. **Personal access tokens** → **Tokens (classic)**
4. **Generate new token (classic)**
5. Give it a descriptive name: `deepterm-admin-ai`
6. Set expiration: 90 days (or no expiration for development)
7. Select scopes:
   - `repo` — full repository access (read + write issues, PRs, files)
   - `workflow` — trigger GitHub Actions workflows
   - `read:org` — read organization data
   - `read:user` — read user profile
8. **Generate token** — copy it immediately (shown only once)
9. Paste it in **Admin Settings → Admin AI → API Keys → GitHub PAT**

**What it unlocks:** `github_read` tool (repos, issues, PRs, workflow runs, file contents) + `github_act` tool (create/close issues, trigger workflows).

#### Voyage AI API Key

Voyage AI powers the semantic document search (vector embeddings). This is **separate from Claude** — Anthropic's API is chat-only and has no embeddings endpoint. Voyage `voyage-3-large` generates 1024-dimensional float vectors used for cosine similarity search over documentation chunks.

**This key is optional.** If not configured, the `search_documentation` tool is unavailable — the assistant still has `read_documentation` for direct file reads.

1. Go to **dash.voyageai.com** and create an account (or log in)
2. Navigate to **API Keys**
3. **Create new key** — name it `deepterm-docs`
4. Copy the key (starts with `pa-`)
5. Paste it in **Admin Settings → Admin AI → API Keys → Voyage AI Key**

**What it unlocks:** `search_documentation(query, topK)` — semantic similarity search across all indexed documentation chunks. Much more powerful than keyword-based read for open-ended questions.

### Model Configuration

The default model is `claude-opus-4-6` (stored in `AdminAIConfig.modelId`). Admins can override per session via the panel header dropdown. Phase 3 settings will expose the full model config UI.

---

## Initial Setup — Indexing Documentation

After setting the Voyage AI API key, index your documentation into the vector store so the AI assistant can perform semantic search. This step is required once (and after major doc updates).

### Option A — Via the AI Chat Panel

1. Open the Admin AI Assistant panel (sidebar or `Cmd+Shift+A`)
2. Ask: **"Index all documentation files"**
3. The assistant will call `index_documentation` for each file in `Documentation/`
4. Confirm with: **"List indexed documents"** to verify all files are indexed

### Option B — Index a Specific File

```
Index the file 09-ADMIN-AI-ASSISTANT.md
```

The assistant will chunk (~1,500-char chunks, 200-char overlap), batch-embed 25 chunks at a time via Voyage API, and write to `DocumentVector` in SQLite.

### Re-indexing After Updates

After editing documentation, re-index the changed file:
```
Re-index 02-ARCHITECTURE.md
```

The tool deletes existing chunks for that filename and re-embeds from scratch.

### Verifying the Index

```
List all indexed documents
```

Response includes filename, chunk count, and last indexed timestamp.

### Without a Voyage API Key

If no Voyage key is configured, `search_documentation` and `index_documentation` tools are disabled. Use `read_documentation` instead:
```
Read the file 07-AI-DEV-SYSTEM.md
```

---

## Security

- Panel is only accessible inside the admin panel (intranet-only, enforced by middleware + Nginx)
- All API routes require valid `admin-session` cookie
- Conversation history is scoped to the `AdminUser` who created it
- Tool outputs are truncated to 10KB to prevent context flooding
- `read_documentation` sanitizes filenames (path traversal prevention: `path.basename()`)
- SSH commands in Phase 2 support a confirmation flow for non-read operations
- GitHub PAT and SSH keys stored AES-256-GCM encrypted via `encryptApiKey()`
- All tool executions stored in `AdminAIMessage.toolCalls` + `.toolResults` for audit trail
- Usage tracked in existing `AIUsageLog` under activity `admin.chat`

---

## Adding Page Context to New Admin Pages

Any admin page can contribute context to the AI assistant:

```tsx
'use client';
import { useAdminAI } from '@/components/admin/AdminAIContext';
import { useEffect } from 'react';

export default function MyAdminPage() {
  const { setPageContext } = useAdminAI();

  useEffect(() => {
    setPageContext({
      page: 'My Page',
      summary: 'Short human-readable summary of what is shown',
      data: {
        // Key data points visible on screen
        count: items.length,
        selectedItem: selected?.id,
      },
    });
    // Clear on unmount
    return () => setPageContext(null);
  }, [items, selected]);

  // ... rest of page
}
```

---

## Dependencies

### Phase 1 (no new packages required)
- `@anthropic-ai/sdk` — already installed (v0.78.0)
- `fs` / `path` — Node.js built-ins
- `@prisma/client` — already installed

### Phase 2 (no new packages required)
- `child_process` / `util` — Node.js built-ins (for `ssh_exec` on RPi)
- Voyage AI — called via direct `fetch()` to REST API (no npm package needed)
- GitHub REST API — called via direct `fetch()` with PAT (no npm package needed)
- Airflow / Node-RED — called via direct `fetch()` (no npm package needed)
- `stripe` — already installed

---

## Phase 2+ Roadmap Notes

### Vector Search (Phase 2)
- Embedding provider: Voyage AI (`voyage-3-large`, 1024 dimensions)
- Storage: SQLite `DocumentVector` table (already in schema)
- Indexing: triggered on startup (if stale) and after any doc CRUD
- Tool: `search_documentation(query, topK=5)` replaces `read_documentation` for open queries
- `VOYAGE_API_KEY` stored encrypted in `AdminAIConfig.voyageApiKey`
- Fallback: if Voyage key not configured, falls back to `read_documentation` (keyword-based)

### SSH (Phase 2 — RPi only, others in Phase 4)
- **RPi (webapp):** uses `child_process.exec()` directly — no SSH needed (app runs on the RPi)
- Machine registry: `MACHINES` object in `src/lib/admin-ai/ssh.ts`
- Safety filter: blocks `rm -rf /`, `dd if=`, `mkfs`, redirects to raw devices, `sudo passwd`
- CI Mac (`lucadeblasio@192.168.1.248`) and AI Dev Mac (`luca@192.168.1.249`) deferred to Phase 4 pending firewall configuration — Phase 4 will use `ssh2` package for remote execution

### MCP Integration (Phase 4)
- Config: URL + auth header stored in `AdminAIConfig.mcpServers`
- Claude calls MCP tools as `mcp_<toolname>`
- Backend acts as MCP client, proxies tool calls to external MCP server
- Tool discovery: on config save, backend fetches tool list from MCP server

---

**Last Updated:** 2026-03-03 — Added GitHub PAT + Voyage AI setup instructions and documentation indexing guide
**Owner:** Admin AI system
