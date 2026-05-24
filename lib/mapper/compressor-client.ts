/**
 * lib/mapper/compressor-client.ts
 *
 * BROWSER-SAFE compressor. Same strategies as lib/mapper/compressor.ts
 * (PDF via pdf-lib, PPTX/XLSX via JSZip, CSV via string normalisation)
 * but runs in the browser BEFORE the file is uploaded — turning a 25 MB
 * PDF into ~8 MB before it streams to Vercel Blob.
 *
 * Notes
 *   • Images are skipped here — sharp can't run in the browser. The
 *     server-side image agent handles those after upload.
 *   • Server-side mapper-qa + senior-audit STILL run on the compressed
 *     output, so if the browser somehow corrupted the file the council
 *     catches it and falls back to the original (re-uploaded server-side
 *     compression path is not available — the file the browser sent IS
 *     what we have).
 *   • Both pdf-lib and JSZip are dynamic-imported so users who never
 *     upload a large file don't pay the bundle cost.
 */

export interface ClientCompressResult {
  /** The (possibly compressed) File ready to upload. Same name + type as input. */
  file: File;
  originalBytes:    number;
  compressedBytes:  number;
  ratio:            number;       // compressed / original (1.0 = no change)
  strategy:         string;       // human-readable summary
  /** True iff we actually reduced the file. False = passed through unchanged. */
  reduced:          boolean;
}

function detectKind(filename: string): 'pdf' | 'pptx' | 'xlsx' | 'csv' | 'image' | 'other' {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf'))                       return 'pdf';
  if (lower.endsWith('.pptx'))                      return 'pptx';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'xlsx';
  if (lower.endsWith('.csv'))                       return 'csv';
  if (/\.(png|jpe?g|webp|gif)$/.test(lower))        return 'image';
  return 'other';
}

/** Skip client-side compression below this threshold — savings aren't worth
 *  the CPU spike on the user's machine. Server-side audit still runs. */
const MIN_BYTES_TO_COMPRESS = 4 * 1024 * 1024; // 4 MB

function noChange(file: File, reason: string): ClientCompressResult {
  return {
    file,
    originalBytes:   file.size,
    compressedBytes: file.size,
    ratio:           1,
    strategy:        reason,
    reduced:         false,
  };
}

export async function compressClientSide(file: File): Promise<ClientCompressResult> {
  // Below the threshold, the round-trip cost beats the saving
  if (file.size < MIN_BYTES_TO_COMPRESS) {
    return noChange(file, 'skip:below-threshold');
  }

  const kind = detectKind(file.name);
  try {
    const buf = new Uint8Array(await file.arrayBuffer());

    let out: Uint8Array | null = null;
    let strategy = 'skip:no-strategy';

    if (kind === 'pdf') {
      const { PDFDocument } = await import('pdf-lib');
      try {
        const doc = await PDFDocument.load(buf, { updateMetadata: false });
        doc.setProducer('');
        doc.setCreator('');
        out = await doc.save({ useObjectStreams: true, addDefaultPage: false, objectsPerTick: 200 });
        strategy = 'pdf-lib:object-streams+restream';
      } catch (err: any) {
        return noChange(file, `pdf-skip:${err.message}`);
      }
    } else if (kind === 'pptx' || kind === 'xlsx') {
      const JSZip = (await import('jszip')).default;
      try {
        const zip = await JSZip.loadAsync(buf);
        // Strip thumbnail / printer settings (lossless)
        if (zip.files['docProps/thumbnail.jpeg']) zip.remove('docProps/thumbnail.jpeg');
        for (const path of Object.keys(zip.files)) {
          if (/^xl\/printerSettings\//.test(path)) zip.remove(path);
        }
        out = new Uint8Array(await zip.generateAsync({
          type: 'uint8array',
          compression: 'DEFLATE',
          compressionOptions: { level: 9 },
        }));
        strategy = `${kind}-jszip:max-deflate`;
      } catch (err: any) {
        return noChange(file, `${kind}-skip:${err.message}`);
      }
    } else if (kind === 'csv') {
      let text = new TextDecoder('utf-8').decode(buf);
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      text = text.split('\n').map(l => l.replace(/[ \t]+$/, '')).join('\n').replace(/\n+$/, '\n');
      out = new TextEncoder().encode(text);
      strategy = 'csv:bom+newline+trim';
    } else {
      return noChange(file, `skip:${kind}-handled-server-side`);
    }

    if (!out || out.length >= buf.length) {
      return noChange(file, `${strategy}:no-saving`);
    }

    // Wrap in a new File preserving name + MIME
    // BlobPart accepts Uint8Array; create File so the upload picks up the original name.
    const compressedFile = new File([out as BlobPart], file.name, {
      type: file.type, lastModified: file.lastModified,
    });

    return {
      file:            compressedFile,
      originalBytes:   buf.length,
      compressedBytes: out.length,
      ratio:           out.length / buf.length,
      strategy,
      reduced:         true,
    };
  } catch (err: any) {
    // Never block an upload — fall back to original on any failure
    return noChange(file, `error:${err.message}`);
  }
}
