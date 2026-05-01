'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

const TEMPLATE_META = {
  'Executive Briefing':    { icon: '📊', color: '#2563EB' },
  'Client Pitch Deck':     { icon: '🎯', color: '#7C3AED' },
  'Deep Dive Analysis':    { icon: '🔍', color: '#4F46E5' },
  'Board Presentation':    { icon: '🏛️', color: '#334155' },
  'Internal Team Update':  { icon: '👥', color: '#059669' },
  'Investor Update':       { icon: '💰', color: '#D97706' },
  'Quick Overview':        { icon: '⚡', color: '#0891B2' },
};
const DEFAULT_META = { icon: '📌', color: '#475569' };

function StatusPill({ status }) {
  const cfg = {
    generated: { dot:'#059669', bg:'rgba(5,150,105,.1)',  text:'#059669', label:'Ready'      },
    generating: { dot:'#2563EB', bg:'rgba(37,99,235,.1)', text:'#2563EB', label:'Generating…' },
    failed:     { dot:'#DC2626', bg:'rgba(220,38,38,.1)', text:'#DC2626', label:'Failed'      },
  }[status] || { dot:'#94A3B8', bg:'rgba(148,163,184,.1)', text:'#94A3B8', label:status };
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px',
      borderRadius:20, background:cfg.bg, color:cfg.text, fontSize:11, fontWeight:700 }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:cfg.dot, display:'inline-block',
        animation: status==='generating' ? 'ppulse 1.5s infinite' : 'none' }} />
      {cfg.label}
    </span>
  );
}

function PresentationCard({ pres }) {
  const { icon, color } = TEMPLATE_META[pres.template_name] || DEFAULT_META;
  const [hover, setHover] = useState(false);
  const date = new Date(pres.created_at).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });

  return (
    <Link href={`/presentations/${pres.id}`} style={{ textDecoration:'none', display:'block' }}>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          background:'#fff', borderRadius:20, overflow:'hidden',
          border: hover ? `1.5px solid ${color}50` : '1.5px solid #E2E8F0',
          boxShadow: hover ? `0 20px 48px ${color}18, 0 4px 16px rgba(0,0,0,.07)` : '0 2px 8px rgba(0,0,0,.05)',
          transform: hover ? 'translateY(-4px)' : 'translateY(0)',
          transition: 'all .25s cubic-bezier(.34,1.56,.64,1)',
          cursor: 'pointer',
        }}
      >
        {/* Colour bar top */}
        <div style={{
          background:`linear-gradient(135deg,${color}EE,${color}88)`,
          padding:'22px 22px 18px', position:'relative', overflow:'hidden',
        }}>
          <div style={{
            position:'absolute', inset:0, opacity:.07,
            backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 18px,rgba(255,255,255,.8) 18px,rgba(255,255,255,.8) 19px),repeating-linear-gradient(90deg,transparent,transparent 18px,rgba(255,255,255,.8) 18px,rgba(255,255,255,.8) 19px)',
          }} />
          <div style={{ position:'relative', display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
            <span style={{ fontSize:34 }}>{icon}</span>
            <StatusPill status={pres.status} />
          </div>
          <h3 style={{ marginTop:10, fontSize:16, fontWeight:800, color:'#fff',
            letterSpacing:'-.3px', lineHeight:1.25, position:'relative',
            textShadow:'0 1px 3px rgba(0,0,0,.2)' }}>
            {pres.brief_name}
          </h3>
        </div>

        {/* Body */}
        <div style={{ padding:'16px 20px 0' }}>
          <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', color:'#94A3B8', marginBottom:3 }}>Template</p>
          <p style={{ fontSize:13, fontWeight:600, color:'#334155', marginBottom:10 }}>{pres.template_name}</p>
          {pres.headline && (
            <>
              <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', color:'#94A3B8', marginBottom:3 }}>Headline</p>
              <p style={{ fontSize:13, color:'#475569', lineHeight:1.5, marginBottom:10,
                display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{pres.headline}</p>
            </>
          )}
          <p style={{ fontSize:11, color:'#94A3B8', paddingBottom:0 }}>{date}</p>
        </div>

        {/* Actions */}
        <div style={{ display:'flex', gap:0, marginTop:14, borderTop:'1px solid #F1F5F9' }}>
          <button style={{ flex:1, padding:'11px 0', border:'none', background:'transparent',
            fontSize:12, fontWeight:700, color, cursor:'pointer', borderRight:'1px solid #F1F5F9' }}>
            View →
          </button>
          <a href={`/api/presentations/${pres.id}/download`} onClick={e => e.stopPropagation()}
            style={{ flex:1, padding:'11px 0', border:'none', background:'transparent',
              fontSize:12, fontWeight:700, color:'#059669', cursor:'pointer',
              textAlign:'center', textDecoration:'none', display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>
            ⬇ PPT
          </a>
        </div>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div style={{ background:'#fff', borderRadius:24, border:'1.5px dashed #E2E8F0',
      padding:'56px 40px', textAlign:'center', maxWidth:600, margin:'0 auto' }}>
      <div style={{ fontSize:54, marginBottom:14 }}>🎨</div>
      <h2 style={{ fontSize:26, fontWeight:900, color:'#0F172A', marginBottom:8, letterSpacing:'-.5px' }}>No Presentations Yet</h2>
      <p style={{ color:'#64748B', fontSize:15, marginBottom:36, lineHeight:1.6 }}>
        Auto-generate polished decks from your intelligence reports in seconds
      </p>

      <div style={{ display:'flex', flexDirection:'column', gap:10, textAlign:'left', marginBottom:36 }}>
        {[
          { n:1, color:'#2563EB', bg:'#EFF6FF', border:'#BFDBFE', title:'Open any Analysis', sub:'Go to My Analyses and pick a report' },
          { n:2, color:'#7C3AED', bg:'#F5F3FF', border:'#DDD6FE', title:'Click "Generate Presentation"', sub:'Top-right of the report, next to export buttons' },
          { n:3, color:'#059669', bg:'#ECFDF5', border:'#A7F3D0', title:'Pick a template & download', sub:'7 styles including Executive, Client Pitch, Board…' },
        ].map(s => (
          <div key={s.n} style={{ display:'flex', alignItems:'flex-start', gap:14,
            padding:'13px 16px', borderRadius:14, background:s.bg, border:`1px solid ${s.border}` }}>
            <div style={{ width:28, height:28, borderRadius:'50%', background:s.color,
              color:'#fff', fontWeight:800, fontSize:12, display:'flex', alignItems:'center',
              justifyContent:'center', flexShrink:0 }}>{s.n}</div>
            <div>
              <p style={{ fontWeight:700, color:'#0F172A', fontSize:13, marginBottom:2 }}>{s.title}</p>
              <p style={{ color:'#64748B', fontSize:12 }}>{s.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <Link href="/insights" style={{ display:'inline-flex', alignItems:'center', gap:8,
        padding:'13px 28px', borderRadius:12,
        background:'linear-gradient(135deg,#2563EB,#7C3AED)',
        color:'#fff', fontWeight:700, fontSize:14, textDecoration:'none',
        boxShadow:'0 6px 20px rgba(37,99,235,.3)' }}>
        View My Analyses →
      </Link>
    </div>
  );
}

export default function PresentationsPage() {
  const [presentations, setPresentations] = useState([]);
  const [loading, setLoading]             = useState(true);

  useEffect(() => {
    fetch('/api/presentations')
      .then(r => r.ok ? r.json() : { presentations:[] })
      .then(d => setPresentations(d.presentations || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ minHeight:'100vh', background:'#F8FAFC' }}>
      <div style={{ background:'#0F172A' }}>
        <nav className="nav">
          <Link href="/dashboard" className="nav-brand" style={{ textDecoration:'none' }}>
            <div className="nav-prism-icon">P</div>
            <span className="nav-prism-text">PRISM</span>
          </Link>
          <div className="nav-links">
            <Link href="/dashboard" className="nav-link" style={{ textDecoration:'none' }}>My Briefs</Link>
            <Link href="/insights"  className="nav-link" style={{ textDecoration:'none' }}>📊 Analyses</Link>
            <Link href="/culture"   className="nav-link" style={{ textDecoration:'none' }}>Culture</Link>
          </div>
        </nav>
      </div>

      <main style={{ maxWidth:1200, margin:'0 auto', padding:'48px 24px' }}>
        {/* Page header */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:40 }}>
          <div>
            <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.12em', color:'#7C3AED', marginBottom:6 }}>
              PRISM INTELLIGENCE
            </p>
            <h1 style={{ fontSize:34, fontWeight:900, color:'#0F172A', letterSpacing:'-.6px', marginBottom:6 }}>My Presentations</h1>
            <p style={{ color:'#64748B', fontSize:15 }}>Auto-generated decks from your analysis insights</p>
          </div>
          {!loading && presentations.length > 0 && (
            <div style={{ padding:'10px 16px', borderRadius:12, background:'#fff',
              border:'1.5px solid #E2E8F0', fontSize:13, color:'#475569', fontWeight:600,
              display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:18 }}>🎨</span>
              {presentations.length} deck{presentations.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {loading && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'80px 0', gap:16 }}>
            <div style={{ width:40, height:40, borderRadius:'50%',
              border:'3px solid #E2E8F0', borderTopColor:'#7C3AED',
              animation:'pspin .8s linear infinite' }} />
            <p style={{ color:'#64748B', fontSize:14 }}>Loading presentations…</p>
          </div>
        )}

        {!loading && presentations.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:20 }}>
            {presentations.map(p => <PresentationCard key={p.id} pres={p} />)}
          </div>
        )}

        {!loading && presentations.length === 0 && <EmptyState />}
      </main>

      <style>{`
        @keyframes pspin { to { transform: rotate(360deg) } }
        @keyframes ppulse { 0%,100%{opacity:1} 50%{opacity:.3} }
      `}</style>
    </div>
  );
}
