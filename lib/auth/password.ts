/**
 * lib/auth/password.ts
 * Password hashing using Node's built-in scrypt. No external dependency.
 *
 * Stored format: scrypt$<N>$<r>$<p>$<saltHex>$<hashHex>
 * The parameters are embedded so we can tune them later without breaking
 * old hashes.
 */

import { scrypt, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options?: { N?: number; r?: number; p?: number; maxmem?: number },
) => Promise<Buffer>;

// Node defaults: N=16384 (2^14), r=8, p=1. Strong enough for serverless cold-start budgets.
const N = 16384;
const r = 8;
const p = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;
const MAX_MEM = 64 * 1024 * 1024; // 64 MB — comfortably above N*r*128

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const hash = await scryptAsync(password.normalize('NFKC'), salt, KEY_LEN, {
    N, r, p, maxmem: MAX_MEM,
  });
  return `scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const parts = stored.split('$');
  if (parts.length !== 6) return false;
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const N2 = Number(nStr), r2 = Number(rStr), p2 = Number(pStr);
  if (!N2 || !r2 || !p2) return false;
  let salt: Buffer, expected: Buffer;
  try {
    salt = Buffer.from(saltHex, 'hex');
    expected = Buffer.from(hashHex, 'hex');
  } catch { return false; }
  const actual = await scryptAsync(password.normalize('NFKC'), salt, expected.length, {
    N: N2, r: r2, p: p2, maxmem: MAX_MEM,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
