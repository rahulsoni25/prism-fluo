/**
 * POST /api/upload/blob-token
 *
 * Issues short-lived, pre-signed Vercel Blob upload tokens to the client
 * so large files (>4 MB) can be PUT directly to blob storage, bypassing
 * Vercel's serverless function body-size limit (~4.5 MB on every plan).
 *
 * The client uses `@vercel/blob/client`'s `upload()` helper, which calls
 * this endpoint twice:
 *   1. Before generating the upload URL — we check auth and return a
 *      token payload (passing through userId + briefId so we can stamp
 *      provenance after upload completes).
 *   2. After upload completes — Vercel notifies us; we currently no-op
 *      because the client immediately POSTs the resulting URL to
 *      /api/upload for processing.
 *
 * Requires the `BLOB_READ_WRITE_TOKEN` env var, which Vercel sets
 * automatically when a Blob store is linked to the project. Local dev
 * pulls it via `vercel env pull .env.local` after running `vercel link`.
 */

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/server';
import { logger } from '@/lib/logger';

// One ALLOWED list, lifted from /api/upload so the two stay in sync.
const ALLOWED_CONTENT_TYPES = [
  // Excel
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel',                                          // .xls
  // CSV
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',                                          // browsers send this for .csv too
  // PDF
  'application/pdf',
  // PowerPoint
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'application/vnd.ms-powerpoint',                                              // .ppt
  // Fallbacks browsers send when MIME isn't recognised
  'application/octet-stream',
  '',
];

export const POST = async (req: NextRequest) => {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error: 'BLOB_NOT_CONFIGURED',
        message:
          'Vercel Blob is not configured. Create a Blob store in the ' +
          'Vercel Dashboard (Storage → Blob → Create), then run ' +
          '`vercel env pull .env.local` to fetch BLOB_READ_WRITE_TOKEN.',
      },
      { status: 503 },
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // pathname is the blob path the client wants (e.g. "uploads/foo.pptx").
        // We don't restrict pathnames; just gate on extension + size + auth.
        const ext = pathname.split('.').pop()?.toLowerCase() ?? '';
        if (!['xlsx', 'xls', 'csv', 'pdf', 'pptx', 'ppt', 'png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
          throw new Error(`Unsupported file extension: .${ext}`);
        }
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          // Hard cap aligned with config.MAX_FILE_SIZE_MB default.
          // Override per-deploy by raising config.MAX_FILE_SIZE_MB.
          maximumSizeInBytes: 50 * 1024 * 1024, // 50 MB
          tokenPayload: JSON.stringify({
            userId:   session.userId,
            payload:  clientPayload ?? '',
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // The client will POST the blob URL to /api/upload immediately
        // after this fires — so we just log here. Don't do heavy work
        // (Gemini calls etc.) in this callback; Vercel's hook timeout
        // is shorter than our normal request budget.
        // @vercel/blob's PutBlobResult exposes url + pathname + contentType
        // but not size; that's fine — the size check happens server-side
        // when /api/upload downloads the blob.
        logger.info('blob:upload_complete', {
          url:         blob.url,
          pathname:    blob.pathname,
          contentType: blob.contentType,
          tokenPayload,
        });
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (err: any) {
    logger.error('blob:token_failed', { error: err.message });
    return NextResponse.json(
      { error: 'BLOB_TOKEN_FAILED', message: err.message },
      { status: 400 },
    );
  }
};
