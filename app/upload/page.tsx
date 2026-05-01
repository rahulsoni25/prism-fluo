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
import type { ChartSpec } from '@/types/inference';

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
const BUCKET_CHART_COLORS: Record<string, string> = {
  content:       'rgba(37,99,235,0.85)',
  commerce:      'rgba(5,150,105,0.85)',
  communication: 'rgba(124,58,237,0.85)',
  culture:       'rgba(217,119,6,0.85)',
};

const BUCKET_CHART_BORDERS: Record<string, string> = {
  content:       'rgba(30,58,138,1)',
  commerce:      'rgba(6,95,70,1)',
  communication: 'rgba(76,29,149,1)',
  culture:       'rgba(120,53,15,1)',
};

function buildGeminiChartData(
  type:    string,
  labels:  string[],
  values:  number[],
  bucket:  string,
  values2?: number[],
) {
  const bg     = BUCKET_CHART_COLORS[bucket]  || 'rgba(37,99,235,0.85)';
  const border = BUCKET_CHART_BORDERS[bucket] || 'rgba(37,99,235,1)';

  if (type === 'pie') {
    return {
      labels,
      datasets: [{
        data: values,
        backgroundColor: ['#1E3A8A','#4C1D95','#065F46','#78350F','#1D4ED8','#7C3AED','#059669','#D97706'],
        borderWidth: 2, borderColor: '#fff',
      }],
    };
  }

  if (type === 'scatter' && values2 && values2.length === values.length) {
    // X = Audience %, Y = Index multiplier
    return {
      datasets: [{
        label: 'Audience % vs Likelihood',
        data: labels.map((lbl, i) => ({ x: values[i], y: values2[i], label: lbl })),
        backgroundColor: bg,
        pointRadius: 7,
        pointHoverRadius: 9,
      }],
    };
  }

  // bar / hbar
  return {
    labels,
    datasets: [{
      label: 'Audience %',
      data: values,
      backgroundColor: bg,
      borderColor: border,
      borderWidth: 1,
      borderRadius: 3,
    }],
  };
}

// ─── Gemini insight cards → ChartSpec[] ─────────────────────
function insightsToCharts(insights: any[], entryIdx: number): ChartSpec[] {
  return insights.map((ins: any, i: number) => {
    // Strip empty/null labels and match values to remaining labels
    const rawLabels: string[] = Array.isArray(ins.chartLabels) ? ins.chartLabels : [];
    const rawValues: number[] = Array.isArray(ins.chartValues) ? ins.chartValues.map(Number) : [];
    const rawValues2: number[] = Array.isArray(ins.chartValues2) ? ins.chartValues2.map(Number) : [];

    // Only keep positions where label is non-empty AND value is a real number
    const validPairs = rawLabels
      .map((lbl: any, idx: number) => ({
        lbl: String(lbl ?? '').trim(),
        val: rawValues[idx] ?? 0,
        val2: rawValues2[idx] ?? 0,
      }))
      .filter(p => p.lbl.length > 0 && !isNaN(p.val));

    // Require at least 2 data points with at least one non-zero value
    const hasChart = validPairs.length >= 2 && validPairs.some(p => p.val > 0);

    const cleanLabels  = validPairs.map(p => p.lbl);
    const cleanValues  = validPairs.map(p => p.val);
    const cleanValues2 = rawValues2.length > 0 ? validPairs.map(p => p.val2) : undefined;

    return {
      id:         `gemini_${entryIdx}_${i}`,
      type:       ins.type || 'hbar',
      xCol:       'Attributes',
      yCol:       'Audience %',
      title:      ins.title,
      lbl:        ins.toolLabel || 'PRISM',
      source:     ins.toolLabel || 'PRISM',
      conviction: ins.conviction ?? 85,
      obs:        ins.obs  ?? '',
      stat:       ins.stat ?? '',
      rec:        ins.rec  ?? '',
      bucket:     ins.bucket || 'content',
      toolLabel:  ins.toolLabel || 'PRISM',
      computedChartData: hasChart
        ? buildGeminiChartData(ins.type, cleanLabels, cleanValues, ins.bucket, cleanValues2)
        : null,
    };
  });
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

  const updateEntry = (idx: number, patch: Partial<FileEntry>) =>
    setFileEntries(prev => prev.map((e, i) => i === idx ? { ...e, ...patch } : e));

  // ── Upload + analyse one file → return { charts, uploadId } ─
  async function processFile(entry: FileEntry, entryIdx: number): Promise<{ charts: ChartSpec[]; uploadId: string }> {
    const { file } = entry;
    updateEntry(entryIdx, { status: 'uploading' });
    addLog(`📤 Uploading "${file.name}"…`);

    const formData = new FormData();
    formData.append('file', file);
    if (briefId) formData.append('briefId', briefId);
    if (selectedSlaHours) formData.append('slaHours', String(selectedSlaHours));
    const upRes = await fetch('/api/upload', { method: 'POST', body: formData });
    const summary = await upRes.json();
    if (!upRes.ok) throw new Error(summary.message ?? `Upload failed (${upRes.status})`);

    const { uploadId, sheets, rawText } = summary;

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

    // ── Pick the best sheet: prefer "ALL ROWS" for GWI, else first sheet ──
    const preferredSheet =
      sheets.find((s: any) => /all\s*rows?/i.test(s.sheetName)) ?? sheets[0];

    addLog(`🔍 Reading "${preferredSheet.sheetName}" from "${file.name}"…`);

    const dataRes = await fetch(
      `/api/uploads/${uploadId}/sheets/${encodeURIComponent(preferredSheet.sheetName)}/data`,
    );
    const rawData: any[] = await dataRes.json();

    if (!Array.isArray(rawData) || rawData.length === 0) {
      addLog(`⚠ No data in "${preferredSheet.sheetName}"`);
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
    addLog('🤖 Sending data to Gemini 2.5 for PRISM analysis…');
    let geminiError = '';
    try {
      const aiRes = await fetch('/api/ai/analyze-data', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows:      rawData,
          sheetName: preferredSheet.sheetName,
          fileNames: [file.name],
        }),
      });

      if (!aiRes.ok) {
        const errBody = await aiRes.json().catch(() => ({}));
        geminiError = (errBody as any).error ?? `HTTP ${aiRes.status}`;
        addLog(`⚠ Gemini returned ${aiRes.status}: ${geminiError}`);
        if (aiRes.status === 503) addLog('   ↳ GEMINI_API_KEY may not be set on the server');
      } else {
        const { insights } = await aiRes.json();
        if (Array.isArray(insights) && insights.length > 0) {
          addLog(`✨ Gemini generated ${insights.length} PRISM insights`);
          const charts: ChartSpec[] = insightsToCharts(insights, entryIdx);
          updateEntry(entryIdx, { status: 'done', chartsFound: charts.length });
          addLog(`✅ "${file.name}" → ${charts.length} insights ready`);
          return { charts, uploadId };
        } else {
          geminiError = 'Gemini returned 0 insights';
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
    const msg = `Gemini 2.5 analysis failed (${geminiError || 'no insights returned'}). This usually means GEMINI_API_KEY is missing or rate-limited on Railway.`;
    addLog(`❌ ${msg}`);
    updateEntry(entryIdx, { status: 'error', chartsFound: 0, error: msg });
    return { charts: [], uploadId };
  }

  // ── Process all files → merge → Gemini → save → redirect ──
  async function processAll(entries: FileEntry[]) {
    setProcessing(true);
    setAgentLog([]);
    setErrorMsg(null);

    try {
      const allCharts: ChartSpec[] = [];
      let firstUploadId = '';

      for (let i = 0; i < entries.length; i++) {
        const { charts, uploadId } = await processFile(entries[i], i);
        if (i === 0) firstUploadId = uploadId;
        allCharts.push(...charts);
      }

      if (allCharts.length === 0) {
        setErrorMsg('No data could be extracted from the uploaded files. Check that your files are not empty.');
        setProcessing(false);
        return;
      }

      // Preview bucket distribution
      const preview: Record<string, number> = { content: 0, commerce: 0, communication: 0, culture: 0 };
      allCharts.forEach(c => { const b = (c as any).bucket || 'content'; if (preview[b] !== undefined) preview[b]++; });
      setBucketPreview(preview);
      addLog(`📊 PRISM distribution — Content: ${preview.content} · Commerce: ${preview.commerce} · Comms: ${preview.communication} · Culture: ${preview.culture}`);

      // Optional Gemini title enhancement — skip if charts already came from Gemini 2.5
      let finalCharts = allCharts;
      const fromGemini = allCharts.every(c => c.id?.startsWith('gemini_'));
      if (fromGemini) {
        addLog('✨ Gemini 2.5 insights used — skipping redundant enhance step.');
      } else {
        try {
          addLog('🤖 Enhancing titles with Gemini AI…');
          const eRes = await fetch('/api/ai/enhance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              charts: allCharts.map(c => ({ title: c.title, type: c.type, obs: (c as any).obs })),
              context: `PRISM multi-source analysis — ${entries.map(e => e.file.name).join(', ')}`,
            }),
          });
          if (eRes.ok) {
            const { titles } = await eRes.json();
            if (Array.isArray(titles) && titles.length === allCharts.length) {
              finalCharts = allCharts.map((c, i) => ({ ...c, title: titles[i] || c.title }));
              addLog('✨ AI titles applied.');
            }
          }
        } catch { addLog('⚡ Gemini unavailable — using auto titles.'); }
      }

      // Save combined analysis (use uploadId from first file — no re-upload needed)
      addLog('💾 Saving PRISM Intelligence Report…');
      const combinedName = entries.length > 1
        ? `PRISM Combined — ${entries.length} sources`
        : entries[0].file.name.replace(/\.[^.]+$/, '');

      const domainValue = entries.length > 1
        ? 'multi-source'
        : ((finalCharts[0] as any)?.toolLabel ?? 'PRISM ANALYSIS');

      const saveRes = await fetch('/api/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId:  firstUploadId,
          sheetName: combinedName,
          filename:  entries.map(e => e.file.name).join(' + '),
          briefId,                  // when set, auto-flips brief to 'ready' + stamps actual_completed_at
          results: {
            charts:         finalCharts,
            scorecards:     [],
            strategicBrief: null,
            anomalies:      [],
            meta: {
              domain: domainValue,
              title:  combinedName,
              cls:    'content',
            },
          },
        }),
      });

      if (saveRes.ok) {
        const { id } = await saveRes.json();
        if (id) {
          addLog(`💾 Analysis saved. Now selecting SLA…`);
          // Show SLA modal if not already selected
          if (!selectedSlaHours) {
            setShowSlaModal(true);
            // Store the analysis ID so we can redirect after SLA is selected
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

  // ── File picker handler ────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (!picked.length) return;

    const valid: FileEntry[] = [];
    const errors: string[]   = [];

    for (const f of picked) {
      const ext    = f.name.split('.').pop()?.toLowerCase() ?? '';
      const maxMB  = ext === 'pdf' ? 15 : 10;
      if (!['xlsx','xls','csv','pdf'].includes(ext)) {
        errors.push(`"${f.name}" — unsupported format (use xlsx, csv, or pdf)`);
        continue;
      }
      if (f.size > maxMB * 1024 * 1024) {
        errors.push(`"${f.name}" — exceeds ${maxMB} MB limit`);
        continue;
      }
      valid.push({ file: f, status: 'pending', chartsFound: 0 });
    }

    if (errors.length) setErrorMsg(errors.join('\n'));
    if (!valid.length) return;

    setFileEntries(valid);
    setBucketPreview({});
    processAll(valid);

    // Reset input so the same files can be re-picked
    e.target.value = '';
  };

  const removeFile = (idx: number) =>
    setFileEntries(prev => prev.filter((_, i) => i !== idx));

  const hasFiles = fileEntries.length > 0;

  // ── Bucket display config ────────────────────────────────────
  const BUCKET_CFG = {
    content:       { label:'📝 Content',       color:'#2563EB', bg:'#EFF6FF', border:'#BFDBFE' },
    commerce:      { label:'🛒 Commerce',      color:'#059669', bg:'#ECFDF5', border:'#A7F3D0' },
    communication: { label:'📢 Comms',         color:'#7C3AED', bg:'#F5F3FF', border:'#DDD6FE' },
    culture:       { label:'🌍 Culture',       color:'#D97706', bg:'#FFFBEB', border:'#FDE68A' },
  } as const;

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
          <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.14em',
            color:'#818CF8', marginBottom:10 }}>DATA MAPPER</p>
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
              Excel · CSV · PDF &nbsp;·&nbsp; Multiple files supported &nbsp;·&nbsp; Max 10 MB
            </p>
            <p style={{ fontSize:12, color:'#94A3B8' }}>
              GWI · Google Keywords · Helium10 · Google Trends · Konnect Insights
            </p>
            {/* Format chips */}
            <div style={{ display:'flex', gap:8, justifyContent:'center', marginTop:20 }}>
              {['.xlsx','.xls','.csv','.pdf'].map(ext => (
                <span key={ext} style={{ padding:'4px 10px', borderRadius:8,
                  background:'#F1F5F9', color:'#475569', fontSize:11, fontWeight:700 }}>{ext}</span>
              ))}
            </div>
            <input ref={fileInputRef} type="file" multiple className="hidden"
              accept=".xlsx,.xls,.csv,.pdf" onChange={handleFileChange} />
          </div>
        )}

        {/* ── File list ── */}
        {hasFiles && (
          <div style={{ marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <p style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'.12em', color:'#475569' }}>
                Files ({fileEntries.length})
              </p>
              {!processing && (
                <button onClick={() => { setFileEntries([]); setAgentLog([]); setBucketPreview({}); }}
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
                    {/* File icon */}
                    <div style={{ width:36, height:36, borderRadius:10, flexShrink:0,
                      background: e.file.name.endsWith('.pdf') ? '#FEF2F2' : '#EFF6FF',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:16 }}>
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
                    {/* Status */}
                    <div style={{ display:'flex', alignItems:'center', gap:7, flexShrink:0 }}>
                      {(e.status === 'uploading' || e.status === 'analyzing') && (
                        <Loader2 size={13} style={{ color: cfg.color, animation:'upspin .7s linear infinite' }} />
                      )}
                      {e.status === 'done' && <CheckCircle size={13} style={{ color:'#059669' }} />}
                      <span style={{ fontSize:11, fontWeight:700,
                        color: cfg.color, background: cfg.bg,
                        padding:'3px 9px', borderRadius:20 }}>
                        {e.status === 'done' ? `${e.chartsFound} insights` : cfg.label}
                      </span>
                    </div>
                    {!processing && e.status !== 'done' && (
                      <button onClick={() => removeFile(i)} style={{
                        color:'#CBD5E1', background:'none', border:'none', cursor:'pointer', padding:0,
                        flexShrink:0,
                      }}>
                        <X size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {!processing && (
              <button onClick={() => fileInputRef.current?.click()} style={{
                width:'100%', marginTop:8, padding:'11px 0', borderRadius:14,
                border:'2px dashed #E2E8F0', background:'transparent',
                fontSize:13, fontWeight:600, color:'#94A3B8', cursor:'pointer',
                fontFamily:'inherit', transition:'all .15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor='#6366F1'; (e.currentTarget as HTMLButtonElement).style.color='#6366F1'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor='#E2E8F0'; (e.currentTarget as HTMLButtonElement).style.color='#94A3B8'; }}>
                + Add more files
              </button>
            )}
            <input ref={fileInputRef} type="file" multiple className="hidden"
              accept=".xlsx,.xls,.csv,.pdf" onChange={handleFileChange} />
          </div>
        )}

        {/* ── PRISM Bucket distribution ── */}
        {Object.keys(bucketPreview).length > 0 && (
          <div style={{ marginBottom:20 }}>
            <p style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'.12em',
              color:'#475569', marginBottom:12 }}>PRISM Distribution</p>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
              {(['content','commerce','communication','culture'] as const).map(b => {
                const cfg = BUCKET_CFG[b];
                const count = bucketPreview[b] ?? 0;
                const maxCount = Math.max(...Object.values(bucketPreview), 1);
                return (
                  <div key={b} style={{ background:cfg.bg, borderRadius:16, padding:'16px 14px',
                    border:`1.5px solid ${cfg.border}`, textAlign:'center' }}>
                    <div style={{ fontSize:22, fontWeight:900, color:cfg.color, marginBottom:4 }}>{count}</div>
                    {/* Mini bar */}
                    <div style={{ height:3, background:`${cfg.color}20`, borderRadius:2, marginBottom:6, overflow:'hidden' }}>
                      <div style={{ height:'100%', borderRadius:2, background:cfg.color,
                        width:`${maxCount > 0 ? (count/maxCount)*100 : 0}%`, transition:'width .5s ease' }} />
                    </div>
                    <div style={{ fontSize:10, fontWeight:700, color:cfg.color }}>{cfg.label}</div>
                  </div>
                );
              })}
            </div>
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
