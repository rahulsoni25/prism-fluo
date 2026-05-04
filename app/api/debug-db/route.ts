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

  return NextResponse.json({
    DATABASE_URL_set: !!dbUrl,
    DATABASE_URL_masked: maskedUrl,
    pg_connected: true,
    tables: { uploads, tool_data, briefs, analyses, users },
    uploads_columns: { user_id: has_user_id, brief_id: has_brief_id, sla_hours: has_sla_hours },
    ready_for_uploads: uploads && tool_data && has_user_id,
  });
}
