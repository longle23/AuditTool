export const SESSION_COOKIE = 'jennie-work-session';
export const ADMIN_USERNAME = 'admin';
export const ADMIN_PASSWORD = 'conbotdien';
export const ADMIN_SESSION_MINUTES = 4 * 60;
// Must stay under setTimeout's ~24.8-day limit, used for the client-side guest deadline.
export const MAX_SHARE_MINUTES = 7 * 24 * 60;

export type Role = 'admin' | 'guest';
export interface Session {
  role: Role;
  exp: number;
}

// Set AUTH_SECRET in production; the fallback only keeps local dev working.
const SECRET = process.env.AUTH_SECRET || 'jennie-work-dev-secret';
const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

let keyPromise: Promise<CryptoKey> | undefined;
function getKey() {
  keyPromise ??= crypto.subtle.importKey('raw', encoder.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
  return keyPromise;
}

export async function signSession(role: Role, minutes: number): Promise<string> {
  const payload = toBase64Url(encoder.encode(JSON.stringify({ role, exp: Date.now() + minutes * 60_000 })));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await getKey(), encoder.encode(payload)));
  return `${payload}.${toBase64Url(signature)}`;
}

/** Returns the session if the signature is valid, even when expired; callers check `exp`. */
export async function readSession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await getKey(),
      fromBase64Url(signature) as BufferSource,
      encoder.encode(payload),
    );
    if (!valid) return null;
    const session = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as Session;
    return (session.role === 'admin' || session.role === 'guest') && typeof session.exp === 'number' ? session : null;
  } catch {
    return null;
  }
}

export const isExpired = (session: Session) => session.exp <= Date.now();
