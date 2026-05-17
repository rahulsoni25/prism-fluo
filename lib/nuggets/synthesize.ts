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
  ask?:         NuggetCard;
  keyword?:     NuggetCard;
  helium10?:    NuggetCard;
  // Framework slots (A-J in the audience brief) ─────────────────────
  competition?: NuggetCard;  // section J — named-competitor share table
  cultural?:    NuggetCard;  // section D — theme clusters as creative cues
  trust?:       NuggetCard;  // section I — what builds trial / preference
  // future slots: gwi (A/B/C/D/F/G), panel (H), brand tracker (I)
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

/* ── COMPETITION synthesis (Section J of audience brief) ──────────────
   Takes the brief.competitors list (e.g. "Ghadi, Nirma, Rin, Wheel, Fena,
   Mr White, Patanjali, Nise") and surfaces each named brand's share in
   BOTH search volume (from keyword rows) AND Amazon revenue (from H10 rows).
   Highlights the biggest gainers / losers to inform competitive response. */
function synthesizeCompetition(opts: {
  keywordRows:      any[];
  helium10Rows:     any[];
  briefCompetitors: string[];
  briefBrand?:      string;
}): NuggetCard | null {
  const { keywordRows, helium10Rows, briefCompetitors, briefBrand } = opts;
  if (briefCompetitors.length === 0 && !briefBrand) return null;

  // Build the brand match list — our brand + named competitors, lowercased.
  const brandList = [briefBrand, ...briefCompetitors]
    .filter(Boolean)
    .map(b => String(b).toLowerCase().trim());
  if (brandList.length === 0) return null;

  // ── Search volume per brand (from keyword rows) ──────────────────
  let kwVolumes: Record<string, number> = {};
  let kwTotalCategoryVol = 0;
  if (keywordRows.length > 0) {
    const sample = keywordRows[0];
    const volKey = findCol(sample, /avg.*month.*search/i, /search\s*volume/i, /monthly\s*searches/i);
    if (volKey) {
      keywordRows.forEach(r => {
        const kw = String(r.Keyword || r.keyword || '').toLowerCase();
        const v  = toNum(r[volKey]);
        kwTotalCategoryVol += v;
        for (const b of brandList) {
          // First token (e.g. "Surf Excel" → "surf") OR full match
          const first = b.split(/\s+/)[0];
          if (new RegExp(`\\b${escapeRe(first)}\\b`).test(kw)) {
            kwVolumes[b] = (kwVolumes[b] || 0) + v;
          }
        }
      });
    }
  }

  // ── Revenue share per brand (from Helium 10 rows) ────────────────
  let amzRevenue: Record<string, number> = {};
  let amzTotal = 0;
  if (helium10Rows.length > 0) {
    const sample = helium10Rows[0];
    const revKey   = findCol(sample, /monthly.*revenue/i, /^revenue$/i);
    const brandKey = findCol(sample, /^brand$/i);
    if (revKey && brandKey) {
      helium10Rows.forEach(r => {
        const b = String(r[brandKey] || '').toLowerCase().trim();
        const v = toNum(r[revKey]);
        amzTotal += v;
        for (const target of brandList) {
          const first = target.split(/\s+/)[0];
          if (b === target || b.includes(first) || first.includes(b)) {
            amzRevenue[target] = (amzRevenue[target] || 0) + v;
            break;
          }
        }
      });
    }
  }

  // ── Build merged table sorted by combined share ──────────────────
  const combined = brandList.map(b => {
    const kwVol  = kwVolumes[b] || 0;
    const kwPct  = kwTotalCategoryVol > 0 ? Math.round(kwVol / kwTotalCategoryVol * 100) : 0;
    const amzVol = amzRevenue[b] || 0;
    const amzPct = amzTotal > 0 ? Math.round(amzVol / amzTotal * 100) : 0;
    return { brand: b, kwVol, kwPct, amzVol, amzPct, isOurs: b === (briefBrand || '').toLowerCase() };
  }).filter(x => x.kwVol > 0 || x.amzVol > 0);

  if (combined.length === 0) return null;

  // Sort by search share desc (the cheaper signal — present even when no Amazon data)
  combined.sort((a, b) => b.kwPct - a.kwPct);
  const leader = combined[0];
  const ourBrand = combined.find(c => c.isOurs);

  // ── Headline + stat ──────────────────────────────────────────────
  let headline: string;
  let eyebrow = '🏆 Competition';
  if (ourBrand && leader && leader.brand !== ourBrand.brand) {
    headline = `${cap(leader.brand)} leads category search at ${leader.kwPct}% · ${cap(ourBrand.brand)} sits at ${ourBrand.kwPct}% — ${ourBrand.kwPct < leader.kwPct ? `gap of ${leader.kwPct - ourBrand.kwPct}pts to close` : 'within striking distance'}.`;
  } else if (ourBrand) {
    headline = `${cap(ourBrand.brand)} leads category search at ${ourBrand.kwPct}% across ${combined.length} tracked brands.`;
  } else if (leader) {
    headline = `${cap(leader.brand)} leads the named competitor set at ${leader.kwPct}% of category search volume.`;
  } else {
    return null;
  }

  const statParts: string[] = [];
  statParts.push(`Search SOV across ${combined.length} brands`);
  if (amzTotal > 0) {
    const amzLeader = [...combined].sort((a, b) => b.amzPct - a.amzPct)[0];
    if (amzLeader && amzLeader.amzPct > 0) {
      statParts.push(`${cap(amzLeader.brand)} leads shelf at ${amzLeader.amzPct}% revenue`);
    }
  }
  const stat = statParts.join(' · ');

  // ── Hover: brand-by-brand table ──────────────────────────────────
  const hoverLines: string[] = combined.slice(0, 8).map(c => {
    const parts: string[] = [];
    if (c.kwPct > 0) parts.push(`search ${c.kwPct}%`);
    if (c.amzPct > 0) parts.push(`shelf ${c.amzPct}%`);
    const tag = c.isOurs ? ' ← our brand' : '';
    return `${cap(c.brand)}${tag} — ${parts.join(' · ')}`;
  });

  return { eyebrow, headline, stat, hoverLines };
}

/* ── CULTURAL CUES synthesis (Section D, partial) ─────────────────────
   Mines top theme clusters from keyword data using simple token frequency.
   Surfaces the strongest content/creative territories as direction signals.
   Caveat: this is a token-frequency proxy, NOT proper LDA/embedding clusters.
   For full Section D coverage upload GWI genre data. */
function synthesizeCulturalCues(rows: any[]): NuggetCard | null {
  if (!Array.isArray(rows) || rows.length < 20) return null;
  const sample = rows[0];
  const volKey = findCol(sample, /avg.*month.*search/i, /search\s*volume/i, /monthly\s*searches/i);
  if (!volKey) return null;

  // Stopwords + generic category words to ignore so clusters surface meaningful themes.
  const STOP = new Set([
    'the','and','for','with','from','this','that','your','best','top','how','what','where','when',
    'why','near','near me','in','of','to','a','an','is','are','my','me','i',
    // category-generic words
    'detergent','washing','powder','liquid','soap','laundry','clothes','machine','wash',
  ]);

  // Token-volume map
  const tokVol: Record<string, number> = {};
  rows.forEach(r => {
    const kw  = String(r.Keyword || r.keyword || '').toLowerCase();
    const v   = toNum(r[volKey]);
    if (v < 50) return;  // skip noise
    const toks = kw.split(/[\s\-_]+/).filter(t => t.length > 2 && !STOP.has(t));
    toks.forEach(t => { tokVol[t] = (tokVol[t] || 0) + v; });
  });

  // Rank tokens by volume, exclude tokens that are likely brand names
  const KNOWN_BRAND_TOKS = new Set(['surf','ariel','tide','ghadi','nirma','rin','wheel','henko','patanjali','fena','genteel','safed','vimal','sasa','mr','presto','godrej']);
  const themes = Object.entries(tokVol)
    .filter(([t]) => !KNOWN_BRAND_TOKS.has(t) && isNaN(Number(t)))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  if (themes.length < 3) return null;

  const top3 = themes.slice(0, 3);

  // ── Headline + stat ──────────────────────────────────────────────
  const eyebrow = '🎬 Cultural Cues';
  const headline = `"${top3[0][0]}" leads the conversation at ${fmt(top3[0][1])} monthly queries — strongest creative territory.`;
  const stat = `Top 3 themes: ${top3.map(([t, v]) => `${t} (${fmt(v)})`).join(' · ')}`;

  const hoverLines: string[] = themes.slice(0, 6).map(([t, v]) => `"${t}" — ${fmt(v)} monthly mentions`);
  hoverLines.push('Read these as content/creative angle hooks — landing pages, ad copy, video themes');

  return { eyebrow, headline, stat, hoverLines };
}

/* ── TRUST SIGNALS synthesis (Section I, partial) ─────────────────────
   What drives trial / preference in this category, based on the data we
   have. Pulls signals from:
     - Branded vs non-branded search ratio (low brand share = trust/awareness gap)
     - Reviews × sales correlation (high r = reviews are the buy lever)
     - Price band breadth (wide range = pricing-as-signal opportunity) */
function synthesizeTrustBuilders(opts: {
  keywordRows?:  any[] | null;
  helium10Rows?: any[] | null;
  briefBrand?:   string;
}): NuggetCard | null {
  const lines: string[] = [];
  let headline: string | null = null;
  let stat: string | null = null;

  // Branded-vs-non-branded signal from keywords
  if (opts.keywordRows && opts.keywordRows.length > 0) {
    const sample = opts.keywordRows[0];
    const volKey = findCol(sample, /avg.*month.*search/i, /search\s*volume/i);
    if (volKey) {
      const KNOWN_BRANDS = ['surf','ariel','tide','ghadi','nirma','rin','wheel','henko','patanjali','fena','genteel','safed'];
      let total = 0, branded = 0;
      opts.keywordRows.forEach(r => {
        const kw = String(r.Keyword || r.keyword || '').toLowerCase();
        const v  = toNum(r[volKey]);
        total += v;
        if (KNOWN_BRANDS.some(b => new RegExp(`\\b${b}\\b`).test(kw))) branded += v;
      });
      const pct = total > 0 ? Math.round(branded / total * 100) : 0;
      if (pct < 35) {
        headline = `${100 - pct}% of search is unbranded — trial-trust gap means recognition + recommendation matter more than brand recall.`;
        lines.push(`Branded ${pct}% vs non-branded ${100 - pct}% — leans heavily generic`);
        lines.push(`Implication: invest in retailer placement, in-store sampling, demo-led content`);
      } else if (pct > 60) {
        headline = `${pct}% of search is branded — established trust pool; the lever is consistency of presence, not new awareness.`;
        lines.push(`Branded ${pct}% vs non-branded ${100 - pct}% — consolidated branded category`);
        lines.push(`Implication: defend share-of-shelf + share-of-voice on owned brand keywords`);
      }
    }
  }

  // Reviews × Sales correlation from Helium 10
  if (opts.helium10Rows && opts.helium10Rows.length > 3) {
    const sample = opts.helium10Rows[0];
    const revKey     = findCol(sample, /monthly.*revenue/i, /^revenue$/i);
    const reviewsKey = findCol(sample, /review.*count/i, /^reviews$/i);
    if (revKey && reviewsKey) {
      const pts = opts.helium10Rows
        .filter(r => toNum(r[reviewsKey]) > 0 && toNum(r[revKey]) > 0)
        .map(r => ({ x: Math.log(toNum(r[reviewsKey]) + 1), y: Math.log(toNum(r[revKey]) + 1) }));
      if (pts.length > 2) {
        const mx = pts.reduce((s, d) => s + d.x, 0) / pts.length;
        const my = pts.reduce((s, d) => s + d.y, 0) / pts.length;
        const n  = pts.reduce((s, d) => s + (d.x - mx) * (d.y - my), 0);
        const dx = Math.sqrt(pts.reduce((s, d) => s + (d.x - mx) ** 2, 0));
        const dy = Math.sqrt(pts.reduce((s, d) => s + (d.y - my) ** 2, 0));
        const r  = dx > 0 && dy > 0 ? n / (dx * dy) : 0;
        if (r > 0.5) {
          lines.push(`Reviews × Sales correlation r=${r.toFixed(2)} — reviews are the primary buy lever on e-com`);
        } else if (r > 0) {
          lines.push(`Reviews × Sales r=${r.toFixed(2)} — moderate review influence, price and shelf placement matter more`);
        }
      }
    }
  }

  if (!headline) {
    if (lines.length === 0) return null;
    headline = lines[0];
    lines.shift();
  }

  if (!stat) stat = 'What converts consideration → trial in this category';

  // Add framework reminder lines
  lines.push('Full trust map needs: brand tracker (Kantar/YouGov), recommender mix (creator audit), review themes (NLP on ratings)');

  return {
    eyebrow:  '🛡️ Trust Signals',
    headline,
    stat,
    hoverLines: lines,
  };
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

  const kwRows  = Array.isArray(opts.keywordRows)  ? opts.keywordRows  : [];
  const amzRows = Array.isArray(opts.helium10Rows) ? opts.helium10Rows : [];

  if (kwRows.length > 0) {
    const k = synthesizeKeywords(kwRows);
    if (k) out.keyword = k;
  }
  if (amzRows.length > 0) {
    const h = synthesizeHelium10(amzRows);
    if (h) out.helium10 = h;
  }

  // ── Framework slots (Section J, D, I) ───────────────────────────
  const briefCompetitors = String(opts.brief?.competitors || '')
    .split(/[,;·|\/]+/)
    .map(s => s.trim())
    .filter(Boolean);

  const competition = synthesizeCompetition({
    keywordRows:  kwRows,
    helium10Rows: amzRows,
    briefCompetitors,
    briefBrand:   opts.brief?.brand,
  });
  if (competition) out.competition = competition;

  const cultural = synthesizeCulturalCues(kwRows);
  if (cultural) out.cultural = cultural;

  const trust = synthesizeTrustBuilders({
    keywordRows:  kwRows,
    helium10Rows: amzRows,
    briefBrand:   opts.brief?.brand,
  });
  if (trust) out.trust = trust;

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
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
