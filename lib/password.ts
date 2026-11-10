import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// Also keeps usernames safe inside NocoDB `where` clauses, which cannot escape `,` `(` `)`.
export const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{1,50}$/;

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

/** Stored format: `scrypt$<salt base64>$<hash base64>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 32);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Verified against when the username does not exist, so response time does not reveal valid usernames. */
export const DUMMY_HASH = `scrypt$${'A'.repeat(22)}==$${'A'.repeat(43)}=`;
