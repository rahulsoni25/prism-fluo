'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * StaleAnalysisBanner
 *
 * Shows on /insights when the brief has been edited since the analysis was
 * generated. The MarketPyramid card + category context recompute live from
 * brief.* so those numbers are always current — but the Gemini-generated
 * AI snapshot + nugget headlines are stored in analyses.results_json and
 * reflect the brief AS IT WAS when the analysis ran.
 *
 * Two actions:
 *   • Regenerate now — calls /api/analyses/[id]/regenerate (existing endpoint)
 *   • Dismiss        — hides the banner for this session
 */
export default function StaleAnalysisBanner({ reason, analysisId }) {
  const router = useRouter();
  const [busy,  setBusy]  = useState(false);
  const [err,   setErr]   = useState(null);
  const [hide,  setHide]  = useState(false);

  if (hide) return null;

  async function regenerate() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/analyses/${analysisId}/regenerate`, { method: 'POST' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || j.error || `HTTP ${res.status}`);
      }
      // Reload the page to show fresh AI text + cleared stale flag
      router.refresh();
      window.location.reload();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <div style={{
      marginTop: 12,
      background: 'linear-gradient(135deg, #FEF3C7, #FEF9C3)',
      border: '1px solid #FCD34D',
      borderRadius: 12,
      padding: '14px 18px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 16, flexWrap: 'wrap',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{ flex: 1, minWidth: 280 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: '#92400E', marginBottom: 3, letterSpacing: '.02em' }}>
          ⚠ Brief changed — AI text may be out of date
        </div>
        <div style={{ fontSize: 12, color: '#78350F', lineHeight: 1.5 }}>
          The Market Size card and category context recompute live from your brief,
          so those numbers are current. The AI snapshot + nugget headlines were
          generated against the previous brief and need a regenerate to refresh.
          {reason && (
            <span style={{ display: 'block', marginTop: 4, fontStyle: 'italic', color: '#9A6700' }}>
              {reason}
            </span>
          )}
        </div>
        {err && (
          <div style={{ marginTop: 6, fontSize: 11.5, color: '#991B1B', fontWeight: 600 }}>
            ❌ {err}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={regenerate}
          disabled={busy}
          style={{
            padding: '8px 16px', borderRadius: 8, border: 'none',
            background: busy ? '#94A3B8' : '#D97706', color: '#fff',
            fontSize: 12, fontWeight: 800, letterSpacing: '.02em',
            cursor: busy ? 'wait' : 'pointer',
            boxShadow: busy ? 'none' : '0 2px 8px rgba(217,119,6,.4)',
          }}>
          {busy ? '⏳ Regenerating…' : '🔄 Regenerate insights'}
        </button>
        <button
          onClick={() => setHide(true)}
          style={{
            padding: '8px 12px', borderRadius: 8, border: '1px solid #FCD34D',
            background: 'transparent', color: '#78350F',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
