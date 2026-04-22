'use client';
import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { 
  BarChart3, 
  Share2, 
  ShoppingCart, 
  Globe, 
  Activity, 
  ArrowUpRight, 
  ShieldCheck, 
  Layers,
  ChevronRight,
  TrendingUp,
  Target,
  Zap,
  Brain,
  Search,
  MapPin
} from 'lucide-react';
import { 
  ChartBar, 
  ChartLine, 
  ChartPie, 
  ChartHBar, 
  ChartScatter, 
  Heatmap 
} from '@/components/charts/AppChart';
import ChatCopilot from '@/components/ChatCopilot';

import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend, Filler, RadialLinearScale, ArcElement
} from 'chart.js';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  Title, Tooltip, Legend, Filler, RadialLinearScale, ArcElement
);

const PILLARS = [
  { id: 'content', label: 'Content Insights', icon: <Share2 />, color: '#3B82F6', theme: 'sky' },
  { id: 'commerce', label: 'Commerce Insights', icon: <ShoppingCart />, color: '#10B981', theme: 'emerald' },
  { id: 'communication', label: 'Communication', icon: <Activity />, color: '#8B5CF6', theme: 'violet' },
  { id: 'culture', label: 'Culture & Audit', icon: <Globe />, color: '#F59E0B', theme: 'amber' },
];

export default function DashboardsGrid() {
  const [activePillar, setActivePillar] = useState('content');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [briefMeta, setBriefMeta] = useState({ title: 'Loading...', confidence: '0%', filename: '' });

  useEffect(() => {
    setLoading(true);
    fetch(`/api/insights?bucket=${activePillar}`)
      .then(res => res.json())
      .then(d => {
        setData(Array.isArray(d) ? d : []);
        setLoading(false);
        
        // Calculate aggregate confidence from the first few cards if available
        if (d && d.length > 0) {
          const avg = d.reduce((acc, curr) => acc + (curr.conviction || curr.confidence || 0), 0) / d.length;
          setBriefMeta(prev => ({ ...prev, confidence: `${Math.round(avg)}% Grounded` }));
        }
      });
  }, [activePillar]);

  useEffect(() => {
    // Fetch latest upload info for the header
    fetch('/api/upload/latest')
      .then(res => res.json())
      .then(meta => {
        setBriefMeta(prev => ({ 
          ...prev, 
          title: meta.filename || 'New Intelligence Brief',
          filename: meta.filename
        }));
      })
      .catch(() => setBriefMeta(prev => ({ ...prev, title: 'Nike India — Q2 Launch' })));
  }, []);

  const resolveChartType = (card) => {
    if (card.chartType) return card.chartType;
    if (card.charts && card.charts[0]) {
      const id = card.charts[0].chartSpecId || '';
      if (id.includes('trend') || id.includes('line')) return 'line';
      if (id.includes('pie') || id.includes('share')) return 'pie';
      if (id.includes('scatter')) return 'scatter';
      if (id.includes('hbar')) return 'hbar';
    }
    return 'bar';
  };

  const getChartData = (card, type) => {
    if (!card.chartData) return { labels: [], datasets: [] };
    const palette = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];
    return {
      labels: card.chartData.labels || [],
      datasets: (card.chartData.datasets || []).map((ds, i) => ({
        ...ds,
        backgroundColor: type === 'pie' ? palette : palette[i % palette.length],
        borderColor: palette[i % palette.length],
        borderWidth: 0,
        borderRadius: type === 'bar' || type === 'hbar' ? 8 : 0,
      }))
    };
  };

  return (
    <div className="screen fade-in" style={{ background: '#F8FAFC', minHeight: '100vh' }}>
      <Navbar />
      
      <div style={{ padding: 'clamp(16px, 4vw, 40px) clamp(16px, 5vw, 60px)' }}>
        {/* Header Section */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ fontSize: '10px', fontWeight: 900, background: '#0F172A', color: '#fff', padding: '2px 8px', borderRadius: '4px' }}>EXECUTIVE COMMAND</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748B' }}>PRISM STRATEGIC INTELLIGENCE</span>
            </div>
            <h1 style={{ fontSize: '42px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.04em', lineHeight: 1 }}>Unified Strategic Pillars</h1>
          </div>
          
          <div style={{ background: '#fff', padding: '12px 24px', borderRadius: '20px', border: '1px solid #E2E8F0', display: 'flex', gap: '32px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', marginBottom: '4px' }}>ACTIVE BRIEF</div>
              <div style={{ fontWeight: 800, color: '#0F172A' }}>{briefMeta.title}</div>
            </div>
            <div style={{ width: '1px', background: '#F1F5F9' }}></div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', marginBottom: '4px' }}>CONFIDENCE</div>
              <div style={{ color: '#10B981', fontWeight: 800 }}>{briefMeta.confidence}</div>
            </div>
          </div>
        </div>

        {/* Pillar Navigation */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))', gap: '16px', marginBottom: '40px' }}>
          {PILLARS.map(p => (
            <div 
              key={p.id}
              onClick={() => setActivePillar(p.id)}
              style={{
                background: activePillar === p.id ? p.color : '#fff',
                color: activePillar === p.id ? '#fff' : '#0F172A',
                padding: '24px',
                borderRadius: '24px',
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                border: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                boxShadow: activePillar === p.id ? `0 10px 25px -5px ${p.color}44` : '0 4px 6px -1px rgba(0,0,0,0.02)'
              }}
            >
              <div style={{ 
                background: activePillar === p.id ? 'rgba(255,255,255,0.2)' : `${p.color}11`,
                color: activePillar === p.id ? '#fff' : p.color,
                width: '48px', height: '48px', borderRadius: '12px',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {p.icon}
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 800, opacity: 0.8, textTransform: 'uppercase' }}>Pillar</div>
                <div style={{ fontSize: '18px', fontWeight: 900 }}>{p.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Dashboard Content Area */}
        <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 600px), 1fr))', gap: '30px' }}>
          {/* Main Insights Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            {loading ? (
              <div style={{ height: '400px', background: '#fff', borderRadius: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Activity className="spinning" size={48} color="#94A3B8" />
              </div>
            ) : data.length === 0 ? (
              <div style={{ height: '400px', background: '#fff', borderRadius: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }}>
                <Brain size={48} style={{ marginBottom: '16px', opacity: 0.2 }} />
                <p style={{ fontWeight: 800 }}>No insights synthesized for this pillar yet.</p>
              </div>
            ) : (
              data.map((ins, idx) => {
                const chartType = resolveChartType(ins);
                const chartData = getChartData(ins, chartType);
                const obs = ins.observation || ins.obs;
                const rec = ins.recommendation || ins.rec;
                const mainMetric = ins.metrics?.[0] || { label: 'Signal', value: ins.stat || 'N/A' };

                return (
                  <div key={idx} style={{ background: '#fff', borderRadius: '32px', padding: '40px', border: '1px solid #E2E8F0', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        {(ins.sources || []).map(s => (
                          <span key={s} style={{ fontSize: '11px', fontWeight: 800, background: '#F1F5F9', color: '#475569', padding: '6px 14px', borderRadius: '30px' }}>{s}</span>
                        ))}
                        <span style={{ fontSize: '11px', fontWeight: 800, background: '#ECFDF5', color: '#059669', padding: '6px 14px', borderRadius: '30px' }}>{ins.conviction || ins.confidence || 0}% Confidence</span>
                      </div>
                    </div>
                    
                    <h3 style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', marginBottom: '24px', letterSpacing: '-0.02em' }}>{ins.title}</h3>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: '24px', alignItems: 'center' }}>
                      <div>
                        <div style={{ marginBottom: '24px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 900, color: PILLARS.find(p => p.id === activePillar).color, textTransform: 'uppercase', marginBottom: '8px' }}>THE OBSERVATION</div>
                          <p style={{ color: '#334155', lineHeight: 1.6, fontSize: '16px' }}>{obs}</p>
                        </div>
                        <div style={{ padding: '20px', background: '#F8FAFC', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
                          <div style={{ background: '#fff', padding: '10px', borderRadius: '12px' }}>
                            <Activity size={24} color={PILLARS.find(p => p.id === activePillar).color} />
                          </div>
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: 800, color: '#94A3B8' }}>{mainMetric.label.toUpperCase()}</div>
                            <div style={{ fontWeight: 900, fontSize: '15px', color: '#0F172A' }}>{mainMetric.value}</div>
                          </div>
                        </div>
                      </div>
                      
                      <div style={{ height: '240px', position: 'relative', width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <div style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase' }}>Visualization Pool</div>
                          <div style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8' }}>{ins.lbl || 'GROUNDED EVIDENCE'}</div>
                        </div>
                        
                        <div style={{ height: '200px' }}>
                          {ins.isHeatmap ? (
                            <Heatmap data={ins.chartData || []} />
                          ) : (
                            <>
                              {chartType === 'bar' && <ChartBar data={chartData} extraOptions={ins.chartExtra} />}
                              {chartType === 'line' && <ChartLine data={chartData} extraOptions={ins.chartExtra} />}
                              {chartType === 'pie' && <ChartPie data={chartData} extraOptions={ins.chartExtra} />}
                              {chartType === 'hbar' && <ChartHBar data={chartData} extraOptions={ins.chartExtra} />}
                              {chartType === 'scatter' && <ChartScatter data={chartData} extraOptions={ins.chartExtra} />}
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: '32px', paddingTop: '32px', borderTop: '1px solid #F1F5F9' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '15px', padding: '24px', background: '#ECFDF5', borderRadius: '24px' }}>
                        <div style={{ background: '#059669', color: '#fff', width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Zap size={16} />
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 900, color: '#059669', textTransform: 'uppercase', marginBottom: '4px' }}>ADVISORY RECOMMENDATION</div>
                          <p style={{ color: '#065F46', fontWeight: 600, fontSize: '15px', lineHeight: 1.5 }}>{rec}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Side Context Bar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            <div style={{ background: '#0F172A', color: '#fff', padding: '32px', borderRadius: '32px', boxShadow: '0 10px 25px -5px rgba(15,23,42,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <Brain size={24} color="#3B82F6" />
                <span style={{ fontWeight: 800, fontSize: '18px' }}>Strategic Context</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 800, color: '#64748B', marginBottom: '8px', textTransform: 'uppercase' }}>Current Objective</div>
                  <div style={{ fontSize: '14px', lineHeight: 1.5 }}>
                    {briefMeta.filename ? `Analysis of ${briefMeta.filename} — identifying structural opportunities and market shifts.` : "PRISM Unified Intelligence — capturing market nuances through cross-channel data synthesis."}
                  </div>
                </div>
                <div style={{ padding: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <span style={{ fontSize: '11px', color: '#94A3B8' }}>Pillar Health</span>
                    <span style={{ fontSize: '11px', color: '#10B981' }}>Optimal</span>
                  </div>
                  <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: '85%', height: '100%', background: '#3B82F6' }}></div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ background: '#fff', padding: '32px', borderRadius: '32px', border: '1px solid #E2E8F0' }}>
              <h4 style={{ fontSize: '18px', fontWeight: 900, marginBottom: '20px' }}>Pillar Meta</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {[
                { l: 'Data Source', v: briefMeta.filename || 'N/A' },
                { l: 'Synthesis', v: 'Real-time' },
                { l: 'Conviction', v: briefMeta.confidence || 'Calculating...' }
                ].map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid #F1F5F9' }}>
                    <span style={{ fontSize: '13px', color: '#64748B' }}>{m.l}</span>
                    <span style={{ fontSize: '13px', fontWeight: 800 }}>{m.v}</span>
                  </div>
                ))}
              </div>
              <button style={{ width: '100%', marginTop: '24px', padding: '14px', background: '#F1F5F9', color: '#2563EB', border: 'none', borderRadius: '16px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                Full Audit Log <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <ChatCopilot sessionId={data[0]?.upload_id || ''} />

      
      <style jsx>{`
        .spinning { animation: spin 2s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .fade-in { animation: fadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1); }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
