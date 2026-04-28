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
      'SELECT id, brief_name, template_name, pptx_data FROM presentations WHERE id = $1 AND user_id = $2',
      [presentationId, session.userId],
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'Presentation not found or not owned by user' },
        { status: 404 }
      );
    }

    const presentation = rows[0];

    // If we have PPTX data stored, return it with streaming + caching
    if (presentation.pptx_data) {
      const buffer = Buffer.isBuffer(presentation.pptx_data)
        ? presentation.pptx_data
        : Buffer.from(presentation.pptx_data);

      const filename = `${presentation.brief_name.replace(/\s+/g, '_')}_${presentation.template_name.replace(/\s+/g, '_')}.pptx`;

      // Optimized headers for faster download and browser caching
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': buffer.length.toString(),
          'Cache-Control': 'private, max-age=86400',
          'ETag': `"${Buffer.from(buffer).toString('base64').slice(0, 32)}"`,
          'Accept-Ranges': 'bytes',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    // If no PPTX data found
    return NextResponse.json(
      {
        error: 'Presentation file not available',
        message: 'The presentation data was not stored. Please regenerate it.',
      },
      { status: 404 }
    );
  } catch (error) {
    console.error('Error downloading presentation:', error);
    return NextResponse.json(
      { error: 'Failed to download presentation', details: String(error) },
      { status: 500 }
    );
  }
}
