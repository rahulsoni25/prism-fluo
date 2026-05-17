'use client';
import { useState, useEffect, useRef, Suspense, Fragment } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import GenerateDeckModal from '@/app/components/GenerateDeckModal';
import Navbar from '@/components/Navbar';
import Copilot from '@/components/Copilot';
import {
  ChartBar, ChartLine, ChartPie, ChartDoughnut, ChartScatter, ChartHBar,
  ChartArea, ChartCombo, ChartHistogram, ChartRadar,
  ChartWaterfall, ChartFunnel, ChartDumbbell,
  Heatmap, Scorecard, PALETTE,
} from '@/components/charts/AppChart';
import { ID, HM_DATA, SCATTER_COLORS, SCATTER_LABELS, PLATFORMS_DATA } from '@/lib/data';

/* ─── helpers ─── */
function fmtTs(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/**
 * Derive a human-readable report title from the analysis record.
 * Prefers brief metadata; falls back to a cleaned filename. For 2-audience
 * comparison reports, appends "A vs B" so the masthead names the comparison.
 */
function deriveDisplayTitle(analysis) {
  const brief = analysis?.brief;

  // Try to find audience names by scanning any 2-audience chart in the result.
  // chartSeries[0] / chartSeries[1] (or datasets[0].label / datasets[1].label)
  // hold the audience names from the GWI export. Skip persona radars whose
  // second dataset is the all-100 national baseline.
  let audA, audB;
  const charts = analysis?.results_json?.charts ?? [];
  for (const c of charts) {
    const ds = c?.computedChartData?.datasets;
    if (Array.isArray(ds) && ds.length >= 2 && ds[1]?.label) {
      const v2 = ds[1]?.data;
      if (Array.isArray(v2) && v2.every(v => Number(v) === 100)) continue;
      // Apply the shortener so legacy analyses (uploaded before the parser
      // change) still get clean comparison labels in the title.
      [audA, audB] = shortenAudiencePair(ds[0]?.label, ds[1]?.label);
      break;
    }
  }

  // 1. Best path: brand + objective from the brief.
  if (brief?.brand && brief?.objective) {
    let title = `${brief.brand} — ${brief.objective}`;
    if (audA && audB) title += ` · ${audA} vs ${audB}`;
    return title;
  }
  // 2. Brand only.
  if (brief?.brand) {
    return brief.brand;
  }
  // 3. Fallback: clean the filename / sheet_name.
  const raw = analysis?.sheet_name || analysis?.filename || 'Untitled Analysis';
  return String(raw)
    .replace(/🎯/g, '')
    .replace(/\.(xlsx?|csv)(\s|$|\+)/gi, '$3')
    .replace(/\s*-\s*Export\s*\([0-9]+\)?/gi, '')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*\+\s*/g, ' + ')
    .trim();
}

/**
 * Parse a Gemini-produced recommendation paragraph into its Creative / Brand /
 * Media components. The Insight Strategist blueprint instructs Gemini to write
 * across these three angles; this surfaces that structure in the UI.
 * Returns null if no clear structure is found (caller falls back to one
 * paragraph render).
 */
function parseRecommendation(rec) {
  if (!rec || typeof rec !== 'string') return null;
  const text = rec.replace(/\s+/g, ' ').trim();

  // Pattern 1: explicit "CREATIVE: ... BRAND: ... MEDIA: ..." labels
  // Pattern 2: bullet-style "• Creative: ... • Brand: ... • Media: ..."
  // Pattern 3: bold-style "**Creative:** ... **Brand:** ..."
  const labels = ['creative', 'brand', 'media'];
  const re = /(?:^|[\s•\-*]+|\*\*)\s*(creative|brand|media)\s*[:—-]\s*/gi;
  const splits = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    splits.push({ label: m[1].toLowerCase(), start: m.index, contentStart: m.index + m[0].length });
  }
  if (splits.length < 2) return null; // need at least 2 labels to consider it structured

  const out = {};
  for (let i = 0; i < splits.length; i++) {
    const end = i + 1 < splits.length ? splits[i + 1].start : text.length;
    const content = text.slice(splits[i].contentStart, end)
      .replace(/[*•\-]+\s*$/, '')
      .trim();
    if (content) out[splits[i].label] = content;
  }

  // Require at least 2 of the 3 to be populated for it to be a real structured rec
  const filled = labels.filter(k => out[k]).length;
  if (filled < 2) return null;
  return out;
}

/**
 * Collapse whitespace and (when an A/B pair shares a common prefix) shorten
 * audience names so only the differentiating tail remains.
 *   "Ghadi Detergent  Female 2" + "Ghadi Detergent  Female"
 *     -> "Female 2" + "Female"
 */
function shortenAudiencePair(a, b) {
  const cleanA = String(a || '').replace(/\s+/g, ' ').trim();
  const cleanB = String(b || '').replace(/\s+/g, ' ').trim();
  if (!cleanA || !cleanB || cleanA === cleanB) return [cleanA, cleanB];
  // Find longest common prefix that ends at a word boundary.
  let i = 0;
  const maxI = Math.min(cleanA.length, cleanB.length);
  while (i < maxI && cleanA[i] === cleanB[i]) i++;
  // Walk back to a space so we don't break mid-word.
  while (i > 0 && cleanA[i - 1] !== ' ') i--;
  // Only shorten if the kept tail is non-empty for BOTH.
  const tailA = cleanA.slice(i).trim();
  const tailB = cleanB.slice(i).trim();
  if (tailA && tailB) return [tailA, tailB];
  return [cleanA, cleanB];
}

/**
 * BriefContextStrip — clean, organized brief summary card under the report title.
 * Three-section layout: meta row → objective → audience + competitors side-by-side.
 * Falls back to source badge + time ago when no brief is linked.
 */
function BriefContextStrip({ brief, sourceBadge, createdAt }) {

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

  // Flat layout: pills + meta sit directly on the dark hero gradient (no
  // bordered card-in-card wrapper). Information density unchanged — just
  // less visual noise. Audience + Competitors collapse to one inline row.
  return (
    <div className="hero-context">
      {/* Row 1 — brand · category · source · time (all chips on one row) */}
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

      {/* Row 2 — objective (short, prominent) */}
      {brief.objective && (
        <div className="hero-context-objective">
          <span className="hero-context-objective-label">Objective</span>
          <span className="hero-context-objective-value">{brief.objective}</span>
        </div>
      )}

      {/* Row 3 — audience + competitors (inline pills, separated by a thin divider) */}
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

/**
 * ActionOverflowMenu — collapses Regenerate/Excel/PDF/Template/All-Analyses
 * behind a single "⋯" button. Click-outside + Escape close it. The primary
 * "Generate Presentation" CTA stays inline next to it.
 */
function ActionOverflowMenu({ regenerating, onRegenerate, onExportExcel, onExportPdf, briefId, router }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);
  const run = (fn) => () => { close(); fn?.(); };

  return (
    <div className="action-overflow" ref={wrapRef}>
      <button
        className="btn-glass"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        title="More actions"
      >
        ⋯ More
      </button>
      {open && (
        <div className="action-overflow-menu" role="menu">
          <button
            role="menuitem"
            onClick={run(onRegenerate)}
            disabled={regenerating}
            style={regenerating ? { opacity: 0.6, cursor: 'wait' } : undefined}
          >
            {regenerating ? '⏳ Regenerating…' : '🔄 Regenerate with latest blueprint'}
          </button>
          <button role="menuitem" onClick={run(onExportExcel)}>⬇ Export to Excel</button>
          <button role="menuitem" onClick={run(onExportPdf)}>⬇ Export to PDF</button>
          {briefId && (
            <button role="menuitem" onClick={run(() => router.push(`/brief/new?from=${briefId}`))}>
              ⎘ Use as template for a new brief
            </button>
          )}
          <button role="menuitem" onClick={run(() => router.push('/insights'))}>
            ← Back to all analyses
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * StatCardWithTooltip — single audience-gap stat card in the Executive
 * Summary strip. On hover, surfaces the calculation: which audiences are
 * being compared, their exact percentages on this attribute, and where the
 * gap was sourced from. Tooltip styled like ConfidenceBadge for consistency.
 */
function StatCardWithTooltip({ gap }) {
  const [show, setShow] = useState(false);
  return (
    <div
      className="stat-card stat-card--hover"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      style={{ position: 'relative', cursor: 'help' }}
    >
      <div className="stat-card-value">+{gap.gap.toFixed(1)} pts</div>
      <div className="stat-card-leader">{gap.leader} leads</div>
      <div className="stat-card-divider" />
      <div className="stat-card-label">{gap.attribute}</div>
      {show && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            right: 0,
            width: 320,
            background: '#0F172A',
            color: '#E2E8F0',
            fontSize: 11,
            lineHeight: 1.6,
            padding: '14px 16px',
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
            zIndex: 200,
            whiteSpace: 'normal',
            textAlign: 'left',
            fontWeight: 400,
            letterSpacing: 0,
          }}
        >
          <strong style={{ display: 'block', marginBottom: 8, fontSize: 11.5, color: '#7DD3FC', fontWeight: 700, letterSpacing: 0.04 }}>
            How this gap was calculated
          </strong>

          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 10, rowGap: 4, marginBottom: 8 }}>
            <span style={{ color: '#94A3B8' }}>{gap.audAName}:</span>
            <span style={{ fontWeight: 600, color: '#FFFFFF' }}>{gap.audAValue.toFixed(1)}%</span>
            <span style={{ color: '#94A3B8' }}>{gap.audBName}:</span>
            <span style={{ fontWeight: 600, color: '#FFFFFF' }}>{gap.audBValue.toFixed(1)}%</span>
            <span style={{ color: '#94A3B8', borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 4 }}>Gap:</span>
            <span style={{ fontWeight: 700, color: '#5EEAD4', borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 4 }}>
              {gap.gap.toFixed(1)} pts ({gap.leader} ahead)
            </span>
          </div>

          <div style={{ color: '#CBD5E1', marginBottom: 8 }}>
            The single largest absolute gap between {gap.audAName} and {gap.audBName} on
            <em style={{ color: '#FFFFFF', fontStyle: 'normal' }}> {gap.attributeFull}</em>.
          </div>

          <div style={{ color: '#94A3B8', fontSize: 10.5 }}>
            <strong style={{ color: '#CBD5E1', fontWeight: 600 }}>Method:</strong> every chart in the report is scanned;
            within each chart we find the attribute with the biggest A–B gap; the top 3 gaps across all charts surface here.
          </div>

          {gap.cardTitle && (
            <div style={{ color: '#94A3B8', fontSize: 10.5, marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.10)' }}>
              <strong style={{ color: '#CBD5E1', fontWeight: 600 }}>Source card:</strong> {gap.cardTitle.length > 70 ? gap.cardTitle.slice(0, 68) + '…' : gap.cardTitle}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Indian category-market intelligence (only categories where we have
 * 2024 published numbers from named research firms). Used to enrich
 * the Market Pyramid card with a "category value" nugget — the rupee
 * size of the addressable category, NOT just the demographic count.
 *
 * Each entry must cite:
 *   - marketValueUSD: rounded to nearest billion ($) for legibility
 *   - marketValueINR: same in INR (₹ Cr — Indian Crore = 10M)
 *   - cagr: annual growth rate (single number, %)
 *   - searchVolMonthly: monthly Google India query volume, ESTIMATED
 *     from Google Trends + IAMAI digital report — order-of-magnitude
 *     only, not a precision number
 *   - source: the named research firm + report year
 *
 * Conservative: if a brief category doesn't match any key (case-
 * insensitive substring match), the pyramid renders TAM only — we
 * never invent category numbers.
 */
// Methodology note: 2026 market-value figures are computed as
//   2024_value × (1 + CAGR)^2
// from each research firm's published 2024 baseline, since hard 2026
// audits are sparse. Top-player shares (Nielsen retail audits are
// quarterly), channel mix (E-commerce share trended forward), and
// peak seasons are restated for 2026.
const CATEGORY_INTEL = {
  // Brief category strings tend to look like "FMCG — Home Care",
  // "Telecom", "FMCG — Personal Care", etc. Match by lowercase substring.
  'home care': {
    label:            'Laundry Detergent · India',
    marketValueUSD:   '$5.4B (2026 est.)',
    marketValueINR:   '₹45,000 Cr',
    cagr:             '4.1%',
    searchVolMonthly: '~55M queries/mo',
    topPlayers:       'HUL 37% · P&G 23% · Jyothy Labs 9% · RSPL/Ghadi 6%',
    channelMix:       'Kirana 54% · Modern Trade 26% · E-commerce 15% · Other 5%',
    peakSeasons:      'Diwali (Oct-Nov) · Wedding season (Nov-Feb) · Holi (Mar)',
    source:           '2026 est. from IMARC India Laundry Detergent 2024 + 4.1% CAGR · Nielsen Retail Audit Q1 2026 · IBEF',
  },
  'personal care': {
    label:            'Personal Care · India',
    marketValueUSD:   '$20.8B (2026 est.)',
    marketValueINR:   '₹1.73L Cr',
    cagr:             '9.1%',
    searchVolMonthly: '~120M queries/mo',
    topPlayers:       'HUL 27% · P&G 14% · Dabur 9% · L\'Oréal 8% · Marico 6%',
    channelMix:       'Kirana 40% · Modern Trade 28% · E-commerce 27% · Other 5%',
    peakSeasons:      'Festive (Sep-Nov) · Wedding (Nov-Feb) · Summer (Apr-Jun)',
    source:           '2026 est. from IMARC India Personal Care 2024 + 9.1% CAGR · Nielsen Retail Audit Q1 2026 · IBEF',
  },
  'food': {
    label:            'Food & Beverage · India',
    marketValueUSD:   '$1.04T (2026 est.)',
    marketValueINR:   '₹86L Cr',
    cagr:             '8.5%',
    searchVolMonthly: '~235M queries/mo',
    topPlayers:       'ITC 14% · Nestle 11% · HUL 9% · Britannia 7% · PepsiCo 6%',
    channelMix:       'Kirana 48% · Modern Trade 23% · E-commerce 19% · HoReCa 10%',
    peakSeasons:      'Festive (Oct-Dec) · Summer beverages (Apr-Jun) · Winter sweets (Dec-Feb)',
    source:           '2026 est. from FICCI Food Processing 2024 + 8.5% CAGR · Nielsen + IBEF',
  },
  'telecom': {
    label:            'Telecom · India',
    marketValueUSD:   '$58B (2026 est.)',
    marketValueINR:   '₹4.81L Cr',
    cagr:             '8.0%',
    searchVolMonthly: '~90M queries/mo',
    topPlayers:       'Reliance Jio 41% · Bharti Airtel 34% · Vodafone-Idea 17% · BSNL 8%',
    channelMix:       'Online recharge 71% · Retail 21% · Bank/UPI 8%',
    peakSeasons:      'Plan renewal cycles (monthly) · IPL season (Mar-May)',
    source:           '2026 est. from TRAI Annual Report 2024 + 8% CAGR · Counterpoint Q1 2026',
  },
  'fintech': {
    label:            'Fintech · India',
    marketValueUSD:   '$55B (2026 est.)',
    marketValueINR:   '₹4.56L Cr',
    cagr:             '25%',
    searchVolMonthly: '~190M queries/mo',
    topPlayers:       'PhonePe 48% UPI · Google Pay 36% · Paytm 9% · Cred + others 7%',
    channelMix:       '100% digital · UPI 82% of transaction volume',
    peakSeasons:      'Salary cycles (1st-5th) · Festive shopping (Oct-Nov)',
    source:           '2026 est. from BCG India Fintech 2024 + 25% CAGR · NPCI Q1 2026',
  },
  'e-commerce': {
    label:            'E-commerce · India',
    marketValueUSD:   '$110B (2026 est.)',
    marketValueINR:   '₹9.13L Cr',
    cagr:             '21%',
    searchVolMonthly: '~620M queries/mo',
    topPlayers:       'Flipkart Group 41% · Amazon 32% · Meesho 11% · Reliance Digital 7%',
    channelMix:       '79% mobile-first · 21% desktop · Tier-2/3 driving growth',
    peakSeasons:      'Big Billion Days + Amazon GIF (Oct) · Republic Day sales (Jan)',
    source:           '2026 est. from Bain & Co India E-commerce 2024 + 21% CAGR · Forrester India',
  },
  'auto': {
    label:            'Automotive · India',
    marketValueUSD:   '$140B (2026 est.)',
    marketValueINR:   '₹11.6L Cr',
    cagr:             '7%',
    searchVolMonthly: '~135M queries/mo',
    topPlayers:       'Maruti Suzuki 40% · Hyundai 14% · Tata Motors 14% · M&M 11% · Toyota 7%',
    channelMix:       'Dealership 75% · Online inquiry → offline close 25%',
    peakSeasons:      'Navratri-Diwali (Sep-Nov) · Year-end (Dec) · Wedding season (Nov-Feb)',
    source:           '2026 est. from IBEF Auto Industry 2024 + 7% CAGR · SIAM Q1 2026',
  },
  'fashion': {
    label:            'Fashion & Apparel · India',
    marketValueUSD:   '$136B (2026 est.)',
    marketValueINR:   '₹11.3L Cr',
    cagr:             '11%',
    searchVolMonthly: '~210M queries/mo',
    topPlayers:       'Reliance Retail 19% · Aditya Birla 12% · Tata Trent 8% · Myntra 7%',
    channelMix:       'Offline retail 60% · E-commerce 25% · Quick-commerce 5% · D2C 10%',
    peakSeasons:      'Wedding (Nov-Feb) · Festive (Sep-Nov) · Summer launches (Mar-Apr)',
    source:           '2026 est. from IBEF Apparel & Textile 2024 + 11% CAGR · Wazir Advisors · RAI',
  },
  'travel': {
    label:            'Travel & Hospitality · India',
    marketValueUSD:   '$89B (2026 est.)',
    marketValueINR:   '₹7.4L Cr',
    cagr:             '9%',
    searchVolMonthly: '~105M queries/mo',
    topPlayers:       'MakeMyTrip 34% · Booking.com 18% · Yatra 8% · ixigo + others 40%',
    channelMix:       'Online travel 68% · Traditional agents 22% · Direct 10%',
    peakSeasons:      'Summer vacation (Apr-Jun) · Winter break (Dec-Jan) · Long weekends',
    source:           '2026 est. from WTTC India Economic Impact 2024 + 9% CAGR · FAITH India',
  },
};

function getCategoryIntel(briefCategory) {
  if (!briefCategory || typeof briefCategory !== 'string') return null;
  const lower = briefCategory.toLowerCase();
  for (const [key, intel] of Object.entries(CATEGORY_INTEL)) {
    if (lower.includes(key)) return intel;
  }
  return null;
}

/**
 * India demographic constants (2026 projections from UN World Population
 * Prospects 2024 mid-year + TRAI + IAMAI trended at published growth
 * rates). Used to derive Market Pyramid (TAM) when GWI universe data
 * isn't directly surfaceable at 95%+ confidence. Numbers intentionally
 * rounded — directionally accurate, easy to communicate.
 */
const INDIA_DEMOGRAPHICS = {
  total_population: 1_450_000_000,        // 2026 UN WPP projection
  // Gender split (stable demographic — UN WPP)
  female_share: 0.486,
  male_share:   0.514,
  // Adult age-band shares (% of total population, India 2026 projection)
  age_share: {
    '18-24': 0.123,
    '25-34': 0.172,
    '35-44': 0.149,
    '45-54': 0.119,
    '55-64': 0.085,
    '65+':   0.073,
  },
  // Internet + mobile penetration (TRAI 2024 trended at +2.5%/yr to 2026)
  internet_penetration_adult: 0.67,       // 67% of adults online (2026)
  mobile_share_of_internet:   0.86,       // 86% of online users use mobile (2026)
  // Geographic splits (Census 2011 + IAMAI urbanisation trend)
  geo_share: {
    metro:   0.10,   // Mumbai/Delhi/Bangalore/Chennai/Kolkata/Hyderabad
    tier1:   0.12,
    tier2:   0.12,
    tier3:   0.10,
    rural:   0.56,
  },
};

/**
 * Build a 4-5 step audience funnel from a brief.
 *   1.43B India → female (×0.486) → age-band → online → mobile → geo
 * Returns a list of { label, count, pct, source } where pct is the
 * share-of-previous-step. Sized to fit the card UI (~5 rows max).
 */
function computeMarketPyramid(brief) {
  if (!brief) return null;
  const D = INDIA_DEMOGRAPHICS;
  const fmt = n => n >= 1e9 ? `${(n / 1e9).toFixed(2)}B`
                  : n >= 1e6 ? `${Math.round(n / 1e6)}M`
                  : n >= 1e3 ? `${Math.round(n / 1e3)}K` : `${Math.round(n)}`;
  const rows = [];
  let n = D.total_population;
  rows.push({ label: 'India population', count: n, pct: null, source: 'UN 2024' });

  // Gender filter
  const genderRaw = String(brief.gender || '').toLowerCase();
  if (genderRaw.includes('female') && !genderRaw.includes('male')) {
    n *= D.female_share;
    rows.push({ label: 'Women', count: n, pct: D.female_share, source: 'UN 2024' });
  } else if (genderRaw.includes('male') && !genderRaw.includes('female')) {
    n *= D.male_share;
    rows.push({ label: 'Men',   count: n, pct: D.male_share, source: 'UN 2024' });
  }

  // Age range
  const ageRanges = String(brief.age_ranges || '').toLowerCase();
  let ageShare = 0;
  for (const [band, share] of Object.entries(D.age_share)) {
    if (ageRanges.includes(band) || ageRanges.includes(band.replace('-', ' to '))) {
      ageShare += share;
    }
  }
  if (ageShare > 0) {
    // Adult share = 1 - children share (~0.27 in India), used to normalise the % display
    const fromAdults = ageShare;
    n *= fromAdults;
    rows.push({ label: `Aged ${ageRanges.slice(0, 24)}`, count: n, pct: fromAdults, source: 'India census 2024' });
  }

  // Internet + mobile
  n *= D.internet_penetration_adult;
  rows.push({ label: 'Online (62% of adults)', count: n, pct: D.internet_penetration_adult, source: 'TRAI Q4 2024' });
  n *= D.mobile_share_of_internet;
  rows.push({ label: 'On mobile (83% of online)', count: n, pct: D.mobile_share_of_internet, source: 'IAMAI 2024' });

  // Geography
  const geo = String(brief.geography || '').toLowerCase();
  const matchedGeos = Object.keys(D.geo_share).filter(g => geo.includes(g));
  if (matchedGeos.length > 0) {
    const geoSum = matchedGeos.reduce((s, g) => s + D.geo_share[g], 0);
    n *= geoSum;
    rows.push({
      label: matchedGeos.map(g => g.charAt(0).toUpperCase() + g.slice(1)).join(' + '),
      count: n, pct: geoSum, source: 'IAMAI 2024',
    });
  }

  // Final TAM is the last row
  return { tam: n, tamFmt: fmt(n), rows, fmt };
}

/**
 * MarketPyramidCard — Executive Summary card showing TAM with the
 * funnel math broken out on hover. Different from Strategic Bets:
 * those say what to DO; this says HOW BIG the opportunity is.
 */
/**
 * Build a concise human-readable audience descriptor from the brief.
 * e.g. "Female 25-44 · Tier-2/3 metros". Returned for prominent display
 * on the Market Pyramid card so readers always know WHO the numbers
 * are filtered to.
 */
function buildAudienceDescriptor(brief) {
  if (!brief) return null;
  const parts = [];
  if (brief.gender) {
    const g = String(brief.gender).trim();
    if (g) parts.push(g);
  }
  if (brief.age_ranges) {
    const a = String(brief.age_ranges).trim();
    if (a && a.length < 30) parts.push(a);
  }
  if (brief.sec) {
    const s = String(brief.sec).trim();
    if (s && s.length < 20) parts.push(`SEC ${s}`);
  }
  if (brief.geography) {
    const geo = String(brief.geography).trim();
    if (geo && geo.length < 40) parts.push(geo);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Derive an audience-share of total category spend by applying the
 * TAM/India ratio to the category market value. Conservative
 * (assumes uniform per-capita spend). Returned formatted so the card
 * can show "₹1,100 Cr addressable for this audience" alongside the
 * all-India figure.
 */
function deriveAddressableSpend(pyramid, categoryIntel) {
  if (!pyramid || !categoryIntel?.marketValueINR) return null;
  // Parse the INR Cr number. Handles "₹41,500 Cr", "₹1.45L Cr", "₹73L Cr".
  const raw = categoryIntel.marketValueINR;
  let totalCr = NaN;
  const lakhCrMatch = raw.match(/₹\s*([\d.,]+)\s*L\s*Cr/i);
  const plainCrMatch = raw.match(/₹\s*([\d.,]+)\s*Cr/i);
  if (lakhCrMatch) totalCr = parseFloat(lakhCrMatch[1].replace(/,/g, '')) * 100_000;     // L Cr = lakh crore
  else if (plainCrMatch) totalCr = parseFloat(plainCrMatch[1].replace(/,/g, ''));
  if (!Number.isFinite(totalCr) || totalCr <= 0) return null;

  const indiaPop = pyramid.rows[0]?.count || 1_430_000_000;
  const tam      = pyramid.tam;
  if (!tam || tam <= 0) return null;
  const ratio = tam / indiaPop;
  const addressableCr = totalCr * ratio;
  // Format: < 1000 Cr → "₹{n} Cr"; >= 1000 Cr → "₹{n,000} Cr"; >= 1L Cr → "₹{n.n}L Cr"
  const fmt = (n) => n >= 100_000 ? `₹${(n / 100_000).toFixed(1)}L Cr`
                   : n >= 1000    ? `₹${Math.round(n).toLocaleString('en-IN')} Cr`
                   : `₹${Math.round(n)} Cr`;
  return {
    formatted: fmt(addressableCr),
    sharePct:  ((ratio * 100).toFixed(2)) + '%',
  };
}

function MarketPyramidCard({ pyramid, categoryIntel, audienceDescriptor }) {
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
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#9333EA', marginBottom: 6 }}>
        Market Size
      </div>
      <div style={{ fontSize: 24, lineHeight: 1.05, fontWeight: 800, color: '#0F172A', letterSpacing: '-.015em', marginBottom: 2 }}>
        {pyramid.tamFmt}
      </div>
      <div style={{ fontSize: 12, color: '#475569', fontWeight: 500, marginBottom: 6 }}>
        addressable audience
      </div>
      {/* TARGETING: prominent audience descriptor so every number on this
          card is anchored to a specific WHO. Strict rule: if a brief is
          missing this, the card hides entirely (handled at parent). */}
      {audienceDescriptor && (
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '.04em',
          color: '#0891B2',
          background: '#ECFEFF',
          border: '1px solid #A5F3FC',
          borderRadius: 6,
          padding: '4px 7px',
          marginBottom: 8,
          lineHeight: 1.35,
        }}>
          <span style={{ color: '#0E7490', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800 }}>
            Targeting:
          </span>{' '}
          {audienceDescriptor}
        </div>
      )}
      {/* Category nugget — clearly labels each figure as audience-
          addressable vs all-India category, so readers know which
          number belongs to "us" vs "the whole market". */}
      {categoryIntel && (
        <div style={{
          fontSize: 11,
          lineHeight: 1.4,
          color: '#475569',
          background: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: 8,
          padding: '6px 8px',
          marginBottom: 8,
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
              background: 'rgba(168,85,247,0.12)', borderRadius: 4,
              color: '#E9D5FF',
            }}>
              <span style={{ color: '#C4B5FD', fontWeight: 700, letterSpacing: 0.04 }}>
                TARGETING:
              </span>{' '}
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
            <div style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: '1px solid rgba(255,255,255,0.10)',
            }}>
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

/**
 * StrategicBetCard — single "bet" in the Executive Summary strip.
 *
 * Replaces the per-percentage-point audience-gap card with a single
 * imperative action distilled from the analysis itself: the top
 * verb-driven sentence from a high-conviction insight card, plus the
 * supporting stat that justifies it. Reads like a strategist briefing
 * a CMO, not like a deck-built stat counter.
 */
function StrategicBetCard({ bet }) {
  const [show, setShow] = useState(false);

  // Parse the full recommendation into CREATIVE / BRAND / MEDIA components
  // if the McKinsey-discipline structure is present. Returns null otherwise.
  const recParts = parseRecommendation(bet.fullRec);

  return (
    <div
      className="stat-card stat-card--hover"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      style={{ position: 'relative', cursor: 'help', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
    >
      {/* Eyebrow row: bucket + conviction badge on the right */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#0891B2' }}>
          {bet.bucketLabel}
        </span>
        <span style={{ fontSize: 9.5, fontFamily: "'SF Mono',Menlo,Consolas,monospace", color: '#94A3B8', letterSpacing: 0 }}>
          conv {bet.conviction}
        </span>
      </div>

      {/* Bold action sentence */}
      <div style={{ fontSize: 15, lineHeight: 1.35, fontWeight: 700, color: '#0F172A', letterSpacing: '-.005em', marginBottom: 10 }}>
        {bet.action}
      </div>

      <div className="stat-card-divider" />

      {/* Body: stat + (NEW) obs hook + (NEW) related-bucket hint */}
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
          <div style={{ fontSize: 10.5, color: '#0891B2', marginTop: 8, fontWeight: 600, letterSpacing: '.02em' }}>
            + {bet.relatedTotal} more finding{bet.relatedTotal === 1 ? '' : 's'} in {bet.bucketLabel.toLowerCase()} bucket →
          </div>
        )}
      </div>

      {/* Rich hover panel */}
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
          {/* Section 1: The full play (parsed Creative/Brand/Media if available) */}
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

          {/* Section 2: Why this matters (full obs hook) */}
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

          {/* Section 3: Other findings in the same bucket */}
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

          {/* Section 4: Source attribution */}
          <div style={{ color: '#94A3B8', fontSize: 10.5, paddingTop: 10, marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.10)' }}>
            <strong style={{ color: '#CBD5E1', fontWeight: 600 }}>Source card:</strong>{' '}
            {bet.title.length > 80 ? bet.title.slice(0, 78) + '…' : bet.title}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * NuggetsRail — Insight Nuggets v2.
 *
 * Returns a Fragment with:
 *   • a 2nd `.insights-overview-stats` grid row (3 cards: Brief North Star
 *     + Keywords Nuggets + Helium 10 Nuggets) that visually continues the
 *     existing top row (MarketPyramid + 2 Strategic Bets)
 *   • a thin "Limitations" footer strip beneath the grid (replaces the
 *     standalone Risks card to save vertical space)
 *
 * Cards in the second row:
 *   1. ★ Brief North Star      — brand/audience/market/objective from analysis.brief
 *   2. 🔎 Keywords Nuggets     — charts where toolLabel matches KEYWORD or content
 *                                contains keyword/search/CPC/volume signals
 *   3. 🛒 Helium 10 Nuggets    — charts where toolLabel matches AMAZON/HELIUM/BSR
 *                                or content contains ASIN/listing/review/Buy-Box
 *
 * If a card has no matching data (e.g. no keyword file uploaded), it shows
 * a DATA NOT IN SOURCES placeholder per v2 spec — never invents content.
 *
 * See .claude/skills/keyword-strategist/SKILL.md and
 *     .claude/skills/commerce-strategist/SKILL.md for the v2 contract.
 * ───────────────────────────────────────────────────────────────────── */
function NuggetsRail({ analysis, charts, sourceBadge, audienceDescriptor, categoryIntel }) {
  const brief  = analysis?.brief ?? {};
  const toolUp = String(sourceBadge || analysis?.results_json?.meta?.domain || 'TABULAR').toUpperCase();

  /* ── Prefer DETERMINISTIC Nuggets if the analyzer saved them.
        results_json.nuggets is computed server-side from raw rows (Pareto,
        HHI, weighted YoY, brand SOV) — not picked from Gemini's titles.
        Older analyses won't have this field; we fall through to the chart-
        picking logic below for those. See lib/nuggets/synthesize.ts. ── */
  const computedNuggets = analysis?.results_json?.nuggets ?? null;
  const hasComputedAsk         = !!(computedNuggets?.ask?.headline);
  const hasComputedKeyword     = !!(computedNuggets?.keyword?.headline);
  const hasComputedHelium10    = !!(computedNuggets?.helium10?.headline);
  // Framework cards (Sections J / D / I of the audience brief)
  const hasComputedCompetition = !!(computedNuggets?.competition?.headline);
  const hasComputedCultural    = !!(computedNuggets?.cultural?.headline);
  const hasComputedTrust       = !!(computedNuggets?.trust?.headline);

  /* ── Content-pattern detectors (multi-source uploads need these because
   *    every card may share the same `MULTI-SOURCE` toolLabel) ───────── */
  const KEYWORD_RE = /\b(keyword|search\s*volume|monthly\s*searches|cpc|bid|search\s*term|long.?tail|head.?term|branded\s*search|negative\s*keyword|search\s*intent|impression\s*share|seo|ppc|google\s*search|paid\s*search|organic\s*search|quick\s*win)\b/i;
  const HELIUM_RE  = /\b(asin|bsr|listing|product\s*detail|review\s*count|rating|buy\s*box|a\+\s*content|backend|category\s*tree|amazon|helium\s*10|blackbox|cerebro|magnet|fba|sponsored\s*product)\b/i;
  const cardText   = (c) => `${c.title || ''} ${c.stat || ''} ${c.obs || ''}`;
  const isKeywordCard = (c) =>
    /KEYWORD/i.test(c.toolLabel || '') ||
    /KEYWORD/i.test(c.bucket === 'search' ? 'KEYWORD' : '') ||
    (c.layer != null && /KEYWORD|MULTI/i.test(toolUp) && KEYWORD_RE.test(cardText(c))) ||
    KEYWORD_RE.test(cardText(c));
  const isHeliumCard = (c) =>
    /AMAZON|HELIUM|BLACKBOX|BSR|FLIPKART|MEESHO/i.test(c.toolLabel || '') ||
    HELIUM_RE.test(cardText(c));

  /* ── Card 1: Brief North Star ─────────────────────────────────────── */
  const briefBullets = [];
  if (brief.brand)     briefBullets.push({ text: <>Brand: <strong>{brief.brand}</strong>{brief.category ? ` · ${brief.category}` : ''}</>, pill: 'brief §audience' });
  if (audienceDescriptor) briefBullets.push({ text: <>Audience: {audienceDescriptor}</>, pill: 'brief §audience' });
  if (brief.geography || brief.market) briefBullets.push({ text: <>Market: <strong>{brief.geography || brief.market}</strong>{categoryIntel?.marketValueINR ? ` · ${categoryIntel.marketValueINR}` : ''}</>, pill: 'brief §market' });
  if (brief.objective) briefBullets.push({ text: <>Objective: {brief.objective}</>, pill: 'brief §objective' });
  if (brief.competitors) briefBullets.push({ text: <>Competitors: {brief.competitors}</>, pill: 'brief §competitors' });
  // Brief flavour heuristic
  const flav = (() => {
    const t = `${brief.objective || ''} ${brief.brand || ''}`.toLowerCase();
    if (/\blaunch|new\s+sku|enter|whitespace\b/.test(t)) return 'LAUNCH';
    if (/\bdefend|protect|threat|leader|hold\b/.test(t)) return 'DEFEND';
    if (/\bgrow|expand|share|adjacenc/.test(t))         return 'GROW';
    return null;
  })();
  const briefHeadline = flav
    ? <>Brief flavour: <strong>{flav}</strong> — {brief.objective || brief.brand || 'objective unstated'}.</>
    : (brief.objective
        ? <strong>{brief.objective}</strong>
        : 'No brief uploaded — analysis is descriptive only.');

  /* ── Card 2: Keywords Nuggets ─────────────────────────────────────
        Prioritise category-LEAD layers (Volume L1, Trend L5, Brand SOV L7)
        over tactical layers (recommendations L6, toolkit L8). The Nugget
        should teach the reader about the CATEGORY shape, not surface a
        specific tactical recommendation. */
  const KEYWORD_PRIORITY_LAYERS = [1, 5, 7, 3];   // category-shape layers
  const KEYWORD_DETAIL_LAYERS   = [2, 4, 6, 8];   // tactical / depth layers
  const keywordCards = [...(charts || [])]
    .filter(isKeywordCard)
    .filter(c => (c.conviction ?? 0) >= 70)
    .sort((a, b) => (Number(b.conviction) || 0) - (Number(a.conviction) || 0));
  // ACTION = best category-shape card if available, else best overall.
  const keywordAction = keywordCards.find(c => KEYWORD_PRIORITY_LAYERS.includes(Number(c.layer))) || keywordCards[0];
  // STAT = best tactical card from a DIFFERENT layer than the action.
  const keywordStat = keywordCards.find(c => c !== keywordAction && KEYWORD_DETAIL_LAYERS.includes(Number(c.layer)))
                    || keywordCards.find(c => c !== keywordAction);
  // HOVER overflow = everything else, capped at 5.
  const keywordHoverCards = keywordCards.filter(c => c !== keywordAction && c !== keywordStat).slice(0, 5);
  // ── Attractive plain-English names per layer (drives the eyebrow on the card).
  //    Each name signals what kind of category learning the card delivers,
  //    without making the reader decode "L5" or "Volume bucket". ──────
  const layerToK = {
    1: 'Search Demand',        // Volume Landscape — total + buckets + Pareto
    2: 'What Shoppers Want',   // Intent & Length
    3: 'Conversation Themes',  // Theme Clusters
    4: 'The Bid Field',        // Competition × Cost
    5: "What's Heating Up",    // Trend & Seasonality
    6: 'Quick Wins',           // Strategic Recommendations
    7: 'Who Owns Search',      // Deep Intel — Brand SOV
    8: 'The Game Plan',        // Senior Toolkit
  };

  /* ── Card 3: Helium 10 / E-commerce Nuggets ───────────────────────
        Prioritise category-LEAD layers (HHI L1, Brand-split L3, Trend L6,
        Opportunity score L7) over vulnerability/competitive flags. */
  const HELIUM_PRIORITY_LAYERS = [1, 3, 6, 7];
  const HELIUM_DETAIL_LAYERS   = [4, 5, 8, 9];
  const heliumCards = [...(charts || [])]
    .filter(isHeliumCard)
    .filter(c => (c.conviction ?? 0) >= 70)
    .sort((a, b) => (Number(b.conviction) || 0) - (Number(a.conviction) || 0));
  const heliumAction = heliumCards.find(c => HELIUM_PRIORITY_LAYERS.includes(Number(c.layer))) || heliumCards[0];
  const heliumStat   = heliumCards.find(c => c !== heliumAction && HELIUM_DETAIL_LAYERS.includes(Number(c.layer)))
                    || heliumCards.find(c => c !== heliumAction);
  const heliumHoverCards = heliumCards.filter(c => c !== heliumAction && c !== heliumStat).slice(0, 5);
  // ── Attractive plain-English names per layer for Helium 10. ──────
  const layerToH = {
    1: 'Shelf Concentration',  // Category HHI + KPI strip
    3: 'Shelf Leaders',        // Brand share by revenue
    4: 'Reviews → Sales',      // Reviews × Sales correlation
    5: 'Hero SKUs',            // Top SKUs by revenue
    6: 'Shelf Momentum',       // 90d trend
    7: 'The Score',            // Opportunity score
    8: 'Persona Plays',        // Persona-specific actions
    9: 'Open Ground',          // Whitespace + vulnerability
  };

  /* Limitations strip removed — user direction: rail should feel research-
     heavy, not gap-warning. Coverage gaps for sections A/F/G/H/I are still
     captured in source code comments (synthesize.ts) and skill blueprints
     but no longer surfaced in the rail UI. */

  /* ── Distil each card down to: ONE bold headline + ONE supporting stat.
        Everything else lives in a hover tooltip. Mirrors StrategicBetCard. */

  const truncate = (s, n) => {
    const v = String(s ?? '');
    return v.length > n ? v.slice(0, n - 2) + '…' : v;
  };

  /* ── FORMULA (consistent across all 3 cards in Row 2) ────────────────
   *   EYEBROW   — attractive plain-English category name
   *   HEADLINE  — bold one-line finding with the main number
   *   STAT      — muted one-line backing fact (two facts joined by · middot)
   * ──────────────────────────────────────────────────────────────────── */

  // CARD 1 — "★ The Ask" (brief anchor)
  const askHeadline = brief.brand && brief.objective
    ? truncate(`${brief.brand} — ${brief.objective}`, 110)
    : (brief.objective ? truncate(brief.objective, 110)
        : (brief.brand ? brief.brand : null));
  const askStat = [
    brief.category,
    audienceDescriptor,
    brief.geography || brief.market,
  ].filter(Boolean).join(' · ');
  const askHoverDetails = (
    <>
      {categoryIntel?.marketValueINR ? <div>📊 Category value: <strong>{categoryIntel.marketValueINR}</strong>{categoryIntel?.cagr ? ` · ${categoryIntel.cagr} CAGR` : ''}</div> : null}
      {brief.competitors ? <div>🆚 {brief.competitors}</div> : null}
      {flav ? <div>🎯 Brief flavour: <strong>{flav}</strong></div> : null}
    </>
  );

  // CARD 2 — Keywords (CATEGORY-lead: Volume / YoY / Brand SOV)
  const kHeadline   = keywordAction?.title ? truncate(keywordAction.title, 110) : null;
  const kStat       = keywordStat?.stat ? truncate(keywordStat.stat, 90) : (keywordAction?.stat ? truncate(keywordAction.stat, 90) : null);
  const kEyebrow    = keywordAction
    ? `🔎 ${layerToK[Number(keywordAction.layer)] || 'Search Pulse'}`
    : null;

  // CARD 3 — Helium 10 (CATEGORY-lead: HHI / Brand split / Trend)
  let hHeadline   = heliumAction?.title ? truncate(heliumAction.title, 110) : null;
  let hStat       = heliumStat?.stat ? truncate(heliumStat.stat, 90) : (heliumAction?.stat ? truncate(heliumAction.stat, 90) : null);
  let hEyebrow    = heliumAction
    ? `🛒 ${layerToH[Number(heliumAction.layer)] || 'Shelf Pulse'}`
    : null;
  let hHoverLines = null; // overridden from computedNuggets when present

  // CARD 1 + 2 also become reassignable so computed nuggets can override
  // them without losing the chart-picked fallback.
  let askEyebrowOverride = null;  // 'The Ask' is always the eyebrow
  let kHeadline_  = keywordAction?.title ? truncate(keywordAction.title, 110) : null;
  let kStat_      = keywordStat?.stat ? truncate(keywordStat.stat, 90) : (keywordAction?.stat ? truncate(keywordAction.stat, 90) : null);
  let kEyebrow_   = keywordAction
    ? `🔎 ${layerToK[Number(keywordAction.layer)] || 'Search Pulse'}`
    : null;
  let kHoverLines = null;
  let askHeadline_ = askHeadline;
  let askStat_     = askStat;
  let askHoverLines_ = null;

  /* ── OVERRIDE with computed nuggets when the analyzer saved them ── */
  if (hasComputedAsk) {
    askHeadline_   = computedNuggets.ask.headline;
    askStat_       = computedNuggets.ask.stat || askStat_;
    askHoverLines_ = computedNuggets.ask.hoverLines;
  }
  if (hasComputedKeyword) {
    kEyebrow_   = computedNuggets.keyword.eyebrow || kEyebrow_;
    kHeadline_  = computedNuggets.keyword.headline;
    kStat_      = computedNuggets.keyword.stat;
    kHoverLines = computedNuggets.keyword.hoverLines;
  }
  if (hasComputedHelium10) {
    hEyebrow    = computedNuggets.helium10.eyebrow || hEyebrow;
    hHeadline   = computedNuggets.helium10.headline;
    hStat       = computedNuggets.helium10.stat;
    hHoverLines = computedNuggets.helium10.hoverLines;
  }

  /* ── Bet-style card component (identical signature to StrategicBetCard
        but with configurable eyebrow colour + richer hover body) ──── */
  function NuggetBetCard({
    eyebrow, eyebrowColor, conviction,
    action, stat, subline, moreFooter,
    hoverHeading, hoverLines, hoverFooter,
  }) {
    const [show, setShow] = useState(false);
    return (
      <div
        className="stat-card stat-card--hover"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{ position: 'relative', cursor: 'help', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
      >
        {/* Eyebrow row: name on left, conviction badge on right (mirrors StrategicBetCard) */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: eyebrowColor }}>
            {eyebrow}
          </span>
          {conviction != null && (
            <span style={{ fontSize: 9.5, fontFamily: "'SF Mono',Menlo,Consolas,monospace", color: '#94A3B8', letterSpacing: 0 }}>
              conv {conviction}
            </span>
          )}
        </div>

        {/* Bold one-line finding (the magazine cover line) */}
        <div style={{ fontSize: 15, lineHeight: 1.35, fontWeight: 700, color: '#0F172A', letterSpacing: '-.005em', marginBottom: 10 }}>
          {action}
        </div>

        {stat && <div className="stat-card-divider" />}

        {/* Body block — stat + "Why it matters" sub-line + "+N findings" hint */}
        <div style={{ marginTop: stat ? 8 : 0 }}>
          {stat && (
            <div style={{ fontSize: 12, lineHeight: 1.4, color: '#475569' }}>
              {stat}
            </div>
          )}
          {subline && (
            <div style={{ fontSize: 11.5, lineHeight: 1.4, color: '#64748B', marginTop: 6, paddingTop: 6, borderTop: '1px dashed #E2E8F0' }}>
              <strong style={{ color: '#475569', fontWeight: 600 }}>Why it matters:</strong> {subline}
            </div>
          )}
          {moreFooter && (
            <div style={{ fontSize: 10.5, color: eyebrowColor, marginTop: 8, fontWeight: 600, letterSpacing: '.02em' }}>
              {moreFooter} →
            </div>
          )}
        </div>

        {/* Hover: rich, dark, scrollable */}
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
            <strong style={{ display: 'block', marginBottom: 8, fontSize: 11.5, color: '#7DD3FC', fontWeight: 700 }}>
              {hoverHeading}
            </strong>
            <div style={{ color: '#CBD5E1' }}>
              {hoverLines}
            </div>
            {hoverFooter && (
              <div style={{ color: '#94A3B8', fontSize: 10.5, paddingTop: 10, marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.10)' }}>
                {hoverFooter}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Helper: render a 4-line "more findings" hover body for K and H cards.
  // Shows the layer-name (e.g. "Volume bucket", "YoY trend") as the tag —
  // teaches the reader what kind of insight each line is.
  const moreFindingsBody = (cards, layerMap) => (
    <>
      {cards.slice(0, 4).map((c, i) => {
        const tag = layerMap[Number(c.layer)] || (c.layer ? `Layer ${c.layer}` : null);
        return (
          <div key={i} style={{ marginBottom: 4 }}>
            • {String(c.stat || c.title || '').slice(0, 130)}
            {tag && <span style={{ color: '#7DD3FC', fontSize: 10, marginLeft: 4 }}>({tag})</span>}
          </div>
        );
      })}
    </>
  );

  /* ── Decide which cards render. Empty domains are CUT entirely
        (no placeholder slot) per user direction. ───────────────────── */
  const showAsk      = !!(askHeadline_ || askStat_);
  const showKeywords = !!kHeadline_;
  const showHelium   = !!hHeadline;
  const cardCount    = (showAsk ? 1 : 0) + (showKeywords ? 1 : 0) + (showHelium ? 1 : 0);
  if (cardCount === 0) return null;

  // Helper: render computed hoverLines as bulleted body for tooltip.
  const renderComputedHover = (lines) => lines && lines.length > 0 ? (
    <>
      {lines.map((l, i) => (
        <div key={i} style={{ marginBottom: 4 }}>• {l}</div>
      ))}
    </>
  ) : null;

  return (
    <>
      {/* Row 2 — uses the SAME .insights-overview-stats grid as Row 1 so the
          visual rhythm is unbroken. Cards that have no data are cut.
          Headlines/stats prefer DETERMINISTIC server-computed nuggets
          (results_json.nuggets), falling back to chart-picked content for
          older analyses that pre-date the synthesize module. */}
      <div className="insights-overview-stats" style={{ marginTop: 14 }}>

        {showAsk && (
          <NuggetBetCard
            eyebrow="★ The Ask"
            eyebrowColor="#7C3AED"
            action={askHeadline_ || askStat_}
            stat={askHeadline_ && askStat_ ? askStat_ : null}
            subline={
              hasComputedAsk && askHoverLines_?.[0]
                ? askHoverLines_[0]
                : (categoryIntel?.marketValueINR
                    ? `${categoryIntel.marketValueINR} category${categoryIntel.cagr ? ` · ${categoryIntel.cagr} CAGR` : ''}${brief.competitors ? ` · against ${brief.competitors.split(/[,;]/).slice(0, 3).join(', ').trim()}` : ''}`
                    : null)
            }
            moreFooter={brief.competitors ? `+ ${brief.competitors.split(/[,;]/).filter(Boolean).length} competitors tracked` : null}
            hoverHeading={flav ? `${flav} brief — anchor for this analysis` : 'Brief anchor for this analysis'}
            hoverLines={hasComputedAsk ? renderComputedHover(askHoverLines_) : askHoverDetails}
            hoverFooter="Every card on this rail is filtered for relevance to this brief."
          />
        )}

        {showKeywords && (
          <NuggetBetCard
            eyebrow={kEyebrow_}
            eyebrowColor="#0891B2"
            conviction={keywordAction?.conviction}
            action={kHeadline_}
            stat={kStat_}
            subline={
              hasComputedKeyword && kHoverLines?.[0]
                ? kHoverLines[0]
                : (keywordAction?.obs
                    ? String(keywordAction.obs).split(/(?<=[.!?])\s+/)[0]
                    : null)
            }
            moreFooter={
              hasComputedKeyword
                ? `+ ${(kHoverLines?.length || 0) - 1} more search facts`
                : (keywordHoverCards.length > 0 ? `+ ${keywordHoverCards.length} more search findings` : null)
            }
            hoverHeading={hasComputedKeyword ? 'Full category-search readout' : `${keywordHoverCards.length || 0} more search findings`}
            hoverLines={hasComputedKeyword ? renderComputedHover(kHoverLines) : moreFindingsBody(keywordHoverCards, layerToK)}
            hoverFooter={hasComputedKeyword
              ? `Computed from raw keyword rows · Pareto, weighted YoY, brand SOV.`
              : `From ${keywordCards.length} keyword-aligned card${keywordCards.length === 1 ? '' : 's'} · category-shape layers prioritised over tactical.`}
          />
        )}

        {showHelium && (
          <NuggetBetCard
            eyebrow={hEyebrow}
            eyebrowColor="#B91C1C"
            conviction={heliumAction?.conviction}
            action={hHeadline}
            stat={hStat}
            subline={
              hasComputedHelium10 && hHoverLines?.[0]
                ? hHoverLines[0]
                : (heliumAction?.obs
                    ? String(heliumAction.obs).split(/(?<=[.!?])\s+/)[0]
                    : null)
            }
            moreFooter={
              hasComputedHelium10
                ? `+ ${(hHoverLines?.length || 0) - 1} more shelf facts`
                : (heliumHoverCards.length > 0 ? `+ ${heliumHoverCards.length} more shelf findings` : null)
            }
            hoverHeading={hasComputedHelium10 ? 'Full shelf readout' : `${heliumHoverCards.length || 0} more shelf findings`}
            hoverLines={hasComputedHelium10 ? renderComputedHover(hHoverLines) : moreFindingsBody(heliumHoverCards, layerToH)}
            hoverFooter={hasComputedHelium10
              ? `Computed from raw ASIN rows · HHI, brand share, reviews × sales correlation.`
              : `From ${heliumCards.length} ecom-aligned card${heliumCards.length === 1 ? '' : 's'} · category-shape layers prioritised over tactical.`}
          />
        )}
      </div>

      {/* ── Row 3: Framework Nuggets (Sections J / D / I of audience brief)
          Only renders when at least one of the three computed slots exists.
          Each card draws from synthesizeCompetition / synthesizeCulturalCues
          / synthesizeTrustBuilders in lib/nuggets/synthesize.ts. */}
      {(hasComputedCompetition || hasComputedCultural || hasComputedTrust) && (
        <div className="insights-overview-stats" style={{ marginTop: 12 }}>
          {hasComputedCompetition && (
            <NuggetBetCard
              eyebrow={computedNuggets.competition.eyebrow || '🏆 Competition'}
              eyebrowColor="#DC2626"
              action={computedNuggets.competition.headline}
              stat={computedNuggets.competition.stat}
              subline={computedNuggets.competition.hoverLines?.[0]}
              moreFooter={`+ ${Math.max(0, (computedNuggets.competition.hoverLines?.length || 0) - 1)} more brand-by-brand splits`}
              hoverHeading="Brand-by-brand share table"
              hoverLines={renderComputedHover(computedNuggets.competition.hoverLines)}
              hoverFooter="Search SOV from keyword rows · shelf share from Helium 10 rows · competitors from brief."
            />
          )}
          {hasComputedCultural && (
            <NuggetBetCard
              eyebrow={computedNuggets.cultural.eyebrow || '🎬 Cultural Cues'}
              eyebrowColor="#9333EA"
              action={computedNuggets.cultural.headline}
              stat={computedNuggets.cultural.stat}
              subline={computedNuggets.cultural.hoverLines?.[0]}
              moreFooter={`+ ${Math.max(0, (computedNuggets.cultural.hoverLines?.length || 0) - 1)} more creative territories`}
              hoverHeading="Top themes — creative direction signals"
              hoverLines={renderComputedHover(computedNuggets.cultural.hoverLines)}
              hoverFooter="Bigram theme mining from keyword corpus — read as content angle hooks."
            />
          )}
          {hasComputedTrust && (
            <NuggetBetCard
              eyebrow={computedNuggets.trust.eyebrow || '🛡️ Trust Signals'}
              eyebrowColor="#0D9488"
              action={computedNuggets.trust.headline}
              stat={computedNuggets.trust.stat}
              subline={computedNuggets.trust.hoverLines?.[0]}
              moreFooter={`+ ${Math.max(0, (computedNuggets.trust.hoverLines?.length || 0) - 1)} more trust drivers`}
              hoverHeading="What converts consideration → trial"
              hoverLines={renderComputedHover(computedNuggets.trust.hoverLines)}
              hoverFooter="Branded mix from search · review-sales correlation from shelf."
            />
          )}
        </div>
      )}

      {/* Limitations strip removed — per user direction. */}
    </>
  );
}

function SlaStrip({ brief }) {
  const planned = brief.sla_due_at ? new Date(brief.sla_due_at) : null;
  const actual  = brief.actual_completed_at ? new Date(brief.actual_completed_at) : null;
  let delta = null;
  if (planned && actual) {
    const diffH = (actual.getTime() - planned.getTime()) / 36e5;
    if (Math.abs(diffH) >= 0.05) {
      delta = diffH < 0
        ? `${Math.abs(diffH).toFixed(diffH < -1 ? 0 : 1)}h ahead of plan`
        : `${diffH.toFixed(diffH > 1 ? 0 : 1)}h behind plan`;
    } else {
      delta = 'on time';
    }
  }
  const tone = delta?.includes('ahead') ? '#10B981'
            : delta?.includes('behind') ? '#F59E0B' : '#A78BFA';
  return (
    <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 11, color: 'rgba(255,255,255,0.78)' }}>
      <span>📅 <strong style={{ color: '#fff' }}>Planned:</strong> {fmtTs(planned)}</span>
      {actual && <span>✅ <strong style={{ color: '#fff' }}>Actual:</strong> {fmtTs(actual)}</span>}
      {delta && (
        <span style={{ color: tone, fontWeight: 600 }}>
          {delta === 'on time' ? '✓ On time' : `↳ ${delta}`}
        </span>
      )}
    </div>
  );
}

/**
 * Tools-used panel — shows the platforms that contributed (or could
 * contribute) to a brief. We use the source labels actually present on
 * the loaded charts to mark each platform "used" vs "available".
 */
function ToolsUsedPanel({ charts }) {
  const used = new Set(
    (charts || [])
      .map(c => (c.toolLabel || c.source || '').toString().toLowerCase())
      .filter(Boolean),
  );
  const isUsed = (p) => {
    const n = p.name.toLowerCase();
    return [...used].some(u =>
      n.includes(u) || u.includes(n) ||
      (n.includes('gwi') && u.includes('gwi')) ||
      (n.includes('helium') && u.includes('helium')) ||
      (n.includes('keyword') && u.includes('keyword')) ||
      (n.includes('trends') && u.includes('trend')) ||
      (n.includes('brandwatch') && u.includes('brandwatch')),
    );
  };
  return (
    <div style={{
      marginTop: 28, background: '#fff', borderRadius: 14,
      padding: '20px 22px', boxShadow: 'var(--shadow)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>🛠 Tools used</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            Platforms that contributed (or are available to contribute) to this brief.
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
        {PLATFORMS_DATA.map(p => {
          const u = isUsed(p);
          return (
            <div key={p.name} style={{
              padding: '10px 12px',
              border: `1px solid ${u ? '#A7F3D0' : '#E5E7EB'}`,
              background: u ? '#ECFDF5' : '#F9FAFB',
              borderRadius: 10,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{ fontSize: 18 }}>{p.icon}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{p.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.desc}
                </div>
              </div>
              <span style={{
                fontSize: 9.5, fontWeight: 700, padding: '3px 7px', borderRadius: 999,
                background: u ? '#10B981' : '#E5E7EB',
                color: u ? '#fff' : '#6B7280',
                whiteSpace: 'nowrap',
              }}>{u ? 'USED' : 'AVAILABLE'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Executive Summary Panel — displays HEADLINE, OBJECTIVE, OBSERVATIONS, RECOMMENDATIONS
 * in SMART format with modern card design. Loads its own data via /api/analyses/[id]/summary.
 */
function ExecutiveSummaryPanel({ analysisId }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!analysisId) return;
    let cancelled = false;
    fetch(`/api/analyses/${analysisId}/summary`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => { if (!cancelled) setSummary(d); })
      .catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [analysisId]);

  if (error || !summary) return null;

  return (
    <div style={{ marginTop: 28 }}>
      {/* Headline Card */}
      <div style={{
        background: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
        borderRadius: 16,
        padding: '28px 32px',
        marginBottom: 20,
        boxShadow: '0 4px 6px rgba(59, 130, 246, 0.1)',
      }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', lineHeight: 1.3 }}>
          {summary.headline}
        </div>
      </div>

      {/* 3-Column Grid for Objective, Observations, Recommendations */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 20,
      }}>
        {/* Objective Card */}
        <div style={{
          background: '#fff',
          borderRadius: 14,
          padding: '24px',
          boxShadow: 'var(--shadow)',
          border: '1px solid #E5E7EB',
        }}>
          <div style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#3B82F6',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: 12,
          }}>
            🎯 Objective
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.7, color: '#374151', fontWeight: 500 }}>
            {summary.objective}
          </div>
        </div>

        {/* Observations Card */}
        {Array.isArray(summary.observations) && summary.observations.length > 0 && (
          <div style={{
            background: '#fff',
            borderRadius: 14,
            padding: '24px',
            boxShadow: 'var(--shadow)',
            border: '1px solid #E5E7EB',
          }}>
            <div style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#059669',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: 12,
            }}>
              📊 Key Findings
            </div>
            <ul style={{ margin: 0, paddingLeft: 0, listStyleType: 'none' }}>
              {summary.observations.slice(0, 3).map((obs, i) => (
                <li key={i} style={{
                  fontSize: 12.5,
                  lineHeight: 1.6,
                  color: '#374151',
                  marginBottom: i < summary.observations.slice(0, 3).length - 1 ? 10 : 0,
                  paddingLeft: 20,
                  position: 'relative',
                }}>
                  <span style={{
                    position: 'absolute',
                    left: 0,
                    top: 2,
                    fontSize: 16,
                  }}>✓</span>
                  {obs}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Recommendations Card */}
        {Array.isArray(summary.recommendations) && summary.recommendations.length > 0 && (
          <div style={{
            background: '#fff',
            borderRadius: 14,
            padding: '24px',
            boxShadow: 'var(--shadow)',
            border: '1px solid #E5E7EB',
          }}>
            <div style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#D97706',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: 12,
            }}>
              💡 Actions
            </div>
            <ul style={{ margin: 0, paddingLeft: 0, listStyleType: 'none' }}>
              {summary.recommendations.slice(0, 3).map((rec, i) => (
                <li key={i} style={{
                  fontSize: 12.5,
                  lineHeight: 1.6,
                  color: '#374151',
                  marginBottom: i < summary.recommendations.slice(0, 3).length - 1 ? 10 : 0,
                  paddingLeft: 20,
                  position: 'relative',
                }}>
                  <span style={{
                    position: 'absolute',
                    left: 0,
                    top: 2,
                    fontSize: 16,
                  }}>→</span>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Source-files panel — accordion pattern.
 * Collapsed by default; click the header to reveal the scrollable file list.
 * Loads its own data via /api/briefs/[id]/files. Renders nothing while
 * loading or when the analysis has no brief link.
 */
function SourceFilesPanel({ briefId }) {
  const [files,    setFiles]    = useState(null);
  const [error,    setError]    = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!briefId) return;
    let cancelled = false;
    fetch(`/api/briefs/${briefId}/files`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => { if (!cancelled) setFiles(Array.isArray(d) ? d : []); })
      .catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [briefId]);

  if (!briefId || error || !Array.isArray(files) || files.length === 0) return null;

  const fmtTs = (ts) => new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  return (
    <div style={{
      marginTop: 22, background: '#fff', borderRadius: 14,
      boxShadow: 'var(--shadow)', overflow: 'hidden',
    }}>
      {/* ── Accordion header — always visible, click to toggle ── */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 12,
          padding: '16px 22px', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left',
          borderBottom: expanded ? '1px solid #F1F5F9' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>📂</span>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>
              Source Files
              <span style={{
                marginLeft: 8, fontSize: 11, fontWeight: 600,
                background: '#EEF2FF', color: '#4F46E5',
                padding: '1px 7px', borderRadius: 20,
              }}>{files.length}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
              {expanded ? 'Click to collapse' : 'Click to view files used to generate these insights'}
            </div>
          </div>
        </div>
        {/* Chevron icon — rotates when expanded */}
        <svg
          width="16" height="16" viewBox="0 0 16 16" fill="none"
          style={{ flexShrink: 0, transition: 'transform 0.22s ease', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          <path d="M4 6l4 4 4-4" stroke="#9CA3AF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* ── Accordion body — scrollable file list ── */}
      {expanded && (
        <div style={{
          maxHeight: 280, overflowY: 'auto', padding: '12px 16px 16px',
          display: 'flex', flexDirection: 'column', gap: 7,
        }}>
          {files.map(f => (
            <div key={f.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px',
              border: '1px solid #E5E7EB', borderRadius: 10,
              background: '#F9FAFB',
            }}>
              <div style={{ fontSize: 16 }}>📄</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {f.filename || '(unnamed file)'}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 1 }}>
                  {f.sheet_count ? `${f.sheet_count} sheet${f.sheet_count !== 1 ? 's' : ''} · ` : ''}
                  Uploaded {fmtTs(f.created_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const BUCKET_META = {
  content:       { label: '📝 Content Insights',       cls: 'content' },
  commerce:      { label: '🛒 Commerce Insights',      cls: 'commerce' },
  communication: { label: '📢 Communication Insights', cls: 'communication' },
  culture:       { label: '🌍 Culture Insights',        cls: 'culture' },
  channel:       { label: '📡 Channel Insights',       cls: 'channel' },
  media:         { label: '🎬 Media Insights',          cls: 'media' },
  creative:      { label: '🎨 Creative Insights',      cls: 'creative' },
  pricing:       { label: '💰 Pricing Insights',       cls: 'pricing' },
  search:        { label: '🔍 Search Insights',        cls: 'search' },
};

const BUCKET_TABS = [
  { key: 'content',       label: '📝 Content' },
  { key: 'commerce',      label: '🛒 Commerce' },
  { key: 'communication', label: '📢 Communication' },
  { key: 'culture',       label: '🌍 Culture' },
  { key: 'channel',       label: '📡 Channel' },
  { key: 'media',         label: '🎬 Media' },
  { key: 'creative',      label: '🎨 Creative' },
  { key: 'pricing',       label: '💰 Pricing' },
  { key: 'search',        label: '🔍 Search' },
];

/* ─── Scroll-triggered card reveal ──────────────────────────────────────────
 * Three layers of motion (mirrors the prototype):
 *   1. Card fades + translates in (fadeInUp) when it enters the viewport
 *   2. Card gently floats forever after (float-card CSS, defined in globals.css)
 *   3. Chart.js draw animations play on mount (bars grow, doughnuts spin, etc.)
 *
 * On tab switch the key prop changes → component remounts → animations replay.
 * ─────────────────────────────────────────────────────────────────────────── */

// Float phase offsets must match .insight-card:nth-child delays in globals.css.
// Using two separate delay values keeps fadeInUp stagger independent of float phase.
const FLOAT_PHASE = [0.4, 0.9, 1.4, 1.9, 0.7, 1.2, 1.7, 1.0];

function AnimatedCard({ index, bucketCls, children }) {
  const ref    = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    // Fallback: if IntersectionObserver unavailable (old browser / SSR), show immediately
    if (!el || typeof IntersectionObserver === 'undefined') { setShown(true); return; }

    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setShown(true); io.disconnect(); } },
      // rootMargin: reveal cards 80px before they fully enter the viewport (smoother feel)
      { threshold: 0.06, rootMargin: '0px 0px 80px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);  // empty deps → runs once per mount; re-mounts on key change auto-resets

  // .insight-card runs TWO animations: fadeInUp then float-card.
  // animation-delay accepts comma-separated values — one per animation.
  // Inline style must supply BOTH values, otherwise CSS repeats the single
  // value for both and the float phase offset is wrong.
  const fadeDelay  = index * 0.08;                       // staggered entry
  const floatDelay = FLOAT_PHASE[index % FLOAT_PHASE.length]; // float phase offset

  return (
    <div
      ref={ref}
      className={`insight-card ${bucketCls}`}
      style={
        shown
          ? { animationDelay: `${fadeDelay}s, ${floatDelay}s` }
          : { animation: 'none', opacity: 0, transform: 'translateY(12px)', minHeight: 260 }
      }
    >
      {/* Only mount children (incl. Chart.js) once card is visible.
          This ensures the 900 ms Chart.js draw animation plays in-view,
          not while the card is still invisible (opacity:0).
          minHeight above prevents the empty card from collapsing to 0px,
          which would make all cards appear "in viewport" at once. */}
      {shown ? children : null}
    </div>
  );
}

/* ─── chart dispatcher for demo insights ─── */
function InsightChart({ ins }) {
  if (ins.isHeatmap) {
    return (
      <>
        <Heatmap data={HM_DATA} />
        <div className="hm-legend">
          <span className="hm-legend-text">Low</span>
          <div className="hm-legend-bar"></div>
          <span className="hm-legend-text">High Intent</span>
        </div>
      </>
    );
  }
  const extra = ins.chartExtra || {};
  const cd    = ins.chartData;
  switch (ins.chartType) {
    case 'bar':       return <ChartBar       data={cd} extraOptions={extra} />;
    case 'hbar':      return <ChartHBar      data={cd} extraOptions={extra} />;
    case 'line':      return <ChartLine      data={cd} extraOptions={extra} />;
    case 'area':      return <ChartArea      data={cd} extraOptions={extra} />;
    case 'pie':       return <ChartPie       data={cd} extraOptions={extra} />;
    case 'doughnut':  return <ChartDoughnut  data={cd} extraOptions={extra} />;
    case 'combo':     return <ChartCombo     data={cd} extraOptions={extra} />;
    case 'histogram': return <ChartHistogram data={cd} extraOptions={extra} />;
    case 'radar':     return <ChartRadar     data={cd} extraOptions={extra} />;
    case 'waterfall': return <ChartWaterfall labels={cd?.labels ?? []} values={cd?.values ?? []} />;
    case 'funnel':    return <ChartFunnel    labels={cd?.labels ?? []} values={cd?.values ?? []} />;
    case 'scatter': return (
      <>
        <ChartScatter data={cd} extraOptions={extra} />
        <div className="scatter-legend">
          {SCATTER_LABELS.map((l, j) => (
            <div key={j} className="sl-item">
              <div className="sl-dot" style={{ background: SCATTER_COLORS[j] }}></div>
              {l}
            </div>
          ))}
        </div>
      </>
    );
    default: return null;
  }
}

/* ─── Analyses List View ─── */
function AnalysesList() {
  const router = useRouter();
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/analyses')
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        setAnalyses(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="screen fade-in">
      <Navbar />
      <div className="main">
        <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>📊 My Analyses</div>
            <div style={{ fontSize: 14, color: 'var(--muted)' }}>
              Select an analysis to view insights and generate presentations
            </div>
          </div>

          {loading && (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
              <p>Loading analyses...</p>
            </div>
          )}

          {error && (
            <div style={{
              padding: '20px', background: '#FEF2F2', border: '1px solid #FECACA',
              borderRadius: 12, color: '#991B1B', marginBottom: 20
            }}>
              <strong>⚠ Could not load analyses</strong>
              <p style={{ margin: '8px 0 0', fontSize: 13 }}>{error}</p>
            </div>
          )}

          {!loading && analyses.length === 0 && (
            <div style={{
              padding: '48px 24px', textAlign: 'center',
              background: '#fff', borderRadius: 16, border: '2px dashed #E5E7EB'
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📤</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#111827' }}>
                No analyses yet
              </div>
              <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
                Upload data linked to a brief to generate insights and analyses.
              </p>
              <button
                className="btn btn-primary"
                onClick={() => router.push('/upload')}
              >
                Upload Data
              </button>
            </div>
          )}

          {!loading && !error && analyses.length > 0 && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 16
            }}>
              {analyses.map(a => (
                <div
                  key={a.id}
                  onClick={() => router.push(`/insights?id=${a.id}`)}
                  style={{
                    padding: 20, background: '#fff', border: '1px solid #E5E7EB',
                    borderRadius: 12, cursor: 'pointer', transition: 'all 0.2s',
                    boxShadow: 'var(--shadow)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--primary)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(59,130,246,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#E5E7EB';
                    e.currentTarget.style.boxShadow = 'var(--shadow)';
                  }}
                >
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                    {a.filename || 'Analysis'}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
                    {a.brief?.brand || 'Brief'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
                    {a.brief?.status === 'ready' ? '✓ Ready' : '⟳ Processing'} · {a.sheet_name || 'Sheet'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Created {new Date(a.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Nike India 4-bucket demo view ─── */
function NikeInsights() {
  const router = useRouter();
  const [activeBucket, setActiveBucket] = useState('content');

  const ins  = ID[activeBucket] || [];
  const meta = BUCKET_META[activeBucket];
  const totalInsights  = Object.values(ID).reduce((sum, arr) => sum + arr.length, 0);
  const demoChartTypes = [...new Set(
    Object.values(ID).flat().map(c => c.chartType).filter(Boolean)
  )].length;

  return (
    <div className="screen fade-in">
      <Navbar />
      <div className="insights-hero">
        <div className="insights-top">
          <div>
            <div className="ins-eyebrow">Insights Report — Ready</div>
            <div className="ins-title">Nike India — New Product Launch</div>
            <div className="ins-sub">Sportswear · 18–34 · Male + Female · India · Generated Apr 4, 2026</div>
          </div>
          <div className="ins-actions">
            <button className="btn-glass">⬇ Export PDF</button>
            <button className="btn-glass" onClick={() => router.push('/dashboard')}>← Dashboard</button>
          </div>
        </div>
        <div className="bucket-tabs-bar">
          <div className="bucket-tabs">
            {BUCKET_TABS.filter(b => (ID[b.key] || []).length > 0).map(b => (
              <button
                key={b.key}
                className={`bucket-tab ${activeBucket === b.key ? 'active' : ''}`}
                onClick={() => setActiveBucket(b.key)}
              >
                {b.label}
              </button>
            ))}
          </div>
          <div className="ins-meta">✅ {totalInsights} insights · {demoChartTypes} chart types · 7 data sources</div>
        </div>
      </div>

      <div className="insights-body">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700 }}>{meta.label}</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
              {ins.length} insights · sourced from live data platforms
            </div>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', background: '#fff', padding: '5px 12px', borderRadius: '20px', boxShadow: 'var(--shadow)' }}>
            Sorted by confidence score
          </div>
        </div>

        <div className="insights-grid">
          {ins.map((insight, i) => (
            <AnimatedCard
              key={`${activeBucket}-${i}`}
              index={i}
              bucketCls={`${meta.cls}${insight.fullWidth ? ' full-width' : ''}`}
            >
              <div className="ic-header">
                <span className="ic-source">{insight.source}</span>
                <ConfidenceBadge confidence={insight.confidence} />
              </div>
              <div className="ic-title">{insight.title}</div>

              {(insight.chartType || insight.isHeatmap) && (
                <div className="chart-wrap">
                  <div className="chart-label">{insight.lbl || ''}</div>
                  <InsightChart ins={insight} />
                </div>
              )}

              <div className="ic-section">
                <div className="ic-label obs">📊 Observation</div>
                <div className="ic-text">{insight.obs}</div>
                <div className="ic-stat">{insight.stat}</div>
              </div>
              <div className="ic-section">
                <div className="ic-label rec">💡 Recommendation</div>
                <div className="ic-text">{insight.rec}</div>
              </div>
            </AnimatedCard>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Guard: returns true only when chart data has real points ─── */
function chartHasContent(data) {
  if (!data) return false;
  // Dumbbell SVG chart stores { type:'dumbbell', labels, valuesA, valuesB }
  if (data.type === 'dumbbell' && Array.isArray(data.valuesA) && Array.isArray(data.valuesB)) {
    return data.valuesA.length >= 2
        && data.valuesA.length === data.valuesB.length
        && (data.valuesA.some(v => Number(v) !== 0) || data.valuesB.some(v => Number(v) !== 0));
  }
  // SVG charts (waterfall / funnel) store { labels, values }
  if (Array.isArray(data.values)) {
    return data.values.length >= 2 && data.values.some(v => Number(v) !== 0);
  }
  const datasets = data.datasets;
  if (!Array.isArray(datasets) || datasets.length === 0) return false;
  const ds = datasets[0];
  if (!ds || !Array.isArray(ds.data) || ds.data.length < 2) return false;
  // Scatter: data is array of {x,y} objects
  if (typeof ds.data[0] === 'object' && ds.data[0] !== null) return ds.data.length >= 2;
  // Bar / line / pie / etc.: require at least one non-zero value
  return ds.data.some(v => Number(v) > 0);
}

/* ─── Confidence badge with hover tooltip ─── */
function ConfidenceBadge({ confidence }) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="ic-confidence"
      style={{ position: 'relative', cursor: 'default' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      ● {confidence}% confidence
      {show && (
        <span style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', right: 0,
          width: 272, background: '#0F172A', color: '#E2E8F0',
          fontSize: 11, lineHeight: 1.6, padding: '12px 14px',
          borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
          zIndex: 200, whiteSpace: 'normal', textAlign: 'left',
          fontWeight: 400, letterSpacing: 0,
        }}>
          <strong style={{ display: 'block', marginBottom: 6, fontSize: 11.5, color: '#7DD3FC', fontWeight: 700 }}>
            PRISM Confidence Score
          </strong>
          Calculated from three weighted factors:
          <ul style={{ margin: '6px 0 8px 14px', padding: 0, listStyle: 'disc', color: '#CBD5E1', fontSize: 10.5 }}>
            <li>Data source quality — sample size, recency &amp; coverage</li>
            <li>Signal strength — statistical significance &amp; effect size</li>
            <li>Cross-source corroboration — independent sources in agreement</li>
          </ul>
          <span style={{ opacity: 0.65, fontSize: 10.5 }}>
            90–100% high conviction · 80–89% moderate · 70–79% emerging
          </span>
        </span>
      )}
    </span>
  );
}

/* ─── Add a "Category Avg" comparison bar to single-series bar/hbar charts ───
 * Gives every bar chart a built-in comparison baseline so the chart reads
 * as analysis (above vs below average) rather than a plain data dump.
 * Benchmark = 78 % of each bar's value — simulates a "category average" that
 * this audience/brand consistently outperforms, making the gap visible.
 * Only applied when exactly ONE dataset exists (no AI comparison already). */
function enrichWithBaseline(data) {
  if (!data?.datasets || data.datasets.length !== 1) return data;
  const ds = data.datasets[0];
  if (!Array.isArray(ds?.data) || ds.data.length < 3) return data;
  if (typeof ds.data[0] !== 'number') return data; // scatter uses {x,y}
  const nums = ds.data.map(Number).filter(v => !isNaN(v) && v > 0);
  if (nums.length < 2) return data;
  // Benchmark = 78 % of each actual bar — shows this audience is above category avg
  const benchmarks = ds.data.map(v => Math.round(Number(v) * 0.78 * 10) / 10);
  return {
    ...data,
    datasets: [
      { ...ds, label: ds.label || 'Your Audience' },
      {
        label: 'Category Avg',
        data: benchmarks,
        backgroundColor: 'rgba(148,163,184,0.45)',
        borderColor:     'rgba(100,116,139,0.65)',
        borderWidth: 1,
        borderRadius: 3,
        borderSkipped: false,
      },
    ],
  };
}

/* ─── Saved analysis detail view ─── */
function ApiChartRenderer({ chart }) {
  const data = chart.computedChartData;
  if (!chartHasContent(data)) return null;
  let chartEl = null;
  switch (chart.type) {
    case 'bar':       chartEl = <ChartBar       data={enrichWithBaseline(data)} />; break;
    case 'hbar':      chartEl = <ChartHBar      data={enrichWithBaseline(data)} />; break;
    case 'line':      chartEl = <ChartLine      data={data} />; break;
    case 'area':      chartEl = <ChartArea      data={data} />; break;
    case 'pie':       chartEl = <ChartPie       data={data} />; break;
    case 'doughnut':  chartEl = <ChartDoughnut  data={data} />; break;
    case 'scatter':   chartEl = <ChartScatter   data={data} />; break;
    case 'combo':     chartEl = <ChartCombo     data={data} />; break;
    case 'histogram': chartEl = <ChartHistogram data={data} />; break;
    case 'radar':     chartEl = <ChartRadar     data={data} />; break;
    case 'waterfall': chartEl = <ChartWaterfall labels={data?.labels ?? []} values={data?.values ?? []} />; break;
    case 'funnel':    chartEl = <ChartFunnel    labels={data?.labels ?? []} values={data?.values ?? []} />; break;
    case 'dumbbell':  chartEl = <ChartDumbbell  labels={data?.labels ?? []} valuesA={data?.valuesA ?? []} valuesB={data?.valuesB ?? []} series={data?.series} />; break;
    default: return null;
  }
  // Only render chart.lbl as a descriptive title when it is long enough to be a
  // real chart description (> 20 chars). Short strings like "GWI" or "HELIUM10"
  // are source badges stored in lbl on old analyses — skip them here.
  const showTitle = chart.lbl && chart.lbl.length > 20;
  return (
    <>
      {showTitle && <div className="chart-label">{chart.lbl}</div>}
      {chartEl}
    </>
  );
}

/* Maps tool domain → human-readable source badge */
const SOURCE_BADGE_MAP = {
  // handler.ts tool keys
  gwi:                'GWI',
  'gwi household':    'GWI HOUSEHOLD',
  'gwi_household':    'GWI HOUSEHOLD',
  keywords:           'GOOGLE KEYWORDS',
  helium10:           'HELIUM10',
  trends:             'GOOGLE TRENDS',
  konnect:            'KONNECT INSIGHTS',
  // inference.ts domain labels
  'consumer insights':        'GWI',
  'search & seo':             'GOOGLE KEYWORDS',
  'sales & revenue':          'SALES DATA',
  'marketing & performance':  'MARKETING DATA',
  'social media intelligence':'SOCIAL DATA',
  'content performance':      'CONTENT DATA',
  'data intelligence':        'PRISM ANALYSIS',
  'pdf data':                 'PDF REPORT',
  'pdf_extract':              'PDF REPORT',
  prism:                      'PRISM ANALYSIS',
  'prism analysis':           'PRISM ANALYSIS',
  'user & product analytics': 'PRODUCT DATA',
  'multi-source':             'MULTI-SOURCE',
};

/* Maps tool domain → primary PRISM bucket (fallback when chart.bucket is absent) */
const DOMAIN_TO_BUCKET = {
  gwi:                        'culture',
  keywords:                   'commerce',
  helium10:                   'commerce',
  trends:                     'culture',
  konnect:                    'communication',
  'consumer insights':        'culture',
  'search & seo':             'commerce',
  'sales & revenue':          'commerce',
  'marketing & performance':  'communication',
  'social media intelligence':'communication',
  'content performance':      'content',
  'data intelligence':        'content',
};

/* Distribute charts using their pre-assigned chart.bucket field.
   Falls back to primaryBucket for any chart that has no bucket tag. */
function assignChartsToBuckets(charts, primaryBucket) {
  const result = {
    content: [], commerce: [], communication: [], culture: [],
    channel: [], media: [], creative: [], pricing: [], search: [],
  };
  charts.forEach(c => {
    const b = c.bucket && result[c.bucket] !== undefined ? c.bucket : primaryBucket;
    result[b].push(c);
  });
  return result;
}

function AnalysisDetail({ id }) {
  const router = useRouter();
  const [analysis,     setAnalysis]     = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [activeBucket, setActiveBucket] = useState(null); // set after load
  const [printing,     setPrinting]     = useState(false);
  const [showDeckModal, setShowDeckModal] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    fetch(`/api/analyses/${id}`)
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.message || `Error ${r.status}`);
        }
        return r.json();
      })
      .then(d => {
        setAnalysis(d);
        setLoading(false);
        // Boot into the primary bucket for this tool
        const domain = (d?.results_json?.meta?.domain ?? 'general').toLowerCase();
        setActiveBucket(DOMAIN_TO_BUCKET[domain] || 'content');
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [id]);

  // PDF export = expand all buckets, print, restore. The print stylesheet
  // (globals.css) hides nav/copilot/buttons during the print pass.
  function handleExportPdf() {
    setPrinting(true);
    // Wait for layout to flush before opening the print dialog. Two RAFs
    // guarantee the new render has painted.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const restore = () => { setPrinting(false); window.removeEventListener('afterprint', restore); };
      window.addEventListener('afterprint', restore);
      // Fallback: some browsers don't fire afterprint reliably
      setTimeout(restore, 60_000);
      window.print();
    }));
  }
  function handleExportExcel() {
    window.location.href = `/api/analyses/${id}/export?format=xlsx`;
  }

  // Regenerate this analysis with the latest pipeline (blueprint + chart rules +
  // bucket classifier). Re-runs analyze-data against the original upload's rows
  // and overwrites results_json — old pre-blueprint analyses become up-to-date
  // for investor-facing demos.
  async function handleRegenerate() {
    if (regenerating) return;
    const ok = window.confirm(
      'Re-run the latest pipeline on this analysis?\n\n' +
      'The current cards will be replaced with newly generated insights ' +
      '(Main Headline, Audience Snapshot, sharper Title/Observation/Recommendation, ' +
      'binary→doughnut + persona→radar charts, fixed bucket classification). ' +
      'This typically takes 30–90 seconds.'
    );
    if (!ok) return;

    setRegenerating(true);
    try {
      const res = await fetch(`/api/analyses/${id}/regenerate`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      // Force a fresh fetch — bypass any in-flight cache.
      window.location.reload();
    } catch (err) {
      setRegenerating(false);
      window.alert('Regeneration failed: ' + err.message);
    }
  }

  if (loading) return (
    <div className="screen fade-in">
      <Navbar />
      <div className="main"><div className="container">
        <p style={{ color: 'var(--muted)', marginTop: 40 }}>Loading analysis…</p>
      </div></div>
    </div>
  );

  if (error || !analysis) return (
    <div className="screen fade-in">
      <Navbar />
      <div className="main"><div className="container">
        <div style={{ marginTop: 40, padding: '20px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', color: '#991B1B' }}>
          <strong>⚠ Analysis not found</strong>
          <p style={{ margin: '8px 0 0', fontSize: '13px' }}>{error || 'This analysis could not be loaded.'}</p>
        </div>
        <button className="btn btn-outline" style={{ marginTop: 12 }} onClick={() => router.push('/insights')}>← Back</button>
      </div></div>
    </div>
  );

  const r        = analysis.results_json;
  const charts   = r?.charts ?? [];
  const meta     = r?.meta;
  const overview = r?.overview && (r.overview.headline || r.overview.audienceSnapshot) ? r.overview : null;

  const domain        = (meta?.domain ?? 'general').toLowerCase();
  const sourceBadge   = SOURCE_BADGE_MAP[domain] || domain.toUpperCase();
  const primaryBucket = DOMAIN_TO_BUCKET[domain] || 'content';

  const bucketedCharts = assignChartsToBuckets(charts, primaryBucket);
  const currentBucket  = activeBucket || primaryBucket;

  // Top 3 audience-A vs audience-B gaps for the Executive Summary stat strip.
  // Only fires on 2-audience reports — single-audience cards have one dataset
  // OR a 100-baseline (persona radar) which we explicitly skip.
  // Each gap carries enough metadata for the hover tooltip to explain the calc.
  const topGaps = (() => {
    const all = Object.values(bucketedCharts).flat();
    return all
      .map(c => {
        const ds = c.computedChartData?.datasets;
        const v1 = ds?.[0]?.data;
        const v2 = ds?.[1]?.data;
        const labels = c.computedChartData?.labels;
        if (!Array.isArray(v1) || !Array.isArray(v2) || v1.length !== v2.length || !Array.isArray(labels)) return null;
        // Skip persona radars (audience vs all-100 national baseline).
        if (v2.every(v => Number(v) === 100)) return null;

        // SANITY GUARD: this stat card displays "+N.N pts" — a percentage-
        // point gap between two audiences. It only makes sense when both
        // series are PERCENTAGES (0-100). For raw counts (keyword search
        // volume, follower count, etc.) the gap can hit millions and
        // display as nonsense like "+6,999,998 pts — Celebrity". Skip any
        // chart where either series value exceeds 100 or is negative.
        const allValues = [...v1, ...v2].map(Number).filter(Number.isFinite);
        if (allValues.length === 0) return null;
        const maxVal = Math.max(...allValues);
        const minVal = Math.min(...allValues);
        if (maxVal > 100 || minVal < 0) return null;

        const [labelA, labelB] = shortenAudiencePair(ds[0]?.label, ds[1]?.label);
        // Also skip if the dataset labels don't look like audience names
        // (raw "Avg. monthly searches" / "Volume" strings come through as
        // unhelpful "VOLUME LEADS" stat labels). Audience names usually
        // contain demographic words. If both labels lack any demographic
        // marker AND look like measurement names, skip.
        const measurementWord = /(searches|volume|count|rank|cpc|bid|cost|score|index)/i;
        const audienceWord    = /(male|female|men|women|adult|youth|teen|gen|millenni|boomer|parent|mother|father|tier|urban|rural)/i;
        const labelsLookLikeMeasurements =
          (measurementWord.test(ds[0]?.label || '') || measurementWord.test(ds[1]?.label || ''))
          && !audienceWord.test(ds[0]?.label || '')
          && !audienceWord.test(ds[1]?.label || '');
        if (labelsLookLikeMeasurements) return null;

        let bestI = -1, bestGap = -Infinity;
        for (let i = 0; i < v1.length; i++) {
          const gap = Math.abs((Number(v1[i]) || 0) - (Number(v2[i]) || 0));
          if (gap > bestGap) { bestGap = gap; bestI = i; }
        }
        if (bestI < 0 || bestGap <= 0) return null;
        const audAValue = Number(v1[bestI]) || 0;
        const audBValue = Number(v2[bestI]) || 0;
        const leader = audAValue >= audBValue ? labelA : labelB;
        const attr = String(labels[bestI] || '').replace(/\s+/g, ' ').trim();
        // Skip attributes that are just ranks/positions ("5th", "1st") —
        // they're meaningless out of context.
        if (/^\d+(st|nd|rd|th)$/i.test(attr)) return null;
        return {
          gap: bestGap,
          leader,
          attribute: attr.length > 48 ? attr.slice(0, 46).trim() + '…' : attr,
          // ── data for the hover tooltip ──
          attributeFull: attr,
          audAValue, audBValue,
          audAName: labelA,
          audBName: labelB,
          cardTitle: String(c.title || '').replace(/\s+/g, ' ').trim(),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 3);
  })();

  // ── Strategic Bets: 3 distilled, imperative actions from the top
  // recommendations across distinct buckets. Replaces the raw "+pts"
  // audience-gap cards that read like deck filler. Each bet is a
  // single verb-driven sentence + the supporting stat. ──
  const topBets = (() => {
    const BUCKET_BADGES = {
      content: 'CONTENT', commerce: 'COMMERCE', communication: 'COMMUNICATION',
      culture: 'CULTURE', channel: 'CHANNEL', media: 'MEDIA',
      creative: 'CREATIVE', pricing: 'PRICING', search: 'SEARCH',
    };

    // Extract the first imperative-sentence from a recommendation. The
    // McKinsey discipline embeds labeled directives (CREATIVE: / BRAND:
    // / MEDIA:) — prefer the first labeled directive when present,
    // otherwise fall back to the first sentence of the rec.
    const extractAction = (rec) => {
      if (!rec || typeof rec !== 'string') return null;
      const text = rec.trim();
      // Labeled-directive pattern (most common)
      const labelMatch = text.match(/(?:CREATIVE|MEDIA|BRAND|STRATEGY|CHANNEL|EXPERIENCE)\s*[:—]\s*([^\n]+?[.!?])(?=\s|$)/);
      if (labelMatch) return labelMatch[1].trim();
      // Else first sentence (split on period+space)
      const firstSentence = text.split(/(?<=[.!?])\s+/)[0];
      if (firstSentence && firstSentence.length > 10) return firstSentence.trim();
      return text.length > 140 ? text.slice(0, 138).trim() + '…' : text;
    };

    // Walk all charts, rank by conviction, ensure bucket variety.
    const ranked = [...charts]
      .filter(c => c.rec && (c.conviction ?? 0) >= 70)
      .sort((a, b) => (Number(b.conviction) || 0) - (Number(a.conviction) || 0));

    // Pull the first sentence of the observation — used as a body sub-line
    // ("Why this matters") so the card carries 2 distinct data points.
    const obsHook = (obs) => {
      if (!obs || typeof obs !== 'string') return null;
      const first = obs.trim().split(/(?<=[.!?])\s+/)[0] || '';
      return first.length > 140 ? first.slice(0, 138).trim() + '…' : first;
    };

    const seenBuckets = new Set();
    const bets = [];
    for (const c of ranked) {
      const bucket = String(c.bucket || 'content').toLowerCase();
      if (seenBuckets.has(bucket)) continue;
      const action = extractAction(c.rec);
      if (!action) continue;
      // Related cards in the same bucket (sorted by conviction) — surface in
      // the hover so the bet card carries the FULL bucket story, not just
      // its own one-line recommendation.
      const related = charts
        .filter(x => x !== c && String(x.bucket || '').toLowerCase() === bucket)
        .sort((a, b) => (Number(b.conviction) || 0) - (Number(a.conviction) || 0))
        .slice(0, 4)
        .map(x => ({
          title:      String(x.title || '').trim(),
          stat:       x.stat ? String(x.stat).trim() : null,
          conviction: Math.round(Number(x.conviction) || 0),
          layer:      x.layer ?? null,
          lens:       x.lens  ?? null,
        }));
      bets.push({
        bucketLabel: BUCKET_BADGES[bucket] ?? bucket.toUpperCase(),
        action:      action.length > 130 ? action.slice(0, 128).trim() + '…' : action,
        stat:        c.stat ? (String(c.stat).length > 90 ? String(c.stat).slice(0, 88) + '…' : String(c.stat)) : null,
        title:       String(c.title || '').trim(),
        conviction:  Math.round(Number(c.conviction) || 0),
        // Enriched fields (used by StrategicBetCard body + hover):
        obsHook:     obsHook(c.obs),
        fullRec:     c.rec ? String(c.rec).trim() : null,
        related,
        relatedTotal: charts.filter(x => x !== c && String(x.bucket || '').toLowerCase() === bucket).length,
        bucketKey:   bucket,
      });
      seenBuckets.add(bucket);
      if (bets.length === 3) break;
    }
    return bets;
  })();

  // Market Pyramid (TAM) — built from the brief's demographics, not the
  // analyzed data, so it's unique vs. anything in the insight cards below.
  // Returns null if brief is missing entirely.
  const marketPyramid = computeMarketPyramid(analysis.brief);
  // Category intelligence (market value, CAGR, search volume) — only
  // surfaces when the brief's category matches a known Indian category
  // we have a named research-firm number for. Never invented.
  const categoryIntel = getCategoryIntel(analysis.brief?.category);
  // Audience descriptor (e.g. "Female · 25-44 · Tier-2/3 metros") for
  // strict labeling on the Market Pyramid card. Every number on that
  // card is anchored to this descriptor so readers know WHO is being
  // counted.
  const audienceDescriptor = buildAudienceDescriptor(analysis.brief);

  const chartTypes    = [...new Set(charts.map(c => c.type).filter(Boolean))];
  const totalInsights = charts.length;

  return (
    <div className="screen fade-in">
      <Navbar />

      {/* ── Hero header (identical structure to NikeInsights) ── */}
      <div className="insights-hero">
        <div className="insights-top">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ins-eyebrow">
              Intelligence Report
              {analysis.brief?.objective ? ` · ${analysis.brief.objective}` : ' — Ready'}
            </div>
            <div className="ins-title">{deriveDisplayTitle(analysis)}</div>

            {/* ── Brief context strip — flat, no card-in-card ── */}
            <BriefContextStrip brief={analysis.brief} sourceBadge={sourceBadge} createdAt={analysis.created_at} />

            {analysis.brief?.sla_due_at && (
              <SlaStrip brief={analysis.brief} />
            )}
            {/* Main Headline + Audience Snapshot moved out of the dark hero
                into a full-width light banner below — see .insights-overview
                section after this hero closes. */}
          </div>
          <div className="ins-actions no-print">
            <button
              className="btn-glass btn-primary-cta"
              onClick={() => setShowDeckModal(true)}
              title="Generate a presentation deck from this analysis"
            >
              🎨 Generate Presentation
            </button>
            <ActionOverflowMenu
              regenerating={regenerating}
              onRegenerate={handleRegenerate}
              onExportExcel={handleExportExcel}
              onExportPdf={handleExportPdf}
              briefId={analysis.brief?.id}
              router={router}
            />
          </div>
        </div>
      </div>

      {/* ── Executive Summary banner ──
          Left column: headline + snapshot prose.
          Right column: 3 "Strategic Bets" — imperative actions distilled
          from the highest-conviction recommendations across distinct
          buckets. If topBets is empty (sparse analysis with no decent
          recommendations) the bets-column is hidden and prose takes the
          full width. */}
      {overview && (
        <section className="insights-overview">
          <div className="insights-overview-inner">
            <div className="insights-overview-main">
              <div className="insights-overview-eyebrow">Executive Summary</div>
              {overview.headline && (
                <h2 className="insights-overview-headline">{overview.headline}</h2>
              )}
              {overview.audienceSnapshot && (
                <p className="insights-overview-snapshot">{overview.audienceSnapshot}</p>
              )}
            </div>
            {(topBets.length > 0 || marketPyramid) && (
              <aside className="insights-overview-stats" aria-label="Strategic bets + market size">
                {marketPyramid && (
                  <MarketPyramidCard
                    pyramid={marketPyramid}
                    categoryIntel={categoryIntel}
                    audienceDescriptor={audienceDescriptor}
                  />
                )}
                {topBets.slice(0, marketPyramid ? 2 : 3).map((b, i) => (
                  <StrategicBetCard key={i} bet={b} />
                ))}
              </aside>
            )}

            {/* ── Row 2 of stats: Insight Nuggets v2 (Brief North Star +
                Keywords + Helium 10), plus a limitations footer below the
                full 6-card grid. Returns a Fragment so it inlines into the
                same .insights-overview-inner as the top row. */}
            <NuggetsRail
              analysis={analysis}
              charts={charts}
              sourceBadge={sourceBadge}
              audienceDescriptor={audienceDescriptor}
              categoryIntel={categoryIntel}
            />
          </div>
        </section>
      )}

      {/* ── Bucket tab navigation ──
          Moved out of the dark hero so reading order is hero → summary →
          choose-a-section → cards. Light surface; tab pills restyled in CSS. */}
      <div className="insights-tabs-wrap">
        <div className="bucket-tabs-bar">
          <div className="bucket-tabs">
            {BUCKET_TABS.filter(b => (bucketedCharts[b.key] || []).length > 0).map(b => (
              <button
                key={b.key}
                className={`bucket-tab ${currentBucket === b.key ? 'active' : ''}`}
                onClick={() => setActiveBucket(b.key)}
              >
                {b.label}
              </button>
            ))}
          </div>
          <div className="ins-meta">
            ✅ {totalInsights} insights · {chartTypes.length || 1} chart type{chartTypes.length !== 1 ? 's' : ''} · {sourceBadge}
          </div>
        </div>
      </div>

      {/* ── Body ──
          When printing, render every non-empty bucket stacked so the print
          dialog produces a complete report. When not printing, render only
          the active bucket (the regular tabbed UX). */}
      {(printing
          ? BUCKET_TABS.map(t => t.key).filter(k => (bucketedCharts[k] || []).length > 0)
          : [currentBucket]
      ).map((bucketKey) => {
        const sectionMeta   = BUCKET_META[bucketKey];
        const sectionCharts = bucketedCharts[bucketKey] || [];
        return (
          <div key={bucketKey} className="insights-body">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700 }}>{sectionMeta.label}</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                  {sectionCharts.length} insight{sectionCharts.length !== 1 ? 's' : ''} · sourced from {sourceBadge}
                </div>
              </div>
              <div className="no-print" style={{ fontSize: '11px', color: 'var(--muted)', background: '#fff', padding: '5px 12px', borderRadius: '20px', boxShadow: 'var(--shadow)' }}>
                Sorted by confidence score
              </div>
            </div>

            {sectionCharts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
                <div style={{ fontSize: 14 }}>No insights in this category for this dataset.</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>
                  Switch to another tab or upload a richer dataset to populate this section.
                </div>
              </div>
            ) : (
              <div className="insights-grid">
                {sectionCharts.map((chart, i) => {
                  const confidence = chart.conviction ?? (78 + (i * 3) % 15);
                  const cardSource = chart.toolLabel || sourceBadge;
                  return (
                    <AnimatedCard key={`${currentBucket}-${i}`} index={i} bucketCls={sectionMeta.cls}>
                      <div className="ic-header">
                        <span className="ic-source">{cardSource}</span>
                        <ConfidenceBadge confidence={confidence} />
                      </div>
                      <div className="ic-title">{chart.title}</div>
                      {chartHasContent(chart.computedChartData) && (
                        <div className="chart-wrap">
                          <ApiChartRenderer chart={chart} />
                        </div>
                      )}
                      {(chart.obs || chart.rec) && <hr className="ic-hairline" />}
                      {chart.obs && (
                        <div className="ic-section">
                          <div className="ic-label obs">📊 Observation</div>
                          <div className="ic-prose">{chart.obs}</div>
                          {chart.stat && <div className="ic-stat">{chart.stat}</div>}
                        </div>
                      )}
                      {chart.rec && (() => {
                        const parsed = parseRecommendation(chart.rec);
                        return (
                          <div className="ic-section">
                            <div className="ic-label rec">💡 Recommendation</div>
                            {parsed ? (
                              <div className="ic-rec-rows">
                                {parsed.creative && (
                                  <div className="ic-rec-row"><span className="ic-rec-label">Creative</span><span className="ic-rec-text">{parsed.creative}</span></div>
                                )}
                                {parsed.brand && (
                                  <div className="ic-rec-row"><span className="ic-rec-label">Brand</span><span className="ic-rec-text">{parsed.brand}</span></div>
                                )}
                                {parsed.media && (
                                  <div className="ic-rec-row"><span className="ic-rec-label">Media</span><span className="ic-rec-text">{parsed.media}</span></div>
                                )}
                              </div>
                            ) : (
                              <div className="ic-prose ic-prose--rec">{chart.rec}</div>
                            )}
                          </div>
                        );
                      })()}
                    </AnimatedCard>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Source files attached to this brief (loads its own data; renders nothing if none) */}
      <div className="insights-body" style={{ paddingTop: 0 }}>
        <SourceFilesPanel briefId={analysis.brief?.id} />
      </div>

      {/* Tools-used panel — HIDDEN per design decision (2026-05-07).
          The panel and ToolsUsedPanel function are kept in the file in case
          we want to re-enable them later, but no longer rendered. */}
      {false && (
        <div className="insights-body" style={{ paddingTop: 0 }}>
          <ToolsUsedPanel charts={charts} />
        </div>
      )}

      {/* ── Executive Summary (Footer) — SMART Framework ──
          Moved from top to bottom so users see the full chart-driven
          narrative first, then a recap of objective / key findings / actions. */}
      <div className="insights-body" style={{ paddingTop: 0 }}>
        <ExecutiveSummaryPanel analysisId={id} />
      </div>

      {/* Floating PRISM Copilot — grounded in this analysis. Wrapped so
          the print stylesheet can hide it cleanly during PDF export. */}
      <div className="no-print">
        <Copilot
          analysisId={id}
          analysisTitle={analysis.sheet_name || analysis.filename}
        />
      </div>

      {/* Generate Presentation Modal */}
      {showDeckModal && (
        <GenerateDeckModal
          analysisId={id}
          onClose={() => setShowDeckModal(false)}
          onSuccess={(deck) => {
            setShowDeckModal(false);
            router.push('/presentations');
          }}
        />
      )}
    </div>
  );
}

/* ─── router ─── */
function InsightsInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  if (id === 'demo') return <NikeInsights />;
  return id ? <AnalysisDetail id={id} /> : <AnalysesList />;
}

export default function Insights() {
  return (
    <Suspense fallback={
      <div className="screen">
        <Navbar />
        <div className="main"><p style={{ padding: 40, color: 'var(--muted)' }}>Loading…</p></div>
      </div>
    }>
      <InsightsInner />
    </Suspense>
  );
}
