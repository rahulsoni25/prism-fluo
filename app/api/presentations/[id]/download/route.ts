/**
 * GET /api/presentations/[id]/download
 * Downloads a presentation as PowerPoint file
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  try {
    const presentationId = params.id;

    // Fetch presentation with ownership check
    const { rows } = await db.query(
      'SELECT id, brief_name, gamma_url, template_name FROM presentations WHERE id = $1 AND user_id = $2',
      [presentationId, session.userId],
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'Presentation not found or not owned by user' },
        { status: 404 }
      );
    }

    const presentation = rows[0];

    // If we have a Gamma URL, try to download from there
    if (presentation.gamma_url && presentation.gamma_url !== '#') {
      try {
        const response = await fetch(presentation.gamma_url);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          const filename = `${presentation.brief_name.replace(/\s+/g, '_')}_${presentation.template_name.replace(/\s+/g, '_')}.pptx`;

          return new NextResponse(buffer, {
            headers: {
              'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
              'Content-Disposition': `attachment; filename="${filename}"`,
              'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            },
          });
        }
      } catch (error) {
        console.error('Error downloading from Gamma URL:', error);
      }
    }

    // Fallback: Generate a simple presentation file
    // For now, return a JSON response with instructions
    return NextResponse.json(
      {
        message: 'Presentation download not yet available. Please use the online viewer.',
        viewerUrl: presentation.gamma_url || '#',
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error downloading presentation:', error);
    return NextResponse.json(
      { error: 'Failed to download presentation' },
      { status: 500 }
    );
  }
}
