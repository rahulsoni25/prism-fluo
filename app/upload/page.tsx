'use client';
import { useState, useRef, useMemo } from 'react';
import Navbar from '@/components/Navbar';
import SheetList from '@/components/SheetList';
import { 
  ChartBar, ChartLine, ChartPie, ChartScatter, ChartHBar, 
  ChartRadar, ChartArea, ChartBubble, Scorecard 
} from '@/components/charts/AppChart';
import { 
  UploadCloud, Brain, Zap, ShieldCheck, 
  Table as TableIcon, Layers, TrendingUp, AlertTriangle
} from 'lucide-react';
import { inferSchema, autoGenerateLayout, detectAnomalies, generateStrategicBrief } from '@/lib/inference';
import type { UploadSummary, SheetMeta } from '@/types/dataset';

export default function UploadData() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<SheetMeta | null>(null);
  const [loading, setLoading] = useState(false);
  
  const [headers, setHeaders] = useState<{id: string, value: string, label: string}[]>([]);
  const [rawData, setRawData] = useState<any[]>([]);
  const [schema, setSchema] = useState<any>(null);
  
  const [scorecards, setScorecards] = useState<any[]>([]);
  const [charts, setCharts] = useState<any[]>([]);
  const [strategicBrief, setStrategicBrief] = useState<any>(null);
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [dashboardMeta, setDashboardMeta] = useState<any>(null);
  
  const [agentPhase, setAgentPhase] = useState<'reading' | 'analyzing' | 'building' | 'done' | null>(null);
  const [agentLog, setAgentLog] = useState<string[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  // ---- 1. FILE UPLOAD ----
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    
    setLoading(true);
    setAgentPhase('reading');
    setAgentLog([`📂 Initiating multi-sheet ingestion for: ${f.name}`]);
    
    const formData = new FormData();
    formData.append('file', f);
    
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const summary: UploadSummary = await res.json();
      
      setUploadSummary(summary);
      setAgentLog(prev => [...prev, `✨ Ingestion complete. Discovered ${summary.sheets.length} high-value Intelligence Leads.`]);
      
      if (summary.sheets.length > 0) {
        // Auto-select first lead
        handleSheetSelect(summary.sheets[0], summary.uploadId);
      }
    } catch (err: any) {
      setAgentLog(prev => [...prev, `❌ Error: ${err.message}`]);
    } finally {
      setLoading(false);
    }
  };

  // ---- 2. SHEET SELECTION & ANALYSIS ----
  const handleSheetSelect = async (sheet: SheetMeta, uploadId?: string) => {
    const uid = uploadId || uploadSummary?.uploadId;
    if (!uid) return;

    setSelectedSheet(sheet);
    setAgentPhase('analyzing');
    setAgentLog(prev => [...prev, `🔍 Activating ${sheet.type.replace('_',' ')} Engine for "${sheet.sheetName}"...`]);
    
    try {
      const res = await fetch(`/api/uploads/${uid}/sheets/${encodeURIComponent(sheet.sheetName)}/data`);
      const data = await res.json();
      
      if (data.length > 0) {
        setRawData(data);
        const cols = Object.keys(data[0]);
        setHeaders(cols.map((c, idx) => ({ id: `${c}-${idx}`, value: c, label: c })));
        
        // Intelligence Run
        await delay(600);
        const s = inferSchema(data);
        setSchema(s);
        
        const detected = detectAnomalies(data, s);
        setAnomalies(detected);
        
        setAgentPhase('building');
        const layout = autoGenerateLayout(data, s);
        
        setScorecards(layout.scorecards);
        setCharts(layout.charts);
        setDashboardMeta(layout.meta);
        
        const brief = generateStrategicBrief(layout.scorecards, layout.charts, detected);
        setStrategicBrief(brief);
        
        setAgentPhase('done');
        setAgentLog(prev => [...prev, `✅ Intelligence Hub generated for ${sheet.sheetName}`]);
      }
    } catch (err: any) {
      setAgentLog(prev => [...prev, `❌ Analysis failed: ${err.message}`]);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Header Section */}
        <div className="mb-12">
          <h1 className="text-4xl font-extrabold text-slate-900 mb-4 tracking-tight">
            PRISM Intelligence Hub
          </h1>
          <p className="text-slate-600 text-lg max-w-2xl leading-relaxed">
            Upload your consumer research workbooks and search strategy sheets. 
            PRISM's specialized engines will automatically harmonize, enrich, and visualize your high-conviction insights.
          </p>
        </div>

        {/* Upload Dropzone */}
        {!uploadSummary && (
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="group relative cursor-pointer overflow-hidden rounded-3xl border-2 border-dashed border-slate-200 bg-white p-20 transition-all hover:border-blue-400 hover:bg-blue-50/30"
          >
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="rounded-2xl bg-blue-50 p-4 font-bold text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <UploadCloud size={32} />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-900">Drop GWI or Keyword Plan here</p>
                <p className="text-slate-500">Supports Excel and CSV multi-sheet workbooks</p>
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

        {/* Agent Logs & Lead Discovery */}
        {agentPhase && (
          <div className="mb-8 p-6 bg-slate-900 rounded-3xl text-slate-300 font-mono text-sm shadow-2xl">
            <div className="flex items-center space-x-2 mb-4 border-b border-slate-800 pb-3">
              <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-blue-400 font-bold uppercase tracking-widest text-xs">PRISM AI Sequence</span>
            </div>
            <div className="space-y-1 overflow-y-auto max-h-40 scrollbar-hide">
              {agentLog.map((log, i) => (
                <div key={i} className="flex">
                  <span className="opacity-30 mr-3">[{i.toString().padStart(2, '0')}]</span>
                  <span>{log}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lead Selector Hub */}
        {uploadSummary && (
          <SheetList 
            sheets={uploadSummary.sheets} 
            onSelect={handleSheetSelect}
            selectedSheetName={selectedSheet?.sheetName}
          />
        )}

        {/* DASHBOARD RENDERER */}
        {agentPhase === 'done' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Context Header */}
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
              <div className="flex space-x-2">
                <button className="flex items-center space-x-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors">
                  <Brain size={16} />
                  <span>Strategic Brief</span>
                </button>
              </div>
            </div>

            {/* Scorecards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {scorecards.map((s, i) => (
                <Scorecard key={i} {...s} />
              ))}
            </div>

            {/* Insight Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {charts.map((c, i) => (
                <div key={i} className={`bg-white rounded-[2rem] border border-slate-100 p-8 shadow-sm hover:shadow-xl transition-all duration-500 overflow-hidden relative group`}>
                    <div className="flex justify-between items-start mb-8">
                      <div>
                        <div className="text-[10px] font-bold text-blue-600 uppercase tracking-[0.2em] mb-2">{c.lbl}</div>
                        <h3 className="text-xl font-bold text-slate-900 tracking-tight leading-tight">{c.title}</h3>
                      </div>
                      <div className="h-10 w-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                        <ChartBar size={20} />
                      </div>
                    </div>

                    <div className="h-[300px] w-full mb-8 relative">
                      {c.type === 'bar' && <ChartBar data={rawData} xCol={c.xCol} yCol={c.yCol} title={c.title} />}
                      {c.type === 'line' && <ChartLine data={rawData} xCol={c.xCol} yCol={c.yCol} title={c.title} />}
                      {c.type === 'hbar' && <ChartHBar data={rawData} xCol={c.xCol} yCol={c.yCol} title={c.title} />}
                      {c.type === 'pie' && <ChartPie data={rawData} xCol={c.xCol} yCol={c.yCol} title={c.title} />}
                      {c.type === 'area' && <ChartArea data={rawData} xCol={c.xCol} yCol={c.yCol} title={c.title} />}
                    </div>

                    <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 group-hover:border-blue-100 transition-colors">
                      <div className="flex items-center space-x-2 mb-2">
                        <ShieldCheck size={14} className="text-blue-600" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Strategic Hook (Conviction: {c.conviction}%)</span>
                      </div>
                      <p className="text-slate-600 text-sm leading-relaxed">{c.obs}</p>
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
