/**
 * GET  /api/admin/email-test        — diagnostic view. Returns which providers
 *                                     are configured (masked), no send.
 * POST /api/admin/email-test        — actually sends a test verification email
 *                                     to the admin, then returns the exact
 *                                     Resend API response (or error).
 *
 * Purpose: when signup emails silently fail, this endpoint gives a direct
 * answer without hunting Vercel logs. Admin-only.
 *
 * Body for POST: { to?: string }  — recipient. Defaults to session user email.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/server';
import { db } from '@/lib/db/client';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

async function isAdmin(userId: string): Promise<boolean> {
  try {
    const { rows } = await db.query('SELECT email, is_admin FROM users WHERE id = $1', [userId]);
    const u = rows[0];
    if (!u) return false;
    if (u.is_admin === true) return true;
    const list = (process.env.ADMIN_EMAILS ?? '')
      .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    return list.includes((u.email ?? '').toLowerCase());
  } catch { return false; }
}

function maskKey(k?: string | null): string | null {
  if (!k) return null;
  if (k.length < 12) return '(too short — invalid?)';
  return `${k.slice(0, 8)}…${k.slice(-4)}`;
}

// ── GET: report what's configured ──────────────────────────────────
export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!(await isAdmin(session.userId))) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
  }

  const report: Record<string, unknown> = {
    // Which provider will sendMail() actually use?
    activeProvider:
      process.env.RESEND_API_KEY ? 'Resend'
      : (process.env.SMTP_USER && process.env.SMTP_PASS) ? 'Gmail SMTP'
      : 'NONE (emails will be console-logged only)',

    resend: {
      apiKeySet:    !!process.env.RESEND_API_KEY,
      apiKeyMask:   maskKey(process.env.RESEND_API_KEY),
      from:         process.env.RESEND_FROM ?? 'PRISM Intelligence <onboarding@resend.dev>',
      fromDefault:  !process.env.RESEND_FROM,
      note:         process.env.RESEND_FROM
        ? 'Custom From — make sure the domain is verified in Resend.'
        : 'Using Resend SANDBOX From (onboarding@resend.dev) — can ONLY send to the email your Resend account was created with. All other recipients silently fail. Verify a domain in Resend + set RESEND_FROM to fix.',
    },

    smtp: {
      userSet:  !!process.env.SMTP_USER,
      passSet:  !!process.env.SMTP_PASS,
      host:     process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port:     Number(process.env.SMTP_PORT ?? 465),
    },

    notifyTo: process.env.NOTIFY_EMAIL ?? 'rahul@fluodigital.com',

    generatedAt: new Date().toISOString(),
  };

  return NextResponse.json(report);
}

// ── POST: actually try to send + return raw provider response ──────
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!(await isAdmin(session.userId))) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const to = String(body?.to || session.email || '').trim();
  if (!to || !/^\S+@\S+\.\S+$/.test(to)) {
    return NextResponse.json({ error: 'Provide a valid recipient email' }, { status: 400 });
  }

  const from = process.env.RESEND_FROM ?? 'PRISM Intelligence <onboarding@resend.dev>';

  // Try Resend first
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const result = await resend.emails.send({
        from,
        to,
        subject: '[PRISM diagnostic] Test email',
        html:    `<p>This is a diagnostic email from PRISM admin.</p>
                  <p>If you received this, your email pipeline is working.</p>
                  <p>Sent at: ${new Date().toISOString()}</p>`,
      });

      return NextResponse.json({
        provider: 'Resend',
        ok: !result.error,
        to,
        from,
        resendData:  result.data ?? null,
        resendError: result.error ?? null,
        // Common failure modes explained inline for the admin
        hint: result.error
          ? interpretResendError(result.error)
          : 'Sent successfully. Check Resend dashboard at resend.com/emails to see delivery status.',
      });
    } catch (err: any) {
      return NextResponse.json({
        provider:  'Resend',
        ok:        false,
        to,
        from,
        thrown:    true,
        message:   err?.message ?? String(err),
        hint:      'Uncaught exception from Resend SDK. Common causes: invalid API key format, network error, or missing @ in From address.',
      });
    }
  }

  // Fallback to SMTP
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const nodemailer = await import('nodemailer');
      const t = nodemailer.createTransport({
        host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT ?? 465),
        secure: true,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      const info = await t.sendMail({
        from: `PRISM Intelligence <${process.env.SMTP_USER}>`,
        to,
        subject: '[PRISM diagnostic] Test email (via SMTP)',
        html: `<p>Test via Gmail SMTP fallback at ${new Date().toISOString()}</p>`,
      });
      return NextResponse.json({ provider: 'Gmail SMTP', ok: true, to, info });
    } catch (err: any) {
      return NextResponse.json({
        provider: 'Gmail SMTP',
        ok: false,
        to,
        error: err?.message ?? String(err),
        hint: 'Gmail SMTP failed. Most common cause: the App Password was revoked by Google. Rotate at myaccount.google.com/apppasswords.',
      });
    }
  }

  return NextResponse.json({
    provider: 'NONE',
    ok: false,
    hint: 'Neither RESEND_API_KEY nor SMTP_USER/SMTP_PASS is set in Vercel env vars.',
  });
}

/**
 * Turn a Resend error object into a plain-English explanation. Resend's
 * error names are stable so we can map them to specific fixes.
 */
function interpretResendError(err: any): string {
  const name    = String(err?.name ?? '').toLowerCase();
  const message = String(err?.message ?? '').toLowerCase();

  if (name.includes('validation') && message.includes('testing')) {
    return 'SANDBOX RESTRICTION: With the default onboarding@resend.dev From, you can ONLY send to the email your Resend account was created with. Verify a domain in Resend + set RESEND_FROM = "PRISM Intelligence <no-reply@fluodigital.com>" to send to arbitrary recipients.';
  }
  if (name.includes('missing_api_key') || message.includes('api key')) {
    return 'API KEY MISSING OR INVALID. Confirm RESEND_API_KEY is set on the PRODUCTION Vercel environment and the deployment has picked it up (redeploy without cache).';
  }
  if (name.includes('not_found')) {
    return 'DOMAIN NOT VERIFIED. The From address domain is not verified in Resend. Either use onboarding@resend.dev or verify your domain first.';
  }
  if (name.includes('rate_limit')) {
    return 'RATE LIMIT HIT. Resend free tier allows 100 emails/day. Wait or upgrade.';
  }
  return `Resend error "${err?.name ?? 'unknown'}": ${err?.message ?? '(no message)'}`;
}
