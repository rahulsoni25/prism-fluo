'use client';
import { useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { UploadCloud, AlertTriangle, CheckCircle, Loader2, X } from 'lucide-react';
import BriefSelectModal from '@/components/BriefSelectModal';
import SlaSelectModal from '@/components/SlaSelectModal';
import {
  inferSchema, autoGenerateLayout, detectAnomalies, generateStrategicBrief,
} from '@/lib/inference';
import { insightsToCharts as buildInsightsToCharts } from '@/lib/charts/build-gemini-chart-data';
import type { ChartSpec } from '@/types/inference';
import type { SheetMeta } from '@/types/dataset';

// ─── Chart data builders (unchanged) ────────────────────────
function buildStandardData(chart: ChartSpec, data: any[]) {
  const groups: Record<string, number> = {};
  data.forEach(row => {
    const label = String(row[chart.xCol!] ?? 'Other').trim();
    if (!label || label === 'undefined' || label === 'null') return;
    groups[label] = (groups[label] ?? 0) + (parseFloat(row[chart.yCol!]) || 0);
  });
  const entries = Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, chart.type === 'pie' ? 6 : 12);
  return {
    labels: entries.map(e => e[0]),
    datasets: [{
      label: chart.yCol ?? '',
      data: entries.map(e => e[1]),
      backgroundColor: chart.type === 'pie'
        ? ['#2563EB','#7C3AED','#059669','#D97706','#DC2626','#0891B2']
        : 'rgba(37, 99, 235, 0.85)',
      borderColor: (chart.type === 'line' || chart.type === 'area') ? 'rgba(37,99,235,1)' : undefined,
      borderRadius: 6,
      fill: chart.type === 'area',
    }],
  };
}
function buildCrossData(chart: ChartSpec) {
  const entries = (chart._crossData ?? []).slice(0, 12);
  return { labels: entries.map(e => e[0]), datasets: [{ label: chart.yCol ?? '', data: entries.map(e => e[1]), backgroundColor: 'rgba(124,58,237,0.85)', borderRadius: 4 }] };
}
function buildScatterData(chart: ChartSpec, data: any[]) {
  const points = data.map(row => ({ x: parseFloat(row[chart.xCol!]) || 0, y: parseFloat(row[chart.yCol!]) || 0 })).filter(p => !isNaN(p.x) && !isNaN(p.y)).slice(0, 200);
  return { datasets: [{ label: `${chart.xCol} vs ${chart.yCol}`, data: points, backgroundColor: 'rgba(37,99,235,0.6)', pointRadius: 4 }] };
}
function buildBubbleData(chart: ChartSpec, data: any[]) {
  const zVals = data.map(r => parseFloat(r[chart.zCol!]) || 0).filter(v => !isNaN(v));
  const zMax  = Math.max(...zVals, 1);
  const points = data.map(row => ({ x: parseFloat(row[chart.xCol!]) || 0, y: parseFloat(row[chart.yCol!]) || 0, r: Math.max(3, ((parseFloat(row[chart.zCol!]) || 0) / zMax) * 20) })).filter(p => !isNaN(p.x) && !isNaN(p.y)).slice(0, 50);
  return { datasets: [{ label: `${chart.xCol}/${chart.yCol}/${chart.zCol}`, data: points, backgroundColor: 'rgba(37,99,235,0.5)' }] };
}
function buildRadarData(chart: ChartSpec, data: any[]) {
  const yCols = chart.yCols ?? [];
  const groups: Record<string, { sums: number[]; count: number }> = {};
  data.forEach(row => {
    const k = String(row[chart.xCol!] ?? '').trim();
    if (!k) return;
    if (!groups[k]) groups[k] = { sums: yCols.map(() => 0), count: 0 };
    groups[k].count++;
    yCols.forEach((col, i) => { groups[k].sums[i] += parseFloat(row[col]) || 0; });
  });
  const labels = Object.keys(groups).slice(0, 6);
  const COLORS = ['rgba(37,99,235,0.7)','rgba(124,58,237,0.7)','rgba(5,150,105,0.7)','rgba(217,119,6,0.7)','rgba(220,38,38,0.7)','rgba(8,145,178,0.7)'];
  return { labels: yCols, datasets: labels.map((grp, i) => ({ label: grp, data: groups[grp].sums.map((s, j) => groups[grp].count > 0 ? s / groups[grp].count : 0), backgroundColor: COLORS[i % COLORS.length].replace('0.7','0.15'), borderColor: COLORS[i % COLORS.length], pointBackgroundColor: COLORS[i % COLORS.length] })) };
}
function buildChartData(chart: ChartSpec, data: any[]) {
  if (chart.id === 'cross_cat' && chart._crossData) return buildCrossData(chart);
  switch (chart.type) {
    case 'scatter': return buildScatterData(chart, data);
    case 'bubble':  return buildBubbleData(chart, data);
    case 'radar':   return buildRadarData(chart, data);
    default:        return buildStandardData(chart, data);
  }
}

// ─── Gemini chart data builder ───────────────────────────────
// Authoritative implementation lives in `lib/charts/build-gemini-chart-data.ts`
// so the /api/analyses/[id]/regenerate endpoint produces identical charts to
// fresh uploads. Local wrapper preserves the existing call signature.
function insightsToCharts(insights: any[], entryIdx: number): ChartSpec[] {
  return buildInsightsToCharts(insights, entryIdx) as ChartSpec[];
}

// ─── Types ───────────────────────────────────────────────────
interface FileEntry {
  file: File;
  status: 'pending' | 'uploading' | 'analyzing' | 'done' | 'error';
  error?: string;
  chartsFound: number;
}

// ─── PRISM bucket colours ─────────────────────────────────────
const BUCKET_COLORS: Record<string, string> = {
  content:       '#2563EB',
  commerce:      '#059669',
  communication: '#7C3AED',
  culture:       '#D97706',
};
const BUCKET_LABELS: Record<string, string> = {
  content:       '📝 Content',
  commerce:      '🛒 Commerce',
  communication: '📢 Communication',
  culture:       '🌍 Culture',
};

// ─── Main page ────────────────────────────────────────────────
function UploadDataInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  // When the upload page is opened from a specific brief
  // (/upload?briefId=<id>), every uploaded file is attached to that brief
  // and the brief auto-transitions waiting_for_data → processing → ready.
  const urlBriefId   = searchParams.get('briefId');
  // DEV TOGGLE: append ?v2=1 to use the v2 hero/foil pre-compute pipeline locally
  const useV2Pipeline = searchParams.get('v2') === '1';

  // ── Brief & SLA Selection States ──
  const [selectedBrief, setSelectedBrief] = useState<any>(null);
  const [showBriefModal, setShowBriefModal] = useState(!urlBriefId);
  const [showSlaModal, setShowSlaModal] = useState(false);
  const [selectedSlaHours, setSelectedSlaHours] = useState<number | null>(null);

  // ── Upload States ──
  const [fileEntries, setFileEntries]   = useState<FileEntry[]>([]);
  const [processing,  setProcessing]    = useState(false);
  const [agentLog,    setAgentLog]      = useState<string[]>([]);
  const [errorMsg,    setErrorMsg]      = useState<string | null>(null);
  const [bucketPreview, setBucketPreview] = useState<Record<string, number>>({});

  // ── Accumulated results across multiple upload batches ──
  const [accumulatedCharts, setAccumulatedCharts] = useState<ChartSpec[]>([]);
  const [firstUploadId,     setFirstUploadId]     = useState<string>('');
  const [allFileNames,      setAllFileNames]       = useState<string[]>([]);
  const [batchDone,         setBatchDone]          = useState(false);
  // Main Headline + Audience Snapshot from the first file's GWI analysis.
  // Only one overview per analysis run (the first one with content wins).
  const [analysisOverview, setAnalysisOverview] = useState<{ headline: string; audienceSnapshot: string } | null>(null);

  // ── Data Mapper: sheet selection state ──
  const [mapperPending, setMapperPending] = useState<{
    file: File; sheets: SheetMeta[]; uploadId: string;
  } | null>(null);
  const sheetPickerResolveRef = useRef<((sheet: SheetMeta) => void) | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const addLog = (msg: string) => setAgentLog(prev => [...prev, msg]);

  // Use URL briefId if provided, otherwise use selected brief
  const briefId = urlBriefId || selectedBrief?.id || null;

  // ── Brief Selection Handler ──
  const handleBriefSelect = (brief: any) => {
    setSelectedBrief(brief);
    setShowBriefModal(false);
    addLog(`✅ Selected brief: ${brief.brand}`);
  };

  // ── SLA Selection Handler ──
  const handleSlaSelect = ({ slaHours }: { slaHours: number }) => {
    setSelectedSlaHours(slaHours);
    setShowSlaModal(false);
    addLog(`✅ Selected SLA: ${slaHours} hours`);

    // If there's a pending analysis, redirect to it
    const pendingId = (window as any).__pendingAnalysisId;
    if (pendingId) {
      delete (window as any).__pendingAnalysisId;
      addLog(`🚀 Redirecting to Intelligence Report…`);
      router.push(`/insights?id=${pendingId}&sla=${slaHours}`);
    }
  };

  // ── Data Mapper: user picked a sheet ──
  const handleSheetPick = (sheet: SheetMeta) => {
    setMapperPending(null);
    sheetPickerResolveRef.current?.(sheet);
    sheetPickerResolveRef.current = null;
  };

  const updateEntry = (idx: number, patch: Partial<FileEntry>) =>
    setFileEntries(prev => prev.map((e, i) => i === idx ? { ...e, ...patch } : e));

  // ── Upload + analyse one file → return { charts, uploadId } ─
  // ── PPTX image stripper ─────────────────────────────────────────────
  // PPTX is a ZIP. 80-90% of an agency deck is images embedded under
  // ppt/media/. The structured parser only reads slide XML — images
  // are dead weight on upload. Stripping them client-side typically
  // takes 10 MB → ~1 MB, which uploads in ~1 s instead of 10 s+ AND
  // fits in the multipart path so we never hit Vercel's 4.5 MB function-
  // body cap on production OR the @vercel/blob/client coordination
  // endpoint that ad-blockers love to block.
  async function stripPptxBloat(file: File): Promise<File> {
    if (!file.name.toLowerCase().endsWith('.pptx')) return file;
    try {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(file);
      // Delete everything that isn't slide structure. Keep slides,
      // slideLayouts, slideMasters, notesSlides, theme, _rels, the
      // presentation root, and [Content_Types].xml — that's all the
      // parser touches.
      const toRemove: string[] = [];
      zip.forEach((path) => {
        if (
          path.startsWith('ppt/media/') ||
          path.startsWith('ppt/embeddings/') ||
          path.startsWith('ppt/audio/') ||
          path.startsWith('ppt/video/') ||
          path.startsWith('ppt/fonts/')
        ) {
          toRemove.push(path);
        }
      });
      if (toRemove.length === 0) return file; // already lean
      for (const p of toRemove) zip.remove(p);
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const stripped = new File([blob], file.name, {
        type: file.type || 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });
      const beforeMB = (file.size     / 1024 / 1024).toFixed(1);
      const afterMB  = (stripped.size / 1024 / 1024).toFixed(1);
      addLog(`📦 Stripped ${toRemove.length} embedded media files from "${file.name}" — ${beforeMB} MB → ${afterMB} MB (parser only needs slide XML)`);
      return stripped;
    } catch (err: any) {
      // If anything goes wrong, fall through with the original file —
      // never block the upload on this optimization.
      addLog(`⚠ Could not strip media from "${file.name}" (${err.message}) — uploading full file`);
      return file;
    }
  }

  async function processFile(entry: FileEntry, entryIdx: number): Promise<{ charts: ChartSpec[]; uploadId: string; overview?: { headline: string; audienceSnapshot: string } }> {
    let { file } = entry;
    updateEntry(entryIdx, { status: 'uploading' });
    addLog(`📤 Uploading "${file.name}"…`);

    // Strip embedded media from PPTX BEFORE measuring size — the upload
    // path-selection below depends on the post-strip size.
    if (file.name.toLowerCase().endsWith('.pptx')) {
      file = await stripPptxBloat(file);
    }

    // ── Upload strategy ────────────────────────────────────────────
    // Files ≤ 4 MB go via legacy multipart — fewer round trips, no
    // dependency on a Vercel Blob store. Files > 4 MB exceed Vercel's
    // serverless body-size cap (~4.5 MB) on production, so we PUT them
    // directly to Vercel Blob via a signed URL, then POST just the
    // resulting URL to /api/upload as JSON.
    //
    // EXCEPTION: on localhost dev, always use multipart regardless of
    // size. Two reasons:
    //   1. The Next.js dev server has no 4 MB cap — multipart works for
    //      any reasonable file size.
    //   2. The @vercel/blob/client SDK coordinates through vercel.com/api/blob,
    //      which is commonly blocked by ad-blockers / privacy extensions
    //      (uBlock Origin, Brave Shields, Pi-hole). Those blocks make the
    //      Blob upload silently fail with status 0 / 5s timeouts. Sticking
    //      to multipart on localhost sidesteps the whole chain.
    // ⚠️ NOTE for prod: end users on Vercel who have aggressive blockers
    // will still hit this issue for files > 4 MB. If that becomes a
    // support burden, swap @vercel/blob for a direct S3/R2 client or proxy
    // the upload server-side.
    const MULTIPART_MAX_MB = 4;
    const sizeMB     = file.size / 1024 / 1024;
    const isLocalDev = typeof window !== 'undefined'
      && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const useMultipart = isLocalDev || sizeMB <= MULTIPART_MAX_MB;
    let upRes: Response;
    if (useMultipart) {
      // On localhost or files ≤ 4 MB. For files > 4 MB on localhost, send as
      // raw binary instead of FormData — Next.js dev's `req.formData()` chokes
      // on multipart bodies above ~4 MB ("Failed to parse body as FormData.").
      // The raw-binary path (Path C in /api/upload) reads `req.arrayBuffer()`
      // which doesn't need multipart envelope parsing.
      if (isLocalDev && sizeMB > MULTIPART_MAX_MB) {
        upRes = await fetch('/api/upload', {
          method:  'POST',
          body:    file,
          headers: {
            'Content-Type':    'application/octet-stream',
            'X-Upload-Mode':   'raw',
            'X-Filename':      encodeURIComponent(file.name),
            ...(briefId         ? { 'X-Brief-Id':  briefId             } : {}),
            ...(selectedSlaHours ? { 'X-Sla-Hours': String(selectedSlaHours) } : {}),
          },
        });
      } else {
        const formData = new FormData();
        formData.append('file', file);
        if (briefId) formData.append('briefId', briefId);
        if (selectedSlaHours) formData.append('slaHours', String(selectedSlaHours));
        upRes = await fetch('/api/upload', { method: 'POST', body: formData });
      }
    } else {
      // Direct-to-blob path (large files).
      addLog(`📦 Streaming "${file.name}" (${sizeMB.toFixed(1)} MB) directly to Blob storage…`);
      // Lazy-import to keep the bundle smaller for users who never hit this path.
      const { upload } = await import('@vercel/blob/client');
      let blob;
      try {
        blob = await upload(file.name, file, {
          access:           'public',
          handleUploadUrl:  '/api/upload/blob-token',
        });
      } catch (err: any) {
        // Surface BLOB_NOT_CONFIGURED with a setup hint, otherwise re-throw.
        const msg = err?.message ?? String(err);
        if (msg.includes('BLOB_NOT_CONFIGURED') || msg.includes('BLOB_READ_WRITE_TOKEN')) {
          throw new Error(
            `Large-file upload is not configured. To enable uploads > 4 MB, create a Vercel Blob store ` +
            `(Storage → Blob → Create in the Vercel Dashboard), then run \`vercel env pull .env.local\` ` +
            `and restart the dev server.`,
          );
        }
        throw new Error(`Direct blob upload failed: ${msg}`);
      }
      upRes = await fetch('/api/upload', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blobUrl:  blob.url,
          filename: file.name,
          briefId:  briefId ?? null,
          slaHours: selectedSlaHours ?? null,
        }),
      });
    }

    // Vercel's platform (nginx) returns "Request Entity Too Large" as plain text
    // for files > 4.5 MB — parse JSON only after checking status to avoid crash.
    // After the direct-to-blob switch this branch only fires when MULTIPART_MAX_MB
    // is bumped too high or the server-side cap (config.MAX_FILE_SIZE_MB) is exceeded.
    if (!upRes.ok) {
      const errText = await upRes.text().catch(() => '');
      if (upRes.status === 413 || errText.toLowerCase().includes('entity too large') || errText.toLowerCase().includes('request en')) {
        throw new Error(
          `"${file.name}" is ${sizeMB.toFixed(1)} MB — exceeds the server's configured upload cap.\n` +
          `Increase MAX_FILE_SIZE_MB in the server env, or split/export to a smaller format.`,
        );
      }
      let errBody: any = {};
      try { errBody = JSON.parse(errText); } catch { /* non-JSON */ }
      throw new Error(errBody.message ?? errText ?? `Upload failed (${upRes.status})`);
    }
    const summary = await upRes.json();

    const { uploadId, sheets, rawText, deduplicated, existingAnalysisId } = summary;
    if (deduplicated) {
      addLog(`♻️ "${file.name}" matches a recent upload — reusing existing parse`);
    }

    // FAST PATH: dedup hit AND we have a pre-existing analysis for this exact
    // content → skip /api/ai/analyze-data + /api/analyses entirely. Burns zero
    // Gemini quota; user lands on the previous insights page instantly.
    // This is the "pre-warm" optimization: once an analysis is generated for
    // a file, every subsequent upload of the same bytes (for 7 days) is free.
    if (deduplicated && existingAnalysisId && typeof window !== 'undefined') {
      addLog(`⚡ Found existing analysis ${existingAnalysisId.slice(0, 8)}… — opening directly (zero Gemini cost)`);
      updateEntry(entryIdx, { status: 'done', chartsFound: 0 });
      // Navigate immediately. The /insights page reads its own cards from the
      // stored analysis so we don't need to pre-populate charts in state.
      window.location.href = `/insights?id=${encodeURIComponent(existingAnalysisId)}`;
      return { charts: [], uploadId };
    }

    // ── Raw text fallback: structured parsing returned 0 rows ──────────
    // ExcelJS couldn't parse this CSV/Excel. Route the raw file content
    // directly to Gemini's text analysis path (same as PDF analysis).
    if (!sheets?.length && rawText) {
      addLog(`⚠ Structured parser found no rows in "${file.name}" — sending raw content to Gemini…`);
      try {
        const aiRes = await fetch('/api/ai/analyze-pdf', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: rawText, filename: file.name }),
        });
        const body = await aiRes.json().catch(() => ({}));
        const insights = (body as any).insights;
        if (aiRes.ok && Array.isArray(insights) && insights.length > 0) {
          addLog(`✨ Gemini generated ${insights.length} PRISM insights from raw content`);
          const charts: ChartSpec[] = insightsToCharts(insights, entryIdx);
          updateEntry(entryIdx, { status: 'done', chartsFound: charts.length });
          addLog(`✅ "${file.name}" → ${charts.length} insights ready`);
          return { charts, uploadId };
        }
        addLog(`⚠ Gemini raw-text analysis returned no insights (${(body as any).error ?? aiRes.status})`);
      } catch (err: any) {
        addLog(`⚡ Gemini raw-text analysis failed: ${err.message}`);
      }
      updateEntry(entryIdx, { status: 'error', chartsFound: 0, error: `Could not extract data from "${file.name}". Check the file has content and try again.` });
      return { charts: [], uploadId };
    }

    if (!sheets?.length) { addLog(`⚠ No data found in "${file.name}"`); return { charts: [], uploadId }; }

    updateEntry(entryIdx, { status: 'analyzing' });

    // ── DATA MAPPER: if multiple sheets exist, pause for user to pick one ──
    let preferredSheet: any;
    if (sheets.length > 1) {
      addLog(`🗂 ${sheets.length} sheets found in "${file.name}" — select one in the DATA MAPPER below…`);
      preferredSheet = await new Promise<any>(resolve => {
        setMapperPending({ file, sheets, uploadId });
        sheetPickerResolveRef.current = resolve;
      });
      addLog(`✅ Sheet "${preferredSheet.sheetName}" selected`);
    } else {
      // Auto-pick: prefer "ALL ROWS" for GWI, else first sheet
      preferredSheet = sheets.find((s: any) => /all\s*rows?/i.test(s.sheetName)) ?? sheets[0];
      addLog(`🔍 Auto-selected "${preferredSheet.sheetName}" from "${file.name}"…`);
    }

    let rawData: any[] = [];
    try {
      const dataRes = await fetch(
        `/api/uploads/${uploadId}/sheets/${encodeURIComponent(preferredSheet.sheetName)}/data`,
      );
      if (!dataRes.ok) {
        const errBody = await dataRes.json().catch(() => ({}));
        throw new Error((errBody as any).message || `HTTP ${dataRes.status}`);
      }
      rawData = await dataRes.json().catch(() => []);
    } catch (err: any) {
      addLog(`⚠ Could not load sheet data: ${err.message}`);
      updateEntry(entryIdx, { status: 'error', chartsFound: 0, error: `Failed to read sheet "${preferredSheet.sheetName}": ${err.message}` });
      return { charts: [], uploadId };
    }

    if (!Array.isArray(rawData) || rawData.length === 0) {
      addLog(`⚠ No data found in "${preferredSheet.sheetName}" — the sheet may be empty or data storage failed`);
      updateEntry(entryIdx, { status: 'error', chartsFound: 0, error: `No rows returned for sheet "${preferredSheet.sheetName}". Check that the file has data and the database is reachable.` });
      return { charts: [], uploadId };
    }
    addLog(`  └─ ${rawData.length} rows loaded`);

    const isPdf = file.name.toLowerCase().endsWith('.pdf');

    // ── PDF BRANCH — send raw text to Gemini free-text analysis ──
    if (isPdf) {
      addLog('📄 PDF detected — extracting text for Gemini analysis…');
      try {
        // rawData rows are { text: "line..." } objects from the PDF parser
        const fullText = rawData
          .map((r: any) => r.text ?? Object.values(r).join(' '))
          .filter(Boolean)
          .join('\n');

        if (fullText.trim().length >= 50) {
          addLog('🤖 Sending PDF text to Gemini 2.5 for PRISM analysis…');
          const aiRes = await fetch('/api/ai/analyze-pdf', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: fullText, filename: file.name }),
          });

          const pdfBody = await aiRes.json().catch(() => ({}));
          const insights = (pdfBody as any).insights;
          if (aiRes.ok && Array.isArray(insights) && insights.length > 0) {
            addLog(`✨ Gemini generated ${insights.length} PRISM insights from PDF`);
            const charts: ChartSpec[] = insightsToCharts(insights, entryIdx);
            updateEntry(entryIdx, { status: 'done', chartsFound: charts.length });
            addLog(`✅ "${file.name}" → ${charts.length} insights ready`);
            return { charts, uploadId };
          }
          addLog(`⚠ Gemini PDF analysis returned no insights (${(pdfBody as any).error ?? aiRes.status})`);
        } else {
          addLog('⚠ Not enough text extracted from PDF to analyse');
        }
      } catch (err: any) {
        addLog(`⚡ Gemini PDF analysis failed (${err.message})`);
      }
      // PDF fallback — no rule engine (it produces garbage on PDF text rows)
      updateEntry(entryIdx, { status: 'error', chartsFound: 0, error: 'Could not extract insights from this PDF. Try uploading an Excel or CSV file instead.' });
      return { charts: [], uploadId };
    }

    // ── Detect GWI-format data (structured survey rows from DB) ──
    // GWI rows have index_score / time_bucket / audience_pct fields.
    // The generic rule engine was built for sales/marketing data and produces
    // nonsense "tailspin" / "Convergence Zone" cards on GWI columns.
    // Block it for GWI data — Gemini 2.5 is the ONLY valid analyser for these.
    const isGwiData = rawData.length > 0 && (
      'index_score' in rawData[0] ||
      'time_bucket' in rawData[0] ||
      ('audience_pct' in rawData[0] && 'universe' in rawData[0])
    );

    // ── TABULAR BRANCH (Excel / CSV) — try Gemini 2.5 first ──────
    const analysisEndpoint = useV2Pipeline ? '/api/ai/analyze-data-v2' : '/api/ai/analyze-data';
    addLog(`🤖 Sending data to Gemini 2.5 for PRISM analysis${useV2Pipeline ? ' (v2 hero/foil pipeline)' : ''}…`);
    let geminiError = '';
    try {
      const aiRes = await fetch(analysisEndpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows:      rawData,
          sheetName: preferredSheet.sheetName,
          fileNames: [file.name],
          briefId:   briefId || null,
          uploadId,                // enables server-side analysis cache
          debug:     useV2Pipeline,
        }),
      });

      if (!aiRes.ok) {
        const errBody = await aiRes.json().catch(() => ({}));
        geminiError = (errBody as any).error ?? `HTTP ${aiRes.status}`;
        addLog(`⚠ Gemini returned ${aiRes.status}: ${geminiError}`);
        if (aiRes.status === 503) addLog('   ↳ GEMINI_API_KEY may not be set on the server');
      } else {
        const body = await aiRes.json();
        const { insights, fallback, overview, geminiErrors } = body as {
          insights?: any[];
          fallback?: 'openrouter' | 'auto' | boolean;
          overview?: { headline: string; audienceSnapshot: string };
          geminiErrors?: string[];
        };
        // (Cache hits short-circuit at the upload layer — frontend never
        //  reaches this branch when (deduplicated && existingAnalysisId).)
        if (fallback === 'openrouter') addLog('⚡ Gemini unavailable — switched to OpenRouter (free LLM models, conviction 82)');
        else if (fallback === 'auto' || fallback === true) addLog('⚡ AI unavailable — using auto-analysis from raw index data (conviction 70)');
        // Surface the actual Gemini error reasons so the user can debug API-key / model / quota issues.
        if (Array.isArray(geminiErrors) && geminiErrors.length > 0) {
          for (const e of geminiErrors) addLog(`   ↳ Gemini ${e}`);
        }
        if (Array.isArray(insights) && insights.length > 0) {
          const source = fallback === 'openrouter' ? 'OpenRouter' : fallback ? 'Auto-analysis' : 'Gemini';
          addLog(`✨ ${source} generated ${insights.length} PRISM insights`);
          if (overview?.headline) addLog(`📝 Main Headline ready`);
          const charts: ChartSpec[] = insightsToCharts(insights, entryIdx);
          updateEntry(entryIdx, { status: 'done', chartsFound: charts.length });
          addLog(`✅ "${file.name}" → ${charts.length} insights ready${fallback ? ` (${source.toLowerCase()})` : ''}`);
          return { charts, uploadId, overview };
        } else {
          geminiError = 'No insights returned';
          addLog(`⚠ ${geminiError}`);
        }
      }
    } catch (err: any) {
      geminiError = err.message;
      addLog(`⚡ Gemini error: ${geminiError}`);
    }

    // ── Rule engine is permanently disabled ─────────────────────
    // Its language ("tailspin", "Volume-Capture mandate", "Capitalise on
    // momentum", "Multiplier: Nx") reads like a stock-market terminal,
    // which is wrong for creative and media professionals — our audience.
    // Gemini 2.5 (now with a generic-tabular path for Amazon/Helium10/etc.)
    // is the ONLY valid analyser. If it failed, we surface the error so it
    // can be fixed — we never silently downgrade the output quality.
    const msg = `All analysis tiers failed (${geminiError || 'no insights returned'}). Gemini 2.5, OpenRouter, and auto-analysis were all attempted. Check that GEMINI_API_KEY and OPENROUTER_API_KEY are set on the server, or verify the file has structured data rows.`;
    addLog(`❌ ${msg}`);
    updateEntry(entryIdx, { status: 'error', chartsFound: 0, error: msg });
    return { charts: [], uploadId };
  }

  // ── Save accumulated charts + redirect (called by "Get Insights" button) ──
  async function saveAndRedirect(charts: ChartSpec[], uploadId: string, fileNames: string[]) {
    setProcessing(true);
    addLog('💾 Saving PRISM Intelligence Report…');

    try {
      const fromGemini = charts.every(c => c.id?.startsWith('gemini_'));
      let finalCharts = charts;
      if (!fromGemini) {
        try {
          addLog('🤖 Enhancing titles with AI…');
          const eRes = await fetch('/api/ai/enhance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              charts: charts.map(c => ({ title: c.title, type: c.type, obs: (c as any).obs })),
              context: `PRISM multi-source analysis — ${fileNames.join(', ')}`,
            }),
          });
          if (eRes.ok) {
            const { titles } = await eRes.json();
            if (Array.isArray(titles) && titles.length === charts.length) {
              finalCharts = charts.map((c, i) => ({ ...c, title: titles[i] || c.title }));
              addLog('✨ AI titles applied.');
            }
          }
        } catch { addLog('⚡ Using auto titles.'); }
      } else {
        addLog('✨ Gemini insights used — skipping enhance step.');
      }

      const combinedName = fileNames.length > 1
        ? `PRISM Combined — ${fileNames.length} sources`
        : fileNames[0]?.replace(/\.[^.]+$/, '') ?? 'PRISM Analysis';

      const domainValue = fileNames.length > 1
        ? 'multi-source'
        : ((finalCharts[0] as any)?.toolLabel ?? 'PRISM ANALYSIS');

      const saveRes = await fetch('/api/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId,
          sheetName: combinedName,
          filename:  fileNames.join(' + '),
          briefId,
          slaHours: selectedSlaHours,
          results: {
            charts:         finalCharts,
            scorecards:     [],
            strategicBrief: null,
            anomalies:      [],
            overview:       analysisOverview ?? null,
            meta: { domain: domainValue, title: combinedName, cls: 'content' },
          },
        }),
      });

      if (saveRes.ok) {
        const { id } = await saveRes.json();
        if (id) {
          if (!selectedSlaHours) {
            setShowSlaModal(true);
            (window as any).__pendingAnalysisId = id;
          } else {
            addLog(`🚀 Redirecting to Intelligence Report…`);
            router.push(`/insights?id=${id}&sla=${selectedSlaHours}`);
          }
          return;
        }
      }
      throw new Error('Save failed — no ID returned');
    } catch (err: any) {
      addLog(`❌ ${err.message}`);
      setErrorMsg(err.message);
    } finally {
      setProcessing(false);
    }
  }

  // ── Process a batch of new files → accumulate results ──
  async function processAll(entries: FileEntry[], existingOffset: number) {
    setProcessing(true);
    setBatchDone(false);
    setErrorMsg(null);

    try {
      const batchCharts: ChartSpec[] = [];
      let batchFirstUploadId = '';

      for (let i = 0; i < entries.length; i++) {
        const { charts, uploadId, overview } = await processFile(entries[i], existingOffset + i);
        if (i === 0) batchFirstUploadId = uploadId;
        batchCharts.push(...charts);
        // Capture the first non-empty overview from this run.
        // Functional setState avoids the stale-closure bug across files in a batch
        // and across multiple batches in the same upload session.
        if (overview?.headline) {
          setAnalysisOverview(prev => prev ?? overview);
        }
      }

      if (batchCharts.length === 0 && entries.length > 0) {
        setErrorMsg('No data could be extracted from the uploaded files. Check that your files are not empty.');
        setProcessing(false);
        return;
      }

      // Accumulate across batches. Side effects (setBucketPreview, addLog)
      // must live OUTSIDE the updater — Strict Mode invokes updaters twice
      // in dev, which would duplicate the log line and re-queue the bucket
      // setState. Compute the merged charts here, then derive preview/log
      // from the result.
      const accumulatedNext = [...accumulatedCharts, ...batchCharts];
      const allBuckets = ['content','commerce','communication','culture','channel','media','creative','pricing','search'];
      const preview: Record<string, number> = Object.fromEntries(allBuckets.map(b => [b, 0]));
      accumulatedNext.forEach(c => { const b = (c as any).bucket || 'content'; if (b in preview) preview[b]++; });
      setAccumulatedCharts(accumulatedNext);
      setBucketPreview(preview);
      const nonEmpty = allBuckets.filter(b => preview[b] > 0).map(b => `${b}: ${preview[b]}`).join(' · ');
      addLog(`📊 PRISM Distribution — ${nonEmpty || 'no insights yet'}`);

      setAllFileNames(prev => [...prev, ...entries.map(e => e.file.name)]);
      if (!firstUploadId && batchFirstUploadId) setFirstUploadId(batchFirstUploadId);

      setBatchDone(true);
      addLog(`✅ ${batchCharts.length} new insights added. Add more files or click "Get Insights".`);

    } catch (err: any) {
      addLog(`❌ ${err.message}`);
      setErrorMsg(err.message);
    } finally {
      setProcessing(false);
    }
  }

  // ── File picker handler — appends to existing entries ─────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (!picked.length) return;

    const valid: FileEntry[] = [];
    const errors: string[]   = [];
    // Sanity cap aligned with /api/upload/blob-token's maximumSizeInBytes
    // and the server-side config.MAX_FILE_SIZE_MB. Files ≤ 4 MB go via
    // legacy multipart; >4 MB go through Vercel Blob (see processFile).
    const HARD_CAP_MB = 50;

    for (const f of picked) {
      const ext    = f.name.split('.').pop()?.toLowerCase() ?? '';
      const sizeMB = f.size / 1024 / 1024;
      if (!['xlsx','xls','csv','pdf','pptx','ppt'].includes(ext)) {
        errors.push(`"${f.name}" — unsupported format (use xlsx, csv, pdf, pptx, or ppt)`);
        continue;
      }
      if (sizeMB > HARD_CAP_MB) {
        errors.push(
          `"${f.name}" is ${sizeMB.toFixed(1)} MB — exceeds the ${HARD_CAP_MB} MB upload cap.\n` +
          `Split the file or contact support if you need to raise this limit.`,
        );
        continue;
      }
      valid.push({ file: f, status: 'pending', chartsFound: 0 });
    }

    if (errors.length) setErrorMsg(errors.join('\n'));
    if (!valid.length) return;

    // Append new files; capture offset BEFORE the setState so the side effect
    // lives OUTSIDE the updater. Updaters run twice under React Strict Mode in
    // dev — putting processAll() inside the updater used to fire each upload
    // twice (visible as duplicated "📤 Uploading…" log lines).
    const offset = fileEntries.length;
    setFileEntries(prev => [...prev, ...valid]);
    // Defer one tick so state has flushed before processing kicks off.
    setTimeout(() => processAll(valid, offset), 0);

    // Reset input so the same files can be re-picked
    e.target.value = '';
  };

  const removeFile = (idx: number) =>
    setFileEntries(prev => prev.filter((_, i) => i !== idx));

  const hasFiles = fileEntries.length > 0;

  // ── Bucket display config ────────────────────────────────────
  const BUCKET_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
    content:       { label:'📝 Content',       color:'#2563EB', bg:'#EFF6FF', border:'#BFDBFE' },
    commerce:      { label:'🛒 Commerce',      color:'#059669', bg:'#ECFDF5', border:'#A7F3D0' },
    communication: { label:'📢 Comms',         color:'#7C3AED', bg:'#F5F3FF', border:'#DDD6FE' },
    culture:       { label:'🌍 Culture',       color:'#D97706', bg:'#FFFBEB', border:'#FDE68A' },
    channel:       { label:'📡 Channel',       color:'#0891B2', bg:'#ECFEFF', border:'#A5F3FC' },
    media:         { label:'🎬 Media',         color:'#EA580C', bg:'#FFF7ED', border:'#FED7AA' },
    creative:      { label:'🎨 Creative',      color:'#C026D3', bg:'#FDF4FF', border:'#E9D5FF' },
    pricing:       { label:'💰 Pricing',       color:'#DC2626', bg:'#FEF2F2', border:'#FECACA' },
    search:        { label:'🔍 Search',        color:'#0D9488', bg:'#F0FDFA', border:'#99F6E4' },
  };

  const FILE_STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
    pending:   { label:'Queued',    color:'#94A3B8', bg:'#F1F5F9' },
    uploading: { label:'Uploading', color:'#2563EB', bg:'#EFF6FF' },
    analyzing: { label:'Analysing', color:'#7C3AED', bg:'#F5F3FF' },
    done:      { label:'Done',      color:'#059669', bg:'#ECFDF5' },
    error:     { label:'Error',     color:'#DC2626', bg:'#FEF2F2' },
  };

  return (
    <div style={{ minHeight:'100vh', background:'#F0F4FF' }}>
      <Navbar />

      {/* Brief Selection Modal */}
      <BriefSelectModal
        isOpen={showBriefModal}
        onSelect={handleBriefSelect}
        onCancel={() => { if (!urlBriefId) setShowBriefModal(false); }}
      />

      {/* SLA Selection Modal */}
      <SlaSelectModal
        isOpen={showSlaModal}
        onSelect={handleSlaSelect}
        onBack={() => setShowSlaModal(false)}
        briefName={selectedBrief?.brand || 'Your Brief'}
      />

      {/* Hero bar */}
      <div style={{
        background:'linear-gradient(135deg,#0F172A 0%,#1E1B4B 60%,#1E3A8A 100%)',
        padding:'36px 24px 32px',
      }}>
        <div style={{ maxWidth:760, margin:'0 auto' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
            <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.14em',
              color:'#818CF8', margin:0 }}>DATA MAPPER</p>
            {useV2Pipeline && (
              <span style={{ fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'.1em',
                padding:'2px 8px', borderRadius:6, background:'#134e4a', color:'#34d399',
                border:'1px solid #065f46' }}>
                v2 · hero/foil pipeline
              </span>
            )}
          </div>
          <h1 style={{ fontSize:30, fontWeight:900, color:'#fff', letterSpacing:'-.5px', marginBottom:10, lineHeight:1.2 }}>
            PRISM Intelligence Hub
          </h1>
          {selectedBrief ? (
            <div style={{ display:'inline-flex', alignItems:'center', gap:8,
              padding:'6px 14px', borderRadius:20, background:'rgba(99,102,241,.18)',
              border:'1px solid rgba(99,102,241,.35)' }}>
              <span style={{ fontSize:14 }}>📌</span>
              <span style={{ fontSize:13, fontWeight:700, color:'#C7D2FE' }}>{selectedBrief.brand}</span>
              {!urlBriefId && (
                <button onClick={() => setShowBriefModal(true)} style={{
                  marginLeft:4, fontSize:11, color:'#818CF8', fontWeight:600,
                  background:'none', border:'none', cursor:'pointer', padding:0,
                }}>Change</button>
              )}
            </div>
          ) : (
            <p style={{ fontSize:14, color:'rgba(255,255,255,.55)', lineHeight:1.6, maxWidth:520 }}>
              Upload research files — PRISM AI extracts insights across{' '}
              <span style={{ color:'#93C5FD' }}>Content · Commerce · Communication · Culture</span>
            </p>
          )}
        </div>
      </div>

      <main style={{ maxWidth:760, margin:'0 auto', padding:'32px 24px' }}>

        {/* Error banner */}
        {errorMsg && (
          <div style={{ marginBottom:20, padding:'14px 16px', borderRadius:14,
            background:'#FEF2F2', border:'1.5px solid #FCA5A5',
            display:'flex', alignItems:'flex-start', gap:10 }}>
            <AlertTriangle size={16} style={{ color:'#DC2626', flexShrink:0, marginTop:1 }} />
            <pre style={{ flex:1, fontSize:12, color:'#991B1B', whiteSpace:'pre-wrap', margin:0, fontFamily:'inherit' }}>{errorMsg}</pre>
            <button onClick={() => setErrorMsg(null)} style={{ color:'#FCA5A5', background:'none', border:'none', cursor:'pointer', padding:0 }}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* ── Step 1: Select brief prompt ── */}
        {!selectedBrief && !urlBriefId && (
          <div style={{
            borderRadius:24, border:'2px dashed #C7D2FE',
            background:'linear-gradient(135deg,#EFF6FF,#F5F3FF)',
            padding:'56px 40px', textAlign:'center',
          }}>
            <div style={{ width:72, height:72, borderRadius:20, margin:'0 auto 20px',
              background:'linear-gradient(135deg,#2563EB,#7C3AED)',
              display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow:'0 12px 32px rgba(99,102,241,.35)' }}>
              <UploadCloud size={32} color="#fff" />
            </div>
            <h2 style={{ fontSize:22, fontWeight:900, color:'#0F172A', marginBottom:8, letterSpacing:'-.3px' }}>
              Select a brief to begin
            </h2>
            <p style={{ color:'#64748B', fontSize:14, marginBottom:28, lineHeight:1.6 }}>
              Link this upload to a campaign brief before mapping your data
            </p>
            <button onClick={() => setShowBriefModal(true)} style={{
              padding:'13px 32px', borderRadius:12, border:'none', cursor:'pointer',
              background:'linear-gradient(135deg,#2563EB,#7C3AED)',
              color:'#fff', fontSize:14, fontWeight:800,
              boxShadow:'0 8px 24px rgba(37,99,235,.35)',
            }}>
              Select Brief →
            </button>
          </div>
        )}

        {/* ── Step 2: Drop zone ── */}
        {(selectedBrief || urlBriefId) && !hasFiles && (
          <div
            onClick={() => !processing && fileInputRef.current?.click()}
            style={{
              borderRadius:24, border:'2px dashed #C7D2FE',
              background:'#fff', padding:'64px 40px', textAlign:'center',
              cursor: processing ? 'not-allowed' : 'pointer',
              transition:'all .2s',
            }}
            onMouseEnter={e => {
              if (!processing) {
                (e.currentTarget as HTMLDivElement).style.borderColor = '#6366F1';
                (e.currentTarget as HTMLDivElement).style.background  = '#F8FAFF';
              }
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLDivElement).style.borderColor = '#C7D2FE';
              (e.currentTarget as HTMLDivElement).style.background  = '#fff';
            }}
          >
            <div style={{ width:76, height:76, borderRadius:20, margin:'0 auto 20px',
              background:'linear-gradient(135deg,#6366F1,#7C3AED)',
              display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow:'0 12px 32px rgba(99,102,241,.3)' }}>
              <UploadCloud size={34} color="#fff" />
            </div>
            <p style={{ fontSize:18, fontWeight:800, color:'#0F172A', marginBottom:8, letterSpacing:'-.2px' }}>
              Drop files here or click to browse
            </p>
            <p style={{ fontSize:13, color:'#64748B', marginBottom:6 }}>
              Excel · CSV · PDF · PPTX &nbsp;·&nbsp; Multiple files supported &nbsp;·&nbsp; Up to 50 MB per file
            </p>
            <p style={{ fontSize:12, color:'#94A3B8' }}>
              GWI · Google Keywords · Helium10 · Google Trends · Konnect Insights
            </p>
            {/* Format chips */}
            <div style={{ display:'flex', gap:8, justifyContent:'center', marginTop:20 }}>
              {['.xlsx','.xls','.csv','.pdf','.pptx','.ppt'].map(ext => (
                <span key={ext} style={{ padding:'4px 10px', borderRadius:8,
                  background:'#F1F5F9', color:'#475569', fontSize:11, fontWeight:700 }}>{ext}</span>
              ))}
            </div>
            <input ref={fileInputRef} type="file" multiple className="hidden"
              accept=".xlsx,.xls,.csv,.pdf,.pptx,.ppt" onChange={handleFileChange} />
          </div>
        )}

        {/* ── File list ── */}
        {hasFiles && (
          <div style={{ marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <p style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'.12em', color:'#475569' }}>
                Files ({fileEntries.length})
                {accumulatedCharts.length > 0 && (
                  <span style={{ marginLeft:10, color:'#059669', fontWeight:700 }}>
                    · {accumulatedCharts.length} insights ready
                  </span>
                )}
              </p>
              {!processing && (
                <button onClick={() => {
                  setFileEntries([]); setAgentLog([]); setBucketPreview({});
                  setAccumulatedCharts([]); setFirstUploadId(''); setAllFileNames([]); setBatchDone(false);
                }}
                  style={{ fontSize:12, color:'#94A3B8', background:'none', border:'none', cursor:'pointer',
                    fontWeight:600, fontFamily:'inherit' }}>
                  Clear all
                </button>
              )}
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {fileEntries.map((e, i) => {
                const cfg = FILE_STATUS_CFG[e.status] || FILE_STATUS_CFG.pending;
                return (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:12,
                    background:'#fff', borderRadius:16, padding:'12px 16px',
                    border:'1.5px solid #F1F5F9',
                    boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
                    <div style={{ width:36, height:36, borderRadius:10, flexShrink:0,
                      background: e.file.name.endsWith('.pdf') ? '#FEF2F2' : '#EFF6FF',
                      display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>
                      {e.file.name.endsWith('.pdf') ? '📄' : '📊'}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:13, fontWeight:700, color:'#0F172A',
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:2 }}>
                        {e.file.name}
                      </p>
                      <p style={{ fontSize:11, color:'#94A3B8' }}>
                        {(e.file.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:7, flexShrink:0 }}>
                      {(e.status === 'uploading' || e.status === 'analyzing') && (
                        <Loader2 size={13} style={{ color: cfg.color, animation:'upspin .7s linear infinite' }} />
                      )}
                      {e.status === 'done' && <CheckCircle size={13} style={{ color:'#059669' }} />}
                      <span style={{ fontSize:11, fontWeight:700,
                        color: cfg.color, background: cfg.bg, padding:'3px 9px', borderRadius:20 }}>
                        {e.status === 'done' ? `${e.chartsFound} insights` : cfg.label}
                      </span>
                    </div>
                    {!processing && e.status !== 'done' && (
                      <button onClick={() => removeFile(i)} style={{
                        color:'#CBD5E1', background:'none', border:'none', cursor:'pointer', padding:0, flexShrink:0,
                      }}>
                        <X size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Add More + Get Insights row ── */}
            {!processing && (
              <div style={{ display:'flex', gap:10, marginTop:12 }}>
                {/* Add More */}
                <button onClick={() => fileInputRef.current?.click()} style={{
                  flex:1, padding:'13px 0', borderRadius:14,
                  border:'2px dashed #C7D2FE', background:'#fff',
                  fontSize:13, fontWeight:700, color:'#6366F1', cursor:'pointer',
                  fontFamily:'inherit', transition:'all .15s',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:7,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor='#6366F1'; (e.currentTarget as HTMLButtonElement).style.background='#EEF2FF'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor='#C7D2FE'; (e.currentTarget as HTMLButtonElement).style.background='#fff'; }}>
                  <span style={{ fontSize:16 }}>+</span> Add More
                </button>

                {/* Get Insights — only shown when there are accumulated charts */}
                {accumulatedCharts.length > 0 && (
                  <button
                    onClick={() => saveAndRedirect(accumulatedCharts, firstUploadId, allFileNames)}
                    style={{
                      flex:2, padding:'13px 24px', borderRadius:14, border:'none', cursor:'pointer',
                      background:'linear-gradient(135deg,#2563EB,#7C3AED)',
                      color:'#fff', fontSize:14, fontWeight:800,
                      fontFamily:'inherit', transition:'all .15s',
                      display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                      boxShadow:'0 6px 20px rgba(99,102,241,.4)',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform='translateY(-1px)'; (e.currentTarget as HTMLButtonElement).style.boxShadow='0 10px 28px rgba(99,102,241,.5)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform=''; (e.currentTarget as HTMLButtonElement).style.boxShadow='0 6px 20px rgba(99,102,241,.4)'; }}>
                    ⚡ Get Insights ({accumulatedCharts.length} cards)
                  </button>
                )}
              </div>
            )}

            <input ref={fileInputRef} type="file" multiple className="hidden"
              accept=".xlsx,.xls,.csv,.pdf,.pptx,.ppt" onChange={handleFileChange} />
          </div>
        )}

        {/* ── DATA MAPPER: sheet selection panel ── */}
        {mapperPending && (
          <div style={{ marginBottom: 24, borderRadius: 20,
            border: '2px solid #6366F1', background: '#fff',
            overflow: 'hidden', boxShadow: '0 8px 32px rgba(99,102,241,.18)' }}>
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg,#1E1B4B,#1E3A8A)',
              padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10,
                background: 'rgba(99,102,241,.35)', border: '1px solid rgba(165,180,252,.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                🗂
              </div>
              <div>
                <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
                  letterSpacing: '.15em', color: '#818CF8', marginBottom: 3 }}>DATA MAPPER</p>
                <p style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>
                  {mapperPending.sheets.length} sheets detected in{' '}
                  <span style={{ color: '#A5B4FC' }}>{mapperPending.file.name}</span>
                </p>
              </div>
              <p style={{ marginLeft: 'auto', fontSize: 12, color: '#818CF8' }}>
                Pick a sheet to analyse →
              </p>
            </div>
            {/* Sheet cards */}
            <div style={{ padding: '16px 20px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
                {mapperPending.sheets.map((sheet: SheetMeta) => (
                  <button
                    key={sheet.sheetName}
                    onClick={() => handleSheetPick(sheet)}
                    style={{
                      textAlign: 'left', cursor: 'pointer', padding: '14px 16px',
                      borderRadius: 14, border: '1.5px solid #E2E8F0',
                      background: '#F8FAFF', transition: 'all .15s',
                      fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = '#6366F1';
                      (e.currentTarget as HTMLButtonElement).style.background  = '#EEF2FF';
                      (e.currentTarget as HTMLButtonElement).style.transform   = 'translateY(-2px)';
                      (e.currentTarget as HTMLButtonElement).style.boxShadow   = '0 6px 20px rgba(99,102,241,.2)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = '#E2E8F0';
                      (e.currentTarget as HTMLButtonElement).style.background  = '#F8FAFF';
                      (e.currentTarget as HTMLButtonElement).style.transform   = '';
                      (e.currentTarget as HTMLButtonElement).style.boxShadow   = '';
                    }}
                  >
                    <div style={{ fontSize: 20, marginBottom: 8 }}>
                      {sheet.type === 'gwi_time_spent' ? '📊'
                        : sheet.type === 'keyword_plan' ? '🔍' : '📋'}
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 800, color: '#0F172A',
                      marginBottom: 4, lineHeight: 1.3 }}>
                      {sheet.sheetName}
                    </p>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '.1em', color: '#6366F1' }}>
                      {sheet.type.replace(/_/g, ' ')}
                    </p>
                    {sheet.description && (
                      <p style={{ fontSize: 11, color: '#64748B', marginTop: 6, lineHeight: 1.5 }}>
                        {sheet.description}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── PRISM Bucket distribution ── */}
        {Object.keys(bucketPreview).length > 0 && (
          <div style={{ marginBottom:20 }}>
            <p style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'.12em',
              color:'#475569', marginBottom:12 }}>PRISM Distribution</p>
            {(() => {
              const activeBuckets = Object.keys(BUCKET_CFG).filter(b => (bucketPreview[b] ?? 0) > 0);
              const maxCount = Math.max(...activeBuckets.map(b => bucketPreview[b] ?? 0), 1);
              const cols = Math.min(activeBuckets.length, 5);
              return (
                <div style={{ display:'grid', gridTemplateColumns:`repeat(${cols || 4},1fr)`, gap:10 }}>
                  {activeBuckets.map(b => {
                    const cfg = BUCKET_CFG[b];
                    const count = bucketPreview[b] ?? 0;
                    return (
                      <div key={b} style={{ background:cfg.bg, borderRadius:16, padding:'16px 14px',
                        border:`1.5px solid ${cfg.border}`, textAlign:'center' }}>
                        <div style={{ fontSize:22, fontWeight:900, color:cfg.color, marginBottom:4 }}>{count}</div>
                        <div style={{ height:3, background:`${cfg.color}20`, borderRadius:2, marginBottom:6, overflow:'hidden' }}>
                          <div style={{ height:'100%', borderRadius:2, background:cfg.color,
                            width:`${(count/maxCount)*100}%`, transition:'width .5s ease' }} />
                        </div>
                        <div style={{ fontSize:10, fontWeight:700, color:cfg.color }}>{cfg.label}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* ── AI Agent log ── */}
        {agentLog.length > 0 && (
          <div style={{ borderRadius:20, overflow:'hidden',
            boxShadow:'0 16px 48px rgba(0,0,0,.2)', marginBottom:8 }}>
            {/* Terminal header */}
            <div style={{ background:'#0D1117', padding:'12px 18px',
              display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid rgba(255,255,255,.06)' }}>
              {/* Traffic lights */}
              <div style={{ display:'flex', gap:6 }}>
                {['#FF5F57','#FEBC2E','#28C840'].map(c => (
                  <div key={c} style={{ width:10, height:10, borderRadius:'50%', background:c }} />
                ))}
              </div>
              <div style={{ flex:1, display:'flex', alignItems:'center', gap:8, justifyContent:'center' }}>
                {processing ? (
                  <div style={{ width:7, height:7, borderRadius:'50%', background:'#60A5FA',
                    animation:'upblink 1.2s ease-in-out infinite' }} />
                ) : (
                  <CheckCircle size={11} style={{ color:'#34D399' }} />
                )}
                <span style={{ fontSize:10, fontWeight:700, textTransform:'uppercase',
                  letterSpacing:'.14em', color:'#60A5FA' }}>
                  {processing ? 'PRISM AI · Processing…' : 'PRISM AI · Complete'}
                </span>
              </div>
            </div>
            {/* Log body */}
            <div style={{ background:'#0D1117', padding:'16px 18px',
              fontFamily:"'DM Mono','Fira Mono','Courier New',monospace",
              fontSize:12, lineHeight:1.7, maxHeight:200, overflowY:'auto' }}>
              {agentLog.map((log, i) => (
                <div key={i} style={{ display:'flex', gap:12, color:'#CBD5E1' }}>
                  <span style={{ color:'rgba(255,255,255,.2)', userSelect:'none', flexShrink:0 }}>
                    {String(i).padStart(2,'0')}
                  </span>
                  <span style={{ color: log.startsWith('❌') ? '#F87171'
                    : log.startsWith('✅') || log.startsWith('✨') ? '#34D399'
                    : log.startsWith('🤖') ? '#A78BFA'
                    : log.startsWith('⚠') ? '#FBBF24'
                    : '#CBD5E1' }}>
                    {log}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>

      <style>{`
        @keyframes upspin  { to { transform: rotate(360deg) } }
        @keyframes upblink { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.3;transform:scale(.7)} }
      `}</style>
    </div>
  );
}

// useSearchParams must be wrapped in <Suspense> for Next.js App Router.
export default function UploadData() {
  return (
    <Suspense fallback={
      <div className="screen">
        <Navbar />
        <div className="main"><p style={{ padding: 40, color: 'var(--muted)' }}>Loading…</p></div>
      </div>
    }>
      <UploadDataInner />
    </Suspense>
  );
}
