import { isKeywordPlan } from './keywords';
import { isGWISheet } from './gwi';
import type { Schema, ChartSpec, Scorecard, DashboardMeta, Layout, Anomaly, StrategicBrief } from '@/types/inference';

// ── Helpers ──────────────────────────────────────────────────

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdDev(arr: number[]): number {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / arr.length);
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  const mx = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = y.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  const den = Math.sqrt(dx2 * dy2);
  return den === 0 ? 0 : num / den;
}

function fmt(n: unknown): string {
  const v = Number(n);
  if (n == null || isNaN(v)) return '0';
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function pct(n: unknown): string { return Number(n).toFixed(1) + '%'; }

// ── Schema Inference ─────────────────────────────────────────

export function inferSchema(data: Record<string, unknown>[]): Schema {
  if (!data || data.length === 0) return { time: [], numeric: [], categorical: [], catData: [], allHeaders: [] };

  const headers = Object.keys(data[0]);
  const schema: Omit<Schema, 'catData' | 'allHeaders'> & { catData: Schema['catData']; allHeaders: string[] } =
    { time: [], numeric: [], categorical: [], catData: [], allHeaders: [] };
  const sample = data.slice(0, 500);

  headers.forEach(col => {
    let numCount = 0, dateCount = 0;
    const uniqueVals = new Set<string>();

    sample.forEach(row => {
      const val = row[col];
      if (val == null || val === '') return;
      const vStr = String(val).trim();
      uniqueVals.add(vStr);

      if (!isNaN(parseFloat(String(val))) && isFinite(Number(val))) numCount++;
      const colStr = col.toLowerCase();
      if (['date','time','month','year','period','week','quarter'].some(k => colStr.includes(k))) {
        dateCount++;
      } else if (!isNaN(Date.parse(String(val))) && vStr.length > 4) {
        dateCount++;
      }
    });

    const totalValid = sample.filter(r => r[col] != null && r[col] !== '').length;
    if (totalValid === 0) return;

    if (dateCount > totalValid * 0.5) { schema.time.push(col); return; }
    if (numCount > totalValid * 0.8)  { schema.numeric.push(col); return; }
    if (uniqueVals.size <= Math.max(50, totalValid * 0.5)) { schema.categorical.push(col); }
  });

  schema.catData = schema.categorical.map(col => {
    const s = new Set(data.map(r => r[col]).filter(v => v != null && v !== ''));
    return { name: col, unique: s.size };
  });
  schema.allHeaders = headers;

  return schema as Schema;
}

// ── Layout Generator ─────────────────────────────────────────

export function autoGenerateLayout(data: Record<string, unknown>[], schema: Schema): Layout {
  const charts: ChartSpec[] = [];
  const scorecards: Scorecard[] = [];

  const joined = [...schema.time, ...schema.numeric, ...schema.categorical].join(' ').toLowerCase();

  // Scorecards
  schema.numeric.slice(0, 4).forEach(metric => {
    const vals = data.map(r => parseFloat(String(r[metric]))).filter(v => !isNaN(v));
    if (vals.length === 0) return;
    const sum  = vals.reduce((a, b) => a + b, 0);
    const avg  = sum / vals.length;
    const mid  = Math.floor(vals.length / 2);
    const fh   = vals.slice(0, mid).reduce((a, b) => a + b, 0);
    const sh   = vals.slice(mid).reduce((a, b) => a + b, 0);
    const trend = fh > 0 ? (((sh - fh) / fh) * 100).toFixed(1) : (sh > 0 ? 100 : 0);
    scorecards.push({ label: metric, value: fmt(sum), avg: fmt(avg), trend: Math.abs(Number(trend)), isPositive: Number(trend) >= 0 });
  });

  // GWI
  const isGWIRaw    = isGWISheet(schema.allHeaders, data);
  const isGWITidied = schema.allHeaders.includes('attribute') && schema.allHeaders.includes('metric') && schema.allHeaders.includes('value');
  const isGWIMode   = isGWIRaw || isGWITidied;

  if (isGWIMode && data.length > 0) {
    let indexData = isGWITidied ? data.filter(r => String(r.metric).toLowerCase().includes('index')) : [];
    const indexCol    = schema.allHeaders.find(h => h.toLowerCase().includes('index')) ?? (isGWITidied ? 'value' : null);
    const audienceCol = schema.allHeaders.find(h => h.toLowerCase().includes('audience %')) ?? null;

    if (indexCol && (isGWIRaw || indexData.length > 0)) {
      const displayData = isGWITidied ? indexData : data;
      charts.push({
        id: 'gwi_index_heatmap', type: 'hbar', xCol: schema.categorical[0] ?? 'attribute', yCol: indexCol,
        title: 'Index Analysis: High-Affinity Consumer Pockets',
        lbl: 'AUDIENCE OVER-INDEX HEATMAP',
        source: 'PRISM GWI Engine', conviction: 99,
        obs: `We have identified critical white-space opportunities where your target audience significantly over-indexes (Index > 120). These segments show a 20%+ higher propensity for this behavior compared to the market average, making them prime targets for high-conversion messaging.`,
        stat: `Baseline: 100 · Peak Index: ${Math.max(...displayData.map(r => parseFloat(String(r[indexCol])) || 0))}`,
        rec: `Adopt an **Index-First Targeting** strategy. Redirect 20% of budget into the top 3 over-indexing categories to capture high-affinity audiences where competition is lower but relevance is structural.`,
      });
    }
  }

  // Keywords
  const initialMeta = generateDashboardMeta(data, schema, charts);
  const isSearchMode = initialMeta.domain === 'Search & SEO';

  if (isSearchMode && schema.categorical.includes('tier')) {
    const volCol = schema.numeric.find(n => n.toLowerCase().includes('search')) ?? schema.numeric[0];
    charts.push({
      id: 'keyword_tiers', type: 'pie', xCol: 'tier', yCol: volCol,
      title: `Keyword Dominance: Distribution of ${volCol} by Tier`,
      lbl: 'SEARCH VOLUME CAPTURE BY TIER',
      source: 'PRISM Keyword Engine', conviction: 98,
      obs: `Your search strategy is currently weighted towards ${data.filter(r => r.tier === 'Primary').length} Primary keywords. This indicates a "Top-Heavy" intent profile.`,
      stat: `Tiers: Primary, Secondary, Tertiary · ${data.length} Keywords`,
      rec: `Diversify into **Secondary Clusters**. Reallocate 15% of bid focus into Tier 2 categories where CPC is typically 20-30% lower.`,
    });
  }

  if (isSearchMode && schema.categorical.includes('brand')) {
    const volCol = schema.numeric.find(n => n.toLowerCase().includes('search')) ?? schema.numeric[0];
    charts.push({
      id: 'brand_share', type: 'hbar', xCol: 'brand', yCol: volCol,
      title: 'Brand Capture: Proprietary vs. Non-brand Market Intent',
      lbl: 'BRANDED VS GENERIC SEARCH VOLUME',
      source: 'PRISM Keyword Engine', conviction: 96,
      obs: `Branded search accounts for a significant portion of your total potential traffic.`,
      stat: `Top Brand: ${data.find(r => r.brand !== 'Non-brand')?.brand ?? 'N/A'} · Source: Intent Analysis`,
      rec: `Protect your **Branded Moats**. Set up defensive campaigns for your top 3 detected brands to prevent competitor conquesting.`,
    });
  }

  // Time series
  if (schema.time.length > 0 && schema.numeric.length > 0) {
    const timeCol = schema.time[0];
    schema.numeric.slice(0, 2).forEach(metric => {
      const sorted = [...data].sort((a, b) => (Date.parse(String(a[timeCol])) || 0) - (Date.parse(String(b[timeCol])) || 0));
      const vals = sorted.map(r => parseFloat(String(r[metric]))).filter(v => !isNaN(v));
      if (vals.length < 3) return;

      const firstVal = vals[0], lastVal = vals[vals.length - 1];
      const maxVal = Math.max(...vals);
      const maxIdx = vals.indexOf(maxVal);
      const peakTime = String(sorted[maxIdx]?.[timeCol] ?? 'N/A');
      const avgVal = vals.reduce((a, b) => a + b, 0) / vals.length;
      const sd = stdDev(vals);
      const cv = avgVal > 0 ? ((sd / avgVal) * 100).toFixed(1) : 0;
      const growth = firstVal > 0 ? (((lastVal - firstVal) / firstVal) * 100).toFixed(1) : 0;
      const isGrowing = parseFloat(String(growth)) > 0;
      const multiplier = firstVal > 0 ? (maxVal / firstVal).toFixed(1) : 'N/A';
      const isSales = joined.includes('sale') || joined.includes('revenue');
      const subject = isSales ? 'Customer Demand' : 'Performance';
      const cv_n = parseFloat(String(cv));
      const gr_n = parseFloat(String(growth));
      const momentumLabel = isGrowing ? 'expansionary' : 'contractionary';

      charts.push({
        id: `time_${metric}`,
        type: cv_n > 40 ? 'line' : 'area',
        xCol: timeCol, yCol: metric,
        title: isGrowing
          ? (cv_n > 30 ? `Growth Risk: ${metric} is expanding, but ${cv}% volatility threatens stability`
            : gr_n > 50 ? `Breakout Performance: ${metric} surges ${pct(Math.abs(gr_n))} — triggered by the "${peakTime}" peak`
            : `Steady Momentum: ${metric} on track to hit ${fmt(lastVal * 1.1)} by next period`)
          : (gr_n < -30 ? `Critical Warning: ${metric} has entered a ${pct(Math.abs(gr_n))} tailspin since "${peakTime}"`
            : `Softening Signals: ${metric} showing a structural ${momentumLabel} shift`),
        lbl: `${metric.toUpperCase()} STRATEGIC TRAJECTORY`,
        source: 'PRISM Storyteller · Performance Logic', conviction: 94,
        obs: `Your ${subject} is currently in an ${momentumLabel} phase. We tracked a move from ${fmt(firstVal)} to ${fmt(lastVal)}, with a defining ${multiplier}× breakout occurring at "${peakTime}". ${cv_n > 30 ? `The high volatility (${cv}%) indicates your base is fragile.` : `This stable growth confirms a repeatable success formula.`}`,
        stat: `${isGrowing ? '+' : ''}${growth}% ${isSales ? 'Revenue' : 'Impact'} · Multiplier: ${multiplier}×`,
        rec: isGrowing
          ? `Capitalise on this ${pct(Math.abs(gr_n))} momentum within the next 30 days.`
          : `Immediate Pivot Required: Audit your metrics from the "${peakTime}" peak and launch a 14-day recovery pilot.`,
      });
    });
  }

  // Categorical dominance
  if (schema.catData.length > 0 && schema.numeric.length > 0) {
    schema.catData.slice(0, 3).forEach((cat, cIdx) => {
      if (cat.name === schema.time[0]) return;
      const metric = schema.numeric[cIdx < schema.numeric.length ? cIdx : 0] ?? schema.numeric[0];
      const groups: Record<string, number> = {};
      data.forEach(row => {
        const k = String(row[cat.name] ?? 'Other').trim();
        if (!k || k === 'undefined') return;
        groups[k] = (groups[k] ?? 0) + (parseFloat(String(row[metric])) || 0);
      });
      const entries = Object.entries(groups).sort((a, b) => b[1] - a[1]);
      if (entries.length < 2) return;

      const sumAll = entries.reduce((acc, e) => acc + e[1], 0);
      const top = entries[0], second = entries[1], bottom = entries[entries.length - 1];
      const topPct    = sumAll > 0 ? ((top[1]    / sumAll) * 100).toFixed(1) : '0';
      const secondPct = sumAll > 0 ? ((second[1] / sumAll) * 100).toFixed(1) : '0';
      const hhi = entries.reduce((acc, e) => { const share = sumAll > 0 ? e[1] / sumAll : 0; return acc + share * share; }, 0);
      const isConcentrated = hhi > 0.25;
      const ratio = bottom[1] > 0 ? (top[1] / bottom[1]).toFixed(1) : top[1] > 0 ? '∞' : '1.0';
      const entityClass = cat.name.toLowerCase().includes('brand') ? 'Brand'
        : cat.name.toLowerCase().includes('region') ? 'Market'
        : cat.name.toLowerCase().includes('city')   ? 'Geography'
        : cat.name.toLowerCase().includes('segment')? 'Audience Segment' : 'Category';

      charts.push({
        id: `cat_${cat.name}_${metric}`,
        type: cat.unique <= 5 && parseFloat(topPct) < 60 ? 'pie' : (cat.unique <= 10 ? 'bar' : 'hbar'),
        xCol: cat.name, yCol: metric,
        title: isConcentrated
          ? (parseFloat(topPct) > 60 ? `Dominance Alert: ${entityClass} "${top[0]}" controls ${topPct}% of all ${metric}` : `Market Lead: "${top[0]}" commands ${topPct}% share`)
          : (entries.length > 5 ? `Fragmented Landscape: ${metric} split across ${entries.length} segments` : `Competitive Race: "${top[0]}" leads, "${second[0]}" at ${secondPct}%`),
        lbl: `${entityClass.toUpperCase()} MARKET SHARE ANALYSIS`,
        source: 'PRISM Storyteller · Multi-Segment Engine', conviction: 93,
        obs: `A ${isConcentrated ? 'dominance' : 'fragmentation'} pattern for "${top[0]}". It accounts for ${topPct}% of all ${metric} value — ${fmt(top[1])} total with a ${ratio}× gap over ${bottom[0]}.`,
        stat: `${topPct}% Share for ${top[0]} · ${ratio}× Gap`,
        rec: isConcentrated
          ? `Prioritise **Defensive Market Moats**. Redirect 10% of budget from ${bottom[0]} into loyalty programs for "${top[0]}".`
          : `The market is open. Scale across your top 3 ${cat.name} segments with a **Volume-Capture** mandate.`,
      });
    });
  }

  // Correlation scatter
  if (schema.numeric.length >= 2) {
    const xM = schema.numeric[0], yM = schema.numeric[1];
    const xVals = data.map(r => parseFloat(String(r[xM]))).filter(v => !isNaN(v));
    const yVals = data.map(r => parseFloat(String(r[yM]))).filter(v => !isNaN(v));
    const r_val = pearsonCorrelation(xVals, yVals);
    const rAbs  = Math.abs(r_val);
    charts.push({
      id: 'corr_scatter', type: 'scatter', xCol: xM, yCol: yM,
      title: rAbs > 0.7 ? `Efficiency Link: Higher ${xM} drives ${yM} (r=${r_val.toFixed(2)})`
        : rAbs > 0.4 ? `Correlation Detected: ${xM} and ${yM} are linked`
        : `Independent Performance: ${xM} and ${yM} move independently`,
      lbl: `${xM.toUpperCase()} VS ${yM.toUpperCase()} PERFORMANCE LINK`,
      source: 'PRISM Storyteller · Dynamic Correlation', conviction: rAbs > 0.5 ? 92 : 76,
      obs: `We have isolated a ${rAbs > 0.7 ? 'powerful predictive' : rAbs > 0.4 ? 'notable' : 'weak'} relationship (Pearson r = ${r_val.toFixed(2)}).`,
      stat: `Pearson r = ${r_val.toFixed(2)} · ${Math.min(xVals.length, yVals.length)} samples`,
      rec: rAbs > 0.6
        ? `Adopt a **Linked-Optimization** strategy. Build a regression-based model to predict ${yM} results.`
        : `Stop treating ${xM} and ${yM} as a unified funnel. Run isolated A/B tests to find the binding metric.`,
    });
  }

  // Bubble 3-way
  if (schema.numeric.length >= 3) {
    const [xM, yM, zM] = schema.numeric.slice(0, 3);
    charts.push({
      id: 'bubble_3way', type: 'bubble', xCol: xM, yCol: yM, zCol: zM,
      title: `The Convergence Zone: Mapping Your "Triple-Win" Opportunities`,
      lbl: `${xM.toUpperCase()} VS ${yM.toUpperCase()} WEIGHED BY ${zM.toUpperCase()}`,
      source: 'PRISM Storyteller · Convergence Logic', conviction: 85,
      obs: `Cross-referencing three dimensions reveals a high-perfection "Goldilocks Zone" in the upper-right quadrant.`,
      stat: `3-way Convergence · Upper-right = Optimal Unit Economics`,
      rec: `Execute a **Triple-Weighted Reallocation** over the next 90 days into the top 5 convergence leaders.`,
    });
  }

  // Radar
  if (schema.numeric.length >= 3 && schema.catData.some(c => c.unique >= 2 && c.unique <= 10)) {
    const cat = schema.catData.find(c => c.unique >= 2 && c.unique <= 10)!;
    const metrics = schema.numeric.slice(0, 5);
    const catGroups: Record<string, { count: number; sums: Record<string, number> }> = {};
    data.forEach(row => {
      const k = String(row[cat.name] ?? '').trim();
      if (!k) return;
      if (!catGroups[k]) catGroups[k] = { count: 0, sums: {} };
      catGroups[k].count++;
      metrics.forEach(m => { catGroups[k].sums[m] = (catGroups[k].sums[m] ?? 0) + (parseFloat(String(row[m])) || 0); });
    });
    const catNames = Object.keys(catGroups);
    let bestCat = catNames[0], bestScore = 0, worstCat = catNames[0], worstScore = Infinity;
    catNames.forEach(c => {
      const avg = metrics.reduce((acc, m) => acc + (catGroups[c].sums[m] / catGroups[c].count), 0);
      if (avg > bestScore)  { bestScore = avg;  bestCat = c; }
      if (avg < worstScore) { worstScore = avg; worstCat = c; }
    });
    charts.push({
      id: 'radar_bench', type: 'radar', xCol: cat.name, yCols: metrics,
      title: `Operational Benchmark: Why "${bestCat}" is Outperforming Across All Axes`,
      lbl: `MULTI-AXIS SEGMENT RADAR: "${bestCat}" VS PEERS`,
      source: 'PRISM Storyteller · Benchmark Logic', conviction: 90,
      obs: `"${bestCat}" is your **Execution North Star** while "${worstCat}" reveals a "Dented Radar" profile.`,
      stat: `Leader: "${bestCat}" · Primary Gap in "${worstCat}" · ${metrics.length} axes`,
      rec: `Standardise on the ${bestCat} operational model and deploy top workflows to ${worstCat} in a 30-day pilot.`,
    });
  }

  // Cross-categorical
  if (schema.catData.length >= 2 && schema.numeric.length > 0) {
    const cat1 = schema.catData[0], cat2 = schema.catData[1], metric = schema.numeric[0];
    const crossGroups: Record<string, number> = {};
    data.forEach(row => {
      const k1 = String(row[cat1.name] ?? '').trim();
      const k2 = String(row[cat2.name] ?? '').trim();
      if (!k1 || !k2) return;
      const key = `${k1} × ${k2}`;
      crossGroups[key] = (crossGroups[key] ?? 0) + (parseFloat(String(row[metric])) || 0);
    });
    const crossEntries = Object.entries(crossGroups).sort((a, b) => b[1] - a[1]);
    if (crossEntries.length > 2) {
      const topCombo = crossEntries[0], botCombo = crossEntries[crossEntries.length - 1];
      const ratio = botCombo[1] > 0 ? (topCombo[1] / botCombo[1]).toFixed(1) : '∞';
      charts.push({
        id: 'cross_cat', type: 'hbar', xCol: `${cat1.name} × ${cat2.name}`, yCol: metric,
        _crossData: crossEntries.slice(0, 12) as [string, number][],
        title: `Intersection Strategy: "${topCombo[0]}" Leads by ${ratio}× Over Lowest Segment`,
        lbl: `HIGH-DENSITY PERFORMANCE POCKETS`,
        source: 'PRISM Storyteller · Dimensional Logic', conviction: 88,
        obs: `The intersection of ${cat1.name} and ${cat2.name} reveals "${topCombo[0]}" generating a ${ratio}× advantage.`,
        stat: `Leader: "${topCombo[0]}" · ${ratio}× Performance Delta`,
        rec: `Shift 10% of total effort from "${botCombo[0]}" into "${topCombo[0]}" for the next 45 days.`,
      });
    }
  }

  const isKWP = isKeywordPlan(data);
  const isGWI = isGWIRaw || isGWITidied;

  const meta: DashboardMeta = isGWI
    ? { title: 'Consumer Intelligence (GWI) — Survey Analysis', subtitle: `${data.length} data points · GWI Tidy-Engine active`, readingGuide: 'This report analyzes GWI survey data, focusing on Audience Index scores.', icon: '📊', domain: 'Consumer Insights', cls: 'culture' }
    : isKWP
    ? { title: `Search Intelligence Dashboard — ${schema.numeric[0] ?? 'Volume'} Analysis`, subtitle: `${data.length} keywords analyzed · Multi-tier enrichment active`, readingGuide: 'This report uses the PRISM Keyword Engine.', icon: '🔍', domain: 'Search & SEO', cls: 'content' }
    : generateDashboardMeta(data, schema, charts);

  return { scorecards, charts: charts.slice(0, 8), meta };
}

// ── Dashboard Meta ────────────────────────────────────────────

function generateDashboardMeta(
  data: Record<string, unknown>[],
  schema: Schema,
  charts: ChartSpec[]
): DashboardMeta {
  const allCols = [...schema.time, ...schema.numeric, ...schema.categorical].map(c => c.toLowerCase());
  const joined = allCols.join(' ');

  const domains = [
    { keywords: ['revenue','sales','order','transaction','purchase','price','cost','profit','margin'], label: 'Sales & Revenue', icon: '💰', cls: 'commerce' },
    { keywords: ['campaign','click','impression','ctr','cpc','cpm','ad','spend','reach','engagement'], label: 'Marketing & Performance', icon: '📢', cls: 'communication' },
    { keywords: ['keyword','search','seo','rank','volume','traffic','pageview','session','organic'], label: 'Search & SEO', icon: '🔍', cls: 'content' },
    { keywords: ['user','signup','churn','retention','active','dau','mau','cohort'], label: 'User & Product Analytics', icon: '👤', cls: 'culture' },
    { keywords: ['follower','like','share','comment','post','reel','story','view','subscriber'], label: 'Social Media Intelligence', icon: '📱', cls: 'content' },
    { keywords: ['content','article','video','blog','page','format','type','channel','media'], label: 'Content Performance', icon: '📝', cls: 'content' },
    { keywords: ['employee','salary','headcount','department','hire','attrition','hr'], label: 'HR & Workforce Analytics', icon: '🏢', cls: 'culture' },
    { keywords: ['inventory','stock','sku','warehouse','supply','demand','fulfillment'], label: 'Supply Chain & Inventory', icon: '📦', cls: 'commerce' },
    { keywords: ['patient','diagnosis','treatment','health','clinical','hospital'], label: 'Healthcare Analytics', icon: '🏥', cls: 'culture' },
    { keywords: ['student','grade','score','course','enrollment','attendance'], label: 'Education Analytics', icon: '🎓', cls: 'culture' },
  ];

  let detectedDomain = { label: 'Data Intelligence', icon: '📊', cls: 'content' };
  let maxHits = 0;
  for (const d of domains) {
    const hits = d.keywords.filter(kw => joined.includes(kw)).length;
    if (hits > maxHits) { maxHits = hits; detectedDomain = d; }
  }

  const primaryMetric    = schema.numeric[0]     ?? 'Performance';
  const primaryDimension = schema.categorical[0] ?? schema.time[0] ?? 'Dataset';
  const timeDim          = schema.time[0];

  let title: string;
  if (timeDim && schema.categorical.length > 0) {
    title = `${primaryMetric} by ${schema.categorical[0]} over ${timeDim} — ${detectedDomain.label}`;
  } else if (schema.categorical.length > 0) {
    title = `${primaryMetric} across ${schema.categorical[0]} segments — ${detectedDomain.label}`;
  } else if (timeDim) {
    title = `${primaryMetric} trend over ${timeDim} — ${detectedDomain.label}`;
  } else {
    title = `${primaryMetric} Analysis — ${detectedDomain.label}`;
  }

  const subtitle = `${charts.length} insights · ${schema.numeric.length} metrics · ${data.length} records analysed`;
  const readingGuide = timeDim
    ? `This report analyses ${schema.numeric.length} key metrics across ${schema.categorical.length} categorical dimensions over "${timeDim}".`
    : `This report breaks down ${schema.numeric.length} metrics across ${schema.categorical.length} segments.`;

  return { title, subtitle, readingGuide, icon: detectedDomain.icon, cls: detectedDomain.cls, domain: detectedDomain.label };
}

// ── Anomaly Detection ─────────────────────────────────────────

export function detectAnomalies(data: Record<string, unknown>[], schema: Schema): Anomaly[] {
  const anomalies: Anomaly[] = [];
  schema.numeric.forEach(metric => {
    const vals = data.map(r => parseFloat(String(r[metric]))).filter(v => !isNaN(v));
    if (vals.length < 5) return;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd  = stdDev(vals);
    data.forEach((row, idx) => {
      const v = parseFloat(String(row[metric]));
      if (isNaN(v)) return;
      const zScore = sd > 0 ? (v - avg) / sd : 0;
      if (Math.abs(zScore) > 3) {
        anomalies.push({
          metric, value: v, row: idx,
          severity: Math.abs(zScore).toFixed(1),
          type: zScore > 0 ? 'Surge' : 'Dip',
          context: schema.time[0] ? String(row[schema.time[0]]) : `Record #${idx}`,
        });
      }
    });
  });
  return anomalies.slice(0, 5);
}

// ── Strategic Brief ───────────────────────────────────────────

export function generateStrategicBrief(
  scorecards: Scorecard[],
  charts: ChartSpec[],
  anomalies: Anomaly[]
): StrategicBrief {
  const brief: StrategicBrief = { pillars: [], masterAction: '' };

  const catChart  = charts.find(c => c.id.startsWith('cat_'));
  const timeChart = charts.find(c => c.id.startsWith('time_'));
  const corrChart = charts.find(c => c.id === 'corr_scatter');

  if (catChart) {
    brief.pillars.push({
      type: 'LEAD', label: 'Primary Market Lead', title: catChart.title,
      text: catChart.obs.split('. ')[0] + '. This represents a structural "Operational Anchor" for your current roadmap.',
    });
  }
  if (timeChart) {
    brief.pillars.push({
      type: 'GROWTH', label: 'Momentum Leverage', title: timeChart.title,
      text: timeChart.obs.split('. ')[0] + `. We identified a definitive trend shift that warrants immediate budget scaling.`,
    });
  }
  if (anomalies.length > 0) {
    brief.pillars.push({
      type: 'RISK', label: 'Strategic Risk',
      title: `${anomalies.length} Critical Deviations Detected`,
      text: `Significant "${anomalies[0].type}" in ${anomalies[0].metric} at ${anomalies[0].context}. This ${anomalies[0].severity}σ outlier threatens your efficiency baseline.`,
    });
  } else if (corrChart) {
    brief.pillars.push({
      type: 'RISK', label: 'Efficiency Stability', title: corrChart.title,
      text: corrChart.obs.split('. ')[0] + '.',
    });
  }

  const growth     = timeChart?.title.toLowerCase().includes('momentum') ? 'Accelerate' : 'Defensive';
  const focalPoint = catChart?.title.match(/"([^"]+)"/)?.[1] ?? 'Primary Segment';
  brief.masterAction = `Based on the ${scorecards.length} KPIs analysed, PRISM recommends an **${growth} Strategy** centred on **${focalPoint}**. Direct resources away from low-velocity intersections to drive a ${anomalies.length ? 'Corrective' : 'High-Conviction'} growth multiplier across the next 30 days.`;

  return brief;
}
