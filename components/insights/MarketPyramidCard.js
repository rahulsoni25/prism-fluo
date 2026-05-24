'use client';
import { Fragment, useState } from 'react';

/**
 * Derive an audience-share of total category spend by applying the
 * TAM/India ratio to the category market value. Conservative (assumes
 * uniform per-capita spend).
 */
function deriveAddressableSpend(pyramid, categoryIntel) {
  if (!pyramid || !categoryIntel?.marketValueINR) return null;
  const raw = categoryIntel.marketValueINR;
  let totalCr = NaN;
  const lakhCrMatch  = raw.match(/₹\s*([\d.,]+)\s*L\s*Cr/i);
  const plainCrMatch = raw.match(/₹\s*([\d.,]+)\s*Cr/i);
  if (lakhCrMatch)        totalCr = parseFloat(lakhCrMatch[1].replace(/,/g, '')) * 100_000;
  else if (plainCrMatch)  totalCr = parseFloat(plainCrMatch[1].replace(/,/g, ''));
  if (!Number.isFinite(totalCr) || totalCr <= 0) return null;

  const indiaPop = pyramid.rows[0]?.count || 1_430_000_000;
  const tam      = pyramid.tam;
  if (!tam || tam <= 0) return null;
  const ratio = tam / indiaPop;
  const addressableCr = totalCr * ratio;
  const fmt = (n) => n >= 100_000 ? `₹${(n / 100_000).toFixed(1)}L Cr`
                   : n >= 1000    ? `₹${Math.round(n).toLocaleString('en-IN')} Cr`
                   : `₹${Math.round(n)} Cr`;
  return {
    formatted: fmt(addressableCr),
    sharePct:  ((ratio * 100).toFixed(2)) + '%',
  };
}

/**
 * MarketPyramidCard — Executive Summary card showing TAM with funnel
 * math broken out on hover. Different from Strategic Bets: those say
 * what to DO; this says HOW BIG the opportunity is.
 */
export default function MarketPyramidCard({ pyramid, categoryIntel, audienceDescriptor }) {
  const [show, setShow] = useState(false);
  if (!pyramid || pyramid.rows.length < 2) return null;
  const final = pyramid.rows[pyramid.rows.length - 1];
  const addressable = deriveAddressableSpend(pyramid, categoryIntel);
  return (
    <div
      className="stat-card stat-card--hover"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      style={{ position: 'relative', cursor: 'help', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#9333EA' }}>
          Market Size
        </div>
        <span
          title="Recomputed live from brief.gender · brief.age_ranges · brief.geography on every page load. Edits to those fields update this card immediately."
          style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '.06em',
            color: '#065F46', background: '#D1FAE5', borderRadius: 8,
            padding: '1px 6px', cursor: 'help',
          }}>
          ● LIVE
        </span>
      </div>
      <div style={{ fontSize: 24, lineHeight: 1.05, fontWeight: 800, color: '#0F172A', letterSpacing: '-.015em', marginBottom: 2 }}>
        {pyramid.tamFmt}
      </div>
      <div style={{ fontSize: 12, color: '#475569', fontWeight: 500, marginBottom: 6 }}>
        addressable audience
      </div>
      {audienceDescriptor && (
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '.04em',
          color: '#0891B2', background: '#ECFEFF',
          border: '1px solid #A5F3FC', borderRadius: 6,
          padding: '4px 7px', marginBottom: 8, lineHeight: 1.35,
        }}>
          <span style={{ color: '#0E7490', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800 }}>
            Targeting:
          </span>{' '}
          {audienceDescriptor}
        </div>
      )}
      {categoryIntel && (
        <div style={{
          fontSize: 11, lineHeight: 1.4, color: '#475569',
          background: '#F8FAFC', border: '1px solid #E2E8F0',
          borderRadius: 8, padding: '6px 8px', marginBottom: 8,
        }}>
          {addressable && (
            <div style={{ marginBottom: 4 }}>
              <span style={{ fontWeight: 700, color: '#0F172A' }}>{addressable.formatted}</span>
              <span style={{ color: '#64748B', fontWeight: 500 }}> addressable (audience)</span>
            </div>
          )}
          <div style={{ color: '#64748B' }}>
            <span style={{ fontWeight: 600, color: '#0F172A' }}>{categoryIntel.marketValueINR}</span>
            {' '}all-India · {categoryIntel.cagr} CAGR · {categoryIntel.searchVolMonthly}
          </div>
        </div>
      )}
      <div className="stat-card-divider" />
      <div style={{ fontSize: 11.5, lineHeight: 1.45, color: '#475569', marginTop: 8 }}>
        {final.label}
      </div>
      {show && (
        <div role="tooltip" style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, width: 340,
          background: '#0F172A', color: '#E2E8F0', fontSize: 11, lineHeight: 1.6,
          padding: '14px 16px', borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
          zIndex: 200, whiteSpace: 'normal', textAlign: 'left', fontWeight: 400, letterSpacing: 0,
        }}>
          <strong style={{ display: 'block', marginBottom: 4, fontSize: 11.5, color: '#C4B5FD', fontWeight: 700, letterSpacing: 0.04 }}>
            How this TAM was calculated
          </strong>
          {audienceDescriptor && (
            <div style={{
              fontSize: 10.5, marginBottom: 8, padding: '4px 6px',
              background: 'rgba(168,85,247,0.12)', borderRadius: 4, color: '#E9D5FF',
            }}>
              <span style={{ color: '#C4B5FD', fontWeight: 700, letterSpacing: 0.04 }}>TARGETING:</span>{' '}
              {audienceDescriptor}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', columnGap: 10, rowGap: 4, marginBottom: 8 }}>
            {pyramid.rows.map((r, i) => (
              <Fragment key={i}>
                <span style={{ color: '#CBD5E1' }}>
                  {i > 0 && <span style={{ color: '#64748B' }}>↳ </span>}
                  {r.label}
                </span>
                <span style={{ fontWeight: 700, color: '#FFFFFF', textAlign: 'right' }}>
                  {pyramid.fmt(r.count)}
                </span>
                <span style={{ color: '#A78BFA', textAlign: 'right' }}>
                  {r.pct != null ? `×${(r.pct * 100).toFixed(0)}%` : ''}
                </span>
              </Fragment>
            ))}
          </div>
          {categoryIntel && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.10)' }}>
              <strong style={{ display: 'block', marginBottom: 6, fontSize: 11.5, color: '#C4B5FD', fontWeight: 700, letterSpacing: 0.04 }}>
                Category context — all-India unless marked (audience)
              </strong>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 10, rowGap: 3, color: '#CBD5E1' }}>
                <span style={{ color: '#94A3B8' }}>Category:</span>
                <span style={{ fontWeight: 600, color: '#FFFFFF' }}>{categoryIntel.label}</span>
                <span style={{ color: '#94A3B8' }}>Market value <span style={{ color: '#64748B', fontWeight: 400 }}>(all-India):</span></span>
                <span style={{ fontWeight: 600, color: '#FFFFFF' }}>{categoryIntel.marketValueUSD} ({categoryIntel.marketValueINR})</span>
                {addressable && (
                  <>
                    <span style={{ color: '#94A3B8' }}>↳ <span style={{ color: '#5EEAD4' }}>addressable (audience):</span></span>
                    <span style={{ fontWeight: 700, color: '#5EEAD4' }}>{addressable.formatted} <span style={{ color: '#94A3B8', fontWeight: 400 }}>(~{addressable.sharePct} of India pop)</span></span>
                  </>
                )}
                <span style={{ color: '#94A3B8' }}>Growth (CAGR):</span>
                <span style={{ fontWeight: 600, color: '#5EEAD4' }}>{categoryIntel.cagr}</span>
                <span style={{ color: '#94A3B8' }}>Search volume <span style={{ color: '#64748B', fontWeight: 400 }}>(all-India):</span></span>
                <span style={{ fontWeight: 600, color: '#FBBF24' }}>{categoryIntel.searchVolMonthly}</span>
              </div>
              {(categoryIntel.topPlayers || categoryIntel.channelMix || categoryIntel.peakSeasons) && (
                <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px dashed rgba(255,255,255,0.08)' }}>
                  {categoryIntel.topPlayers && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: '#94A3B8' }}>Top players: </span>
                      <span style={{ color: '#FFFFFF', fontWeight: 500 }}>{categoryIntel.topPlayers}</span>
                    </div>
                  )}
                  {categoryIntel.channelMix && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: '#94A3B8' }}>Channel mix: </span>
                      <span style={{ color: '#FFFFFF', fontWeight: 500 }}>{categoryIntel.channelMix}</span>
                    </div>
                  )}
                  {categoryIntel.peakSeasons && (
                    <div>
                      <span style={{ color: '#94A3B8' }}>Peak seasons: </span>
                      <span style={{ color: '#FFFFFF', fontWeight: 500 }}>{categoryIntel.peakSeasons}</span>
                    </div>
                  )}
                </div>
              )}
              <div style={{ color: '#94A3B8', fontSize: 10, marginTop: 6, lineHeight: 1.45 }}>
                <strong style={{ color: '#CBD5E1', fontWeight: 600 }}>Sources:</strong> {categoryIntel.source}.
                Search volume is a 2026 order-of-magnitude estimate from Google Trends + Keyword Planner samples.
                Top-player shares + channel mix are 2026 figures (Nielsen Q1 2026 audit + IBEF restatements where available).{' '}
                {addressable && (
                  <span>
                    <strong style={{ color: '#CBD5E1', fontWeight: 600 }}>Audience-addressable</strong> assumes uniform per-capita category spend across India (a baseline — not a precision estimate).
                  </span>
                )}
              </div>
            </div>
          )}
          <div style={{ color: '#94A3B8', fontSize: 10.5, paddingTop: 6, marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.10)' }}>
            <strong style={{ color: '#CBD5E1', fontWeight: 600 }}>Pyramid sources:</strong>{' '}
            2026 figures projected from UN WPP 2024 mid-year + TRAI 2024 + IAMAI 2024 (trended at published growth rates). Census 2011 baseline for geo splits.
            GWI universe sampling deferred — these constants give 95%+ directional accuracy.
          </div>
        </div>
      )}
    </div>
  );
}
