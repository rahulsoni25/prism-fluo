/**
 * POST /api/upload/via-cloudconvert/finish
 *
 * Phase 2 of the CloudConvert fallback upload. Client has uploaded the
 * file directly to CC; we now poll the job, download the (possibly
 * compressed) result, and run it through handleUpload exactly as a
 * normal upload would.
 *
 * Body: { jobId, filename, briefId?, slaHours? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/server';
import { handleUpload } from '@/lib/uploads/handler';
import { logger } from '@/lib/logger';

export const maxDuration = 120; // job poll + download + parse can take a minute

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    const apiKey = process.env.CLOUDCONVERT_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        error: 'CLOUDCONVERT_NOT_CONFIGURED',
        message: 'CloudConvert fallback requires CLOUDCONVERT_API_KEY',
      }, { status: 503 });
    }

    const body = await req.json();
    const { jobId, filename, briefId, slaHours } = body;
    if (!jobId || !filename) {
      return NextResponse.json({ error: 'BAD_REQUEST', message: 'jobId and filename required' }, { status: 400 });
    }

    const CloudConvert = (await import('cloudconvert')).default;
    const cc = new CloudConvert(apiKey);

    // Wait for the job to finish (SDK polls internally)
    const job = await cc.jobs.wait(jobId);
    const exportTask = job.tasks.find((t: any) => t.name === 'export-result' && t.status === 'finished');
    if (!exportTask) {
      const failed = job.tasks.find((t: any) => t.status === 'error');
      throw new Error(`CloudConvert job failed: ${failed?.message ?? 'unknown error'}`);
    }
    const fileEntry = exportTask.result?.files?.[0];
    if (!fileEntry?.url) throw new Error('CloudConvert returned no file URL');

    // Download the (compressed) file from CC and hand to our normal pipeline
    const dlRes = await fetch(fileEntry.url);
    if (!dlRes.ok) throw new Error(`Download from CloudConvert failed: HTTP ${dlRes.status}`);
    const buffer = Buffer.from(await dlRes.arrayBuffer());

    logger.info('upload-via-cc:download_complete', {
      filename, jobId,
      bytes: buffer.length,
      ms: Date.now() - t0,
    });

    const summary = await handleUpload(
      buffer, filename,
      typeof briefId === 'string' && briefId.trim() ? briefId.trim() : null,
      session.userId,
      slaHours ? parseInt(String(slaHours), 10) : null,
    );

    return NextResponse.json({
      uploadId: summary.uploadId,
      sheets:   summary.sheets,
      rawText:  summary.rawText ?? null,
      deduplicated:       summary.deduplicated       ?? false,
      existingAnalysisId: summary.existingAnalysisId ?? null,
      mapper:             summary.mapper             ?? null,
      via:                'cloudconvert-fallback',
    });
  } catch (err: any) {
    logger.error('upload-via-cc:finish_failed', { error: err.message, ms: Date.now() - t0 });
    return NextResponse.json({ error: 'FINISH_FAILED', message: err.message }, { status: 500 });
  }
}
