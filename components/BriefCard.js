'use client';
import { useState } from 'react';
import Link from 'next/link';

// Gradient + colour per status
const STATUS_STYLE = {
  ready: {
    gradient: 'linear-gradient(135deg,#065F46 0%,#059669 100%)',
    pill:     { bg:'rgba(167,243,208,.18)', color:'#A7F3D0', dot:'#34D399' },
    label:    'Active',
    icon:     '✓',
    pulse:    false,
  },
  processing: {
    gradient: 'linear-gradient(135deg,#1E3A8A 0%,#2563EB 100%)',
    pill:     { bg:'rgba(147,197,253,.18)', color:'#93C5FD', dot:'#60A5FA' },
    label:    'In Progress',
    icon:     '⟳',
    pulse:    true,
  },
  waiting_for_data: {
    gradient: 'linear-gradient(135deg,#78350F 0%,#D97706 100%)',
    pill:     { bg:'rgba(253,230,138,.18)', color:'#FDE68A', dot:'#FBBF24' },
    label:    'In Progress',
    icon:     '⏳',
    pulse:    true,
  },
  draft: {
    gradient: 'linear-gradient(135deg,#1E293B 0%,#334155 100%)',
    pill:     { bg:'rgba(148,163,184,.18)', color:'#94A3B8', dot:'#64748B' },
    label:    'Draft',
    icon:     '✏',
    pulse:    false,
  },
};

const DEFAULT_STYLE = STATUS_STYLE.draft;

// Category colour accent for the icon circle
const CATEGORY_COLOR = {
  'FMCG — Food & Beverages':  '#D97706',
  'FMCG — Personal Care':     '#EC4899',
  'FMCG — Home Care':         '#059669',
  'Fashion & Apparel':         '#7C3AED',
  'Sportswear & Footwear':     '#2563EB',
  'Electronics & Technology':  '#0891B2',
  'Automotive':                '#DC2626',
  'Beauty & Cosmetics':        '#EC4899',
  'Telecom':                   '#7C3AED',
};
const DEFAULT_COLOR = '#2563EB';

export default function BriefCard({
  href,
  icon,
  brand,
  meta,
  tags = [],
  footerItems = [],
  isDraft,
  status = 'draft',
  slaText,
  category,
}) {
  const [hover, setHover] = useState(false);
  const ss    = STATUS_STYLE[status] || DEFAULT_STYLE;
  const color = CATEGORY_COLOR[category] || DEFAULT_COLOR;

  return (
    <Link href={href || '#'} style={{ display:'block', textDecoration:'none', color:'inherit' }}>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          background:    '#fff',
          borderRadius:  20,
          overflow:      'hidden',
          border:        hover ? `1.5px solid ${color}50` : '1.5px solid #E2E8F0',
          boxShadow:     hover
            ? `0 20px 48px ${color}18, 0 4px 16px rgba(0,0,0,.07)`
            : '0 2px 8px rgba(0,0,0,.05)',
          transform:     hover ? 'translateY(-4px)' : 'translateY(0)',
          transition:    'all .25s cubic-bezier(.34,1.56,.64,1)',
          cursor:        'pointer',
        }}
      >
        {/* ── Gradient header ── */}
        <div style={{
          background:  ss.gradient,
          padding:     '20px 20px 16px',
          position:    'relative',
          overflow:    'hidden',
        }}>
          {/* Subtle grid texture */}
          <div style={{
            position:'absolute', inset:0, opacity:.06,
            backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 18px,rgba(255,255,255,.8) 18px,rgba(255,255,255,.8) 19px),repeating-linear-gradient(90deg,transparent,transparent 18px,rgba(255,255,255,.8) 18px,rgba(255,255,255,.8) 19px)',
          }} />

          <div style={{ position:'relative', display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
            {/* Icon */}
            <div style={{
              width:38, height:38, borderRadius:10,
              background:'rgba(255,255,255,.15)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:20, backdropFilter:'blur(4px)',
              border:'1px solid rgba(255,255,255,.2)',
            }}>{icon || '📋'}</div>

            {/* Status pill */}
            <div style={{
              display:'flex', alignItems:'center', gap:5,
              padding:'4px 10px', borderRadius:20,
              background: ss.pill.bg,
              border:`1px solid ${ss.pill.dot}40`,
              backdropFilter:'blur(4px)',
            }}>
              <span style={{
                width:6, height:6, borderRadius:'50%',
                background: ss.pill.dot,
                display:'inline-block',
                animation: ss.pulse ? 'bcpulse 1.5s ease-in-out infinite' : 'none',
              }} />
              <span style={{ fontSize:10, fontWeight:800, color: ss.pill.color, letterSpacing:'.06em', textTransform:'uppercase' }}>
                {ss.label}
              </span>
            </div>
          </div>

          {/* Brand name */}
          <div style={{
            fontSize:17, fontWeight:800, color:'#fff',
            letterSpacing:'-.3px', lineHeight:1.2,
            textShadow:'0 1px 3px rgba(0,0,0,.2)',
          }}>{brand}</div>
        </div>

        {/* ── Card body ── */}
        <div style={{ padding:'14px 18px 0' }}>
          <div style={{ fontSize:11, color:'#94A3B8', marginBottom:8, lineHeight:1.5 }}>{meta}</div>

          {tags.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:10 }}>
              {tags.map((tag, i) => (
                <span key={i} style={{
                  background:'#F1F5F9', color:'#475569',
                  padding:'3px 9px', borderRadius:20,
                  fontSize:10, fontWeight:600,
                }}>{tag}</span>
              ))}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        {isDraft ? (
          <div style={{ padding:'10px 18px 16px' }}>
            <div style={{
              padding:'8px 0', border:'none', background:'transparent',
              fontSize:12, fontWeight:700, color:'#64748B',
              display:'flex', alignItems:'center', gap:4,
            }}>✏ Continue Editing →</div>
          </div>
        ) : (
          <div style={{
            display:'flex', gap:0, marginTop:10,
            borderTop:'1px solid #F1F5F9',
          }}>
            {footerItems.map((item, i) => (
              <span key={i} style={{
                flex:1, padding:'10px 12px',
                fontSize:11, fontWeight:600, color:'#64748B',
                borderRight: i < footerItems.length - 1 ? '1px solid #F1F5F9' : 'none',
                textAlign:'center',
              }}>{item}</span>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes bcpulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.8)} }
      `}</style>
    </Link>
  );
}
