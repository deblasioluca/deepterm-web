/**
 * Gmail API client for email ingestion.
 *
 * Uses OAuth2 credentials to poll Gmail for new emails forwarded by ImprovMX.
 * Parses email content (from, subject, body, thread ID) and returns structured data.
 *
 * Required env vars:
 *   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface GmailMessage {
  gmailMessageId: string;
  rfcMessageId: string | null;
  threadId: string;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  receivedAt: Date;
}

interface GmailTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

interface GmailMessageResponse {
  id: string;
  threadId: string;
  labelIds?: string[];
  payload: GmailPayload;
  internalDate: string;
}

interface GmailPayload {
  headers: Array<{ name: string; value: string }>;
  mimeType: string;
  body: { data?: string; size: number };
  parts?: GmailPart[];
}

interface GmailPart {
  mimeType: string;
  body: { data?: string; size: number };
  parts?: GmailPart[];
}

// ── Token Management ─────────────────────────────────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Gmail API credentials not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN.',
    );
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail token refresh failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as GmailTokenResponse;
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.token;
}

// ── Gmail API Helpers ────────────────────────────────────────────────────────

async function gmailFetch(path: string): Promise<Response> {
  const token = await getAccessToken();
  return fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * List message IDs matching a query.
 * Default: emails received in the last N hours to our domain aliases.
 */
export async function listMessages(opts?: {
  query?: string;
  maxResults?: number;
  pageToken?: string;
}): Promise<{ messageIds: string[]; nextPageToken?: string }> {
  const q = opts?.query ?? 'to:deepterm.net';
  const max = opts?.maxResults ?? 50;

  let url = `messages?q=${encodeURIComponent(q)}&maxResults=${max}`;
  if (opts?.pageToken) url += `&pageToken=${opts.pageToken}`;

  const res = await gmailFetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail listMessages failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as GmailListResponse;
  const messageIds = (data.messages ?? []).map((m) => m.id);
  return { messageIds, nextPageToken: data.nextPageToken };
}

/**
 * Fetch and parse a single Gmail message by ID.
 */
export async function getMessage(messageId: string): Promise<GmailMessage> {
  const res = await gmailFetch(`messages/${messageId}?format=full`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail getMessage failed (${res.status}): ${body}`);
  }

  const raw = (await res.json()) as GmailMessageResponse;
  return parseGmailMessage(raw);
}

/**
 * Fetch new messages since a given date, filtering out already-processed IDs.
 */
export async function fetchNewMessages(opts: {
  sinceDate?: Date;
  processedIds: Set<string>;
  maxResults?: number;
}): Promise<GmailMessage[]> {
  const since = opts.sinceDate ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
  const epochSecs = Math.floor(since.getTime() / 1000);
  const query = `to:deepterm.net after:${epochSecs}`;

  const { messageIds } = await listMessages({
    query,
    maxResults: opts.maxResults ?? 50,
  });

  // Filter out already-processed messages
  const newIds = messageIds.filter((id) => !opts.processedIds.has(id));

  // Fetch each message (sequential to avoid rate limiting)
  const messages: GmailMessage[] = [];
  for (const id of newIds) {
    try {
      const msg = await getMessage(id);
      messages.push(msg);
    } catch (err) {
      console.error(`Failed to fetch Gmail message ${id}:`, err);
    }
  }

  return messages;
}

// ── Parsing ──────────────────────────────────────────────────────────────────

function parseGmailMessage(raw: GmailMessageResponse): GmailMessage {
  const headers = raw.payload.headers;
  const getHeader = (name: string): string =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

  const fromRaw = getHeader('From');
  const { email: from, name: fromName } = parseEmailAddress(fromRaw);
  const to = extractDeeptermAlias(getHeader('To'), getHeader('Delivered-To'));
  const subject = getHeader('Subject');
  const rfcMessageId = getHeader('Message-ID') || null;

  const { text, html } = extractBody(raw.payload);
  const receivedAt = new Date(parseInt(raw.internalDate, 10));

  return {
    gmailMessageId: raw.id,
    rfcMessageId,
    threadId: raw.threadId,
    from,
    fromName,
    to,
    subject,
    bodyText: text || '(no body)',
    bodyHtml: html || null,
    receivedAt,
  };
}

function parseEmailAddress(raw: string): { email: string; name: string } {
  // Format: "Display Name <email@example.com>" or "email@example.com"
  const match = raw.match(/^"?(.+?)"?\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim().toLowerCase() };
  }
  return { name: '', email: raw.trim().toLowerCase() };
}

function extractDeeptermAlias(to: string, deliveredTo: string): string {
  // Try to find the deepterm.net alias from To or Delivered-To headers
  const combined = `${to}, ${deliveredTo}`;
  const match = combined.match(/([a-zA-Z0-9._+-]+@deepterm\.net)/i);
  return match ? match[1].toLowerCase() : to.toLowerCase();
}

function extractBody(payload: GmailPayload): { text: string; html: string } {
  let text = '';
  let html = '';

  function walk(part: GmailPart | GmailPayload): void {
    if (part.mimeType === 'text/plain' && part.body.data) {
      text += base64UrlDecode(part.body.data);
    } else if (part.mimeType === 'text/html' && part.body.data) {
      html += base64UrlDecode(part.body.data);
    }

    if ('parts' in part && part.parts) {
      for (const sub of part.parts) {
        walk(sub);
      }
    }
  }

  walk(payload);

  // If we only have HTML, strip tags for text version
  if (!text && html) {
    text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  return { text, html };
}

function base64UrlDecode(data: string): string {
  // Gmail uses URL-safe base64 encoding
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}
