'use client';
import { useState, useRef, useMemo, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import Papa from 'papaparse';
import * as xlsx from 'xlsx';
import { 
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, 
  BarElement, Title, Tooltip, Legend, Filler, RadialLinearScale, ArcElement
} from 'chart.js';
import { Line, Bar, Doughnut, Radar, Scatter, Bubble } from 'react-chartjs-2';
import { 
  UploadCloud, Edit3, X, Layers, Brain, Zap, ShieldCheck, 
  Plus, Send, BarChart3, Search, Cloud, Activity, Trash2, ArrowUpRight,
  Database, Globe, Share2, ShoppingCart, Info, CheckCircle2, Loader2
} from 'lucide-react';
import AiChat from '@/components/AiChat';
import { 
  ChartBar, 
  ChartLine, 
  ChartPie, 
  ChartHBar, 
  ChartScatter, 
  Heatmap 
} from '@/components/charts/AppChart';

// Register ChartJS
ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement, 
  Title, Tooltip, Legend, Filler, RadialLinearScale, ArcElement
);

export default function UnifiedDashboard() {
  const [pendingFiles, setPendingFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadId, setUploadId] = useState(null);
  const [unifiedInsights, setUnifiedInsights] = useState(null);
  const [isEditing, setIsEditing] = useState(null);
  const [editedContent, setEditedContent] = useState({});
  const [activeTab, setActiveTab] = useState('insights'); // 'insights' or 'raw'
  const [cardViews, setCardViews] = useState({}); // { cardId: 'insight' | 'raw' }
  const [cardRawData, setCardRawData] = useState({}); // { cardId: data[] }
  const [loadingRaw, setLoadingRaw] = useState({}); // { cardId: boolean }
  const [processingStep, setProcessingStep] = useState(0);
  
  const STEPS = [
    { label: 'Ingesting Multi-sheet Data', icon: <Database size={16}/> },
    { label: 'Identifying Entities & Geographies', icon: <Globe size={16}/> },
    { label: 'Cross-referencing Global Indices', icon: <Layers size={16}/> },
    { label: 'Synthesizing Strategic Narratives', icon: <Brain size={16}/> },
    { label: 'Finalizing Executive Dashboard', icon: <CheckCircle2 size={16}/> }
  ];

  const toggleCardView = async (card) => {
    const isNowRaw = cardViews[card.id] === 'raw';
    const nextView = isNowRaw ? 'insight' : 'raw';
    
    setCardViews(prev => ({ ...prev, [card.id]: nextView }));

    if (nextView === 'raw' && !cardRawData[card.id]) {
      setLoadingRaw(prev => ({ ...prev, [card.id]: true }));
      try {
        // Try to fetch real data if we have a datasetId, else use chartData as fallback
        const datasetId = card.charts?.[0]?.datasetId;
        if (datasetId && datasetId.includes(':')) {
          const [uId, sName] = datasetId.split(':');
          const res = await fetch(`/api/uploads/${uId}/sheets/${sName}/data`);
          const data = await res.json();
          setCardRawData(prev => ({ ...prev, [card.id]: data }));
        } else if (card.chartData) {
          // Fallback: transform chartData into a simple table
          const transformed = card.chartData.labels.map((l, i) => {
            const entry = { Label: l };
            card.chartData.datasets.forEach(ds => { entry[ds.label || 'Value'] = ds.data[i]; });
            return entry;
          });
          setCardRawData(prev => ({ ...prev, [card.id]: transformed }));
        }
      } catch (e) {
        console.error('Raw data fetch failed:', e);
      } finally {
        setLoadingRaw(prev => ({ ...prev, [card.id]: false }));
      }
    }
  };

  const fileInputRef = useRef(null);

  // ---- FILE HANDLING ----

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setPendingFiles(prev => [...prev, ...files.map(f => ({ file: f, id: Math.random().toString(36).substr(2, 9) }))]);
  };

  const removeFile = (id) => {
    setPendingFiles(prev => prev.filter(f => f.id !== id));
  };

  const startSynthesis = async () => {
    if (pendingFiles.length === 0) return;
    setIsProcessing(true);
    setUnifiedInsights(null);
    setProcessingStep(0);

    try {
      // 1. Parallel Uploads with Unified Session
      console.log('📤 Starting parallel session uploads...');
      const sessionId = crypto.randomUUID();

      const uploadPromises = pendingFiles.map(async (item) => {
        const formData = new FormData();
        formData.append('file', item.file);
        formData.append('sessionId', sessionId); // Link all to one session
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        return res.json();
      });

      const uploadResults = await Promise.all(uploadPromises);
      const allUploadIds = uploadResults.map(r => r.uploadId).filter(Boolean);
      
      if (allUploadIds.length === 0) throw new Error('No files were successfully uploaded.');

      const joinedIds = allUploadIds.join(',');
      setUploadId(joinedIds);

      // 2. Start UI Animation Steps (Initial steps)
      setProcessingStep(1); // Identifying
      setTimeout(() => setProcessingStep(2), 1500); // Cross-referencing
      setTimeout(() => setProcessingStep(3), 3000); // Synthesizing

      // 3. Parallel Synthesis Fetch
      console.log(`🧠 Insight Engine: Synthesizing batch session ${sessionId}...`);

      const insightRes = await fetch(`/api/uploads/${joinedIds}/insights?sessionId=${sessionId}`);

      const insightData = await insightRes.json();

      if (!insightRes.ok || !insightData.insightCards) {
         throw new Error(insightData.error || 'Synthesis engine returned an invalid response.');
      }

      // 4. Finalize UI (Only after fetch is done)
      setProcessingStep(4); // Finalizing
      
      setTimeout(() => {
        setUnifiedInsights(insightData.insightCards);
        setIsProcessing(false);
        console.log('✨ Dashboard Finalized.');
      }, 1500);

    } catch (err) {
      console.error('Synthesis Error:', err);
      alert(`Synthesis failed: ${err.message}`);
      setIsProcessing(false);
    }
  };



  // ---- PREMIUM COLOR PALETTES ----
  const PALETTES = {
    ocean:    ['#0EA5E9', '#38BDF8', '#7DD3FC', '#BAE6FD', '#E0F2FE'],
    emerald:  ['#10B981', '#34D399', '#6EE7B7', '#A7F3D0', '#D1FAE5'],
    violet:   ['#7C3AED', '#8B5CF6', '#A78BFA', '#C4B5FD', '#DDD6FE'],
    sunset:   ['#F59E0B', '#FBBF24', '#FCD34D', '#FDE68A', '#FEF3C7'],
    rose:     ['#F43F5E', '#FB7185', '#FDA4AF', '#FECDD3', '#FFE4E6'],
    slate:    ['#475569', '#64748B', '#94A3B8', '#CBD5E1', '#E2E8F0'],
    multi:    ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'],
    gradient: ['rgba(59,130,246,0.85)', 'rgba(16,185,129,0.85)', 'rgba(124,58,237,0.85)', 'rgba(245,158,11,0.85)', 'rgba(239,68,68,0.85)'],
  };

  // ---- SMART CHART TYPE RESOLVER ----
  // Automatically picks the best chart type based on the insight's intent
  const resolveChartType = (card) => {
    const specId = (card.charts?.[0]?.chartSpecId || '').toLowerCase();
    
    // Direct mappings from chartSpecId
    const directMap = {
      'line': 'line', 'trend': 'line', 'rank_trend': 'area',
      'bar': 'bar', 'top_primary': 'hbar', 'keyword_tiers': 'grouped_bar',
      'distribution': 'bar', 'growth': 'bar',
      'hbar': 'hbar', 'horizontal': 'hbar',
      'pie': 'doughnut', 'doughnut': 'doughnut', 'sentiment_split': 'doughnut', 'source_split': 'doughnut',
      'radar': 'radar', 'overindex_radar': 'radar', 'sentiment_radar': 'radar',
      'scatter': 'scatter', 'bubble': 'bubble',
      'area': 'area', 'stacked': 'stacked_bar', 'stacked_bar': 'stacked_bar',
      'grouped_bar': 'grouped_bar', 'traffic_mix': 'stacked_bar',
    };

    if (directMap[specId]) return directMap[specId];

    // Infer from topic/title if no direct match
    const title = (card.title || '').toLowerCase();
    const topic = (card.topic || '').toLowerCase();
    
    if (title.includes('trend') || title.includes('velocity') || title.includes('over time')) return 'line';
    if (title.includes('distribution') || title.includes('split') || title.includes('share')) return 'doughnut';
    if (title.includes('ranking') || title.includes('top ') || title.includes('comparison')) return 'hbar';
    if (title.includes('vs') || title.includes('correlation')) return 'scatter';
    if (title.includes('sentiment') || title.includes('affinity') || title.includes('radar')) return 'radar';
    if (title.includes('tier') || title.includes('segment') || title.includes('category')) return 'grouped_bar';
    if (title.includes('growth') || title.includes('momentum')) return 'area';
    if (topic.includes('sentiment')) return 'radar';
    if (topic.includes('traffic')) return 'stacked_bar';

    return 'bar';
  };

  // ---- CHART DATA BUILDER ----
  const getChartData = (card, chartType) => {
    // 1. If the card already has actual data from the LLM, style it
    if (card.chartData && card.chartData.labels && card.chartData.datasets) {
      const palette = PALETTES.multi;
      return {
        ...card.chartData,
        datasets: card.chartData.datasets.map((ds, i) => {
          const color = palette[i % palette.length];
          const base = { ...ds };

          if (chartType === 'line' || chartType === 'area') {
            return { ...base, borderColor: color, backgroundColor: color.replace(')', ',0.12)').replace('rgb', 'rgba'), fill: chartType === 'area', tension: 0.4, pointRadius: 3, pointHoverRadius: 6, borderWidth: 2.5 };
          }
          if (chartType === 'doughnut') {
            return { ...base, backgroundColor: palette.slice(0, (ds.data || []).length), borderWidth: 0, hoverOffset: 8 };
          }
          if (chartType === 'radar') {
            return { ...base, backgroundColor: `${color}33`, borderColor: color, pointBackgroundColor: color, borderWidth: 2 };
          }
          if (chartType === 'scatter' || chartType === 'bubble') {
            // Transform flat data arrays to {x,y} point arrays if needed
            if (Array.isArray(ds.data) && ds.data.length > 0 && typeof ds.data[0] === 'number') {
              return { ...base, data: ds.data.map((v, idx) => ({ x: idx * 10 + 10, y: v, r: chartType === 'bubble' ? Math.max(4, v / 10) : undefined })), backgroundColor: `${color}80`, borderColor: color, pointRadius: 6, pointHoverRadius: 8 };
            }
            return { ...base, backgroundColor: `${color}80`, borderColor: color, pointRadius: 6 };
          }
          // bar, hbar, stacked, grouped
          return { ...base, backgroundColor: card.chartData.datasets.length > 1 ? color : palette.slice(0, (ds.data || []).length), borderRadius: 6, borderSkipped: false, barPercentage: 0.7 };
        })
      };
    }

    // 2. Fallback mock generators
    const src = (card.sources && card.sources[0]) || 'Source';

    switch (chartType) {
      case 'line':
        return {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
          datasets: [{ label: src, data: [35, 38, 42, 45, 52, 60, 68, 72, 75, 78, 82, 85], borderColor: '#3B82F6', backgroundColor: 'rgba(59,130,246,0.1)', fill: false, tension: 0.4, pointRadius: 3, borderWidth: 2.5 }]
        };
      case 'area':
        return {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
          datasets: [{ label: src, data: [35, 38, 42, 45, 52, 60, 68, 72, 75, 78, 82, 85], borderColor: '#7C3AED', backgroundColor: 'rgba(124,58,237,0.15)', fill: true, tension: 0.4, pointRadius: 2, borderWidth: 2 }]
        };
      case 'doughnut':
        return {
          labels: ['Segment A', 'Segment B', 'Segment C', 'Others'],
          datasets: [{ data: [38, 28, 20, 14], backgroundColor: PALETTES.multi.slice(0, 4), borderWidth: 0, hoverOffset: 8 }]
        };
      case 'radar':
        return {
          labels: ['Reach', 'Engagement', 'Sentiment', 'Growth', 'Affinity'],
          datasets: [{ label: src, data: [85, 72, 90, 65, 80], backgroundColor: 'rgba(124,58,237,0.15)', borderColor: '#7C3AED', pointBackgroundColor: '#7C3AED', borderWidth: 2 }]
        };
      case 'hbar':
        return {
          labels: ['Category A', 'Category B', 'Category C', 'Category D', 'Category E'],
          datasets: [{ label: src, data: [85, 72, 65, 45, 38], backgroundColor: PALETTES.ocean.slice(0, 5), borderRadius: 6, borderSkipped: false, barPercentage: 0.6 }]
        };
      case 'scatter':
        return {
          datasets: [{ label: src, data: [{x:10,y:20},{x:25,y:45},{x:40,y:35},{x:55,y:60},{x:70,y:50},{x:85,y:75}], backgroundColor: 'rgba(59,130,246,0.6)', borderColor: '#3B82F6', pointRadius: 6 }]
        };
      case 'bubble':
        return {
          datasets: [{ label: src, data: [{x:10,y:20,r:8},{x:25,y:45,r:12},{x:40,y:35,r:6},{x:55,y:60,r:15},{x:70,y:50,r:10}], backgroundColor: 'rgba(16,185,129,0.5)', borderColor: '#10B981' }]
        };
      case 'stacked_bar':
        return {
          labels: ['Q1', 'Q2', 'Q3', 'Q4'],
          datasets: [
            { label: 'Organic', data: [40, 45, 50, 55], backgroundColor: '#3B82F6', borderRadius: 4, borderSkipped: false },
            { label: 'Paid', data: [20, 25, 30, 28], backgroundColor: '#10B981', borderRadius: 4, borderSkipped: false },
            { label: 'Direct', data: [15, 12, 18, 20], backgroundColor: '#F59E0B', borderRadius: 4, borderSkipped: false }
          ]
        };
      case 'grouped_bar':
        return {
          labels: ['Primary', 'Secondary', 'Tertiary'],
          datasets: [
            { label: 'Search Volume', data: [85, 52, 28], backgroundColor: '#3B82F6', borderRadius: 6, barPercentage: 0.7 },
            { label: 'Competition', data: [72, 45, 15], backgroundColor: '#10B981', borderRadius: 6, barPercentage: 0.7 }
          ]
        };
      default: // 'bar'
        return {
          labels: ['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5'],
          datasets: [{ label: src, data: [85, 72, 65, 45, 38], backgroundColor: PALETTES.emerald.slice(0, 5), borderRadius: 6, borderSkipped: false, barPercentage: 0.65 }]
        };
    }
  };

  // ---- CHART OPTIONS PER TYPE (readability-optimized) ----
  const getChartOptions = (chartType) => {
    const tooltipStyle = {
      backgroundColor: '#0F172A',
      titleColor: '#F8FAFC',
      bodyColor: '#CBD5E1',
      padding: 12,
      cornerRadius: 10,
      titleFont: { size: 12, weight: '700', family: 'Inter' },
      bodyFont: { size: 11, family: 'Inter' },
      displayColors: true,
      boxPadding: 4,
    };

    const xAxis = { grid: { display: false }, border: { display: false }, ticks: { font: { size: 10, family: 'Inter', weight: '500' }, color: '#64748B', maxRotation: 45, padding: 4 } };
    const yAxis = { grid: { color: '#F1F5F9', drawBorder: false }, border: { display: false }, ticks: { font: { size: 10, family: 'Inter' }, color: '#94A3B8', padding: 8 } };

    const base = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: tooltipStyle,
      },
      animation: { duration: 800, easing: 'easeOutQuart' },
    };

    switch (chartType) {
      case 'line':
        return { ...base, scales: { x: xAxis, y: { ...yAxis, display: true } } };
      case 'area':
        return { ...base, scales: { x: xAxis, y: { ...yAxis, display: true } } };
      case 'doughnut':
        return {
          ...base,
          cutout: '65%',
          plugins: {
            ...base.plugins,
            legend: { display: true, position: 'right', labels: { font: { size: 11, family: 'Inter', weight: '600' }, color: '#334155', padding: 14, boxWidth: 12, usePointStyle: true, pointStyle: 'circle' } }
          }
        };
      case 'radar':
        return {
          ...base,
          scales: { r: { ticks: { display: false, stepSize: 20 }, grid: { color: '#E2E8F0' }, pointLabels: { font: { size: 11, family: 'Inter', weight: '600' }, color: '#475569' }, beginAtZero: true } },
          plugins: { ...base.plugins, legend: { display: true, position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10 } } }
        };
      case 'hbar':
        return {
          ...base,
          indexAxis: 'y',
          scales: { x: { ...xAxis, grid: { color: '#F1F5F9', display: true }, display: true }, y: { ...yAxis, grid: { display: false }, ticks: { ...yAxis.ticks, font: { size: 11, family: 'Inter', weight: '600' } } } },
        };
      case 'scatter':
      case 'bubble':
        return {
          ...base,
          scales: { x: { ...xAxis, grid: { color: '#F8FAFC', display: true }, title: { display: true, text: 'Volume', font: { size: 11, family: 'Inter' }, color: '#94A3B8' } }, y: { ...yAxis, display: true, title: { display: true, text: 'Performance', font: { size: 11, family: 'Inter' }, color: '#94A3B8' } } },
        };
      case 'stacked_bar':
        return {
          ...base,
          scales: { x: { ...xAxis, stacked: true }, y: { ...yAxis, display: true, stacked: true } },
          plugins: { ...base.plugins, legend: { display: true, position: 'bottom', labels: { font: { size: 10, family: 'Inter', weight: '600' }, boxWidth: 10, usePointStyle: true, pointStyle: 'circle', padding: 16 } } },
        };
      case 'grouped_bar':
        return {
          ...base,
          scales: { x: xAxis, y: { ...yAxis, display: true } },
          plugins: { ...base.plugins, legend: { display: true, position: 'bottom', labels: { font: { size: 10, family: 'Inter', weight: '600' }, boxWidth: 10, usePointStyle: true, pointStyle: 'circle', padding: 16 } } }
        };
      default: // 'bar'
        return { ...base, scales: { x: xAxis, y: { ...yAxis, display: true } } };
    }
  };

  // ---- CHART RENDERER ----
  const renderChart = (card) => {
    const chartType = resolveChartType(card);
    if (card.isHeatmap) return <div style={{ height: '220px' }}><Heatmap data={card.chartData || []} /></div>;

    const data = getChartData(card, chartType);
    const extra = card.chartExtra || {};

    return (
      <div>
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
          Intelligence Visualization Pool
        </div>
        <div style={{ height: '240px', position: 'relative' }}>
          {(chartType === 'bar' || chartType === 'growth' || chartType === 'distribution') && <ChartBar data={data} extraOptions={extra} />}
          {chartType === 'hbar' && <ChartHBar data={data} extraOptions={extra} />}
          {(chartType === 'line' || chartType === 'trend') && <ChartLine data={data} extraOptions={extra} />}
          {(chartType === 'area' || chartType === 'rank_trend') && <ChartLine data={data} extraOptions={{ ...extra, fill: true }} />}
          {chartType === 'doughnut' && <ChartPie data={data} extraOptions={extra} />}
          {chartType === 'scatter' && <ChartScatter data={data} extraOptions={extra} />}
        </div>
      </div>
    );
  };

  // ---- RENDER ----

  return (
    <div className="screen fade-in" style={{ backgroundColor: '#F8FAFC', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
      <Navbar />

      <main style={{ padding: '60px 40px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

          {/* LANDING / UPLOAD QUEUE */}
          {!unifiedInsights && !isProcessing && (
            <div className="fade-in" style={{ textAlign: 'center', marginTop: '40px' }}>
              <div style={{ fontSize: '64px', marginBottom: '24px' }}>🧠</div>
              <h1 style={{ fontSize: '48px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.04em', lineHeight: 1, marginBottom: '16px' }}>
                Universal Strategic Engine
              </h1>
              <p style={{ color: '#64748B', fontSize: '18px', maxWidth: '600px', margin: '0 auto 48px' }}>
                Queue datasets from Helium10, SimilarWeb, Konnect, GWI & more. 
                Our agent will synthesize an Executive Strategic Story across all sources.
              </p>

              <div style={{ maxWidth: '640px', margin: '0 auto' }}>
                {/* UPLOAD ZONE */}
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  style={{ 
                    border: '3px dashed #CBD5E1', padding: '40px', borderRadius: '32px', background: '#fff', cursor: 'pointer', transition: 'all 0.2s',
                    boxShadow: '0 10px 30px -10px rgba(0,0,0,0.05)'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.background = '#F0F7FF'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.background = '#fff'; }}
                >
                  <input type="file" ref={fileInputRef} onChange={handleFileSelect} multiple style={{ display: 'none' }} />
                  <UploadCloud size={48} color="#3B82F6" style={{ margin: '0 auto 16px' }} />
                  <div style={{ fontWeight: 800, fontSize: '18px', color: '#1E293B' }}>Add Your Data Files</div>
                  <div style={{ fontSize: '13px', color: '#94A3B8', marginTop: '8px' }}>Drag & drop multiple CSV or XLSX files</div>
                </div>

                {/* FILE QUEUE */}
                {pendingFiles.length > 0 && (
                  <div className="fade-in" style={{ marginTop: '32px', textAlign: 'left' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Ready for Synthesis ({pendingFiles.length})
                      </h3>
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        style={{ background: '#EFF6FF', color: '#2563EB', border: 'none', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Plus size={14} /> Add Multisheet
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {pendingFiles.map(f => (
                        <div key={f.id} style={{ padding: '16px 20px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ background: '#F1F5F9', padding: '10px', borderRadius: '10px' }}>
                              <Layers size={18} color="#64748B" />
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, color: '#1E293B', fontSize: '14px' }}>{f.file.name}</div>
                              <div style={{ fontSize: '12px', color: '#94A3B8' }}>{(f.file.size / 1024).toFixed(1)} KB</div>
                            </div>
                          </div>
                          <button onClick={() => removeFile(f.id)} style={{ color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer' }}>
                            <Trash2 size={18} />
                          </button>
                        </div>
                      ))}
                    </div>

                    <button 
                      onClick={startSynthesis}
                      style={{ width: '100%', marginTop: '32px', padding: '18px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: '20px', fontWeight: 900, fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: '0 10px 25px -5px rgba(37, 99, 235, 0.4)' }}
                    >
                      <Brain size={20} /> SYNTHESIZE EXECUTIVE STORY
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PROCESSING STATE (AGENTIC) */}
          {isProcessing && (
            <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ position: 'relative', marginBottom: '48px' }}>
                <div className="agent-pulse" style={{ width: '100px', height: '100px', borderRadius: '50%', background: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 2 }}>
                  <Brain size={48} color="#fff" />
                </div>
                <div className="spinning" style={{ position: 'absolute', top: '-10px', left: '-10px', right: '-10px', bottom: '-10px', border: '2px dashed #3B82F6', borderRadius: '50%', opacity: 0.5 }}></div>
              </div>
              
              <h2 style={{ fontSize: '32px', fontWeight: 900, color: '#0F172A', marginBottom: '16px', letterSpacing: '-0.02em' }}>Synthesis in Progress</h2>
              <div style={{ width: '400px', background: '#fff', borderRadius: '24px', padding: '24px', border: '1px solid #E2E8F0', boxShadow: '0 10px 25px -10px rgba(0,0,0,0.05)' }}>
                {STEPS.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: i === STEPS.length - 1 ? 0 : '16px', opacity: processingStep >= i ? 1 : 0.3, transition: 'all 0.5s ease' }}>
                    <div style={{ 
                      width: '24px', height: '24px', borderRadius: '50%', backgroundColor: processingStep > i ? '#10B981' : processingStep === i ? '#3B82F6' : '#F1F5F9',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: processingStep >= i ? '#fff' : '#94A3B8'
                    }}>
                      {processingStep > i ? <CheckCircle2 size={14} /> : processingStep === i ? <Loader2 size={14} className="spinning" /> : s.icon}
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: processingStep === i ? 700 : 500, color: processingStep === i ? '#0F172A' : '#64748B' }}>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DASHBOARD OUTPUT (PROTOTYPE STANDARD) */}
          {unifiedInsights && (
            <div className="fade-in">
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '50px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 900, background: '#3B82F6', color: '#fff', padding: '2px 8px', borderRadius: '4px' }}>EXECUTIVE</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Strategic Intelligence Hub</span>
                  </div>
                  <h1 style={{ fontSize: '42px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.04em', lineHeight: 1 }}>Executive Business Summary</h1>
                  <p style={{ color: '#64748B', marginTop: '12px', fontSize: '16px' }}>Synthesized analysis of {pendingFiles.map(f => f.file.name).join(', ')}</p>
                </div>
                <div style={{ background: '#fff', padding: '16px 24px', borderRadius: '24px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', border: '1px solid #E2E8F0', display: 'flex', gap: '32px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', marginBottom: '8px' }}>DATA SOURCES</div>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                      <Cloud size={18} color="#2563EB" />
                      <Search size={18} color="#7C3AED" />
                      <BarChart3 size={18} color="#10B981" />
                      <Activity size={18} color="#F59E0B" />
                    </div>
                  </div>
                  <div style={{ width: '1px', background: '#F1F5F9' }}></div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', marginBottom: '6px' }}>CONFIDENCE</div>
                    <div style={{ color: '#10B981', fontSize: '18px', fontWeight: 900 }}>HIGH (88%)</div>
                  </div>
                </div>
              </div>

              {/* Insights Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '40px' }}>
                {unifiedInsights.map((c, idx) => (
                  <div key={idx} className="unified-card shadow-xl" style={{ 
                    background: '#fff', borderRadius: '40px', border: '1px solid #E2E8F0', padding: '40px', position: 'relative', transition: 'all 0.3s ease'
                  }}>
                    {/* Card Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        {c.sources?.map(s => (
                          <span key={s} style={{ 
                            fontSize: '11px', fontWeight: 800, background: '#F1F5F9', color: '#475569', 
                            padding: '6px 14px', borderRadius: '30px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '6px'
                          }}>{s}</span>
                        ))}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <button 
                          onClick={() => toggleCardView(c)}
                          style={{ 
                            background: cardViews[c.id] === 'raw' ? '#0F172A' : '#EFF6FF', 
                            color: cardViews[c.id] === 'raw' ? '#fff' : '#2563EB', 
                            border: 'none', padding: '6px 14px', borderRadius: '30px', 
                            fontSize: '11px', fontWeight: 800, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '6px',
                            transition: 'all 0.2s'
                          }}
                        >
                          {cardViews[c.id] === 'raw' ? <BarChart3 size={14}/> : <Database size={14}/>}
                          {cardViews[c.id] === 'raw' ? 'View Insight' : 'View Raw Data'}
                        </button>
                        <div style={{ color: '#10B981', fontSize: '13px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <ShieldCheck size={16} /> {c.conviction}% Conviction
                        </div>
                        <button 
                          onClick={() => { setIsEditing(c.id); setEditedContent({ obs: c.observation, rec: c.recommendation }); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
                        >
                          <Edit3 size={16} />
                        </button>
                      </div>
                    </div>

                    <h3 style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', marginBottom: '32px', lineHeight: 1.1, letterSpacing: '-0.02em' }}>{c.title}</h3>

                    {/* Content Area — Conditional Render */}
                    <div style={{ minHeight: '340px' }}>
                      {cardViews[c.id] === 'raw' ? (
                        <div className="fade-in" style={{ height: '100%' }}>
                          <div style={{ fontSize: '11px', fontWeight: 900, color: '#64748B', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.1em' }}>📡 UNDERLYING DATA POINTS</div>
                          {loadingRaw[c.id] ? (
                            <div style={{ height: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                              <Loader2 className="spinning" size={32} color="#CBD5E1" />
                              <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 600 }}>Pulling from Postgres...</span>
                            </div>
                          ) : (
                            <div style={{ maxHeight: '380px', overflowY: 'auto', borderRadius: '16px', border: '1px solid #F1F5F9' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                                <thead style={{ background: '#F8FAFC', position: 'sticky', top: 0 }}>
                                  <tr>
                                    {cardRawData[c.id] && cardRawData[c.id][0] && Object.keys(cardRawData[c.id][0]).slice(0, 6).map(k => (
                                      <th key={k} style={{ padding: '12px 16px', color: '#64748B', fontWeight: 800, borderBottom: '1px solid #F1F5F9' }}>{k}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {cardRawData[c.id]?.slice(0, 50).map((row, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #F8FAFC' }}>
                                      {Object.values(row).slice(0, 6).map((v, j) => (
                                        <td key={j} style={{ padding: '10px 16px', color: '#1E293B', fontWeight: 500 }}>
                                          {typeof v === 'object' ? JSON.stringify(v).slice(0, 20) + '...' : v}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {(!cardRawData[c.id] || cardRawData[c.id].length === 0) && (
                                <div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8' }}>No records found for this specific slice.</div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="fade-in">
                          {/* Metrics Row */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '40px' }}>
                            {c.metrics?.map((m, i) => (
                              <div key={i} style={{ padding: '20px', background: '#F8FAFC', borderRadius: '24px', border: '1px solid #F1F5F9' }}>
                                <div style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', marginBottom: '8px' }}>{m.label}</div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                                  <span style={{ fontSize: '30px', fontWeight: 900, color: '#0F172A' }}>{m.value}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                          
                          {/* Chart Area */}
                          <div style={{ marginBottom: '40px' }}>
                            {renderChart(c)}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Narrative Section */}
                    <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '32px', marginBottom: '32px', opacity: cardViews[c.id] === 'raw' ? 0.4 : 1, transition: 'opacity 0.2s' }}>
                      <div style={{ fontSize: '11px', fontWeight: 900, color: '#3B82F6', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.1em' }}>📝 THE OBSERVATION</div>
                      <p style={{ fontSize: '16px', color: '#334155', lineHeight: 1.6, fontWeight: 500 }}>
                        {isEditing === c.id ? 
                          <textarea 
                            value={editedContent.obs} 
                            onChange={e => setEditedContent(prev => ({ ...prev, obs: e.target.value }))}
                            style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #3B82F6', outline: 'none', background: '#F0F7FF' }}
                          /> : 
                          c.observation
                        }
                      </p>
                    </div>

                    <div style={{ padding: '24px', background: '#ECFDF5', borderRadius: '24px', border: '1px solid #D1FAE5' }}>
                      <div style={{ fontSize: '11px', fontWeight: 900, color: '#059669', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '0.1em' }}>
                        💡 ADVISORY RECOMMENDATION
                      </div>
                      {isEditing === c.id ? 
                        <textarea 
                          value={editedContent.rec} 
                          onChange={e => setEditedContent(prev => ({ ...prev, rec: e.target.value }))}
                          style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #10B981', outline: 'none', background: '#F0FDF4' }}
                        /> : 
                        <p style={{ fontSize: '15px', color: '#065F46', fontWeight: 700, lineHeight: 1.5 }}>{c.recommendation}</p>
                      }
                    </div>

                    {isEditing === c.id && (
                      <button 
                        onClick={() => {
                          const updated = [...unifiedInsights];
                          updated[idx].observation = editedContent.obs;
                          updated[idx].recommendation = editedContent.rec;
                          setUnifiedInsights(updated);
                          setIsEditing(null);
                        }}
                        style={{ width: '100%', marginTop: '20px', padding: '14px', background: '#0F172A', color: '#fff', borderRadius: '16px', fontWeight: 800, cursor: 'pointer', border: 'none' }}
                      >
                        Save Changes
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ marginTop: '60px', textAlign: 'center', display: 'flex', justifyContent: 'center', gap: '20px' }}>
                <button 
                  onClick={() => { setUnifiedInsights(null); setPendingFiles([]); setUploadId(null); }}
                  style={{ background: '#fff', color: '#64748B', border: '1px solid #E2E8F0', padding: '12px 24px', borderRadius: '20px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Start New Session
                </button>
                <button 
                  onClick={() => window.location.href = '/dashboards'}
                  style={{ background: '#0F172A', color: '#fff', border: 'none', padding: '12px 32px', borderRadius: '20px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  Explore Strategic Dashboards <ArrowUpRight size={18} />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* AI ANALYST FLOATING Sparkle */}
      {unifiedInsights && unifiedInsights.length > 0 && (
        <AiChat dataContext={{
          uploadId,
          insightsCount: unifiedInsights.length,
          sources: pendingFiles.map(f => f.file.name),
          summary: unifiedInsights[unifiedInsights.length - 1]?.observation || 'Synthesis complete.'
        }} />
      )}

      <style jsx>{`
        @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.8; } }
        .agent-pulse { animation: pulse 2s infinite ease-in-out; }
        .unified-card:hover { transform: translateY(-4px); }
        .fade-in { animation: fadeIn 0.5s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
