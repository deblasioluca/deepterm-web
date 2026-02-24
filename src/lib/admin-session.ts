import { cookies } from 'next/headers';

export type AdminSession = {
  id: string;
  email: string;
  role: string;
};

export function getAdminSession(): AdminSession | null {
  const sessionCookie = cookies().get('admin-session')?.value;
  if (!sessionCookie) return null;

  try {
    const sessionData = JSON.parse(Buffer.from(sessionCookie, 'base64').toString('utf-8')) as {
      id?: unknown;
      email?: unknown;
      role?: unknown;
      exp?: unknown;
    };

    if (
      !sessionData ||
      typeof sessionData.id !== 'string' ||
      typeof sessionData.email !== 'string' ||
      typeof sessionData.role !== 'string'
    ) {
      return null;
    }

    if (typeof sessionData.exp === 'number' && sessionData.exp < Date.now()) {
      return null;
    }

    return {
      id: sessionData.id,
      email: sessionData.email,
      role: sessionData.role,
    };
  } catch {
    return null;
  }
}
