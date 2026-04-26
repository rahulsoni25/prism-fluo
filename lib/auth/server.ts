/**
 * lib/auth/server.ts
 * Server-side auth helpers — read the session cookie inside API routes.
 */

import { cookies } from 'next/headers';
import { verifySession, SESSION_COOKIE_NAME, type SessionPayload } from './session';
import { db } from '@/lib/db/client';

/**
 * Read the current session payload from the request cookie. Returns null
 * if no cookie / invalid signature / expired.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE_NAME)?.value;
  return verifySession(token ?? null);
}

/**
 * Upsert a user row from a verified login (OAuth or demo).
 * Returns the row id so the session cookie can carry it.
 */
export async function upsertUser(input: {
  email:    string;
  name?:    string | null;
  image?:   string | null;
  provider: 'demo' | 'google' | 'linkedin';
  providerId?: string | null;
}): Promise<{ id: string; email: string; name: string | null; image: string | null }> {
  const { rows } = await db.query(
    `INSERT INTO users (email, name, image, provider, provider_id, last_login)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (email)
     DO UPDATE SET
       name        = COALESCE(EXCLUDED.name,  users.name),
       image       = COALESCE(EXCLUDED.image, users.image),
       provider    = EXCLUDED.provider,
       provider_id = COALESCE(EXCLUDED.provider_id, users.provider_id),
       last_login  = NOW()
     RETURNING id, email, name, image`,
    [
      input.email.toLowerCase().trim(),
      input.name        ?? null,
      input.image       ?? null,
      input.provider,
      input.providerId  ?? null,
    ],
  );
  return rows[0];
}
