'use client';
import { useState, useRef } from 'react';
import Navbar from '@/components/Navbar';
import SheetList from '@/components/SheetList';
import {
  ChartBar, ChartLine, ChartPie, ChartScatter, ChartHBar,
  ChartArea, ChartBubble, ChartRadar, Scorecard,
} from '@/components/charts/AppChart';
import {
  UploadCloud, Brain, ShieldCheck,
  AlertTriangle, BarChart,
} from 'lucide-react';
import {
  inferSchema, autoGenerateLayout, detectAnomalies, generateStrategicBrief,
} from '@/lib/inference';
import type { UploadSummary, SheetMeta } from '@/types/dataset';
import type { ChartSpec } from '@/types/inference';

// ─── Chart data builders ────────────────────────────────────

/** Standard bar / line / hbar / pie / area — group by xCol, sum yCol */
function buildStandardData(chart: ChartSpec, data: any[]) {
  const groups: Record<string, number> = {};
  data.forEach(row => {
    const label = String(row[chart.xCol!] ?? 'Other').trim();
    if (!label || label === 'undefined' || label === 'null') return;
    groups[label] = (groups[label] ?? 0) + (parseFloat(row[chart.yCol!]) || 0);
  });
  const entries = Object.entries(groups)
    .sort((a, b) => b[1] - a[1])
    .slice(0, chart.type === 'pie' ? 6 : 12);

  return {
    labels: entries.map(e => e[0]),
    datasets: [{
      label: chart.yCol ?? '',
      data: entries.map(e => e[1]),
      backgroundColor: chart.type === 'pie'
        ? ['#2563EB','#7C3AED','#059669','#D97706','#DC2626','#0891B2']
        : 'rgba(37, 99, 235, 0.85)',
      borderColor: (chart.type === 'line' || chart.type === 'area')
        ? 'rgba(37, 99, 235, 1)' : undefined,
      borderRadius: 6,
      fill: chart.type === 'area',
    }],
  };
}

/** Cross-categorical hbar — uses pre-computed _crossData array */
function buildCrossData(chart: ChartSpec) {
  const entries = (chart._crossData ?? []).slice(0, 12);
  return {
    labels: entries.map(e => e[0]),
    datasets: [{
      label: chart.yCol ?? '',
      data: entries.map(e => e[1]),
      backgroundColor: 'rgba(124, 58, 237, 0.85)',
      borderRadius: 4,
    }],
  };
}

/** Scatter — needs {x, y} point format */
function buildScatterData(chart: ChartSpec, data: any[]) {
  const points = data
    .map(row => ({
      x: parseFloat(row[chart.xCol!]) || 0,
      y: parseFloat(row[chart.yCol!]) || 0,
    }))
    .filter(p => !isNaN(p.x) && !isNaN(p.y))
    .slice(0, 200);

  return {
    datasets: [{
      label: `${chart.xCol} vs ${chart.yCol}`,
      data: points,
      backgroundColor: 'rgba(37, 99, 235, 0.6)',
      pointRadius: 4,
    }],
  };
}

/** Bubble — needs {x, y, r} format */
function buildBubbleData(chart: ChartSpec, data: any[]) {
  const zVals = data.map(r => parseFloat(r[chart.zCol!]) || 0).filter(v => !isNaN(v));
  const zMax  = Math.max(...zVals, 1);

  const points = data
    .map(row => ({
      x: parseFloat(row[chart.xCol!]) || 0,
      y: parseFloat(row[chart.yCol!]) || 0,
      r: Math.max(3, ((parseFloat(row[chart.zCol!]) || 0) / zMax) * 20),
    }))
    .filter(p => !isNaN(p.x) && !isNaN(p.y))
    .slice(0, 50);

  return {
    datasets: [{
      label: `${chart.xCol} / ${chart.yCol} / ${chart.zCol}`,
      data: points,
      backgroundColor: 'rgba(37, 99, 235, 0.5)',
    }],
  };
}

/** Radar — group by xCol, compute average of each metric in yCols per group */
function buildRadarData(chart: ChartSpec, data: any[]) {
  const yCols   = chart.yCols ?? [];
  const groups: Record<string, { sums: number[]; count: number }> = {};

  data.forEach(row => {
    const k = String(row[chart.xCol!] ?? '').trim();
    if (!k) return;
    if (!groups[k]) groups[k] = { sums: yCols.map(() => 0), count: 0 };
    groups[k].count++;
    yCols.forEach((col, i) => {
      groups[k].sums[i] += parseFloat(row[col]) || 0;
    });
  });

  const labels  = Object.keys(groups).slice(0, 6);
  const COLORS  = ['rgba(37,99,235,0.7)','rgba(124,58,237,0.7)','rgba(5,150,105,0.7)',
                   'rgba(217,119,6,0.7)','rgba(220,38,38,0.7)','rgba(8,145,178,0.7)'];

  return {
    labels: yCols,
    datasets: labels.map((grp, i) => ({
      label: grp,
      data: groups[grp].sums.map((s, j) =>
        groups[grp].count > 0 ? s / groups[grp].count : 0
      ),
      backgroundColor: COLORS[i % COLORS.length].replace('0.7','0.15'),
      borderColor:     COLORS[i % COLORS.length],
      pointBackgroundColor: COLORS[i % COLORS.length],
    })),
  };
}

/** Master dispatch — picks the right builder for each chart type */
function buildChartData(chart: ChartSpec, data: any[]) {
  if (chart.id === 'cross_cat' && chart._crossData) return buildCrossData(chart);
  switch (chart.type) {
    case 'scatter': return buildScatterData(chart, data);
    case 'bubble':  return buildBubbleData(chart, data);
    case 'radar':   return buildRadarData(chart, data);
    default:        return buildStandardData(chart, data);
  }
}

// ─── Chart renderer component ───────────────────────────────

function ChartRenderer({ chart, data }: { chart: ChartSpec; data: any[] }) {
  const chartData = buildChartData(chart, data);
  switch (chart.type) {
    case 'bar':     return <ChartBar     data={chartData} />;
    case 'line':    return <ChartLine    data={chartData} />;
    case 'hbar':    return <ChartHBar    data={chartData} />;
    case 'pie':     return <ChartPie     data={chartData} />;
    case 'area':    return <ChartArea    data={chartData} />;
    case 'scatter': return <ChartScatter data={chartData} />;
    case 'bubble':  return <ChartBubble  data={chartData} />;
    case 'radar':   return <ChartRadar   data={chartData} />;
    default:        return <p className="text-slate-400 text-sm">Unsupported chart type: {chart.type}</p>;
  }
}

// ─── Main page ───────────────────────────────────────────────

export default function UploadData() {
  const [file, setFile]                   = useState<File | null>(null);
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<SheetMeta | null>(null);
  const [loading, setLoading]             = useState(false);
  const [errorMsg, setErrorMsg]           = useState<string | null>(null);

  const [rawData, setRawData]             = useState<any[]>([]);
  const [scorecards, setScorecards]       = useState<any[]>([]);
  const [charts, setCharts]               = useState<ChartSpec[]>([]);
  const [strategicBrief, setStrategicBrief] = useState<any>(null);
  const [anomalies, setAnomalies]         = useState<any[]>([]);
  const [dashboardMeta, setDashboardMeta] = useState<any>(null);

  const [agentPhase, setAgentPhase]       = useState<'reading' | 'analyzing' | 'building' | 'done' | null>(null);
  const [agentLog, setAgentLog]           = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const addLog = (msg: string) => setAgentLog(prev => [...prev, msg]);

  // ── Sheet analysis ────────────────────────────────────────
  const analyzeSheet = async (sheet: SheetMeta, uid: string) => {
    setSelectedSheet(sheet);
    setAgentPhase('analyzing');
    addLog(`🔍 Activating ${sheet.type.replace('_', ' ')} Engine for "${sheet.sheetName}"…`);
    setErrorMsg(null);

    try {
      const res  = await fetch(`/api/uploads/${uid}/sheets/${encodeURIComponent(sheet.sheetName)}/data`);
      const data: any[] = await res.json();

      if (!res.ok) throw new Error((data as any).message ?? `HTTP ${res.status}`);
      if (!Array.isArray(data) || data.length === 0) {
        addLog(`⚠ No data rows returned for "${sheet.sheetName}". Check that your file matches the expected format.`);
        setAgentPhase(null);
        return;
      }

      setRawData(data);
      addLog(`✅ ${data.length} rows loaded.`);

      // Inference
      const schema   = inferSchema(data);
      const detected = detectAnomalies(data, schema);
      setAnomalies(detected);

      setAgentPhase('building');
      addLog(`🔧 Building dashboard layout…`);

      const layout = autoGenerateLayout(data, schema);
      setScorecards(layout.scorecards);
      setCharts(layout.charts);
      setDashboardMeta(layout.meta);

      const brief = generateStrategicBrief(layout.scorecards, layout.charts, detected);
      setStrategicBrief(brief);

      setAgentPhase('done');
      addLog(`✨ Intelligence Hub generated — ${layout.charts.length} charts · ${layout.scorecards.length} scorecards`);

      // Persist results asynchronously (non-blocking)
      const chartsWithData = layout.charts.map((c: ChartSpec) => ({
        ...c,
        computedChartData: buildChartData(c, data),
      }));
      fetch('/api/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId: uid,
          sheetName: sheet.sheetName,
          filename: file?.name,
          results: {
            scorecards: layout.scorecards,
            charts: chartsWithData,
            strategicBrief: brief,
            anomalies: detected,
            meta: layout.meta,
          },
        }),
      }).catch(err => {
        console.warn('Analysis save failed (non-blocking):', err.message);
      });

    } catch (err: any) {
      addLog(`❌ Analysis failed: ${err.message}`);
      setErrorMsg(err.message);
      setAgentPhase(null);
    }
  };

  // ── File upload ───────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    setFile(f);
    setUploadSummary(null);
    setSelectedSheet(null);
    setCharts([]);
    setScorecards([]);
    setAgentPhase('reading');
    setAgentLog([`📂 Initiating multi-sheet ingestion for: ${f.name}`]);
    setErrorMsg(null);
    setLoading(true);

    const formData = new FormData();
    formData.append('file', f);

    try {
      const res     = await fetch('/api/upload', { method: 'POST', body: formData });
      const summary = await res.json();

      if (!res.ok) {
        throw new Error(summary.message ?? `Upload failed (${res.status})`);
      }

      setUploadSummary(summary as UploadSummary);
      addLog(`✨ Ingestion complete — ${summary.sheets.length} Intelligence Leads discovered.`);

      // Auto-select the first sheet (properly awaited)
      if (summary.sheets.length > 0) {
        setLoading(false); // stop spinner before sheet analysis starts
        await analyzeSheet(summary.sheets[0], summary.uploadId);
      } else {
        addLog('⚠ No recognized sheets found. Please check your file format.');
      }

    } catch (err: any) {
      addLog(`❌ Upload error: ${err.message}`);
      setErrorMsg(err.message);
      setAgentPhase(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSheetSelect = async (sheet: SheetMeta) => {
    if (!uploadSummary) return;
    await analyzeSheet(sheet, uploadSummary.uploadId);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Navbar />

      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-extrabold text-slate-900 mb-4 tracking-tight">
            PRISM Intelligence Hub
          </h1>
          <p className="text-slate-600 text-lg max-w-2xl leading-relaxed">
            Upload your consumer research workbooks and search strategy sheets.
            PRISM's specialised engines will automatically harmonise, enrich, and visualise your high-conviction insights.
          </p>
        </div>

        {/* Error toast */}
        {errorMsg && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3">
            <AlertTriangle size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-bold text-red-700 text-sm">Upload or analysis error</p>
              <p className="text-red-600 text-sm mt-1">{errorMsg}</p>
            </div>
            <button
              className="ml-auto text-red-400 hover:text-red-600 text-xs"
              onClick={() => setErrorMsg(null)}
            >✕</button>
          </div>
        )}

        {/* Drop zone */}
        {!uploadSummary && (
          <div
            onClick={() => !loading && fileInputRef.current?.click()}
            className={`group relative overflow-hidden rounded-3xl border-2 border-dashed bg-white p-20 transition-all
              ${loading
                ? 'border-blue-300 cursor-wait'
                : 'border-slate-200 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30'}`}
          >
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className={`rounded-2xl p-4 font-bold transition-colors
                ${loading ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white'}`}>
                <UploadCloud size={32} className={loading ? 'animate-bounce' : ''} />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-900">
                  {loading ? 'Processing file…' : 'Drop GWI or Keyword Plan here'}
                </p>
                <p className="text-slate-500">Supports Excel and CSV multi-sheet workbooks · Max 20 MB</p>
              </div>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileChange}
              accept=".xlsx,.xls,.csv"
            />
          </div>
        )}

        {/* Agent log */}
        {agentPhase && (
          <div className="mb-8 p-6 bg-slate-900 rounded-3xl text-slate-300 font-mono text-sm shadow-2xl">
            <div className="flex items-center space-x-2 mb-4 border-b border-slate-800 pb-3">
              <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-blue-400 font-bold uppercase tracking-widest text-xs">PRISM AI Sequence</span>
            </div>
            <div className="space-y-1 overflow-y-auto max-h-40">
              {agentLog.map((log, i) => (
                <div key={i} className="flex">
                  <span className="opacity-30 mr-3">[{String(i).padStart(2, '0')}]</span>
                  <span>{log}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sheet selector */}
        {uploadSummary && (
          <SheetList
            sheets={uploadSummary.sheets}
            onSelect={handleSheetSelect}
            selectedSheetName={selectedSheet?.sheetName}
          />
        )}

        {/* Dashboard */}
        {agentPhase === 'done' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Context header */}
            <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
              <div>
                <div className="flex items-center space-x-3 mb-2">
                  <span className="text-2xl">{dashboardMeta?.icon || '📊'}</span>
                  <h2 className="text-2xl font-bold text-slate-900">{dashboardMeta?.title || 'Data Analysis'}</h2>
                  <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-bold uppercase tracking-widest">
                    {dashboardMeta?.domain || 'General'}
                  </span>
                </div>
                <p className="text-slate-500 text-sm max-w-xl">{dashboardMeta?.subtitle}</p>
              </div>
              <button className="flex items-center space-x-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors">
                <Brain size={16} />
                <span>Strategic Brief</span>
              </button>
            </div>

            {/* Scorecards */}
            {scorecards.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {scorecards.map((s, i) => (
                  <Scorecard key={i} {...s} />
                ))}
              </div>
            )}

            {/* Anomaly banner */}
            {anomalies.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3">
                <AlertTriangle size={18} className="text-amber-500 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-800 text-sm">
                    {anomalies.length} statistical anomal{anomalies.length === 1 ? 'y' : 'ies'} detected
                  </p>
                  <p className="text-amber-700 text-xs mt-1">
                    {anomalies[0].type} in <strong>{anomalies[0].metric}</strong> at {anomalies[0].context} ({anomalies[0].severity}σ deviation)
                  </p>
                </div>
              </div>
            )}

            {/* Chart grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {charts.map((c, i) => (
                <div
                  key={i}
                  className="bg-white rounded-[2rem] border border-slate-100 p-8 shadow-sm hover:shadow-xl transition-all duration-500 overflow-hidden relative group"
                >
                  <div className="flex justify-between items-start mb-8">
                    <div>
                      <div className="text-[10px] font-bold text-blue-600 uppercase tracking-[0.2em] mb-2">{c.lbl}</div>
                      <h3 className="text-xl font-bold text-slate-900 tracking-tight leading-tight">{c.title}</h3>
                    </div>
                    <div className="h-10 w-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                      <BarChart size={20} />
                    </div>
                  </div>

                  <div className="h-[300px] w-full mb-8 relative">
                    <ChartRenderer chart={c} data={rawData} />
                  </div>

                  <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 group-hover:border-blue-100 transition-colors">
                    <div className="flex items-center space-x-2 mb-2">
                      <ShieldCheck size={14} className="text-blue-600" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Strategic Hook (Conviction: {c.conviction}%)
                      </span>
                    </div>
                    <p className="text-slate-600 text-sm leading-relaxed">{c.obs}</p>
                    {c.rec && (
                      <p className="text-slate-500 text-xs mt-2 leading-relaxed border-t border-slate-200 pt-2">
                        💡 {c.rec}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
