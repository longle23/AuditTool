import { NextResponse, type NextRequest } from 'next/server';
import { findNavItem } from '@/app/config/navigation';
import { isExpired, readSession, SESSION_COOKIE, SESSION_HEADER, type Session } from '@/lib/auth';
import { can } from '@/lib/permissions';

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

/** Tool pages the session has no permission for; the home page then picks an allowed tool. */
function forbidden(session: Session, pathname: string) {
  const match = findNavItem(pathname);
  return match !== null && !can(session.permissions, match.item.permission);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const share = SHARE_PATH.exec(pathname);
  if (share) {
    const [, token, rest = '/'] = share;
    const session = await readSession(token);
    if (!session || session.username !== null) return NextResponse.redirect(new URL('/login', request.url));
    if (isExpired(session)) return forward(request, token, '/expired');
    if (forbidden(session, rest)) return NextResponse.redirect(new URL(`/share/${token}`, request.url));
    return forward(request, token, rest);
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value ?? null;
  const session = await readSession(token ?? undefined);
  const active = session !== null && session.username !== null && !isExpired(session);

  if (pathname === '/login' || pathname === '/expired') {
    return active ? NextResponse.redirect(new URL('/', request.url)) : forward(request, null);
  }
  if (!active) return NextResponse.redirect(new URL('/login', request.url));
  if (forbidden(session, pathname)) return NextResponse.redirect(new URL('/', request.url));
  return forward(request, token);
}

export const config = {
  matcher: ['/((?!_next/|icon.svg|favicon.ico).*)'],
};
