'use client';
import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { ChartBar, ChartLine, ChartPie, ChartScatter, ChartHBar, Heatmap } from '@/components/charts/AppChart';
import { SCATTER_COLORS, SCATTER_LABELS, HM_DATA } from '@/lib/data';

const BM = {
  content: { label: '📝 Content Insights', cls: 'content' },
  commerce: { label: '🛒 Commerce Insights', cls: 'commerce' },
  communication: { label: '📢 Communication Insights', cls: 'communication' },
  culture: { label: '🌍 Culture Insights', cls: 'culture' },
};

export default function Insights() {
  const [bucket, setBucket] = useState('content');
  const [data, setData] = useState([]);
  
  useEffect(() => {
    fetch(`/api/insights?bucket=${bucket}`)
      .then(res => res.json())
      .then(setData);
  }, [bucket]);

  const meta = BM[bucket];

  return (
    <div className="screen fade-in">
      <Navbar />
      <div className="insights-hero">
        <div className="insights-top">
          <div>
            <div className="ins-eyebrow">Insights Report — Ready</div>
            <div className="ins-title">Nike India — New Product Launch</div>
            <div className="ins-sub">Sportswear · 18–34 · Male + Female · India · Generated Apr 4, 2026</div>
          </div>
          <div className="ins-actions">
            <button className="btn-glass">⬇ Export PDF</button>
            <button className="btn-glass">Share</button>
          </div>
        </div>
        <div className="bucket-tabs-bar">
          <div className="bucket-tabs">
            {Object.keys(BM).map(key => (
              <button 
                key={key} 
                className={`bucket-tab ${bucket === key ? 'active' : ''}`}
                onClick={() => setBucket(key)}
              >
                {BM[key].label}
              </button>
            ))}
          </div>
          <div className="ins-meta">✅ 20 insights · 5 chart types · 7 data sources</div>
        </div>
      </div>
      
      <div className="insights-body">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700 }}>{meta.label}</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>{data.length} insights · sourced from live data platforms</div>
          </div>
          <div className="sort-pill">Sorted by confidence score</div>
        </div>
        
        <div className="insights-grid">
          {data.map((ins, i) => (
            <div key={i} className={`insight-card ${meta.cls} ${ins.fullWidth ? 'full-width' : ''} fade-in`} style={{ animationDelay: `${i * 0.08}s` }}>
              <div className="ic-header">
                <span className="ic-source">{ins.source}</span>
                <span className="ic-confidence">● {ins.confidence}% confidence</span>
              </div>
              <div className="ic-title">{ins.title}</div>
              
              {ins.chartType || ins.isHeatmap ? (
                <div className="chart-wrap">
                  <div className="chart-label">{ins.lbl}</div>
                  {ins.chartType === 'bar' && <ChartBar data={ins.chartData} extraOptions={ins.chartExtra} />}
                  {ins.chartType === 'hbar' && <ChartHBar data={ins.chartData} extraOptions={ins.chartExtra} />}
                  {ins.chartType === 'line' && <ChartLine data={ins.chartData} extraOptions={ins.chartExtra} />}
                  {ins.chartType === 'pie' && <ChartPie data={ins.chartData} extraOptions={ins.chartExtra} />}
                  {ins.chartType === 'scatter' && <ChartScatter data={ins.chartData} extraOptions={ins.chartExtra} />}
                  {ins.isHeatmap && <Heatmap data={HM_DATA} />}
                  
                  {ins.isScatter && (
                    <div className="scatter-legend">
                      {SCATTER_LABELS.map((l, j) => (
                        <div key={j} className="sl-item">
                          <div className="sl-dot" style={{ background: SCATTER_COLORS[j] }}></div>
                          {l}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
              
              <div className="ic-section">
                <div className="ic-label obs">📊 Observation</div>
                <div className="ic-text">{ins.obs}</div>
                <div className="ic-stat">{ins.stat}</div>
              </div>
              <div className="ic-section">
                <div className="ic-label rec">💡 Recommendation</div>
                <div className="ic-text">{ins.rec}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
