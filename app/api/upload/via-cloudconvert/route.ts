/**
 * /api/upload/via-cloudconvert
 *
 * Fallback upload path for when Vercel Blob is blocked by browser
 * extensions (uBlock, Brave Shields, corporate firewalls all target
 * *.vercel-storage.com). Routes the upload through CloudConvert's
 * domain instead — different host, almost never blocked.
 *
 * Bonus: CC compresses the PDF in-flight via its optimize task, so
 * the round-trip ends up faster than direct-to-blob would have been.
 *
 * Two-phase protocol so the client can upload directly to CC (Vercel's
 * 4.5 MB body limit means we CANNOT stream the file through our server):
 *
 *   POST   /api/upload/via-cloudconvert        → returns { jobId, uploadUrl, uploadForm }
 *   client PUTs the file to uploadUrl (CC's import host)
 *   POST   /api/upload/via-cloudconvert/finish → polls CC, downloads result, runs handleUpload
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/server';
import { logger } from '@/lib/logger';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    const apiKey = process.env.CLOUDCONVERT_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        error: 'CLOUDCONVERT_NOT_CONFIGURED',
        message: 'CloudConvert fallback path requires CLOUDCONVERT_API_KEY env var. Configure it in Vercel.',
      }, { status: 503 });
    }

    const body = await req.json().catch(() => ({}));
    const filename = String(body.filename || 'document.pdf');
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const isPdf = ext === 'pdf';

    // Lazy-load the SDK
    const CloudConvert = (await import('cloudconvert')).default;
    const cc = new CloudConvert(apiKey);

    // For PDFs we run import → optimize → export.
    // For non-PDFs we just import → export (CC as a CDN bypass with no compression).
    const tasks: any = {
      'upload-input': { operation: 'import/upload' },
      'export-result': {
        operation: 'export/url',
        input: isPdf ? 'optimize-pdf' : 'upload-input',
      },
    };
    if (isPdf) {
      tasks['optimize-pdf'] = {
        operation: 'optimize',
        input: 'upload-input',
        input_format: 'pdf',
        engine: 'ghostscript',
        profile: 'web',
        filename,
      };
    }

    const job = await cc.jobs.create({ tag: 'prism-upload-fallback', tasks });
    const uploadTask = job.tasks.find((t: any) => t.name === 'upload-input');
    if (!uploadTask?.result?.form) {
      throw new Error('CloudConvert did not return an upload form');
    }

    return NextResponse.json({
      jobId:        job.id,
      uploadUrl:    uploadTask.result.form.url,
      uploadParams: uploadTask.result.form.parameters,  // multipart form params to include alongside the file
      isPdf,
    });
  } catch (err: any) {
    logger.error('upload-via-cc:init_failed', { error: err.message });
    return NextResponse.json({ error: 'INIT_FAILED', message: err.message }, { status: 500 });
  }
}
