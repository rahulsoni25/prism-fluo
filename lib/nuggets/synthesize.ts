/**
 * lib/nuggets/synthesize.ts
 *
 * Deterministic Nuggets synthesis. Takes the raw rows the analyzer was
 * given, computes category-LEAD findings using fixed math (Pareto, HHI,
 * weighted YoY, brand SOV), and returns a NuggetsSummary the frontend
 * renders directly — NOT subject to whatever phrasing Gemini happened to
 * produce.
 *
 * Why this exists: the prior Nuggets implementation picked the
 * highest-conviction Gemini card and showed its `title` + `stat`. When
 * Gemini wrote a punchy headline the card landed well; when it wrote a
 * flat one, the card looked thin. This module replaces card-picking with
 * computation, so the header rail produces the same calibre of finding
 * every time.
 *
 * Source of truth: this is the analyzer-side port of
 * scripts/analyze-files-for-nuggets.mts (which proved the math against the
 * real Keyword Stats CSV + Amazon Black Box xlsx). Keep the two in sync —
 * if you change a formula here, update the script too.
 */

/* ── Public shape ─────────────────────────────────────────────────── */
export interface NuggetCard {
  eyebrow:    string;   // "🔎 Search Demand" / "🛒 Shelf Concentration" / "★ The Ask"
  headline:   string;   // bold one-liner with main number
  stat:       string;   // muted one-liner with backing fact (two parts joined by ·)
  hoverLines: string[]; // 3-5 deeper findings, rendered as bullets in the tooltip
}

export interface NuggetsSummary {
  ask?:      NuggetCard;
  keyword?:  NuggetCard;
  helium10?: NuggetCard;
  // future slots: gwi, social, pptx
}

/* ── Helpers ─────────────────────────────────────────────────────── */
const toNum = (v: any): number => {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/[, ₹$%]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const toPct = (v: any): number => {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/[%, ]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const findCol = (sample: any, ...patterns: RegExp[]): string => {
  if (!sample || typeof sample !== 'object') return '';
  for (const p of patterns) {
    const hit = Object.keys(sample).find(k => p.test(k));
    if (hit) return hit;
  }
  return '';
};

/* ── KEYWORD synthesis (8-Layer methodology) ──────────────────────── */
function synthesizeKeywords(rows: any[]): NuggetCard | null {
  if (!Array.isArray(rows) || rows.length < 5) return null;
  const sample = rows[0];
  const volKey  = findCol(sample, /avg.*month.*search/i, /search\s*volume/i, /monthly\s*searches/i);
  const yoyKey  = findCol(sample, /yoy/i, /year.*year/i, /y\/y/i);
  const compKey = findCol(sample, /^competition$/i);
  if (!volKey) return null;

  // ── Layer 1: Total volume + Pareto ────────────────────────────
  const volumes = rows.map(r => toNum(r[volKey])).filter(v => v > 0);
  if (volumes.length === 0) return null;
  const totalVol = volumes.reduce((s, v) => s + v, 0);
  const sorted = [...volumes].sort((a, b) => b - a);
  const top10Vol = sorted.slice(0, 10).reduce((s, v) => s + v, 0);
  const top10Pct = totalVol > 0 ? Math.round(top10Vol / totalVol * 100) : 0;

  // Volume bucket distribution
  const buckets = { Mega: 0, High: 0, Mid: 0, LongTail: 0, Micro: 0 };
  rows.forEach(r => {
    const v = toNum(r[volKey]);
    if (v >= 100000) buckets.Mega++;
    else if (v >= 10000) buckets.High++;
    else if (v >= 1000)  buckets.Mid++;
    else if (v >= 100)   buckets.LongTail++;
    else if (v >= 10)    buckets.Micro++;
  });
  const longTailCount = buckets.Mid + buckets.LongTail + buckets.Micro;

  // ── Layer 5: Weighted YoY ─────────────────────────────────────
  let weightedYoY = 0;
  let topWinner: { kw: string; yoy: number; vol: number } | null = null;
  if (yoyKey) {
    const yoyRows = rows.map(r => ({
      kw: String(r.Keyword || r.keyword || ''),
      vol: toNum(r[volKey]),
      yoy: toPct(r[yoyKey]),
    })).filter(r => r.vol >= 100 && Number.isFinite(r.yoy));
    const w = yoyRows.reduce((acc, r) => ({ num: acc.num + r.vol * r.yoy, den: acc.den + r.vol }), { num: 0, den: 0 });
    weightedYoY = w.den > 0 ? Math.round(w.num / w.den * 10) / 10 : 0;
    const winners = yoyRows.filter(r => r.yoy > 50).sort((a, b) => b.yoy - a.yoy);
    topWinner = winners[0] || null;
  }

  // ── Layer 7.1: Brand share of search ──────────────────────────
  const KNOWN_BRANDS = ['surf', 'ariel', 'tide', 'ghadi', 'nirma', 'rin', 'wheel', 'henko', 'patanjali', 'fena', 'genteel', 'safed', 'nike', 'adidas', 'puma', 'amazon', 'flipkart', 'myntra', 'lakme', 'maybelline', 'lakme', 'sugar', 'mamaearth', 'dabur', 'colgate', 'pepsodent', 'closeup', 'sensodyne'];
  const brandVol: Record<string, number> = {};
  rows.forEach(r => {
    const kw = String(r.Keyword || r.keyword || '').toLowerCase();
    for (const b of KNOWN_BRANDS) {
      if (new RegExp(`\\b${b}\\b`).test(kw)) {
        brandVol[b] = (brandVol[b] || 0) + toNum(r[volKey]);
      }
    }
  });
  const totalBranded = Object.values(brandVol).reduce((s, v) => s + v, 0);
  const brandedPct = totalVol > 0 ? Math.round(totalBranded / totalVol * 100) : 0;
  const brandSov = Object.entries(brandVol)
    .map(([b, v]) => ({ brand: b, vol: v, pct: totalBranded > 0 ? Math.round(v / totalBranded * 100) : 0 }))
    .sort((a, b) => b.vol - a.vol);
  const leader = brandSov[0] || null;

  // ── Build headline + stat ─────────────────────────────────────
  let headline: string;
  let eyebrow:  string;
  if (yoyKey && Math.abs(weightedYoY) >= 5) {
    // Strong YoY signal → use trend as the headline
    eyebrow  = "🔎 What's Heating Up";
    const dir = weightedYoY >= 0 ? '+' : '';
    headline = `Category search runs ${dir}${weightedYoY}% YoY across ${fmt(totalVol)} monthly queries — ${longTailCount} keywords carry the long tail.`;
  } else if (leader && leader.pct >= 30) {
    eyebrow  = '🔎 Who Owns Search';
    headline = `${cap(leader.brand)} commands ${leader.pct}% of branded search across ${fmt(totalVol)} monthly queries.`;
  } else {
    eyebrow  = '🔎 Search Demand';
    headline = `${fmt(totalVol)} monthly queries chase this category — top 10 keywords own ${top10Pct}% of all volume.`;
  }

  const statParts: string[] = [];
  statParts.push(`Top 10 = ${top10Pct}% of volume`);
  if (leader)   statParts.push(`${cap(leader.brand)} leads brand SOV at ${leader.pct}%`);
  else          statParts.push(`${brandedPct}% branded vs ${100 - brandedPct}% non-branded`);
  const stat = statParts.join(' · ');

  // Hover bullets — extra category facts
  const hoverLines: string[] = [];
  hoverLines.push(`Volume buckets — Mega ${buckets.Mega} · High ${buckets.High} · Mid ${buckets.Mid} · Long-tail ${buckets.LongTail} · Micro ${buckets.Micro}`);
  hoverLines.push(`Branded ${brandedPct}% vs non-branded ${100 - brandedPct}% — ${100 - brandedPct >= 60 ? 'wide open generic territory' : 'consolidated branded category'}`);
  if (topWinner) hoverLines.push(`Fastest mover: "${topWinner.kw}" +${Math.round(topWinner.yoy)}% YoY at ${fmt(topWinner.vol)}/mo`);
  if (brandSov.length >= 2) {
    const top3 = brandSov.slice(0, 3).map(b => `${cap(b.brand)} ${b.pct}%`).join(' · ');
    hoverLines.push(`Brand SOV: ${top3}`);
  }
  const topKw = rows.slice().sort((a, b) => toNum(b[volKey]) - toNum(a[volKey]))[0];
  if (topKw) hoverLines.push(`Top keyword: "${topKw.Keyword || topKw.keyword}" at ${fmt(toNum(topKw[volKey]))}/mo`);

  return { eyebrow, headline, stat, hoverLines };
}

/* ── HELIUM 10 / AMAZON BLACK BOX synthesis (9-Layer methodology) ── */
function synthesizeHelium10(rows: any[]): NuggetCard | null {
  if (!Array.isArray(rows) || rows.length < 3) return null;
  const sample = rows[0];
  const revKey    = findCol(sample, /monthly.*revenue/i, /^revenue$/i);
  const unitsKey  = findCol(sample, /monthly.*sales/i, /units\s*sold/i, /^sales$/i);
  const priceKey  = findCol(sample, /^price$/i, /list.*price/i);
  const brandKey  = findCol(sample, /^brand$/i);
  const reviewsKey = findCol(sample, /review.*count/i, /^reviews$/i, /number.*reviews/i);
  const titleKey  = findCol(sample, /^title$/i, /product.*name/i, /^name$/i);
  if (!revKey) return null;

  // ── Layer 1: HHI + revenue concentration ──────────────────────
  const revenues = rows.map(r => toNum(r[revKey])).filter(v => v > 0);
  if (revenues.length === 0) return null;
  const totalRev = revenues.reduce((s, v) => s + v, 0);
  const sorted   = [...revenues].sort((a, b) => b - a);
  const shares   = sorted.map(v => totalRev > 0 ? v / totalRev * 100 : 0);
  const hhi      = Math.round(shares.reduce((s, p) => s + p * p, 0));
  const top3     = Math.round(shares.slice(0, 3).reduce((s, p) => s + p, 0));
  const top10    = Math.round(shares.slice(0, 10).reduce((s, p) => s + p, 0));
  const hhiLabel = hhi > 2500 ? 'highly concentrated' : hhi > 1500 ? 'moderately concentrated' : 'fragmented';

  // ── Layer 3: Brand share by revenue ───────────────────────────
  const brandRev: Record<string, { rev: number; units: number; count: number }> = {};
  rows.forEach(r => {
    const b = String(r[brandKey] || 'Unknown').trim() || 'Unknown';
    if (!brandRev[b]) brandRev[b] = { rev: 0, units: 0, count: 0 };
    brandRev[b].rev   += toNum(r[revKey]);
    brandRev[b].units += toNum(r[unitsKey]);
    brandRev[b].count += 1;
  });
  const brandRanked = Object.entries(brandRev)
    .filter(([b]) => b !== 'Unknown')
    .map(([b, v]) => ({ brand: b, ...v, pct: totalRev > 0 ? Math.round(v.rev / totalRev * 100) : 0 }))
    .sort((a, b) => b.rev - a.rev);
  const leader = brandRanked[0] || null;

  // ── Layer 5: Top SKU ──────────────────────────────────────────
  const topSku = rows.slice().sort((a, b) => toNum(b[revKey]) - toNum(a[revKey]))[0];

  // ── Layer 4: Reviews × Sales correlation (log-log) ────────────
  let corr = 0;
  if (reviewsKey) {
    const pts = rows
      .filter(r => toNum(r[reviewsKey]) > 0 && toNum(r[revKey]) > 0)
      .map(r => ({ x: Math.log(toNum(r[reviewsKey]) + 1), y: Math.log(toNum(r[revKey]) + 1) }));
    if (pts.length > 2) {
      const mx = pts.reduce((s, d) => s + d.x, 0) / pts.length;
      const my = pts.reduce((s, d) => s + d.y, 0) / pts.length;
      const n  = pts.reduce((s, d) => s + (d.x - mx) * (d.y - my), 0);
      const dx = Math.sqrt(pts.reduce((s, d) => s + (d.x - mx) ** 2, 0));
      const dy = Math.sqrt(pts.reduce((s, d) => s + (d.y - my) ** 2, 0));
      corr = dx > 0 && dy > 0 ? Math.round(n / (dx * dy) * 100) / 100 : 0;
    }
  }

  // ── Price band ────────────────────────────────────────────────
  const prices = rows.map(r => toNum(r[priceKey])).filter(p => p > 0).sort((a, b) => a - b);
  const medianPrice = prices[Math.floor(prices.length / 2)] || 0;

  // ── Build headline + stat ─────────────────────────────────────
  let eyebrow:  string;
  let headline: string;
  if (leader && leader.pct >= 25) {
    eyebrow  = '🛒 Shelf Leaders';
    const second = brandRanked[1];
    headline = `${leader.brand} owns ${leader.pct}% of category revenue${second ? ` · ${second.brand} second at ${second.pct}%` : ''} — HHI ${hhi} (${hhiLabel}).`;
  } else if (top3 >= 50) {
    eyebrow  = '🛒 Shelf Concentration';
    headline = `Top 3 ASINs hold ${top3}% of category revenue — HHI ${hhi}, ${hhiLabel}.`;
  } else {
    eyebrow  = '🛒 Hero SKUs';
    const tt = String(topSku?.[titleKey] || '').slice(0, 60);
    headline = `${tt}${tt.length === 60 ? '…' : ''} leads at ${fmtRupees(toNum(topSku?.[revKey]))}/mo across ${rows.length} ASINs.`;
  }

  const statParts: string[] = [];
  statParts.push(`Total category ${fmtRupees(totalRev)}/mo across ${rows.length} ASINs`);
  if (medianPrice > 0) statParts.push(`median price ₹${medianPrice}`);
  const stat = statParts.join(' · ');

  // Hover bullets
  const hoverLines: string[] = [];
  if (brandRanked.length >= 2) {
    hoverLines.push(`Brand split: ${brandRanked.slice(0, 4).map(b => `${b.brand} ${b.pct}%`).join(' · ')}`);
  }
  if (topSku) {
    const tt = String(topSku[titleKey] || '').slice(0, 65);
    hoverLines.push(`Top SKU: "${tt}${tt.length === 65 ? '…' : ''}" at ${fmtRupees(toNum(topSku[revKey]))}/mo`);
  }
  if (corr !== 0) {
    const lab = corr > 0.5 ? 'strongly drive' : corr > 0.3 ? 'moderately influence' : 'weakly correlate with';
    hoverLines.push(`Reviews × Sales r = ${corr} — reviews ${lab} sales`);
  }
  hoverLines.push(`Top 10 ASINs hold ${top10}% of all revenue`);
  if (prices.length > 0) {
    hoverLines.push(`Price range: ₹${prices[0]} – ₹${prices[prices.length - 1]} (median ₹${medianPrice})`);
  }

  return { eyebrow, headline, stat, hoverLines };
}

/* ── Brief Ask synthesis ──────────────────────────────────────────── */
function synthesizeAsk(brief: any, audienceDescriptor: string | null, categoryIntel: any): NuggetCard | null {
  const b = brief || {};
  if (!b.brand && !b.objective && !audienceDescriptor) return null;

  // Detect flavour
  const text = `${b.objective || ''} ${b.brand || ''}`.toLowerCase();
  const flav = /\blaunch|new\s+sku|enter|whitespace\b/.test(text) ? 'LAUNCH'
             : /\bdefend|protect|threat|leader|hold\b/.test(text) ? 'DEFEND'
             : /\bgrow|expand|share|adjacenc/.test(text)         ? 'GROW'
             : null;

  const headline = b.brand && b.objective
    ? `${b.brand} — ${b.objective}`
    : b.objective || b.brand || 'Brief anchors this analysis';

  const statParts = [b.category, audienceDescriptor, b.geography || b.market].filter(Boolean);
  const stat = statParts.join(' · ');

  const hoverLines: string[] = [];
  if (flav) hoverLines.push(`Brief flavour: ${flav}`);
  if (categoryIntel?.marketValueINR) hoverLines.push(`Category value: ${categoryIntel.marketValueINR}${categoryIntel.cagr ? ` · ${categoryIntel.cagr} CAGR` : ''}`);
  if (b.competitors) hoverLines.push(`Competitors: ${b.competitors}`);
  if (b.geography || b.market) hoverLines.push(`Market: ${b.geography || b.market}`);

  return {
    eyebrow:  '★ The Ask',
    headline: headline.length > 120 ? headline.slice(0, 118) + '…' : headline,
    stat:     stat || '',
    hoverLines,
  };
}

/* ── Public entrypoint ────────────────────────────────────────────── */
export function synthesizeNuggets(opts: {
  keywordRows?:  any[] | null;
  helium10Rows?: any[] | null;
  brief?:        any;
  audienceDescriptor?: string | null;
  categoryIntel?: any;
}): NuggetsSummary {
  const out: NuggetsSummary = {};
  const ask = synthesizeAsk(opts.brief, opts.audienceDescriptor ?? null, opts.categoryIntel);
  if (ask) out.ask = ask;
  if (Array.isArray(opts.keywordRows) && opts.keywordRows.length > 0) {
    const k = synthesizeKeywords(opts.keywordRows);
    if (k) out.keyword = k;
  }
  if (Array.isArray(opts.helium10Rows) && opts.helium10Rows.length > 0) {
    const h = synthesizeHelium10(opts.helium10Rows);
    if (h) out.helium10 = h;
  }
  return out;
}

/* ── tiny formatting helpers ─────────────────────────────────────── */
function fmt(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(Math.round(n));
}
function fmtRupees(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '₹0';
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(0)}K`;
  return `₹${Math.round(n)}`;
}
function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
