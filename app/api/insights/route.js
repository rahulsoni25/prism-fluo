import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

// Returns list of saved analyses (replaces static lib/data.js stub)
export async function GET() {
  try {
    const { rows } = await db.query(
      `SELECT id, upload_id, sheet_name, filename,
              results_json->'meta' AS meta,
              created_at
       FROM analyses
       ORDER BY created_at DESC`
    );
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
