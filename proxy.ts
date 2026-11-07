import { NextResponse, type NextRequest } from 'next/server';
import { isExpired, readSession, SESSION_COOKIE } from '@/lib/auth';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/share/')) return NextResponse.next();

  const session = await readSession(request.cookies.get(SESSION_COOKIE)?.value);
  const active = session !== null && !isExpired(session);

  if (pathname === '/login' || pathname === '/expired') {
    return active ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next();
  }
  if (active) return NextResponse.next();

  const target = session?.role === 'guest' ? '/expired' : '/login';
  return NextResponse.redirect(new URL(target, request.url));
}

export const config = {
  matcher: ['/((?!_next/|icon.svg|favicon.ico).*)'],
};
