import { GUEST_PERMISSIONS } from './permissions';

export const SESSION_COOKIE = 'jennie-work-session';
/** Set by the proxy with the token of the current request: user cookie or guest token from `/share/<token>/...`. */
export const SESSION_HEADER = 'x-jennie-session';
export const SESSION_MINUTES = 4 * 60;
// Must stay under setTimeout's ~24.8-day limit, used for the client-side guest deadline.
export const MAX_SHARE_MINUTES = 4 * 60;

export interface Session {
  /** Null for guests browsing through a share link. */
  username: string | null;
  role: string;
  permissions: string[];
  exp: number;
}

// Set AUTH_SECRET in production; the fallback only keeps local dev working.
const SECRET = process.env.AUTH_SECRET || 'jennie-work-dev-secret';
const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
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

const expiresAt = (minutes: number) => Math.floor(Date.now() / 1000 + minutes * 60);

/** Guest token: `g<exp seconds, base36>.<signature>`, e.g. `gtnk3x1.AbCdEfGhIjKl`. */
export async function signGuestSession(minutes: number): Promise<string> {
  const payload = 'g' + expiresAt(minutes).toString(36);
  return `${payload}.${await sign(payload)}`;
}

/**
 * User token: `u<base64url JSON>.<signature>`. Role and permissions are snapshotted at login.
 * shortcut: role/permission changes and deactivation apply on next login (max SESSION_MINUTES); check NocoDB per request if that must be instant.
 */
export async function signUserSession(user: { username: string; role: string; permissions: string[] }, minutes: number) {
  const json = JSON.stringify({ u: user.username, r: user.role, p: user.permissions, e: expiresAt(minutes) });
  const payload = 'u' + toBase64Url(encoder.encode(json));
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

  if (payload[0] === 'g') {
    const exp = parseInt(payload.slice(1), 36) * 1000;
    return Number.isFinite(exp) ? { username: null, role: 'guest', permissions: GUEST_PERMISSIONS, exp } : null;
  }
  if (payload[0] === 'u') {
    try {
      const { u, r, p, e } = JSON.parse(new TextDecoder().decode(fromBase64Url(payload.slice(1))));
      return { username: u, role: r, permissions: p, exp: e * 1000 };
    } catch {
      return null;
    }
  }
  return null;
}

export const isExpired = (session: Session) => session.exp <= Date.now();
export const isGuest = (session: Session) => session.username === null;

/** Guests browse under `/share/<token>` so their session never touches the user cookie. */
export const basePathFor = (session: Session | null, token: string | null) =>
  session && isGuest(session) ? `/share/${token}` : '';
