export const SESSION_COOKIE = 'jennie-work-session';
/** Set by the proxy with the token of the current request: admin cookie or guest token from `/share/<token>/...`. */
export const SESSION_HEADER = 'x-jennie-session';
export const ADMIN_USERNAME = 'admin';
export const ADMIN_PASSWORD = 'botdien';
export const ADMIN_SESSION_MINUTES = 4 * 60;
// Must stay under setTimeout's ~24.8-day limit, used for the client-side guest deadline.
export const MAX_SHARE_MINUTES = 4 * 60;

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

let keyPromise: Promise<CryptoKey> | undefined;
function getKey() {
  keyPromise ??= crypto.subtle.importKey('raw', encoder.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return keyPromise;
}

// Truncated HMAC: 72 bits is far beyond online guessing and keeps share links short.
const SIGNATURE_BYTES = 9;
async function sign(payload: string): Promise<string> {
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', await getKey(), encoder.encode(payload)));
  return toBase64Url(mac.slice(0, SIGNATURE_BYTES));
}

/** Token format: `<a|g><exp seconds, base36>.<signature>`, e.g. `gtnk3x1.AbCdEfGhIjKl`. */
export async function signSession(role: Role, minutes: number): Promise<string> {
  const payload = role[0] + Math.floor(Date.now() / 1000 + minutes * 60).toString(36);
  return `${payload}.${await sign(payload)}`;
}

/** Returns the session if the signature is valid, even when expired; callers check `exp`. */
export async function readSession(token: string | undefined): Promise<Session | null> {
  const [payload, signature] = token?.split('.') ?? [];
  if (!payload || !signature) return null;

  const expected = await sign(payload);
  let diff = signature.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;

  const role = payload[0] === 'a' ? 'admin' : payload[0] === 'g' ? 'guest' : null;
  const exp = parseInt(payload.slice(1), 36) * 1000;
  return role && Number.isFinite(exp) ? { role, exp } : null;
}

export const isExpired = (session: Session) => session.exp <= Date.now();

/** Guests browse under `/share/<token>` so their session never touches the admin cookie. */
export const basePathFor = (session: Session | null, token: string | null) =>
  session?.role === 'guest' ? `/share/${token}` : '';
