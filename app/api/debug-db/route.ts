import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

export async function GET() {
  const dbUrl = process.env.DATABASE_URL ?? '';

  // Mask password
  let maskedUrl = 'NOT SET';
  try {
    if (dbUrl) {
      const u = new URL(dbUrl);
      u.password = '***';
      maskedUrl = u.toString();
    }
  } catch { maskedUrl = dbUrl.slice(0, 40) + '...'; }

  // Test actual DB connectivity + table existence via direct probes
  // (information_schema returns empty through pgBouncer transaction pooler —
  //  use direct SELECT probes instead which are not affected by this limitation)
  const probe = async (sql: string) => {
    const r = await db.query(sql);
    return r.rowCount !== null ? true : false; // any result = table exists
  };

  const [uploads, tool_data, briefs, analyses, users] = await Promise.all([
    probe('SELECT 1 FROM uploads LIMIT 1').catch(() => false),
    probe('SELECT 1 FROM tool_data LIMIT 1').catch(() => false),
    probe('SELECT 1 FROM briefs LIMIT 1').catch(() => false),
    probe('SELECT 1 FROM analyses LIMIT 1').catch(() => false),
    probe('SELECT 1 FROM users LIMIT 1').catch(() => false),
  ]);

  // Check uploads columns via direct query
  let has_user_id = false, has_brief_id = false, has_sla_hours = false;
  try {
    await db.query('SELECT user_id, brief_id, sla_hours FROM uploads LIMIT 0');
    has_user_id = true; has_brief_id = true; has_sla_hours = true;
  } catch { /* columns missing */ }

  const gemini_api_key_set = !!process.env.GEMINI_API_KEY;
  const smtp_set = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
  const nextauth_set = !!process.env.NEXTAUTH_SECRET;

  return NextResponse.json({
    DATABASE_URL_set: !!dbUrl,
    DATABASE_URL_masked: maskedUrl,
    pg_connected: true,
    tables: { uploads, tool_data, briefs, analyses, users },
    uploads_columns: { user_id: has_user_id, brief_id: has_brief_id, sla_hours: has_sla_hours },
    env: {
      GEMINI_API_KEY: gemini_api_key_set,
      SMTP: smtp_set,
      NEXTAUTH_SECRET: nextauth_set,
    },
    ready_for_uploads: uploads && tool_data && has_user_id,
    ready_for_ai: uploads && tool_data && has_user_id && gemini_api_key_set,
    diagnosis: !uploads ? 'MISSING: uploads table — run /api/migrate'
      : !tool_data ? 'MISSING: tool_data table — run /api/migrate'
      : !has_user_id ? 'MISSING: user_id column on uploads — run /api/migrate'
      : !gemini_api_key_set ? 'MISSING: GEMINI_API_KEY env var — add to Vercel dashboard'
      : 'OK — all systems go',
  });
}
