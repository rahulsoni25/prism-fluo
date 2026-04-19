'use client';
import { useState, useRef, useMemo, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import Papa from 'papaparse';
import * as xlsx from 'xlsx';
import { 
  ChartBar, ChartLine, ChartPie, ChartScatter, ChartHBar, 
  ChartRadar, ChartArea, ChartBubble, Scorecard 
} from '@/components/charts/AppChart';
import { 
  UploadCloud, Edit3, Filter, X, Table as TableIcon, 
  Layers, Brain, Zap, ArrowRight, ShieldCheck, TrendingUp, AlertTriangle
} from 'lucide-react';
import { inferSchema, autoGenerateLayout, detectAnomalies, generateStrategicBrief } from '@/lib/inference';
import { isKeywordPlan, enrichKeywordData } from '@/lib/keywords';

export default function UploadData() {
  const [file, setFile] = useState(null);
  const [workbook, setWorkbook] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  
  const [headers, setHeaders] = useState([]);
  const [rawData, setRawData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [schema, setSchema] = useState(null);
  
  const [scorecards, setScorecards] = useState([]);
  const [charts, setCharts] = useState([]);
  const [strategicBrief, setStrategicBrief] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [dashboardMeta, setDashboardMeta] = useState(null);
  
  const [isEditing, setIsEditing] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [globalFilters, setGlobalFilters] = useState({});
  const [agentPhase, setAgentPhase] = useState(null); // null | 'reading' | 'analyzing' | 'building' | 'done'
  const [agentLog, setAgentLog] = useState([]);
  
  const fileInputRef = useRef(null);

  // ---- AGENT SIMULATION ----
  const runAgent = async (cols, data) => {
    setAgentPhase('reading');
    setAgentLog([`📂 Ingested ${data.length} rows across ${cols.length} columns`]);
    await delay(600);

    let activeData = data;
    if (isKeywordPlan(data)) {
      setAgentPhase('reading');
      setAgentLog(prev => [...prev, '🔍 Google Ads Keyword Plan detected. Running PRISM Enrichment Engine...']);
      activeData = enrichKeywordData(data);
      await delay(800);
      setAgentLog(prev => [...prev, '✨ Enrichment complete: Tiers, Brands, and Categories isolated.']);
    }

    setAgentPhase('analyzing');
    const s = inferSchema(activeData);
    setSchema(s);
    
    // Anomaly Detection
    const detected = detectAnomalies(activeData, s);
    setAnomalies(detected);
    
    setAgentLog(prev => [
      ...prev,
      `🧬 Schema detected: ${s.time.length} temporal, ${s.numeric.length} metric, ${s.categorical.length} categorical columns`,
      ...s.time.map(t => `  ⏱ Time axis: "${t}"`),
      ...s.numeric.map(n => `  📊 Metric: "${n}"`),
      detected.length > 0 ? `⚠️ Isolated ${detected.length} statistical anomalies in your data:` : `✅ Data consistency check passed; no severe anomalies detected`,
      ...detected.map(a => `  🚨 ${a.type}: ${a.metric} at "${a.context}" (${a.severity}σ deviation)`),
    ]);
    await delay(800);

    setAgentPhase('building');
    const layout = autoGenerateLayout(data, s);
    
    // Dashboard Meta (contextual title)
    setDashboardMeta(layout.meta);
    
    // Strategic Brief Generation
    const brief = generateStrategicBrief(layout.scorecards, layout.charts, detected);
    setStrategicBrief(brief);

    setAgentLog(prev => [
      ...prev,
      `🤖 Agent generated ${layout.scorecards.length} scorecards and ${layout.charts.length} insight tiles`,
      `📑 Executive Strategic Brief synthesized successfully`,
      `🏷️ Domain detected: ${layout.meta?.domain || 'General'}`,
      ...layout.charts.map(c => `  ✅ ${c.type.toUpperCase()}: ${c.title}`)
    ]);
    await delay(700);

    setHeaders(cols);
    setRawData(activeData);
    setFilteredData(activeData);
    setScorecards(layout.scorecards);
    setCharts(layout.charts.map(c => ({ ...c, instanceId: Math.random().toString(36).substr(2, 9) })));
    setAgentPhase('done');
  };

  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  // ---- DATA INGESTION ----

  const handleFile = async (selectedFile) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    const name = selectedFile.name.toLowerCase();
    
    if (name.endsWith('.csv')) {
      Papa.parse(selectedFile, { 
        header: true, skipEmptyLines: true, 
        complete: (res) => { if (res.data.length > 0) runAgent(Object.keys(res.data[0]), res.data); } 
      });
    } else if (name.endsWith('.xlsx')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const wb = xlsx.read(e.target.result, { type: 'binary' });
        setWorkbook(wb);
        setSheets(wb.SheetNames);
        if (wb.SheetNames.length === 1) loadSheet(wb, wb.SheetNames[0]);
      };
      reader.readAsBinaryString(selectedFile);
    }
  };

  const loadSheet = (wb, sheetName) => {
    setSelectedSheet(sheetName);
    const sheet = wb.Sheets[sheetName];
    const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
    
    let hIdx = 0;
    for (let i = 0; i < Math.min(10, rawRows.length); i++) {
      if (rawRows[i] && rawRows[i].filter(c => c && String(c).trim() !== '').length > 1) { hIdx = i; break; }
    }
    
    const cleanHeaders = (rawRows[hIdx] || []).map((h, i) => h ? String(h).trim() : `Col_${i}`);
    const data = [];
    for (let i = hIdx + 1; i < rawRows.length; i++) {
      if (!rawRows[i] || rawRows[i].length === 0) continue;
      let obj = {};
      cleanHeaders.forEach((h, j) => { obj[h] = rawRows[i][j]; });
      data.push(obj);
    }
    runAgent(cleanHeaders, data);
  };

  // ---- FILTERING ----

  useEffect(() => {
    if (rawData.length === 0) return;
    let nextData = [...rawData];
    Object.entries(globalFilters).forEach(([col, val]) => {
      if (val === 'ALL') return;
      nextData = nextData.filter(row => String(row[col]) === val);
    });
    setFilteredData(nextData);
  }, [globalFilters, rawData]);

  const filterOptions = useMemo(() => {
    if (!schema || !rawData.length) return [];
    return schema.categorical.map(col => {
      const vals = Array.from(new Set(rawData.map(r => String(r[col])).filter(v => v !== 'undefined' && v !== '')));
      return { col, vals };
    });
  }, [schema, rawData]);

  // ---- CHART DATA BUILDER ----

  const getChartData = (chart, dataSlice) => {
    // RADAR: Multivariate benchmark
    if (chart.type === 'radar' && chart.yCols) {
      const labels = chart.yCols;
      // Get unique categories
      const catGroups = {};
      dataSlice.forEach(row => {
        const k = String(row[chart.xCol] || '').trim();
        if (!k) return;
        if (!catGroups[k]) catGroups[k] = { count: 0, sums: {} };
        catGroups[k].count++;
        labels.forEach(m => { catGroups[k].sums[m] = (catGroups[k].sums[m] || 0) + (parseFloat(row[m]) || 0); });
      });

      const colors = ['rgba(37,99,235,0.85)', 'rgba(124,58,237,0.85)', 'rgba(5,150,105,0.85)', 'rgba(217,119,6,0.85)', 'rgba(220,38,38,0.85)'];
      const bgColors = ['rgba(37,99,235,0.15)', 'rgba(124,58,237,0.15)', 'rgba(5,150,105,0.15)', 'rgba(217,119,6,0.15)', 'rgba(220,38,38,0.15)'];

      const catNames = Object.keys(catGroups).slice(0, 5);
      return {
        labels,
        datasets: catNames.map((c, i) => ({
          label: c,
          data: labels.map(m => catGroups[c].count > 0 ? catGroups[c].sums[m] / catGroups[c].count : 0),
          backgroundColor: bgColors[i % bgColors.length],
          borderColor: colors[i % colors.length],
          borderWidth: 2
        }))
      };
    }

    // BUBBLE: 3-way
    if (chart.type === 'bubble') {
      return {
        datasets: [{
          label: 'Data Points',
          data: dataSlice.slice(0, 60).map(r => ({
            x: parseFloat(r[chart.xCol]) || 0,
            y: parseFloat(r[chart.yCol]) || 0,
            r: Math.max(3, Math.min(20, (parseFloat(r[chart.zCol]) || 5) / 2))
          })),
          backgroundColor: 'rgba(124, 58, 237, 0.5)',
          borderColor: 'rgba(124, 58, 237, 0.9)',
          borderWidth: 1
        }]
      };
    }

    // SCATTER
    if (chart.type === 'scatter') {
      return {
        datasets: [{
          label: chart.yCol,
          data: dataSlice.slice(0, 80).map(r => ({
            x: parseFloat(r[chart.xCol]) || 0,
            y: parseFloat(r[chart.yCol]) || 0
          })),
          backgroundColor: 'rgba(37, 99, 235, 0.6)',
          pointRadius: 6,
          pointHoverRadius: 9
        }]
      };
    }

    // CROSS-DATA (e.g., Cat1 × Cat2)
    if (chart._crossData) {
      const entries = chart._crossData;
      return {
        labels: entries.map(e => e[0]),
        datasets: [{
          label: chart.yCol,
          data: entries.map(e => e[1]),
          backgroundColor: 'rgba(37, 99, 235, 0.85)',
          borderRadius: 5
        }]
      };
    }

    // DEFAULT: Bar / Line / Pie / Area / HBar
    const groups = {};
    dataSlice.forEach(row => {
      const label = String(row[chart.xCol] || 'Other').trim();
      if (!label || label === 'undefined') return;
      groups[label] = (groups[label] || 0) + (parseFloat(row[chart.yCol]) || 0);
    });

    const entries = Object.entries(groups).sort((a,b) => b[1] - a[1]).slice(0, chart.type === 'pie' ? 6 : 12);
    return {
      labels: entries.map(e => e[0]),
      datasets: [{
        label: chart.yCol,
        data: entries.map(e => e[1]),
        backgroundColor: chart.type === 'pie' 
          ? ['#2563EB','#7C3AED','#059669','#D97706','#DC2626','#0891B2'] 
          : 'rgba(37, 99, 235, 0.85)',
        borderColor: chart.type === 'line' || chart.type === 'area' ? 'rgba(37, 99, 235, 1)' : undefined,
        borderRadius: 6,
        fill: chart.type === 'area',
        borderSkipped: false
      }]
    };
  };

  // ---- EDITOR ----

  const handleUpdateChart = (instanceId, updates) => {
    if (updates.yCol && !updates.xCol) {
      if (schema.time.length) updates.xCol = schema.time[0];
      else if (schema.categorical.length) updates.xCol = schema.categorical[0];
    }
    setCharts(prev => prev.map(c => c.instanceId === instanceId ? { ...c, ...updates } : c));
  };

  const resetAll = () => {
    setRawData([]); setFile(null); setSheets([]); setSelectedSheet(''); 
    setSchema(null); setScorecards([]); setCharts([]); setAgentPhase(null); setAgentLog([]);
    setGlobalFilters({}); setStrategicBrief(null); setAnomalies([]); setDashboardMeta(null);
  };

  // ---- RENDER ----

  return (
    <div className="screen fade-in" style={{ backgroundColor: '#F1F5F9', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      
      {/* UPLOAD STATE */}
      {!rawData.length && !sheets.length && !agentPhase && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
          <div style={{ textAlign: 'center', maxWidth: '640px', background: '#fff', padding: '60px', borderRadius: '24px', boxShadow: '0 20px 40px -10px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: '56px', marginBottom: '16px' }}>🧠</div>
            <h1 style={{ fontSize: '36px', fontWeight: 900, color: '#0F172A', marginBottom: '12px' }}>PRISM Intelligence Agent</h1>
            <p style={{ color: '#64748B', marginBottom: '40px', fontSize: '17px', lineHeight: 1.6 }}>
              Drop any data file. The Agent will read your data, identify patterns,<br />
              select the best visualizations, and generate strategic insights — automatically.
            </p>
            <div 
              onClick={() => fileInputRef.current?.click()} 
              style={{ border: '3px dashed #CBD5E1', padding: '56px 40px', borderRadius: '20px', cursor: 'pointer', background: '#FAFBFC', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.background = '#F0F7FF'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.background = '#FAFBFC'; }}
            >
              <input type="file" ref={fileInputRef} onChange={e => handleFile(e.target.files[0])} accept=".csv,.xlsx,.xls" style={{ display: 'none' }} />
              <UploadCloud size={56} color="#3B82F6" style={{ margin: '0 auto 20px' }} />
              <div style={{ fontWeight: 700, fontSize: '18px', color: '#1E293B' }}>Choose File or Drag & Drop</div>
              <div style={{ fontSize: '13px', color: '#94A3B8', marginTop: '10px' }}>CSV, XLSX — multi-sheet supported</div>
            </div>
          </div>
        </div>
      )}

      {/* MULTI-SHEET SELECTOR */}
      {sheets.length > 1 && !selectedSheet && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
          <div style={{ background: '#fff', padding: '40px', borderRadius: '20px', width: '440px', boxShadow: '0 20px 40px -10px rgba(0,0,0,0.08)' }}>
            <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Layers size={22} color="#2563EB" /> Multiple Sheets Detected
            </h2>
            <p style={{ color: '#64748B', marginBottom: '24px', fontSize: '14px' }}>Select a sheet to analyze. Each sheet will generate its own intelligence report.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sheets.map((s, i) => (
                <button 
                  key={s} onClick={() => loadSheet(workbook, s)} 
                  style={{ padding: '18px 20px', textAlign: 'left', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', cursor: 'pointer', fontWeight: 600, color: '#334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.15s' }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor='#3B82F6'}
                  onMouseLeave={e=>e.currentTarget.style.borderColor='#E2E8F0'}
                >
                  <span>📄 {s}</span>
                  <ArrowRight size={16} color="#94A3B8" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* AGENT THINKING PHASE */}
      {agentPhase && agentPhase !== 'done' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
          <div style={{ background: '#0F172A', padding: '40px', borderRadius: '20px', width: '560px', color: '#fff', fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <div className="agent-pulse" style={{ width: '12px', height: '12px', borderRadius: '50%', background: agentPhase === 'reading' ? '#3B82F6' : agentPhase === 'analyzing' ? '#D97706' : '#059669' }}></div>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>
                {agentPhase === 'reading' && '🔍 Reading data structure...'}
                {agentPhase === 'analyzing' && '🧬 Analyzing patterns & statistics...'}
                {agentPhase === 'building' && '🏗️ Building intelligence report...'}
              </div>
            </div>
            <div style={{ maxHeight: '300px', overflow: 'auto', fontSize: '12px', lineHeight: '2', color: '#94A3B8' }}>
              {agentLog.map((line, i) => (
                <div key={i} className="fade-in" style={{ animationDelay: `${i * 0.05}s` }}>{line}</div>
              ))}
              <div className="agent-cursor" style={{ display: 'inline-block', width: '8px', height: '16px', background: '#3B82F6', animation: 'blink 1s infinite' }}></div>
            </div>
          </div>
        </div>
      )}

      {/* DASHBOARD */}
      {agentPhase === 'done' && rawData.length > 0 && (
        <div style={{ display: 'flex', flex: 1 }}>
          
          {/* SIDEBAR */}
          <div style={{ width: isSidebarOpen ? '280px' : '0', overflow: 'hidden', background: '#fff', borderRight: '1px solid #E2E8F0', transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', letterSpacing: '0.05em' }}>
                <Filter size={14} color="#64748B" /> GLOBAL FILTERS
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {filterOptions.map(f => (
                  <div key={f.col}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', display: 'block', marginBottom: '8px', letterSpacing: '0.04em' }}>{f.col}</label>
                    <select 
                      value={globalFilters[f.col] || 'ALL'} 
                      onChange={e => setGlobalFilters(prev => ({ ...prev, [f.col]: e.target.value }))}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', fontWeight: 500, color: '#334155', outline: 'none', background: '#FAFBFC' }}
                    >
                      <option value="ALL">All ({f.vals.length})</option>
                      {f.vals.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              {/* Agent Summary */}
              <div style={{ marginTop: '32px', padding: '16px', background: '#F0FDF4', borderRadius: '12px', border: '1px solid #BBF7D0' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#166534', marginBottom: '8px' }}>🤖 Agent Summary</div>
                <div style={{ fontSize: '11px', color: '#15803D', lineHeight: 1.7 }}>
                  {scorecards.length} KPIs detected<br/>
                  {charts.length} insights generated<br/>
                  {filteredData.length} / {rawData.length} records active
                </div>
              </div>
            </div>
            <div style={{ padding: '16px', borderTop: '1px solid #F1F5F9' }}>
              <button onClick={resetAll} style={{ width: '100%', padding: '12px', background: '#FEF2F2', color: '#DC2626', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                Reset Dashboard
              </button>
            </div>
          </div>

          {/* CANVAS */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
            
            {/* Header — Contextual Title */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={{ padding: '8px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', cursor: 'pointer' }}>
                    <TableIcon size={18} color="#64748B" />
                  </button>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
                      {dashboardMeta?.icon || '📊'} {dashboardMeta?.domain || 'Data Intelligence'}
                    </div>
                    <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', lineHeight: 1.2 }}>
                      {dashboardMeta?.title || file?.name.replace(/\.[^/.]+$/, "")}
                    </h1>
                  </div>
                </div>
                <div style={{ fontSize: '13px', color: '#64748B', marginTop: '8px', marginLeft: '44px', display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <span>{dashboardMeta?.subtitle || `${filteredData.length} records · ${headers.length} columns`}</span>
                </div>
                {dashboardMeta?.readingGuide && (
                  <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '6px', marginLeft: '44px', maxWidth: '600px', lineHeight: 1.5 }}>
                    {dashboardMeta.readingGuide}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <div style={{ background: '#F0FDF4', color: '#166534', padding: '8px 16px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Zap size={12} /> Live Intelligence
                </div>
                {selectedSheet && (
                  <div style={{ background: '#EFF6FF', color: '#1E40AF', padding: '8px 16px', borderRadius: '20px', fontSize: '12px', fontWeight: 700 }}>
                    📄 {selectedSheet}
                  </div>
                )}
              </div>
            </div>

            {/* STRATEGIC BRIEF PANE */}
            {strategicBrief && (
              <div className="fade-in shadow-lg" style={{ background: 'rgba(255, 255, 255, 0.7)', backdropFilter: 'blur(12px)', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.4)', padding: '32px', marginBottom: '32px', boxShadow: '0 10px 30px -5px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
                  <Brain size={24} color="#2563EB" />
                  <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em' }}>EXECUTIVE STRATEGIC BRIEF</h2>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', marginBottom: '32px' }}>
                  {strategicBrief.pillars.map((p, i) => (
                    <div key={i} style={{ padding: '20px', borderRadius: '16px', background: p.type === 'RISK' ? '#FFF1F2' : '#F8FAFC', border: `1px solid ${p.type === 'RISK' ? '#FECDD3' : '#E2E8F0'}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        {p.type === 'LEAD' && <ShieldCheck size={16} color="#059669" />}
                        {p.type === 'GROWTH' && <TrendingUp size={16} color="#2563EB" />}
                        {p.type === 'RISK' && <AlertTriangle size={16} color="#DC2626" />}
                        <span style={{ fontSize: '11px', fontWeight: 800, color: p.type === 'RISK' ? '#991B1B' : '#64748B', textTransform: 'uppercase' }}>{p.label}</span>
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', marginBottom: '8px', lineHeight: 1.3 }}>{p.title}</div>
                      <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>{p.text}</div>
                    </div>
                  ))}
                </div>

                <div style={{ padding: '20px', borderRadius: '16px', background: '#0F172A', color: '#fff' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#3B82F6', textTransform: 'uppercase', marginBottom: '8px' }}>🤖 AGENT'S MASTER RECOMMENDATION</div>
                  <div style={{ fontSize: '16px', lineHeight: 1.6, fontWeight: 500, color: '#F1F5F9' }} dangerouslySetInnerHTML={{ __html: strategicBrief.masterAction }}></div>
                </div>
              </div>
            )}

            {/* SCORECARDS */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(scorecards.length, 4)}, 1fr)`, gap: '20px', marginBottom: '32px' }}>
              {scorecards.map((s, idx) => (
                <Scorecard key={idx} label={s.label} value={s.value} trend={s.trend} isPositive={s.isPositive} />
              ))}
            </div>

            {/* SECTION HEADER — Insight Report */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {dashboardMeta?.icon || '📊'} {dashboardMeta?.domain || 'Data'} Insights
                </div>
                <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
                  {charts.length} insights · sourced from uploaded data
                </div>
              </div>
              <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 600 }}>Sorted by confidence score</div>
            </div>

            {/* INSIGHT GRID — Matches static PRISM card structure */}
            <div className="insights-grid">
              {charts.map((c, idx) => (
                <div key={c.instanceId} className={`insight-card content fade-in`} style={{ animationDelay: `${idx * 0.08}s` }}>
                  
                  {/* Header: Source + Confidence + Edit */}
                  <div className="ic-header">
                    <span className="ic-source">{c.source}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className="ic-confidence">● {c.conviction}% conviction</span>
                      <button onClick={() => setIsEditing(c.instanceId)} style={{ padding: '4px 8px', background: '#F8FAFC', border: '1px solid #E2E8F0', cursor: 'pointer', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#64748B', fontWeight: 600 }} title="Edit Tile">
                        <Edit3 size={12} color="#64748B" /> Edit
                      </button>
                    </div>
                  </div>

                  {/* Title — Bold finding headline */}
                  <div className="ic-title">{c.title}</div>
                  
                  {/* Chart — With uppercase label */}
                  <div className="chart-wrap">
                    <div className="chart-label">{c.lbl}</div>
                    {c.type === 'bar' && <ChartBar data={getChartData(c, filteredData)} />}
                    {c.type === 'line' && <ChartLine data={getChartData(c, filteredData)} />}
                    {c.type === 'area' && <ChartArea data={getChartData(c, filteredData)} />}
                    {c.type === 'pie' && <ChartPie data={getChartData(c, filteredData)} />}
                    {c.type === 'radar' && <ChartRadar data={getChartData(c, filteredData)} />}
                    {c.type === 'bubble' && <ChartBubble data={getChartData(c, filteredData)} />}
                    {c.type === 'scatter' && <ChartScatter data={getChartData(c, filteredData)} />}
                    {c.type === 'hbar' && <ChartHBar data={getChartData(c, filteredData)} />}
                  </div>

                  {/* Observation Section */}
                  <div className="ic-section">
                    <div className="ic-label obs">📊 OBSERVATION</div>
                    <div className="ic-text">{c.obs}</div>
                    {c.stat && <div className="ic-stat">{c.stat}</div>}
                  </div>
                  
                  {/* Recommendation Section */}
                  <div className="ic-section">
                    <div className="ic-label rec">💡 RECOMMENDATION</div>
                    <div className="ic-text">{c.rec}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CHART EDITOR MODAL */}
      {isEditing && (() => {
        const editChart = charts.find(c => c.instanceId === isEditing);
        if (!editChart) return null;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div className="fade-in" style={{ background: '#fff', width: '100%', maxWidth: '480px', borderRadius: '20px', padding: '32px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 800 }}>✏️ Edit Tile</h3>
                <button onClick={() => setIsEditing(null)} style={{ background: '#F1F5F9', border: 'none', padding: '8px', borderRadius: '50%', cursor: 'pointer' }}>
                  <X size={16} />
                </button>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '8px' }}>Chart Type</label>
                  <select 
                    value={editChart.type}
                    onChange={e => handleUpdateChart(isEditing, { type: e.target.value })}
                    style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #F1F5F9', fontWeight: 500 }}
                  >
                    <option value="bar">📊 Bar Chart</option>
                    <option value="line">📈 Line Chart</option>
                    <option value="area">🌊 Area Chart</option>
                    <option value="pie">🥧 Pie / Donut</option>
                    <option value="hbar">📐 Horizontal Bar</option>
                    <option value="scatter">🔵 Scatter Plot</option>
                    <option value="radar">🕸️ Radar</option>
                    <option value="bubble">🫧 Bubble Plot</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '8px' }}>Dimension (X-Axis)</label>
                  <select 
                    value={editChart.xCol}
                    onChange={e => handleUpdateChart(isEditing, { xCol: e.target.value })}
                    style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #F1F5F9', fontWeight: 500 }}
                  >
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '8px' }}>Metric (Y-Axis)</label>
                  <select 
                    value={editChart.yCol}
                    onChange={e => handleUpdateChart(isEditing, { yCol: e.target.value })}
                    style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #F1F5F9', fontWeight: 500 }}
                  >
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>

              <button 
                onClick={() => setIsEditing(null)}
                style={{ width: '100%', marginTop: '28px', padding: '14px', background: '#0F172A', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 700, cursor: 'pointer', fontSize: '15px' }}
              >
                Apply Changes
              </button>
            </div>
          </div>
        );
      })()}

      <style jsx>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>
    </div>
  );
}
