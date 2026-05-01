'use client';

import React, { useState } from 'react';
import TemplateGallery from './TemplateGallery';

export default function GenerateDeckModal({ analysisId, onClose, onSuccess }) {
  const [step, setStep]             = useState('gallery');
  const [deck, setDeck]             = useState(null);
  const [downloading, setDownloading] = useState(false);

  const handleSelectTemplate = (deckData) => { setDeck(deckData); setStep('success'); };
  const handleStartOver      = () => { setStep('gallery'); setDeck(null); };

  const handleDownload = async () => {
    if (!deck?.downloadUrl) return;
    setDownloading(true);
    try {
      const res = await fetch(deck.downloadUrl);
      if (res.ok) {
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `${(deck.briefName || 'presentation').replace(/\s+/g,'_')}.pptx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch { alert('Download failed. Try the direct link below.'); }
    finally { setDownloading(false); }
  };

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(15,23,42,.65)',
      backdropFilter:'blur(6px)', display:'flex', alignItems:'center',
      justifyContent:'center', zIndex:9999, padding:16,
    }}
    onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:'#fff', borderRadius:28,
          width:'100%', maxWidth: step==='gallery' ? 900 : 520,
          maxHeight:'92vh', overflowY:'auto',
          boxShadow:'0 40px 80px rgba(0,0,0,.28)',
          position:'relative',
          animation:'gdmIn .25s cubic-bezier(.34,1.56,.64,1) both',
        }}
      >
        {/* Close */}
        <button onClick={onClose} style={{
          position:'sticky', top:16, float:'right', marginRight:16,
          width:32, height:32, borderRadius:'50%', border:'none',
          background:'#F1F5F9', color:'#64748B', fontSize:16, cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center',
          zIndex:10, flexShrink:0,
        }}>✕</button>

        <div style={{ padding: step==='gallery' ? '32px 32px 28px' : '40px 40px 36px', paddingTop:32 }}>

          {/* ── Gallery step ── */}
          {step === 'gallery' && (
            <TemplateGallery analysisId={analysisId} onSelectTemplate={handleSelectTemplate} />
          )}

          {/* ── Success step ── */}
          {step === 'success' && deck && (
            <div style={{ textAlign:'center' }}>
              {/* Animated checkmark */}
              <div style={{
                width:80, height:80, borderRadius:'50%', margin:'0 auto 20px',
                background:'linear-gradient(135deg,#059669,#10B981)',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:36, boxShadow:'0 12px 32px rgba(5,150,105,.35)',
                animation:'gdmPop .4s cubic-bezier(.34,1.56,.64,1) both',
              }}>✨</div>

              <h2 style={{ fontSize:28, fontWeight:900, color:'#0F172A', marginBottom:8, letterSpacing:'-.5px' }}>
                Presentation Ready!
              </h2>
              <p style={{ color:'#64748B', fontSize:15, marginBottom:32, lineHeight:1.6 }}>
                Your deck has been generated with all insights auto-organised across slides
              </p>

              {/* Deck info card */}
              <div style={{
                background:'linear-gradient(135deg,#F8FAFF,#F5F3FF)',
                border:'1.5px solid #E0E7FF', borderRadius:18,
                padding:'24px 28px', marginBottom:24, textAlign:'left',
              }}>
                {[
                  { label:'Template', value: deck.templateName },
                  { label:'Title',    value: deck.briefName },
                  deck.headline && { label:'Headline', value: deck.headline },
                ].filter(Boolean).map(r => (
                  <div key={r.label} style={{ marginBottom:16, lastChild:{ marginBottom:0 } }}>
                    <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase',
                      letterSpacing:'.1em', color:'#94A3B8', marginBottom:4 }}>{r.label}</p>
                    <p style={{ fontSize:14, fontWeight:600, color:'#1E293B', lineHeight:1.4 }}>{r.value}</p>
                  </div>
                ))}
              </div>

              {/* Checklist */}
              <div style={{
                background:'#ECFDF5', border:'1px solid #A7F3D0',
                borderRadius:14, padding:'14px 18px', marginBottom:28, textAlign:'left',
              }}>
                {['All insights automatically organised','Professional design applied','Ready to download and present'].map(item => (
                  <div key={item} style={{ display:'flex', alignItems:'center', gap:8,
                    fontSize:13, color:'#065F46', fontWeight:600, padding:'4px 0' }}>
                    <span style={{ color:'#059669', fontSize:15 }}>✓</span> {item}
                  </div>
                ))}
              </div>

              {/* Buttons */}
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <button onClick={handleDownload} disabled={downloading} style={{
                  padding:'14px 0', borderRadius:12, border:'none', cursor: downloading ? 'not-allowed' : 'pointer',
                  background: downloading ? '#94A3B8' : 'linear-gradient(135deg,#2563EB,#7C3AED)',
                  color:'#fff', fontSize:15, fontWeight:800,
                  boxShadow: downloading ? 'none' : '0 8px 24px rgba(37,99,235,.35)',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                  transition:'all .15s',
                }}>
                  {downloading ? (
                    <><span style={{ width:16, height:16, borderRadius:'50%',
                      border:'2px solid rgba(255,255,255,.4)', borderTopColor:'#fff',
                      animation:'gdmspin .7s linear infinite', display:'inline-block' }} /> Downloading…</>
                  ) : '⬇ Download PowerPoint'}
                </button>

                {deck.gammaUrl && deck.gammaUrl !== '#' && (
                  <a href={deck.gammaUrl} target="_blank" rel="noopener noreferrer" style={{
                    padding:'13px 0', borderRadius:12, textDecoration:'none',
                    background:'linear-gradient(135deg,#7C3AED,#EC4899)',
                    color:'#fff', fontSize:14, fontWeight:700, textAlign:'center',
                    display:'block',
                  }}>🌐 View Online</a>
                )}

                <div style={{ display:'flex', gap:10 }}>
                  <button onClick={handleStartOver} style={{
                    flex:1, padding:'11px 0', borderRadius:10,
                    border:'1.5px solid #E2E8F0', background:'#fff',
                    color:'#475569', fontSize:13, fontWeight:600, cursor:'pointer',
                  }}>← Try Another</button>
                  <button onClick={() => { onSuccess?.(deck); onClose?.(); }} style={{
                    flex:1, padding:'11px 0', borderRadius:10,
                    border:'none', background:'#F1F5F9',
                    color:'#475569', fontSize:13, fontWeight:600, cursor:'pointer',
                  }}>Go to Library</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes gdmIn  { from { opacity:0; transform:scale(.94) translateY(10px) } to { opacity:1; transform:scale(1) translateY(0) } }
        @keyframes gdmPop { from { opacity:0; transform:scale(.6) } to { opacity:1; transform:scale(1) } }
        @keyframes gdmspin { to { transform:rotate(360deg) } }
      `}</style>
    </div>
  );
}
