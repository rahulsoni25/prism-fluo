/**
 * POST /api/compress
 *
 * Accepts a PDF as raw binary body, compresses via CloudConvert, returns
 * the compressed PDF as application/pdf. Available to any logged-in user.
 *
 * Headers:
 *   X-Filename     — original filename (for logging + output naming)
 *   X-Quality      — 'ebook' (default) | 'archive' | 'screen' | 'printer' | 'prepress'
 *
 * Response headers expose the savings:
 *   X-Original-Bytes
 *   X-Compressed-Bytes
 *   X-Ratio
 *   X-Elapsed-Ms
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/server';
import { compressPdfViaCloudConvert, CloudConvertNotConfiguredError } from '@/lib/compress/cloudconvert';
import { logger } from '@/lib/logger';

export const maxDuration = 120; // compression on a 25 MB PDF takes ~30-60s

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    const filename = decodeURIComponent(req.headers.get('x-filename') ?? 'document.pdf');
    const qualityHeader = (req.headers.get('x-quality') ?? 'ebook') as any;
    const allowedQ = ['archive', 'ebook', 'screen', 'printer', 'prepress'];
    const quality = allowedQ.includes(qualityHeader) ? qualityHeader : 'ebook';

    if (!filename.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'PDF_ONLY', message: 'Only PDF files are supported for compression.' }, { status: 415 });
    }

    const buffer = Buffer.from(await req.arrayBuffer());
    if (buffer.length === 0) {
      return NextResponse.json({ error: 'EMPTY', message: 'Empty body.' }, { status: 400 });
    }
    // Hard cap so we don't get billed for huge accidental uploads
    const CAP_MB = 100;
    if (buffer.length > CAP_MB * 1024 * 1024) {
      return NextResponse.json({ error: 'TOO_LARGE', message: `File is larger than ${CAP_MB} MB.` }, { status: 413 });
    }

    const result = await compressPdfViaCloudConvert(buffer, { quality, filename });

    const pct = Math.round((1 - result.ratio) * 100);
    logger.info('compress:done', {
      filename, quality,
      originalMB:   (result.originalBytes / 1e6).toFixed(2),
      compressedMB: (result.compressedBytes / 1e6).toFixed(2),
      savedPct: pct,
      elapsedMs: result.elapsedMs,
      userId: session.userId,
    });

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename.replace(/\.pdf$/i, '')}-compressed.pdf"`,
        'X-Original-Bytes':   String(result.originalBytes),
        'X-Compressed-Bytes': String(result.compressedBytes),
        'X-Ratio':            result.ratio.toFixed(4),
        'X-Elapsed-Ms':       String(result.elapsedMs),
        'Cache-Control':      'no-store',
      },
    });
  } catch (err: any) {
    if (err instanceof CloudConvertNotConfiguredError) {
      logger.warn('compress:not_configured', {});
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: 503 },
      );
    }
    logger.error('compress:failed', { error: err.message, ms: Date.now() - t0 });
    return NextResponse.json({ error: 'COMPRESS_FAILED', message: err.message }, { status: 500 });
  }
}
