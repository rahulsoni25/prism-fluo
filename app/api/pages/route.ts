/**
 * GET /api/pages
 * Returns all pages with their status.
 * Used by the Navbar to determine which links to show.
 * Requires authentication — guests see nothing (login page handles itself).
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ pages: [] });

  try {
    const result = await db.query(
      `SELECT id, name, slug, icon, show_in_nav, status, sort_order
       FROM pages
       ORDER BY sort_order ASC`,
    );
    return NextResponse.json({ pages: result.rows });
  } catch {
    // Return sensible defaults if the pages table doesn't exist yet
    return NextResponse.json({
      pages: [
        { id: 'analyze',       name: 'Analyze',       slug: '/analyze',       icon: '⚡', show_in_nav: true,  status: 'published' },
        { id: 'culture',       name: 'Culture',       slug: '/culture',       icon: '🌍', show_in_nav: true,  status: 'published' },
        { id: 'presentations', name: 'Presentations', slug: '/presentations', icon: '🎨', show_in_nav: true,  status: 'published' },
      ],
    });
  }
}
