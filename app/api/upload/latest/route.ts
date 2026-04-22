import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

export const GET = async () => {
  try {
    const res = await db.query('SELECT s.name as filename, s.id as sessionId, s.created_at FROM sessions s ORDER BY s.created_at DESC LIMIT 1');
    if (res.rows.length === 0) {
      return NextResponse.json({ filename: null });
    }
    return NextResponse.json(res.rows[0]);

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};
