'use client';
import { useEffect, useState } from 'react';

/**
 * GenreNuggetCard — "Content Genres They Prefer" card.
 *
 * Fetches /api/briefs/[id]/genre-nugget and renders one of three states:
 *   • Has data → ranked bar list with audience filter + source
 *   • No data → honest placeholder ("Upload TV Genres / Content Topics
 *     GWI export to populate this card") — never fabricated numbers
 *   • Loading → quiet skeleton
 *
 * Per the bucket spec: this card lives in the CONTENT tab (subject demand
 * for tv_genres / content_topics) with a small MEDIA cross-ref pill since
 * the data also speaks to consumption-vehicle preferences.
 */
export default function GenreNuggetCard({ briefId }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState(null);

  useEffect(() => {
    if (!briefId) { setLoading(false); return; }
    fetch(`/api/briefs/${briefId}/genre-nugget`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .catch(e => setErr(e?.message || String(e)))
      .finally(() => setLoading(false));
  }, [briefId]);

  if (loading) {
    return (
      <div style={{ background: '#fff', borderRadius: 14, padding: '14px 18px', minHeight: 200, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
        <div style={{ width: 120, height: 12, background: '#F1F5F9', borderRadius: 4, marginBottom: 12 }} />
        <div style={{ width: 200, height: 18, background: '#F1F5F9', borderRadius: 4 }} />
      </div>
    );
  }
  if (err || !data) return null;

  const nugget = data.nugget;

  // No data → render nothing. A blank gap is cleaner than a banner that
  // would (a) break the visual grid of other nuggets, (b) look like a
  // system error to a client, and (c) leak internal language. The honest
  // alternative is "if it's not there, don't show it" — not "shout that
  // it's empty." Discoverability of the missing capability happens via
  // /admin/pending-tasks instead, which is the right audience for it.
  if (!nugget) return null;

  // ── Has data ──
  const maxPct = Math.max(...nugget.rankings.map(r => r.pct));
  return (
    <div style={{
      background: '#fff', borderRadius: 14, padding: '14px 18px',
      boxShadow: '0 1px 3px rgba(0,0,0,.04)',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#7C3AED' }}>
          🎬 {nugget.title}
        </div>
        <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', color: '#065F46', background: '#D1FAE5', padding: '1px 6px', borderRadius: 8 }}>
          ● LIVE
        </span>
      </div>
      <div style={{ fontSize: 11, color: '#64748B', marginBottom: 10 }}>
        Audience: <strong>{nugget.audienceFilter}</strong> · sourced from {nugget.source}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {nugget.rankings.map((r, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 50px', gap: 10, alignItems: 'center', fontSize: 12 }}>
            <span style={{ color: '#0F172A', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.label}>
              {r.label}
            </span>
            <div style={{ height: 7, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${(r.pct / maxPct) * 100}%`,
                background: 'linear-gradient(90deg,#7C3AED,#2563EB)',
                borderRadius: 4,
              }} />
            </div>
            <span style={{ color: '#0F172A', fontWeight: 700, textAlign: 'right' }}>
              {r.pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed #E2E8F0', fontSize: 10.5, color: '#94A3B8', lineHeight: 1.45 }}>
        <span style={{ background: '#F5F3FF', color: '#7C3AED', padding: '1px 6px', borderRadius: 4, fontWeight: 700, marginRight: 6 }}>
          MEDIA
        </span>
        Cross-reference: consumption-vehicle signal · from {nugget.sourceSheets.length} GWI sheet{nugget.sourceSheets.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
