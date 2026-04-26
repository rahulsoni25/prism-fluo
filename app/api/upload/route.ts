/**
 * POST /api/upload
 *
 * Accepts a multipart/form-data upload with a single `file` field.
 * Returns the UploadSummary synchronously once processing is done.
 *
 * maxDuration = 60 tells Railway/Next.js to allow up to 60 s for this route
 * (the default is 30 s, which large files would exceed before the bulk-insert
 * optimisation was in place).
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleUpload } from '@/lib/uploads/handler';
import { logger } from '@/lib/logger';
import { config } from '@/lib/config';
import { getSession } from '@/lib/auth/server';

export const maxDuration = 60; // seconds

export const POST = async (req: NextRequest) => {
  const t0 = Date.now();

  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('file');
    const briefIdRaw = formData.get('briefId');
    const briefId = typeof briefIdRaw === 'string' && briefIdRaw.trim() ? briefIdRaw.trim() : null;

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: 'NO_FILE', message: 'No file provided. Send a multipart/form-data request with a "file" field.' },
        { status: 400 }
      );
    }

    const fileObj = file as File;
    const sizeMB = fileObj.size / (1024 * 1024);

    if (sizeMB > config.MAX_FILE_SIZE_MB) {
      return NextResponse.json(
        {
          error: 'FILE_TOO_LARGE',
          message: `File size ${sizeMB.toFixed(1)} MB exceeds the ${config.MAX_FILE_SIZE_MB} MB limit.`,
        },
        { status: 413 }
      );
    }

    const ext = fileObj.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv', 'pdf'].includes(ext ?? '')) {
      return NextResponse.json(
        { error: 'UNSUPPORTED_TYPE', message: 'Only .xlsx, .xls, .csv, and .pdf files are supported.' },
        { status: 415 }
      );
    }

    const buffer = Buffer.from(await fileObj.arrayBuffer());
    const summary = await handleUpload(buffer, fileObj.name, briefId, session.userId);

    logger.info('api:upload', { filename: fileObj.name, sizeMB: sizeMB.toFixed(2), briefId, userId: session.userId, ms: Date.now() - t0 });

    if (summary.sheets.length === 0) {
      return NextResponse.json(
        {
          error: 'NO_RECOGNIZED_SHEETS',
          message: 'No GWI or Keyword Plan sheets were detected in this file. Check that column headers match the expected format.',
          uploadId: summary.uploadId,
          sheets: [],
        },
        { status: 422 }
      );
    }

    return NextResponse.json(summary);

  } catch (err: any) {
    logger.error('api:upload_failed', { error: err.message, ms: Date.now() - t0 });
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: err.message ?? 'An unexpected error occurred during upload.' },
      { status: 500 }
    );
  }
};
