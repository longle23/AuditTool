import { NextResponse, type NextRequest } from 'next/server';
import { readSession, SESSION_COOKIE } from '@/lib/auth';

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await readSession(token);
  if (!session || session.role !== 'guest') return NextResponse.redirect(new URL('/login', request.url));

  // The proxy sends expired guests to /expired; the cookie outlives the token so that screen sticks.
  const response = NextResponse.redirect(new URL('/', request.url));
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.max(0, Math.ceil((session.exp - Date.now()) / 1000)) + 30 * 24 * 60 * 60,
  });
  return response;
}
