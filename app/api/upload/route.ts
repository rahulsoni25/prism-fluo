/**
 * POST /api/upload
 *
 * Accepts EITHER:
 *   (a) Legacy multipart/form-data with a single `file` field — used for
 *       files ≤ 4 MB that fit through Vercel's serverless body-size limit.
 *   (b) JSON `{ blobUrl, filename, briefId?, slaHours? }` — used for files
 *       that were uploaded directly to Vercel Blob via /api/upload/blob-token.
 *       The server downloads the blob, processes it, then deletes it.
 *
 * Returns the UploadSummary synchronously once processing is done.
 *
 * maxDuration = 60 tells Railway/Next.js to allow up to 60 s for this route
 * (the default is 30 s, which large files would exceed before the bulk-insert
 * optimisation was in place).
 */

import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { handleUpload } from '@/lib/uploads/handler';
import { logger } from '@/lib/logger';
import { config } from '@/lib/config';
import { getSession } from '@/lib/auth/server';

export const maxDuration = 60; // seconds

const ALLOWED_EXT = ['xlsx', 'xls', 'csv', 'pdf', 'pptx', 'ppt'];

export const POST = async (req: NextRequest) => {
  const t0 = Date.now();

  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    const contentType = req.headers.get('content-type') ?? '';

    // ── Path B: JSON body with blobUrl ─────────────────────────────
    // Triggered when the client used /api/upload/blob-token to PUT the
    // file directly to Vercel Blob, then sent us just the resulting URL.
    if (contentType.toLowerCase().includes('application/json')) {
      const { blobUrl, filename, briefId: briefIdRaw, slaHours: slaHoursRaw } = await req.json();

      if (typeof blobUrl !== 'string' || !blobUrl.startsWith('https://')) {
        return NextResponse.json(
          { error: 'BAD_BLOB_URL', message: 'blobUrl must be an https URL returned by Vercel Blob.' },
          { status: 400 },
        );
      }
      if (typeof filename !== 'string' || !filename) {
        return NextResponse.json(
          { error: 'NO_FILENAME', message: 'filename is required.' },
          { status: 400 },
        );
      }

      const ext = filename.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_EXT.includes(ext)) {
        return NextResponse.json(
          { error: 'UNSUPPORTED_TYPE', message: `Only .${ALLOWED_EXT.join(', .')} are supported.` },
          { status: 415 },
        );
      }

      const briefId  = typeof briefIdRaw === 'string' && briefIdRaw.trim() ? briefIdRaw.trim() : null;
      const slaHours = slaHoursRaw ? parseInt(String(slaHoursRaw), 10) : null;

      // Download the blob.
      const blobRes = await fetch(blobUrl);
      if (!blobRes.ok) {
        return NextResponse.json(
          { error: 'BLOB_FETCH_FAILED', message: `Could not fetch uploaded blob (${blobRes.status}).` },
          { status: 502 },
        );
      }
      const buffer = Buffer.from(await blobRes.arrayBuffer());
      const sizeMB = buffer.length / (1024 * 1024);

      if (buffer.length === 0) {
        return NextResponse.json(
          { error: 'EMPTY_FILE', message: 'The uploaded file is empty (0 bytes).' },
          { status: 400 },
        );
      }
      if (sizeMB > config.MAX_FILE_SIZE_MB) {
        return NextResponse.json(
          { error: 'FILE_TOO_LARGE', message: `File size ${sizeMB.toFixed(1)} MB exceeds the ${config.MAX_FILE_SIZE_MB} MB limit.` },
          { status: 413 },
        );
      }

      const summary = await handleUpload(buffer, filename, briefId, session.userId, slaHours);

      // Best-effort delete — keeps the Blob store from growing unbounded.
      // We don't fail the request if cleanup errors (file is already processed
      // and persisted in our DB; the orphan blob can be GC'd later).
      try { await del(blobUrl); }
      catch (err: any) { logger.warn('blob:delete_failed', { url: blobUrl, error: err.message }); }

      logger.info('api:upload', {
        filename, sizeMB: sizeMB.toFixed(2), briefId, slaHours,
        userId: session.userId, via: 'blob', ms: Date.now() - t0,
      });

      return NextResponse.json({
        uploadId: summary.uploadId,
        sheets:   summary.sheets,
        rawText:  summary.rawText ?? null,
      });
    }

    // ── Path A: legacy multipart/form-data (small files, ≤ 4 MB) ──
    const formData    = await req.formData();
    const file        = formData.get('file');
    const briefIdRaw  = formData.get('briefId');
    const slaHoursRaw = formData.get('slaHours');

    const briefId  = typeof briefIdRaw === 'string' && briefIdRaw.trim() ? briefIdRaw.trim() : null;
    const slaHours = slaHoursRaw ? parseInt(slaHoursRaw as string, 10) : null;

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: 'NO_FILE', message: 'No file provided. Send a multipart/form-data request with a "file" field, or a JSON body with a blobUrl.' },
        { status: 400 },
      );
    }

    const fileObj = file as File;
    const sizeMB  = fileObj.size / (1024 * 1024);

    if (fileObj.size === 0) {
      return NextResponse.json(
        { error: 'EMPTY_FILE', message: 'The uploaded file is empty (0 bytes). Please upload a file with data.' },
        { status: 400 },
      );
    }

    if (sizeMB > config.MAX_FILE_SIZE_MB) {
      return NextResponse.json(
        { error: 'FILE_TOO_LARGE', message: `File size ${sizeMB.toFixed(1)} MB exceeds the ${config.MAX_FILE_SIZE_MB} MB limit.` },
        { status: 413 },
      );
    }

    const ext = fileObj.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXT.includes(ext ?? '')) {
      return NextResponse.json(
        { error: 'UNSUPPORTED_TYPE', message: `Only .${ALLOWED_EXT.join(', .')} files are supported.` },
        { status: 415 },
      );
    }

    const buffer  = Buffer.from(await fileObj.arrayBuffer());
    const summary = await handleUpload(buffer, fileObj.name, briefId, session.userId, slaHours);

    logger.info('api:upload', {
      filename: fileObj.name, sizeMB: sizeMB.toFixed(2), briefId, slaHours,
      userId: session.userId, via: 'multipart', ms: Date.now() - t0,
    });

    return NextResponse.json({
      uploadId: summary.uploadId,
      sheets:   summary.sheets,
      rawText:  summary.rawText ?? null,
    });

  } catch (err: any) {
    logger.error('api:upload_failed', { error: err.message, ms: Date.now() - t0 });
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: err.message ?? 'An unexpected error occurred during upload.' },
      { status: 500 },
    );
  }
};
