import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

export async function GET(_req, { params }) {
  const { id } = await params;
  try {
    const { rows } = await db.query('SELECT * FROM briefs WHERE id = $1', [id]);
    if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req, { params }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const allowed = ['status', 'analysis_id'];
    const fields = Object.keys(body).filter(k => allowed.includes(k));
    if (fields.length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 });

    const sets = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const vals = fields.map(f => body[f]);
    const { rows } = await db.query(
      `UPDATE briefs SET ${sets} WHERE id = $${fields.length + 1} RETURNING *`,
      [...vals, id]
    );
    if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
