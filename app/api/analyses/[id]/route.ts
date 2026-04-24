import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { rows } = await db.query(
      'SELECT * FROM analyses WHERE id = $1',
      [id]
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
