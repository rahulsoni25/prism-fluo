'use client';
import { useEffect, useState } from 'react';

/**
 * ClientBriefContext — compact strip rendered inside the top Executive Summary
 * banner between the headline and the AI-written snapshot. Surfaces the
 * client's own framing so readers see Problem → Ask → Solution in order.
 *
 * Hidden when there's no brief (legacy analyses) or when both background and
 * objective are blank.
 *
 * Data sources (in order of preference):
 *   1. /api/briefs/[id]/context-summary — LLM-grounded paraphrase (best)
 *   2. extractive fallback — first complete sentence(s) from brief.background
 */
export default function ClientBriefContext({ brief, audienceDescriptor }) {
  const [llmSummary, setLlmSummary] = useState(null);

  useEffect(() => {
    if (!brief?.id || !brief?.background) return;
    let cancelled = false;
    fetch(`/api/briefs/${brief.id}/context-summary`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d?.summary) return;
        setLlmSummary(d.summary);
      })
      .catch(() => { /* keep deterministic fallback */ });
    return () => { cancelled = true; };
  }, [brief?.id, brief?.background]);

  if (!brief || (!brief.background && !brief.objective)) return null;

  const audience = audienceDescriptor || [
    brief.age_ranges,
    brief.gender !== 'All Genders' ? brief.gender : null,
    brief.market,
  ].filter(Boolean).join(' · ');

  // Deterministic extractive summary — used immediately on first paint,
  // and as the fallback when the LLM call hasn't returned (or failed).
  const summarise = (raw) => {
    if (!raw) return '';
    const BUDGET = 360;
    const labelRe = /^(brief\s*[:\-]|context|objective|key\s+questions?|demo\s*[-–]|core\s+tg\s+persona|key\s+frictions|current\s+behaviour|data\s+sources)/i;
    const cleaned = raw
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => {
        if (!l) return false;
        if (l.length < 60 && labelRe.test(l)) return false;
        if (l.length < 90 && !/[.!?:]$/.test(l)) return false;
        if (labelRe.test(l) && l.length < 110) return false;
        return true;
      })
      .join(' ')
      .replace(/\s+/g, ' ');
    const sentences = cleaned
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 8);
    let out = '';
    for (const s of sentences) {
      if (!out) { out = s; if (out.length >= BUDGET) break; continue; }
      if (out.length + 1 + s.length > BUDGET) break;
      out += ' ' + s;
    }
    return out;
  };

  const truncated = llmSummary || summarise(brief.background);

  return (
    <div style={{
      marginBottom: 18,
      padding: '14px 18px',
      background: '#F8FAFC',
      border: '1px solid #E2E8F0',
      borderLeft: '3px solid #2563EB',
      borderRadius: 10,
      maxWidth: 1100,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: truncated ? 8 : 0 }}>
        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: '#2563EB',
        }}>The Ask</span>
        <span style={{ fontSize: 13.5, color: '#0F172A', lineHeight: 1.55 }}>
          <strong>{brief.brand}</strong>
          {brief.objective ? <> is looking at <strong>{brief.objective.toLowerCase()}</strong></> : null}
          {audience ? <> for <strong>{audience}</strong></> : null}
          {brief.category ? <> in the <strong>{brief.category}</strong> space</> : null}.
          {brief.insight_buckets && (
            <>{' '}Study scope: <span style={{ color: '#475569' }}>{brief.insight_buckets}</span>.</>
          )}
        </span>
      </div>
      {truncated && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 10, fontWeight: 800, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: '#7C3AED',
          }}>Context</span>
          <span style={{ fontSize: 13.5, color: '#334155', lineHeight: 1.55 }}>{truncated}</span>
        </div>
      )}
    </div>
  );
}
