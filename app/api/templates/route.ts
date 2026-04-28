/**
 * GET /api/templates
 *
 * Returns list of available presentation templates
 * User can browse and select templates before generating deck
 */

import { NextRequest, NextResponse } from 'next/server';
import { listTemplates } from '@/lib/templates/definitions';
import { getSession } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  try {
    const templates = listTemplates();

    return NextResponse.json({
      success: true,
      count: templates.length,
      templates,
      categories: [...new Set(templates.map(t => t.category))],
    }, { status: 200 });
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}
