'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { UploadCloud, AlertTriangle, CheckCircle, Loader2, X } from 'lucide-react';
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
export default function UploadData() {
  const router = useRouter();

  const [fileEntries, setFileEntries]   = useState<FileEntry[]>([]);
  const [processing,  setProcessing]    = useState(false);
  const [agentLog,    setAgentLog]      = useState<string[]>([]);
  const [errorMsg,    setErrorMsg]      = useState<string | null>(null);
  const [bucketPreview, setBucketPreview] = useState<Record<string, number>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const addLog = (msg: string) => setAgentLog(prev => [...prev, msg]);

  const updateEntry = (idx: number, patch: Partial<FileEntry>) =>
    setFileEntries(prev => prev.map((e, i) => i === idx ? { ...e, ...patch } : e));

  // ── Upload + analyse one file → return { charts, uploadId } ─
  async function processFile(entry: FileEntry, entryIdx: number): Promise<{ charts: ChartSpec[]; uploadId: string }> {
    const { file } = entry;
    updateEntry(entryIdx, { status: 'uploading' });
    addLog(`📤 Uploading "${file.name}"…`);

    const formData = new FormData();
    formData.append('file', file);
    const upRes = await fetch('/api/upload', { method: 'POST', body: formData });
    const summary = await upRes.json();
    if (!upRes.ok) throw new Error(summary.message ?? `Upload failed (${upRes.status})`);

    const { uploadId, sheets } = summary;
    if (!sheets?.length) { addLog(`⚠ No sheets found in "${file.name}"`); return { charts: [], uploadId }; }

    updateEntry(entryIdx, { status: 'analyzing' });
    addLog(`🔍 Analysing ${sheets.length} sheet(s) from "${file.name}"…`);

    const allCharts: ChartSpec[] = [];

    for (const sheet of sheets.slice(0, 3)) {
      const dataRes = await fetch(`/api/uploads/${uploadId}/sheets/${encodeURIComponent(sheet.sheetName)}/data`);
      const data: any[] = await dataRes.json();
      if (!Array.isArray(data) || data.length === 0) continue;

      addLog(`  └─ "${sheet.sheetName}": ${data.length} rows`);
      const schema = inferSchema(data);
      const layout = autoGenerateLayout(data, schema);
      const chartsWithData = layout.charts.map(c => ({
        ...c,
        computedChartData: buildChartData(c, data),
      }));
      allCharts.push(...chartsWithData);
    }

    updateEntry(entryIdx, { status: 'done', chartsFound: allCharts.length });
    addLog(`✅ "${file.name}" → ${allCharts.length} insight${allCharts.length !== 1 ? 's' : ''}`);
    return { charts: allCharts, uploadId };
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

      // Optional Gemini title enhancement
      let finalCharts = allCharts;
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
          addLog(`🚀 Redirecting to Intelligence Report…`);
          router.push(`/insights?id=${id}`);
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

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Navbar />
      <main className="max-w-4xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-extrabold text-slate-900 mb-2 tracking-tight">
            PRISM Intelligence Hub
          </h1>
          <p className="text-slate-500 text-base max-w-xl">
            Upload one or more research files. PRISM will read the data, extract key insights,
            and automatically sort them across <strong>Content · Commerce · Communication · Culture</strong>.
          </p>
        </div>

        {/* Error */}
        {errorMsg && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3">
            <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
            <pre className="text-red-700 text-sm whitespace-pre-wrap flex-1">{errorMsg}</pre>
            <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-600"><X size={14} /></button>
          </div>
        )}

        {/* Drop zone — only shown when idle */}
        {!hasFiles && (
          <div
            onClick={() => !processing && fileInputRef.current?.click()}
            className="group rounded-3xl border-2 border-dashed border-slate-200 bg-white p-20 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-2xl p-4 bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <UploadCloud size={32} />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">Drop files here or click to browse</p>
                <p className="text-slate-500 text-sm mt-1">Excel · CSV · PDF &nbsp;·&nbsp; Multiple files supported &nbsp;·&nbsp; Max 10 MB (PDF: 15 MB)</p>
                <p className="text-slate-400 text-xs mt-2">Works with GWI · Google Keywords · Helium10 · Google Trends · Konnect Insights</p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept=".xlsx,.xls,.csv,.pdf"
              onChange={handleFileChange}
            />
          </div>
        )}

        {/* File list + status */}
        {hasFiles && (
          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-bold text-slate-700 uppercase tracking-widest">Files</p>
              {!processing && (
                <button
                  onClick={() => { setFileEntries([]); setAgentLog([]); setBucketPreview({}); }}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Clear all
                </button>
              )}
            </div>
            {fileEntries.map((e, i) => (
              <div key={i} className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3 border border-slate-100 shadow-sm">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{e.file.name}</p>
                  <p className="text-xs text-slate-400">{(e.file.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                {e.status === 'pending'   && <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Pending</span>}
                {e.status === 'uploading' && <Loader2 size={14} className="text-blue-500 animate-spin" />}
                {e.status === 'analyzing' && <Loader2 size={14} className="text-purple-500 animate-spin" />}
                {e.status === 'done'      && (
                  <span className="flex items-center gap-1 text-xs text-green-600 font-semibold">
                    <CheckCircle size={13} /> {e.chartsFound} insights
                  </span>
                )}
                {e.status === 'error'     && <span className="text-xs text-red-500 font-semibold">Error</span>}
                {!processing && e.status !== 'done' && (
                  <button onClick={() => removeFile(i)} className="text-slate-300 hover:text-slate-500 ml-1"><X size={13} /></button>
                )}
              </div>
            ))}

            {/* Add more files button */}
            {!processing && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 text-sm hover:border-blue-300 hover:text-blue-500 transition-all"
              >
                + Add more files
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept=".xlsx,.xls,.csv,.pdf"
              onChange={handleFileChange}
            />
          </div>
        )}

        {/* PRISM bucket preview */}
        {Object.keys(bucketPreview).length > 0 && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            {(['content','commerce','communication','culture'] as const).map(b => (
              <div key={b} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-center">
                <div className="text-xl font-extrabold" style={{ color: BUCKET_COLORS[b] }}>{bucketPreview[b] ?? 0}</div>
                <div className="text-[11px] text-slate-500 mt-0.5 font-semibold">{BUCKET_LABELS[b]}</div>
              </div>
            ))}
          </div>
        )}

        {/* Agent log */}
        {agentLog.length > 0 && (
          <div className="p-5 bg-slate-900 rounded-3xl text-slate-300 font-mono text-xs shadow-2xl">
            <div className="flex items-center gap-2 mb-3 border-b border-slate-800 pb-2">
              {processing
                ? <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                : <CheckCircle size={12} className="text-green-400" />}
              <span className="text-blue-400 font-bold uppercase tracking-widest text-[10px]">PRISM AI Sequence</span>
            </div>
            <div className="space-y-1 overflow-y-auto max-h-44">
              {agentLog.map((log, i) => (
                <div key={i} className="flex">
                  <span className="opacity-30 mr-3">[{String(i).padStart(2,'0')}]</span>
                  <span>{log}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
