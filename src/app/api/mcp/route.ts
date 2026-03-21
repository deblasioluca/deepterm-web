/**
 * MCP (Model Context Protocol) endpoint for end-users.
 *
 * URL:  POST/GET/DELETE  /api/mcp
 * Auth: Bearer <ZK_JWT_ACCESS_TOKEN>  (same token the desktop/mobile app uses)
 *
 * Stateless: each request creates a fresh MCP server instance scoped to the
 * authenticated user. No session state is maintained between requests.
 */

import { NextRequest } from 'next/server';
import { getAuthFromRequest } from '@/lib/zk/middleware';
import { prisma } from '@/lib/prisma';
import { handleMcpRequest } from '@/lib/mcp/server';

export const dynamic = 'force-dynamic';

// Re-usable auth check — returns user info or a JSON-RPC error Response
async function authenticate(request: NextRequest): Promise<
  | { userId: string; email: string }
  | Response
> {
  const auth = getAuthFromRequest(request);

  if (!auth) {
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unauthorized — provide a valid Bearer token.' },
        id: null,
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Look up user email (needed for payment event queries)
  const user = await prisma.zKUser.findUnique({
    where: { id: auth.userId },
    select: { email: true },
  });

  if (!user) {
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'User not found.' },
        id: null,
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return { userId: auth.userId, email: user.email };
}

// ── POST: Main MCP JSON-RPC handler ──────────────

export async function POST(request: NextRequest) {
  const result = await authenticate(request);
  if (result instanceof Response) return result;

  return handleMcpRequest(request, result.userId, result.email);
}

// ── GET: SSE stream (for server-initiated messages) ──

export async function GET(request: NextRequest) {
  const result = await authenticate(request);
  if (result instanceof Response) return result;

  return handleMcpRequest(request, result.userId, result.email);
}

// ── DELETE: Session termination (stateless = 405) ──

export async function DELETE() {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Session termination not supported (stateless server).' },
      id: null,
    }),
    { status: 405, headers: { 'Content-Type': 'application/json' } },
  );
}
