/**
 * lib/auth/email-policy.ts
 * Work-email-only signup policy. Blocks free email providers (Gmail, Yahoo,
 * Hotmail, etc.) at signup AND login. A small allow-list lets specific
 * personal addresses through for owner/demo access.
 *
 * Override via env without code changes:
 *   ALLOWED_PERSONAL_EMAILS=foo@gmail.com,bar@gmail.com
 */

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.in', 'yahoo.co.uk', 'ymail.com', 'rocketmail.com',
  'hotmail.com', 'hotmail.co.uk', 'hotmail.co.in',
  'outlook.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com',
  'proton.me', 'protonmail.com', 'pm.me',
  'gmx.com', 'gmx.net',
  'zoho.com', 'mail.com',
  'rediffmail.com', 'rediff.com',
]);

const HARDCODED_ALLOWLIST = new Set<string>([
  'rahulsoni25@gmail.com',
]);

function allowlist(): Set<string> {
  const extra = (process.env.ALLOWED_PERSONAL_EMAILS ?? '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  return new Set<string>([...HARDCODED_ALLOWLIST, ...extra]);
}

/**
 * Returns true if `email` is allowed to sign up / sign in.
 * Allowed = on the personal-email allowlist OR not from a free-mail provider.
 */
export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normal = email.toLowerCase().trim();
  if (allowlist().has(normal)) return true;
  const at = normal.lastIndexOf('@');
  if (at < 0) return false;
  const domain = normal.slice(at + 1);
  return !FREE_EMAIL_DOMAINS.has(domain);
}

export const WORK_EMAIL_ERROR =
  'Please use your work email address to sign in. Personal email providers (Gmail, Yahoo, Hotmail, etc.) are not allowed.';
