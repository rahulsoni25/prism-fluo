'use client';

import React, { useState, useEffect } from 'react';

const TEMPLATE_VISUAL = {
  executive_briefing:   { icon:'📊', color:'#2563EB', bg:'#EFF6FF', border:'#BFDBFE' },
  client_pitch:         { icon:'🎯', color:'#7C3AED', bg:'#F5F3FF', border:'#DDD6FE' },
  deep_dive:            { icon:'🔍', color:'#4F46E5', bg:'#EEF2FF', border:'#C7D2FE' },
  board_presentation:   { icon:'🏛️', color:'#334155', bg:'#F8FAFC', border:'#CBD5E1' },
  team_update:          { icon:'👥', color:'#059669', bg:'#ECFDF5', border:'#A7F3D0' },
  investor_update:      { icon:'💰', color:'#D97706', bg:'#FFFBEB', border:'#FDE68A' },
  quick_overview:       { icon:'⚡', color:'#0891B2', bg:'#ECFEFF', border:'#A5F3FC' },
};
const DEFAULT_VIS = { icon:'📌', color:'#475569', bg:'#F8FAFC', border:'#E2E8F0' };

const CAT_COLORS = {
  All:'#0F172A', Executive:'#2563EB', Sales:'#059669',
  Research:'#4F46E5', Governance:'#334155', Internal:'#7C3AED',
  Investor:'#D97706', Quick:'#0891B2',
};

export default function TemplateGallery({ onSelectTemplate, analysisId }) {
  const [templates, setTemplates]       = useState([]);
  const [loading, setLoading]           = useState(true);
  const [selectedCat, setSelectedCat]   = useState('All');
  const [generating, setGenerating]     = useState(null); // template id being generated
  const [hoveredId, setHoveredId]       = useState(null);

  useEffect(() => {
    fetch('/api/templates')
      .then(r => r.json())
      .then(d => setTemplates(d.templates || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = async (template) => {
    if (generating) return;
    setGenerating(template.id);
    try {
      const res = await fetch('/api/presentations/generate', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ templateId: template.id, analysisId }),
      });
      if (res.ok) { onSelectTemplate(await res.json()); }
      else        { alert('Failed to generate presentation. Please try again.'); }
    } catch { alert('Error generating presentation'); }
    finally { setGenerating(null); }
  };

  const cats       = ['All', ...new Set(templates.map(t => t.category))];
  const filtered   = selectedCat === 'All' ? templates : templates.filter(t => t.category === selectedCat);

  return (
    <div style={{ width:'100%' }}>
      {/* Header */}
      <div style={{ marginBottom:28 }}>
        <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.12em',
          color:'#7C3AED', marginBottom:8 }}>STEP 1 OF 1</p>
        <h2 style={{ fontSize:26, fontWeight:900, color:'#0F172A', letterSpacing:'-.5px', marginBottom:6 }}>
          Choose a Presentation Style
        </h2>
        <p style={{ color:'#64748B', fontSize:14, lineHeight:1.6 }}>
          Select a template — PRISM will auto-populate every slide with your analysis insights
        </p>
      </div>

      {/* Category pills */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:28 }}>
        {cats.map(cat => {
          const active = selectedCat === cat;
          const col    = CAT_COLORS[cat] || '#475569';
          return (
            <button key={cat} onClick={() => setSelectedCat(cat)} style={{
              padding:'7px 16px', borderRadius:20, border:'none', cursor:'pointer',
              fontSize:12, fontWeight:700, transition:'all .15s',
              background: active ? col : '#F1F5F9',
              color: active ? '#fff' : '#475569',
              boxShadow: active ? `0 4px 12px ${col}30` : 'none',
              transform: active ? 'scale(1.02)' : 'scale(1)',
            }}>{cat}</button>
          );
        })}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'60px 0', gap:14 }}>
          <div style={{ width:36, height:36, borderRadius:'50%', border:'3px solid #E2E8F0',
            borderTopColor:'#7C3AED', animation:'tgspin .8s linear infinite' }} />
          <p style={{ color:'#64748B', fontSize:13 }}>Loading templates…</p>
        </div>
      )}

      {/* Grid */}
      {!loading && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:16 }}>
          {filtered.map(t => {
            const vis     = TEMPLATE_VISUAL[t.id] || DEFAULT_VIS;
            const isHov   = hoveredId === t.id;
            const isGen   = generating === t.id;
            const anyGen  = !!generating;
            return (
              <div key={t.id}
                onMouseEnter={() => !anyGen && setHoveredId(t.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => handleSelect(t)}
                style={{
                  borderRadius:18, overflow:'hidden', cursor: anyGen ? 'not-allowed' : 'pointer',
                  border: isHov ? `2px solid ${vis.color}60` : `2px solid ${vis.border}`,
                  background: vis.bg,
                  boxShadow: isHov ? `0 16px 40px ${vis.color}18` : '0 2px 8px rgba(0,0,0,.04)',
                  transform: isHov ? 'translateY(-4px) scale(1.01)' : 'translateY(0)',
                  transition: 'all .22s cubic-bezier(.34,1.56,.64,1)',
                  opacity: anyGen && !isGen ? .5 : 1,
                }}
              >
                {/* Icon area */}
                <div style={{ padding:'22px 20px 14px', position:'relative' }}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 }}>
                    <span style={{ fontSize:36 }}>{vis.icon}</span>
                    <span style={{
                      fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em',
                      padding:'3px 8px', borderRadius:6,
                      background:`${vis.color}15`, color:vis.color,
                    }}>{t.category}</span>
                  </div>
                  <h3 style={{ fontSize:15, fontWeight:800, color:'#0F172A', marginBottom:6, letterSpacing:'-.2px' }}>
                    {t.name}
                  </h3>
                  <p style={{ fontSize:12, color:'#64748B', lineHeight:1.6, marginBottom:10 }}>
                    {t.description}
                  </p>
                  {t.audience && (
                    <p style={{ fontSize:11, color:vis.color, fontWeight:600, display:'flex', alignItems:'center', gap:5 }}>
                      <span>👥</span> {t.audience}
                    </p>
                  )}
                </div>

                {/* Divider + preview */}
                {t.previewText && (
                  <div style={{ padding:'10px 20px', borderTop:`1px solid ${vis.border}` }}>
                    <p style={{ fontSize:11, color:'#64748B', fontStyle:'italic', lineHeight:1.5 }}>
                      {t.previewText}
                    </p>
                  </div>
                )}

                {/* CTA */}
                <div style={{ padding:'12px 20px 16px' }}>
                  <button
                    disabled={anyGen}
                    style={{
                      width:'100%', padding:'10px 0', border:'none', borderRadius:10,
                      fontSize:12, fontWeight:700, cursor: anyGen ? 'not-allowed' : 'pointer',
                      background: isGen
                        ? `${vis.color}20`
                        : isHov ? vis.color : `${vis.color}15`,
                      color: isGen || isHov ? (isHov && !isGen ? '#fff' : vis.color) : vis.color,
                      transition:'all .15s',
                      display:'flex', alignItems:'center', justifyContent:'center', gap:7,
                    }}
                  >
                    {isGen ? (
                      <>
                        <span style={{ width:12, height:12, borderRadius:'50%', border:`2px solid ${vis.color}`,
                          borderTopColor:'transparent', animation:'tgspin .7s linear infinite', display:'inline-block' }} />
                        Generating…
                      </>
                    ) : 'Use This Template →'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign:'center', padding:'48px 0', color:'#94A3B8', fontSize:14 }}>
          No templates in this category
        </div>
      )}

      <style>{`@keyframes tgspin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
