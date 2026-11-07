import { NextResponse, type NextRequest } from 'next/server';
import { isExpired, readSession, SESSION_COOKIE, SESSION_HEADER } from '@/lib/auth';

const SHARE_PATH = /^\/share\/([^/]+)(\/.*)?$/;

/** Forwards the request with SESSION_HEADER set to `token` (or stripped), optionally rewritten to `pathname`. */
function forward(request: NextRequest, token: string | null, pathname?: string) {
  const headers = new Headers(request.headers);
  if (token) headers.set(SESSION_HEADER, token);
  else headers.delete(SESSION_HEADER);
  if (!pathname) return NextResponse.next({ request: { headers } });
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.rewrite(url, { request: { headers } });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const share = SHARE_PATH.exec(pathname);
  if (share) {
    const [, token, rest = '/'] = share;
    const session = await readSession(token);
    if (session?.role !== 'guest') return NextResponse.redirect(new URL('/login', request.url));
    return forward(request, token, isExpired(session) ? '/expired' : rest);
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value ?? null;
  const session = await readSession(token ?? undefined);
  const active = session?.role === 'admin' && !isExpired(session);

  if (pathname === '/login' || pathname === '/expired') {
    return active ? NextResponse.redirect(new URL('/', request.url)) : forward(request, null);
  }
  return active ? forward(request, token) : NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/((?!_next/|icon.svg|favicon.ico).*)'],
};
