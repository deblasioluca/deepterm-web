/**
 * ImprovMX API client for email alias management.
 *
 * Docs: https://improvmx.com/api/
 * Auth: Basic auth with "api" as username and API key as password.
 */

const IMPROVMX_API_BASE = 'https://api.improvmx.com/v3';

function getApiKey(): string {
  const key = process.env.IMPROVMX_API_KEY;
  if (!key) throw new Error('IMPROVMX_API_KEY environment variable is not set');
  return key;
}

function getDomain(): string {
  return process.env.IMPROVMX_DOMAIN || 'deepterm.net';
}

function authHeader(): string {
  return 'Basic ' + Buffer.from(`api:${getApiKey()}`).toString('base64');
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ImprovMXAlias {
  id: number;
  alias: string;
  forward: string;
  created: number;
}

export interface ImprovMXLog {
  id: string;
  created: number;
  sender: { address: string; name: string };
  recipient: string;
  subject: string;
  transport: string;
  events: Array<{
    id: string;
    created: number;
    status: string;
    code: number;
    local: string;
    server: string;
    message: string;
  }>;
}

// ── API Functions ────────────────────────────────────────────────────────────

export async function listAliases(): Promise<ImprovMXAlias[]> {
  const domain = getDomain();
  const res = await fetch(`${IMPROVMX_API_BASE}/domains/${domain}/aliases/`, {
    headers: { Authorization: authHeader() },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ImprovMX listAliases failed (${res.status}): ${body}`);
  }

  const data = await res.json() as { aliases: ImprovMXAlias[]; success: boolean };
  return data.aliases;
}

export async function createAlias(
  alias: string,
  forward: string,
): Promise<ImprovMXAlias> {
  const domain = getDomain();
  const res = await fetch(`${IMPROVMX_API_BASE}/domains/${domain}/aliases/`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ alias, forward }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ImprovMX createAlias failed (${res.status}): ${body}`);
  }

  const data = await res.json() as { alias: ImprovMXAlias; success: boolean };
  return data.alias;
}

export async function updateAlias(
  aliasId: string,
  forward: string,
): Promise<ImprovMXAlias> {
  const domain = getDomain();
  const res = await fetch(
    `${IMPROVMX_API_BASE}/domains/${domain}/aliases/${aliasId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ forward }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ImprovMX updateAlias failed (${res.status}): ${body}`);
  }

  const data = await res.json() as { alias: ImprovMXAlias; success: boolean };
  return data.alias;
}

export async function deleteAlias(aliasId: string): Promise<void> {
  const domain = getDomain();
  const res = await fetch(
    `${IMPROVMX_API_BASE}/domains/${domain}/aliases/${aliasId}`,
    {
      method: 'DELETE',
      headers: { Authorization: authHeader() },
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ImprovMX deleteAlias failed (${res.status}): ${body}`);
  }
}

export async function listLogs(): Promise<ImprovMXLog[]> {
  const domain = getDomain();
  const res = await fetch(`${IMPROVMX_API_BASE}/domains/${domain}/logs/`, {
    headers: { Authorization: authHeader() },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ImprovMX listLogs failed (${res.status}): ${body}`);
  }

  const data = await res.json() as { logs: ImprovMXLog[]; success: boolean };
  return data.logs || [];
}

export async function checkDomain(): Promise<{
  active: boolean;
  domain: string;
  display: string;
}> {
  const domain = getDomain();
  const res = await fetch(`${IMPROVMX_API_BASE}/domains/${domain}/check/`, {
    headers: { Authorization: authHeader() },
  });

  if (!res.ok) {
    return { active: false, domain, display: domain };
  }

  const data = await res.json() as { valid: boolean; success: boolean };
  return { active: data.valid && data.success, domain, display: domain };
}
