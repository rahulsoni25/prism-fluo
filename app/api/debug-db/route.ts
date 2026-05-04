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

  // Test actual DB connectivity
  let pgOk = false;
  let pgError = '';
  let tables: string[] = [];
  let uploadsColumns: string[] = [];

  try {
    const res = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`);
    pgOk = true;
    tables = res.rows.map((r: any) => r.table_name);

    const colRes = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name='uploads' AND table_schema='public' ORDER BY ordinal_position`);
    uploadsColumns = colRes.rows.map((r: any) => r.column_name);
  } catch (e: any) {
    pgError = e.message;
  }

  return NextResponse.json({
    DATABASE_URL_set: !!dbUrl,
    DATABASE_URL_masked: maskedUrl,
    pg_connected: pgOk,
    pg_error: pgError || null,
    tables,
    uploads_columns: uploadsColumns,
    has_tool_data: tables.includes('tool_data'),
    has_user_id_on_uploads: uploadsColumns.includes('user_id'),
  });
}
