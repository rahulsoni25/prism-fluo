/**
 * lib/email.ts
 * Transactional email via Nodemailer (SMTP — no third-party account needed).
 *
 * Required Vercel env vars:
 *   SMTP_USER  — Gmail address e.g. prism@fluodigital.com  (or any Gmail)
 *   SMTP_PASS  — Gmail App Password (16-char, spaces ignored)
 *                Get it: myaccount.google.com → Security → 2-Step → App Passwords
 *
 * Optional overrides (defaults work for Gmail):
 *   SMTP_HOST  — default: smtp.gmail.com
 *   SMTP_PORT  — default: 465
 *   SMTP_FROM  — default: "PRISM Intelligence <SMTP_USER>"
 *   NOTIFY_EMAIL — who receives brief notifications (default: rahul@fluodigital.com)
 */

import nodemailer from 'nodemailer';

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (_transporter) return _transporter;

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    console.log('[Email] SMTP_USER / SMTP_PASS not set — emails disabled');
    return null;
  }

  _transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port:   Number(process.env.SMTP_PORT ?? 465),
    secure: true,          // SSL on port 465
    auth:   { user, pass },
  });

  return _transporter;
}

const NOTIFY_TO   = process.env.NOTIFY_EMAIL ?? 'rahul@fluodigital.com';
const FROM_LABEL  = (user: string) =>
  process.env.SMTP_FROM ?? `PRISM Intelligence <${user}>`;

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
  const transport = getTransporter();
  if (!transport) return;

  const user    = process.env.SMTP_USER!;
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

  try {
    await transport.sendMail({
      from:     FROM_LABEL(user),
      to:       NOTIFY_TO,
      replyTo:  submittedBy.email,
      subject:  `📊 New Brief: ${brief.brand}${brief.category ? ' — ' + brief.category : ''}`,
      html,
    });
    console.log('[Email] Brief-created sent to', NOTIFY_TO);
  } catch (err) {
    console.error('[Email] sendBriefCreatedEmail failed:', (err as Error).message);
  }
}

// ── Brief Active (data uploaded) ─────────────────────────────────────────────

export async function sendBriefActiveEmail(
  brief: { id: string; brand: string; category?: string },
  submittedBy: { name?: string; email: string },
  slaHours: number,
): Promise<void> {
  const transport = getTransporter();
  if (!transport) return;

  const user     = process.env.SMTP_USER!;
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

  try {
    await transport.sendMail({
      from:    FROM_LABEL(user),
      to:      NOTIFY_TO,
      replyTo: submittedBy.email,
      subject: `✅ Brief Active: ${brief.brand} — insights ready in ${slaHours}h`,
      html,
    });
    console.log('[Email] Brief-active sent to', NOTIFY_TO);
  } catch (err) {
    console.error('[Email] sendBriefActiveEmail failed:', (err as Error).message);
  }
}
