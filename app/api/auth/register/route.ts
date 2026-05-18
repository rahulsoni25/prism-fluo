/**
 * POST /api/auth/register
 * Creates a pending verification token and sends a confirmation email.
 * The user account is only created after they click the link.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { sendVerificationEmail } from '@/lib/email';
import { hashPassword } from '@/lib/auth/password';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// Ensure the verification_tokens table exists (safe to run on every cold start)
async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS verification_tokens (
      token         TEXT PRIMARY KEY,
      email         TEXT NOT NULL,
      name          TEXT,
      password_hash TEXT,
      expires_at    TIMESTAMP WITH TIME ZONE NOT NULL,
      created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query(`ALTER TABLE verification_tokens ADD COLUMN IF NOT EXISTS password_hash TEXT`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`);
}

export async function POST(req: NextRequest) {
  try {
    const { name, agency, email, password } = await req.json();

    if (!name?.trim() || !email?.trim() || !password) {
      return NextResponse.json({ error: 'Name, email and password are required.' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
    }

    const normalEmail = email.toLowerCase().trim();
    const fullName    = agency?.trim() ? `${name.trim()} (${agency.trim()})` : name.trim();

    await ensureTable();

    // Block if already registered
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [normalEmail]);
    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Please sign in.' },
        { status: 409 },
      );
    }

    // Remove any stale pending token for this email
    await db.query('DELETE FROM verification_tokens WHERE email = $1', [normalEmail]);

    // Hash the password BEFORE persisting — the plaintext never touches the DB
    const passwordHash = await hashPassword(password);

    // Generate a 32-byte hex token (64 chars) — unguessable
    const token     = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 h

    await db.query(
      'INSERT INTO verification_tokens (token, email, name, password_hash, expires_at) VALUES ($1, $2, $3, $4, $5)',
      [token, normalEmail, fullName, passwordHash, expiresAt],
    );

    // Build verify URL relative to the incoming request host
    const host     = req.headers.get('host') ?? 'prism-fluo.vercel.app';
    const proto    = host.startsWith('localhost') ? 'http' : 'https';
    const verifyUrl = `${proto}://${host}/api/auth/verify?token=${token}`;

    await sendVerificationEmail({ name: fullName, email: normalEmail }, verifyUrl);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[register] error:', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
