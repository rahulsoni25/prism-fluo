'use client';
import { timeAgo } from '@/lib/insights/helpers';

/**
 * BriefContextStrip — clean brief summary card under the report title.
 * Three rows: meta chips → objective → audience + competitors pills.
 * Falls back to source badge + time ago when no brief is linked.
 */
export default function BriefContextStrip({ brief, sourceBadge, createdAt }) {
  // ── No brief linked — simple fallback ──────────────────────
  if (!brief?.brand) {
    return (
      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        <span style={{
          padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
          background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.75)',
          border: '1px solid rgba(255,255,255,0.12)',
        }}>📊 {sourceBadge}</span>
        <span style={{
          padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
          background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.55)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}>🕐 {timeAgo(createdAt)}</span>
      </div>
    );
  }

  // ── Parse audience + competitors ───────────────────────────
  const audience = [
    brief.age_ranges && { label: brief.age_ranges },
    brief.gender     && { label: brief.gender },
    brief.sec        && { label: `SEC ${brief.sec}` },
    (brief.geography || brief.market) && { label: brief.geography || brief.market },
  ].filter(Boolean);

  const competitors = brief.competitors
    ? brief.competitors.split(/[,;·|\/]+/).map(s => s.trim()).filter(Boolean).slice(0, 5)
    : [];

  const sectionLabel = {
    fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'rgba(255,255,255,0.42)',
    marginRight: 4, alignSelf: 'center',
  };

  const chip = (bg, border, color) => ({
    display: 'inline-flex', alignItems: 'center',
    padding: '3px 10px', borderRadius: 20,
    fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
    background: bg, border: `1px solid ${border}`, color,
  });

  return (
    <div className="hero-context">
      <div className="hero-context-row">
        <span style={chip('rgba(99,102,241,0.22)', 'rgba(99,102,241,0.4)', '#C7D2FE')}>
          🏢 {brief.brand}
        </span>
        {brief.category && (
          <span style={chip('rgba(255,255,255,0.08)', 'rgba(255,255,255,0.14)', 'rgba(255,255,255,0.7)')}>
            {brief.category}
          </span>
        )}
        <span className="hero-context-divider" />
        <span style={chip('rgba(255,255,255,0.06)', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.52)')}>
          📊 {sourceBadge}
        </span>
        <span className="hero-context-meta">{timeAgo(createdAt)}</span>
      </div>

      {brief.objective && (
        <div className="hero-context-objective">
          <span className="hero-context-objective-label">Objective</span>
          <span className="hero-context-objective-value">{brief.objective}</span>
        </div>
      )}

      {(audience.length > 0 || competitors.length > 0) && (
        <div className="hero-context-row hero-context-row--wrap">
          {audience.length > 0 && (
            <>
              <span style={sectionLabel}>Audience</span>
              {audience.map((a, i) => (
                <span key={`a${i}`} style={chip('rgba(16,185,129,0.14)', 'rgba(16,185,129,0.28)', 'rgba(167,243,208,0.95)')}>
                  {a.label}
                </span>
              ))}
            </>
          )}
          {audience.length > 0 && competitors.length > 0 && (
            <span className="hero-context-divider hero-context-divider--inline" />
          )}
          {competitors.length > 0 && (
            <>
              <span style={sectionLabel}>vs</span>
              {competitors.map((c, i) => (
                <span key={`c${i}`} style={chip('rgba(239,68,68,0.14)', 'rgba(239,68,68,0.3)', 'rgba(252,165,165,0.95)')}>
                  {c}
                </span>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
