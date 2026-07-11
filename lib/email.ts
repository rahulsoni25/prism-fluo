/**
 * lib/email.ts
 * Transactional email — Resend-first with Gmail SMTP fallback.
 *
 * Preferred (production): Resend
 *   RESEND_API_KEY  - get from resend.com -> API Keys
 *   RESEND_FROM     - optional, default "PRISM Intelligence <onboarding@resend.dev>"
 *                     (use Resend's default sandbox domain until fluodigital.com
 *                      is domain-verified in Resend)
 *
 * Fallback (dev / legacy): Gmail SMTP via nodemailer
 *   SMTP_USER, SMTP_PASS   - Gmail address + App Password
 *   SMTP_HOST, SMTP_PORT   - optional overrides
 *   SMTP_FROM              - optional From header override
 *
 * Common:
 *   NOTIFY_EMAIL  - who receives brief notifications (default: rahul@fluodigital.com)
 *
 * If neither Resend nor SMTP is configured, sendMail() logs the URL / body
 * to Vercel console so developers can still test the flow.
 */

import { Resend } from 'resend';

// ── Resend client (preferred) ──────────────────────────────────────
let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  _resend = new Resend(key);
  return _resend;
}

// ── Nodemailer / Gmail SMTP (fallback) ─────────────────────────────
// Loaded lazily to avoid bundler issues in Next.js serverless.
let _transporter: import('nodemailer').Transporter | null = null;
async function getTransporter(): Promise<import('nodemailer').Transporter | null> {
  if (_transporter) return _transporter;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;
  const nodemailer = await import('nodemailer');
  _transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port:   Number(process.env.SMTP_PORT ?? 465),
    secure: true,
    auth:   { user, pass },
  });
  return _transporter;
}

const NOTIFY_TO  = process.env.NOTIFY_EMAIL ?? 'rahul@fluodigital.com';
const FROM_LABEL = (user: string) =>
  process.env.SMTP_FROM ?? `PRISM Intelligence <${user}>`;

// Resend's default sandbox From address works out of the box. Once you
// verify fluodigital.com in Resend, set RESEND_FROM to
// "PRISM Intelligence <no-reply@fluodigital.com>".
const RESEND_FROM = process.env.RESEND_FROM ?? 'PRISM Intelligence <onboarding@resend.dev>';

/**
 * Unified email send. Tries Resend first (production-grade), then Gmail SMTP
 * (legacy fallback), then console-log (dev). Returns true iff a real delivery
 * was attempted (regardless of ultimate delivery success — that's async).
 *
 * All 5 exported email functions below delegate to this. Adding a new email
 * type is now one call, not one nodemailer transport dance per function.
 */
async function sendMail(opts: {
  to:       string | string[];
  subject:  string;
  html:     string;
  replyTo?: string;
  label?:   string;   // for log lines, e.g. "verification", "brief-created"
}): Promise<boolean> {
  const label = opts.label ?? 'mail';

  // 1. Resend (preferred)
  const resend = getResend();
  if (resend) {
    try {
      await resend.emails.send({
        from:      RESEND_FROM,
        to:        opts.to,
        subject:   opts.subject,
        html:      opts.html,
        replyTo:   opts.replyTo,
      });
      console.log(`[Email] ${label} sent via Resend to`, opts.to);
      return true;
    } catch (err: any) {
      console.error(`[Email] Resend ${label} failed:`, err?.message ?? err);
      // fall through to SMTP so we don't fully lose the message
    }
  }

  // 2. Gmail SMTP (legacy fallback)
  const transport = await getTransporter();
  if (transport) {
    const user = process.env.SMTP_USER!;
    try {
      await transport.sendMail({
        from:    FROM_LABEL(user),
        to:      opts.to,
        subject: opts.subject,
        html:    opts.html,
        replyTo: opts.replyTo,
      });
      console.log(`[Email] ${label} sent via SMTP to`, opts.to);
      return true;
    } catch (err: any) {
      console.error(`[Email] SMTP ${label} failed:`, err?.message ?? err);
    }
  }

  // 3. Nothing configured — log so devs can still complete the flow
  console.log(`[Email] ${label} — no provider configured. To:`, opts.to, 'Subject:', opts.subject);
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────

function detailRow(label: string, value: string): string {
  return `
  <tr>
    <td style="padding:9px 0;border-bottom:1px solid #F1F5F9;font-size:13px;color:#64748B;font-weight:500;width:36%">${label}</td>
    <td style="padding:9px 0;border-bottom:1px solid #F1F5F9;font-size:13px;color:#0F172A;font-weight:700;text-align:right">${value}</td>
  </tr>`;
}

// ── Brief Created ────────────────────────────────────────────────────────────

export async function sendBriefCreatedEmail(
  brief: {
    id: string;
    brand: string;
    category?: string;
    objective?: string;
    market?: string;
    age_ranges?: string;
    gender?: string;
    background?: string;
    insight_buckets?: string;
  },
  submittedBy: { name?: string; email: string },
): Promise<void> {
  const now     = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'long', year:'numeric' });
  const timeStr = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true }) + ' IST';
  const initial = (submittedBy.name || submittedBy.email).charAt(0).toUpperCase();

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:'Inter',Arial,sans-serif;background:#F1F5F9;margin:0;padding:24px 12px">
<div style="max-width:600px;margin:0 auto">

  <div style="background:linear-gradient(135deg,#0F172A 0%,#1E1B4B 60%,#1E3A8A 100%);border-radius:16px 16px 0 0;padding:32px;text-align:center">
    <div style="width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#2563EB,#7C3AED);display:inline-flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;color:#fff;margin-bottom:14px">P</div>
    <div style="color:#fff;font-size:20px;font-weight:800;margin-bottom:4px">New Brief Submitted</div>
    <div style="color:#94A3B8;font-size:12px">${dateStr} &nbsp;·&nbsp; ${timeStr}</div>
  </div>

  <div style="background:#fff;padding:28px 32px;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0">

    <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:12px;padding:14px 18px;margin-bottom:24px">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#2563EB,#7C3AED);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:15px;flex-shrink:0">${initial}</div>
        <div>
          <div style="font-size:10px;color:#64748B;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px">Submitted by</div>
          <div style="font-size:14px;font-weight:800;color:#0F172A">${submittedBy.name || submittedBy.email}</div>
          <div style="font-size:12px;color:#2563EB">${submittedBy.email}</div>
        </div>
      </div>
    </div>

    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94A3B8;margin-bottom:10px">Brief Details</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${detailRow('🏷 Brand', brief.brand)}
      ${brief.category   ? detailRow('📂 Category',  brief.category)   : ''}
      ${brief.objective  ? detailRow('🎯 Objective', brief.objective)  : ''}
      ${brief.market     ? detailRow('🗺 Market',    brief.market)     : ''}
      ${brief.age_ranges ? detailRow('👥 Age Range', brief.age_ranges) : ''}
      ${brief.gender && brief.gender !== 'All Genders' ? detailRow('⚤ Gender', brief.gender) : ''}
      ${brief.insight_buckets ? detailRow('📊 Buckets', brief.insight_buckets) : ''}
    </table>

    ${brief.background ? `
    <div style="margin-top:18px;padding:14px 16px;background:#F8FAFC;border-radius:10px;border:1px solid #E2E8F0">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94A3B8;margin-bottom:6px">Background / Context</div>
      <div style="font-size:13px;color:#334155;line-height:1.65">${brief.background}</div>
    </div>` : ''}

    <div style="margin-top:22px;padding:14px 18px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;display:flex;align-items:center;gap:10px">
      <span style="font-size:18px">⏳</span>
      <div>
        <div style="font-size:13px;font-weight:700;color:#92400E">Brief In Progress — Awaiting Data Upload</div>
        <div style="font-size:11px;color:#B45309;margin-top:2px">SLA will be set once data files are uploaded</div>
      </div>
    </div>
  </div>

  <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:0 0 16px 16px;padding:18px 32px;text-align:center">
    <a href="https://prism-fluo.vercel.app/dashboard" style="color:#2563EB;font-size:12px;text-decoration:none;font-weight:600">View Dashboard →</a>
    <div style="font-size:11px;color:#94A3B8;margin-top:6px">PRISM Intelligence · prism-fluo.vercel.app</div>
  </div>
</div>
</body></html>`;

  await sendMail({
    to:      NOTIFY_TO,
    replyTo: submittedBy.email,
    subject: `📊 New Brief: ${brief.brand}${brief.category ? ' — ' + brief.category : ''}`,
    html,
    label:   'brief-created',
  });
}

// ── Email Verification ───────────────────────────────────────────────────────

export async function sendVerificationEmail(
  user: { name: string; email: string },
  verifyUrl: string,
): Promise<void> {
  const firstName = user.name.split(' ')[0];

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:'Inter',Arial,sans-serif;background:#F1F5F9;margin:0;padding:24px 12px">
<div style="max-width:560px;margin:0 auto">

  <div style="background:linear-gradient(135deg,#0F172A 0%,#1E1B4B 60%,#1E3A8A 100%);border-radius:16px 16px 0 0;padding:36px;text-align:center">
    <div style="width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#2563EB,#7C3AED);display:inline-flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;color:#fff;margin-bottom:16px">P</div>
    <div style="color:#fff;font-size:22px;font-weight:800;margin-bottom:6px">Verify your email</div>
    <div style="color:#94A3B8;font-size:13px">One click to activate your PRISM account</div>
  </div>

  <div style="background:#fff;padding:32px;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0">
    <p style="font-size:15px;color:#0F172A;margin:0 0 10px;font-weight:700">Hi ${firstName},</p>
    <p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 28px">
      Thanks for signing up to <strong>PRISM Intelligence</strong>. Click the button below to verify your email address and activate your account.
    </p>

    <div style="text-align:center;margin:28px 0">
      <a href="${verifyUrl}"
         style="background:linear-gradient(135deg,#2563EB,#7C3AED);color:#fff;padding:14px 36px;border-radius:12px;font-size:15px;font-weight:700;text-decoration:none;display:inline-block;letter-spacing:0.02em">
        Verify Email &amp; Sign In →
      </a>
    </div>

    <p style="font-size:12px;color:#94A3B8;text-align:center;margin:24px 0 0">
      This link expires in <strong>24 hours</strong>. If you didn't create an account, you can safely ignore this email.
    </p>

    <div style="margin-top:20px;padding:12px 16px;background:#F8FAFC;border-radius:10px;border:1px solid #E2E8F0">
      <div style="font-size:10px;color:#94A3B8;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Or copy this link</div>
      <div style="font-size:11px;color:#2563EB;word-break:break-all">${verifyUrl}</div>
    </div>
  </div>

  <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:0 0 16px 16px;padding:16px 32px;text-align:center">
    <div style="font-size:11px;color:#94A3B8">PRISM Intelligence · Agency Insights Platform</div>
  </div>
</div>
</body></html>`;

  const ok = await sendMail({
    to:      user.email,
    subject: `Verify your PRISM account`,
    html,
    label:   'verification',
  });
  if (!ok) {
    // Belt-and-suspenders: still log the URL so the admin can hand it to
    // the signup victim over WhatsApp if all providers are down.
    console.log(`[Email] Verify URL: ${verifyUrl}`);
  }
}

// ── Password Reset ───────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(
  user: { name: string; email: string },
  resetUrl: string,
): Promise<void> {
  const firstName = (user.name || user.email).split(' ')[0];

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:'Inter',Arial,sans-serif;background:#F1F5F9;margin:0;padding:24px 12px">
<div style="max-width:560px;margin:0 auto">
  <div style="background:linear-gradient(135deg,#0F172A 0%,#1E1B4B 60%,#1E3A8A 100%);border-radius:16px 16px 0 0;padding:36px;text-align:center">
    <div style="width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#2563EB,#7C3AED);display:inline-flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;color:#fff;margin-bottom:16px">P</div>
    <div style="color:#fff;font-size:22px;font-weight:800;margin-bottom:6px">Reset your password</div>
    <div style="color:#94A3B8;font-size:13px">Use the link below to set a new password for PRISM</div>
  </div>
  <div style="background:#fff;padding:32px;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0">
    <p style="font-size:15px;color:#0F172A;margin:0 0 10px;font-weight:700">Hi ${firstName},</p>
    <p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 24px">
      We received a request to reset the password for your <strong>PRISM Intelligence</strong> account. Click the button below to choose a new one. This link is valid for <strong>1 hour</strong>.
    </p>
    <div style="text-align:center;margin:24px 0">
      <a href="${resetUrl}" style="background:linear-gradient(135deg,#2563EB,#7C3AED);color:#fff;padding:14px 36px;border-radius:12px;font-size:15px;font-weight:700;text-decoration:none;display:inline-block">Reset Password →</a>
    </div>
    <p style="font-size:12px;color:#94A3B8;text-align:center;margin:18px 0 0">
      Didn't request this? You can safely ignore the email — your password won't change.
    </p>
    <div style="margin-top:20px;padding:12px 16px;background:#F8FAFC;border-radius:10px;border:1px solid #E2E8F0">
      <div style="font-size:10px;color:#94A3B8;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Or copy this link</div>
      <div style="font-size:11px;color:#2563EB;word-break:break-all">${resetUrl}</div>
    </div>
  </div>
  <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:0 0 16px 16px;padding:16px 32px;text-align:center">
    <div style="font-size:11px;color:#94A3B8">PRISM Intelligence · Agency Insights Platform</div>
  </div>
</div>
</body></html>`;

  const ok = await sendMail({
    to:      user.email,
    subject: `Reset your PRISM password`,
    html,
    label:   'password-reset',
  });
  if (!ok) console.log(`[Email] Reset URL: ${resetUrl}`);
}

// ── AI Fallback Burst Alert (admin-only) ─────────────────────────────────────

/**
 * Sent by lib/ai/fallback-monitor.ts when 5+ alert-severity fallback events
 * happen within 5 minutes. The single email is rate-limited (30-min cooldown)
 * so an outage doesn't flood the inbox.
 */
export async function sendBurstAlertEmail(subject: string, body: string): Promise<void> {
  const html = `<!DOCTYPE html>
<html><body style="font-family:Inter,Arial,sans-serif;background:#FEF2F2;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:2px solid #DC2626">
  <div style="background:#DC2626;color:#fff;padding:16px 22px;font-weight:800;font-size:16px">🚨 PRISM AI Fallback Alert</div>
  <div style="padding:20px 22px">
    <p style="margin:0 0 10px;font-weight:700;color:#0F172A">${subject}</p>
    <pre style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:12px;font-size:12px;color:#334155;white-space:pre-wrap;font-family:'SF Mono',Consolas,Menlo,monospace">${body.replace(/[<>&]/g, ch => ({'<':'&lt;','>':'&gt;','&':'&amp;'})[ch]!)}</pre>
    <p style="margin:14px 0 0;font-size:12px;color:#64748B">
      Visit <a href="https://prism-fluo.vercel.app/admin/ai-health" style="color:#2563EB">/admin/ai-health</a> for the full event log.
    </p>
  </div>
</div></body></html>`;
  await sendMail({
    to:      NOTIFY_TO,
    subject: `🚨 ${subject}`,
    html,
    label:   'burst-alert',
  });
}

// ── Brief Active (data uploaded) ─────────────────────────────────────────────

export async function sendBriefActiveEmail(
  brief: { id: string; brand: string; category?: string },
  submittedBy: { name?: string; email: string },
  slaHours: number,
): Promise<void> {
  const slaDue   = new Date(Date.now() + slaHours * 3600_000);
  const slaDueStr = slaDue.toLocaleString('en-IN', {
    weekday:'short', day:'numeric', month:'short',
    hour:'2-digit', minute:'2-digit', hour12:true,
  }) + ' IST';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="font-family:'Inter',Arial,sans-serif;background:#F1F5F9;margin:0;padding:24px 12px">
<div style="max-width:600px;margin:0 auto">
  <div style="background:linear-gradient(135deg,#065F46,#059669);border-radius:16px 16px 0 0;padding:32px;text-align:center">
    <div style="font-size:40px;margin-bottom:10px">✅</div>
    <div style="color:#fff;font-size:20px;font-weight:800">Brief Now Active</div>
    <div style="color:#A7F3D0;font-size:13px;margin-top:4px">Data uploaded · Analysis in progress</div>
  </div>
  <div style="background:#fff;padding:28px 32px;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0">
    <table width="100%" cellpadding="0" cellspacing="0">
      ${detailRow('🏷 Brand',    brief.brand)}
      ${brief.category ? detailRow('📂 Category', brief.category) : ''}
      ${detailRow('👤 Account',  `${submittedBy.name || submittedBy.email} (${submittedBy.email})`)}
      ${detailRow('⏱ SLA',      `${slaHours}h — Ready by ${slaDueStr}`)}
    </table>
  </div>
  <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:0 0 16px 16px;padding:20px 32px;text-align:center">
    <a href="https://prism-fluo.vercel.app/dashboard" style="background:linear-gradient(135deg,#059669,#10B981);color:#fff;padding:10px 24px;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none;display:inline-block">View Dashboard →</a>
  </div>
</div>
</body></html>`;

  await sendMail({
    to:      NOTIFY_TO,
    replyTo: submittedBy.email,
    subject: `✅ Brief Active: ${brief.brand} — insights ready in ${slaHours}h`,
    html,
    label:   'brief-active',
  });
}
