/**
 * Shared Airflow API helper.
 * Reads credentials from SystemSettings, provides authenticated fetch.
 */
import { prisma } from '@/lib/prisma';
import { decryptApiKey } from '@/lib/ai-encryption';

export interface AirflowConfig {
  baseUrl: string;
  username: string;
  password: string;
}

/**
 * Read Airflow connection config from SystemSettings.
 * Returns null if not configured.
 */
export async function getAirflowConfig(): Promise<AirflowConfig | null> {
  const settings = await prisma.systemSettings.findMany({
    where: { key: { in: ['airflow_url', 'airflow_username', 'airflow_password'] } },
  });
  const map = new Map(settings.map(s => [s.key, s.value]));

  const baseUrl = map.get('airflow_url');
  const username = map.get('airflow_username');
  const encryptedPassword = map.get('airflow_password');

  if (!baseUrl || !username || !encryptedPassword) return null;

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    username,
    password: decryptApiKey(encryptedPassword),
  };
}

/**
 * Fetch from the Airflow REST API (v1) with Basic auth.
 * @param path  API path starting with '/' (e.g. '/dags')
 * @param init  Optional RequestInit overrides
 */
export async function airflowFetch(path: string, init?: RequestInit): Promise<Response> {
  const config = await getAirflowConfig();
  if (!config) throw new Error('Airflow not configured');

  const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');

  return fetch(`${config.baseUrl}/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    signal: init?.signal ?? AbortSignal.timeout(10000),
  });
}

/**
 * Convenience: fetch JSON from Airflow API.
 */
export async function airflowJSON<T = Record<string, unknown>>(path: string, init?: RequestInit): Promise<T> {
  const res = await airflowFetch(path, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Airflow API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}
