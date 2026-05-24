/**
 * lib/compress/cloudconvert.ts
 *
 * Server-side PDF compression via CloudConvert's optimize task. Uses
 * Ghostscript under the hood but runs in their infrastructure — we
 * don't inherit the AGPL license because we're calling a hosted service,
 * not redistributing the binary.
 *
 * Setup
 *   • Sign up at https://cloudconvert.com (free tier: 25 conversion-
 *     minutes/day, enough for ~25 small compresses)
 *   • Create a sandbox or live API key
 *   • Set CLOUDCONVERT_API_KEY env var on Vercel
 *
 * Privacy
 *   • Files are auto-deleted after 24 hours per CloudConvert's policy
 *   • We pass tag = "prism-compress" so usage is identifiable in
 *     CloudConvert's dashboard
 *   • Free-tier files go through the same infra as paid
 */

/** CloudConvert's optimize-task profile names. */
export type CCProfile = 'web' | 'print' | 'max' | 'archive' | 'mrc';

/** User-facing quality names that we map to CC profiles. */
export type Quality = 'screen' | 'ebook' | 'archive' | 'printer' | 'prepress';

const QUALITY_TO_CC: Record<Quality, CCProfile> = {
  screen:   'max',      // smallest output
  ebook:    'web',      // balanced (default)
  archive:  'archive',  // moderate
  printer:  'print',    // print-quality
  prepress: 'print',    // CC has no "no-compression" profile; print is the closest
};

export interface CompressOpts {
  /** User-facing quality preset. Mapped to a CloudConvert profile internally. */
  quality?: Quality;
  /** Filename for the output (defaults to input filename). */
  filename?: string;
  /** Auto-delete the job after N seconds (0 = use CC default 24h). */
  autoDeleteSec?: number;
}

export interface CompressResult {
  buffer:         Buffer;
  originalBytes:  number;
  compressedBytes: number;
  ratio:          number;
  elapsedMs:      number;
  jobId:          string;
}

export class CloudConvertNotConfiguredError extends Error {
  code = 'CLOUDCONVERT_NOT_CONFIGURED';
  constructor() { super('CLOUDCONVERT_API_KEY env var is not set. Sign up at cloudconvert.com and add the key to Vercel env.'); }
}

export async function compressPdfViaCloudConvert(
  inputBuffer: Buffer,
  opts: CompressOpts = {},
): Promise<CompressResult> {
  const apiKey = process.env.CLOUDCONVERT_API_KEY;
  if (!apiKey) throw new CloudConvertNotConfiguredError();

  const t0 = Date.now();
  // Lazy-import the SDK so cold starts on routes that don't need it are unaffected.
  const CloudConvert = (await import('cloudconvert')).default;
  const cc = new CloudConvert(apiKey);

  const quality = opts.quality ?? 'ebook';
  const filename = opts.filename ?? 'input.pdf';

  // 1. Create job: upload → optimize → export
  let job = await cc.jobs.create({
    tag: 'prism-compress',
    tasks: {
      'upload-input': { operation: 'import/upload' },
      'optimize-pdf': {
        operation: 'optimize',
        input: 'upload-input',
        input_format: 'pdf',
        engine: 'ghostscript',
        profile: QUALITY_TO_CC[quality],
        filename,
      },
      'export-result': {
        operation: 'export/url',
        input: 'optimize-pdf',
      },
    },
  });

  // 2. Upload the input bytes to the URL CloudConvert returned
  const uploadTask = job.tasks.find((t: any) => t.name === 'upload-input');
  if (!uploadTask) throw new Error('CloudConvert did not return an upload task');
  await cc.tasks.upload(uploadTask, inputBuffer, filename);

  // 3. Wait for the job to finish (CC SDK polls internally)
  job = await cc.jobs.wait(job.id);

  // 4. Find the export task and download the result
  const exportTask = job.tasks.find((t: any) => t.name === 'export-result' && t.status === 'finished');
  if (!exportTask) {
    const failed = job.tasks.find((t: any) => t.status === 'error');
    throw new Error(`CloudConvert job failed: ${failed?.message ?? 'unknown error'}`);
  }
  const fileEntry = exportTask.result?.files?.[0];
  if (!fileEntry?.url) throw new Error('CloudConvert export task returned no file URL');

  const dlRes = await fetch(fileEntry.url);
  if (!dlRes.ok) throw new Error(`Failed to download compressed PDF: HTTP ${dlRes.status}`);
  const buffer = Buffer.from(await dlRes.arrayBuffer());

  return {
    buffer,
    originalBytes:   inputBuffer.length,
    compressedBytes: buffer.length,
    ratio:           buffer.length / inputBuffer.length,
    elapsedMs:       Date.now() - t0,
    jobId:           job.id,
  };
}
