import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SUPPORTED_LOCALES = new Set(['en', 'de', 'fr', 'es']);

function resolveLocale(request: NextRequest): string {
  const localeFromQuery = request.nextUrl.searchParams.get('lang')?.toLowerCase();
  if (localeFromQuery && SUPPORTED_LOCALES.has(localeFromQuery)) {
    return localeFromQuery;
  }

  const localeFromCookie = request.cookies.get('deepterm_locale')?.value?.toLowerCase();
  if (localeFromCookie && SUPPORTED_LOCALES.has(localeFromCookie)) {
    return localeFromCookie;
  }

  return 'en';
}

function withLocale(url: URL, locale: string): URL {
  if (!url.searchParams.has('lang')) {
    url.searchParams.set('lang', locale);
  }

  return url;
}

function decodeAdminSessionToken(token: string): { exp?: number } {
  const normalized = token.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  const padded = padding ? normalized + '='.repeat(4 - padding) : normalized;

  const decoded = atob(padded);
  return JSON.parse(decoded) as { exp?: number };
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = parts;
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254) ||
    first === 127
  );
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  );
}

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  return request.ip ?? '';
}

/**
 * Fire-and-forget: report a security event to the internal API so it can
 * be persisted + emailed.  Middleware can't import Prisma/nodemailer
 * (Edge Runtime), so we delegate to a server-side route.
 */
function reportSecurityEvent(
  request: NextRequest,
  type: string,
  details?: Record<string, unknown>,
) {
  const ip = getClientIp(request);
  const origin = request.nextUrl.origin; // e.g. http://localhost:3000

  // Best-effort — don't await, don't let failures affect the response
  fetch(`${origin}/api/internal/security-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type,
      ip,
      path: request.nextUrl.pathname,
      userAgent: request.headers.get('user-agent') ?? undefined,
      details,
    }),
  }).catch(() => {
    // Silently ignore — intrusion tracking must never break user requests
  });
}

function isIntranetRequest(request: NextRequest): boolean {
  let ip = getClientIp(request);
  if (!ip) {
    return false;
  }

  if (ip.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }

  return isPrivateIpv4(ip) || isPrivateIpv6(ip);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const locale = resolveLocale(request);

  if (pathname === '/admin/login' || pathname === '/api/admin/auth/login') {
    if (!isIntranetRequest(request)) {
      reportSecurityEvent(request, 'admin_access_denied', { target: pathname });
      return new NextResponse('Not Found', { status: 404 });
    }
  }

  // Skip admin login page from protection
  if (pathname === '/admin/login') {
    const adminToken = request.cookies.get('admin-session')?.value;
    // Redirect to admin dashboard if already logged in
    if (adminToken) {
      return NextResponse.redirect(withLocale(new URL('/admin', request.url), locale));
    }
    return NextResponse.next();
  }

  // Check if the path is an admin route (protected with admin auth)
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    // Skip auth routes
    if (pathname.startsWith('/api/admin/auth')) {
      return NextResponse.next();
    }

    // Get the admin session token from cookies
    const adminToken = request.cookies.get('admin-session')?.value;

    // If no admin session, redirect to admin login
    if (!adminToken) {
      // For API routes, return 401
      if (pathname.startsWith('/api/admin')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      // For pages, redirect to admin login
      const loginUrl = new URL('/admin/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      loginUrl.searchParams.set('lang', locale);
      return NextResponse.redirect(loginUrl);
    }

    // Verify token is not expired (basic check)
    try {
      const decoded = decodeAdminSessionToken(adminToken);
      if (!decoded.exp || decoded.exp < Date.now()) {
        // Token expired — only flag non-intranet attempts (intranet expired tokens are benign)
        if (!isIntranetRequest(request)) {
          reportSecurityEvent(request, 'admin_token_invalid', { reason: 'expired', target: pathname });
        }
        const response = pathname.startsWith('/api/admin')
          ? NextResponse.json({ error: 'Session expired' }, { status: 401 })
          : NextResponse.redirect(withLocale(new URL('/admin/login', request.url), locale));
        response.cookies.delete('admin-session');
        return response;
      }
    } catch {
      // Invalid token — always suspicious, report it
      reportSecurityEvent(request, 'admin_token_invalid', { reason: 'malformed', target: pathname });
      const response = pathname.startsWith('/api/admin')
        ? NextResponse.json({ error: 'Invalid session' }, { status: 401 })
        : NextResponse.redirect(withLocale(new URL('/admin/login', request.url), locale));
      response.cookies.delete('admin-session');
      return response;
    }
  }

  // Check if the path is a dashboard route (protected)
  if (pathname.startsWith('/dashboard')) {
    // Get the session token from cookies
    const sessionToken = request.cookies.get('authjs.session-token')?.value ||
                         request.cookies.get('__Secure-authjs.session-token')?.value;

    // If no session token, redirect to login
    if (!sessionToken) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      loginUrl.searchParams.set('lang', locale);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Redirect logged-in users away from auth pages
  if (pathname === '/login' || pathname === '/register') {
    const sessionToken = request.cookies.get('authjs.session-token')?.value ||
                         request.cookies.get('__Secure-authjs.session-token')?.value;

    if (sessionToken) {
      return NextResponse.redirect(withLocale(new URL('/dashboard', request.url), locale));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/api/admin/:path*', '/login', '/register'],
};
