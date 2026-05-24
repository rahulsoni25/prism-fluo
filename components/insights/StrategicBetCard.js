'use client';
import { useState } from 'react';
import { parseRecommendation } from '@/lib/insights/helpers';

/**
 * StrategicBetCard — single "bet" in the Executive Summary strip. Distils
 * the top verb-driven sentence from a high-conviction insight card plus
 * the supporting stat. Hover reveals the full play, why it matters,
 * related findings, and source attribution.
 */
export default function StrategicBetCard({ bet, onJumpToBucket }) {
  const [show, setShow] = useState(false);
  const recParts = parseRecommendation(bet.fullRec);

  return (
    <div
      className="stat-card stat-card--hover"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      style={{ position: 'relative', cursor: 'help', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#0891B2' }}>
          {bet.bucketLabel}
        </span>
        <span style={{ fontSize: 9.5, fontFamily: "'SF Mono',Menlo,Consolas,monospace", color: '#94A3B8', letterSpacing: 0 }}>
          conv {bet.conviction}
        </span>
      </div>

      <div style={{ fontSize: 15, lineHeight: 1.35, fontWeight: 700, color: '#0F172A', letterSpacing: '-.005em', marginBottom: 10 }}>
        {bet.action}
      </div>

      <div className="stat-card-divider" />

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 12, lineHeight: 1.4, color: '#475569' }}>
          {bet.stat || bet.title}
        </div>
        {bet.obsHook && bet.obsHook !== bet.stat && (
          <div style={{ fontSize: 11.5, lineHeight: 1.4, color: '#64748B', marginTop: 6, paddingTop: 6, borderTop: '1px dashed #E2E8F0' }}>
            <strong style={{ color: '#475569', fontWeight: 600 }}>Why it matters:</strong> {bet.obsHook}
          </div>
        )}
        {bet.relatedTotal > 0 && (
          onJumpToBucket && bet.bucketKey ? (
            <button
              type="button"
              onClick={(e) => {
                // Stop the hover-card toggle from firing when we click the link
                e.stopPropagation();
                onJumpToBucket(bet.bucketKey);
              }}
              style={{
                fontSize: 10.5, color: '#0891B2', marginTop: 8,
                fontWeight: 600, letterSpacing: '.02em',
                background: 'transparent', border: 'none',
                padding: 0, cursor: 'pointer', textAlign: 'left',
                fontFamily: 'inherit', textDecoration: 'underline',
                textDecorationColor: 'rgba(8,145,178,.35)',
                textUnderlineOffset: 3,
              }}
              onMouseOver={(e) => { e.currentTarget.style.color = '#0E7490'; e.currentTarget.style.textDecorationColor = '#0E7490'; }}
              onMouseOut={(e)  => { e.currentTarget.style.color = '#0891B2'; e.currentTarget.style.textDecorationColor = 'rgba(8,145,178,.35)'; }}
              aria-label={`Jump to ${bet.bucketLabel} bucket`}
            >
              + {bet.relatedTotal} more finding{bet.relatedTotal === 1 ? '' : 's'} in {bet.bucketLabel.toLowerCase()} bucket →
            </button>
          ) : (
            <div style={{ fontSize: 10.5, color: '#0891B2', marginTop: 8, fontWeight: 600, letterSpacing: '.02em' }}>
              + {bet.relatedTotal} more finding{bet.relatedTotal === 1 ? '' : 's'} in {bet.bucketLabel.toLowerCase()} bucket →
            </div>
          )
        )}
      </div>

      {show && (
        <div
          role="tooltip"
          style={{
            position: 'absolute', bottom: 'calc(100% + 8px)', right: 0,
            width: 380, background: '#0F172A', color: '#E2E8F0',
            fontSize: 11, lineHeight: 1.6, padding: '16px 18px',
            borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.32)',
            zIndex: 200, whiteSpace: 'normal', textAlign: 'left',
            fontWeight: 400, letterSpacing: 0,
            maxHeight: 480, overflowY: 'auto',
          }}
        >
          <strong style={{ display: 'block', marginBottom: 8, fontSize: 11.5, color: '#7DD3FC', fontWeight: 700, letterSpacing: 0.04 }}>
            The full play
          </strong>
          {recParts ? (
            <div style={{ marginBottom: 12 }}>
              {recParts.creative && (
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: '#FDE68A', fontWeight: 700, fontSize: 10, letterSpacing: '.05em', textTransform: 'uppercase' }}>Creative · </span>
                  <span style={{ color: '#CBD5E1' }}>{recParts.creative}</span>
                </div>
              )}
              {recParts.brand && (
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: '#FDE68A', fontWeight: 700, fontSize: 10, letterSpacing: '.05em', textTransform: 'uppercase' }}>Brand · </span>
                  <span style={{ color: '#CBD5E1' }}>{recParts.brand}</span>
                </div>
              )}
              {recParts.media && (
                <div>
                  <span style={{ color: '#FDE68A', fontWeight: 700, fontSize: 10, letterSpacing: '.05em', textTransform: 'uppercase' }}>Media · </span>
                  <span style={{ color: '#CBD5E1' }}>{recParts.media}</span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: '#CBD5E1', marginBottom: 12 }}>
              {bet.fullRec ? (bet.fullRec.length > 280 ? bet.fullRec.slice(0, 278) + '…' : bet.fullRec) : bet.action}
            </div>
          )}

          {bet.obsHook && (
            <>
              <strong style={{ display: 'block', marginBottom: 6, fontSize: 10.5, color: '#7DD3FC', fontWeight: 700, letterSpacing: 0.04, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.10)' }}>
                Why this matters
              </strong>
              <div style={{ color: '#CBD5E1', marginBottom: 12 }}>
                {bet.obsHook}
              </div>
            </>
          )}

          {bet.related && bet.related.length > 0 && (
            <>
              <strong style={{ display: 'block', marginBottom: 6, fontSize: 10.5, color: '#7DD3FC', fontWeight: 700, letterSpacing: 0.04, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.10)' }}>
                Other {bet.bucketLabel.toLowerCase()} findings ({bet.relatedTotal})
              </strong>
              {bet.related.map((r, i) => (
                <div key={i} style={{ marginBottom: 5, color: '#CBD5E1' }}>
                  • {r.stat ? (r.stat.length > 130 ? r.stat.slice(0,128) + '…' : r.stat) : (r.title.length > 100 ? r.title.slice(0,98) + '…' : r.title)}
                  <span style={{ color: '#7DD3FC', fontFamily: "'SF Mono',Menlo,Consolas,monospace", fontSize: 9.5, marginLeft: 6 }}>
                    conv {r.conviction}
                  </span>
                </div>
              ))}
            </>
          )}

          <div style={{ color: '#94A3B8', fontSize: 10.5, paddingTop: 10, marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.10)' }}>
            <strong style={{ color: '#CBD5E1', fontWeight: 600 }}>Source card:</strong>{' '}
            {bet.title.length > 80 ? bet.title.slice(0, 78) + '…' : bet.title}
          </div>
        </div>
      )}
    </div>
  );
}
