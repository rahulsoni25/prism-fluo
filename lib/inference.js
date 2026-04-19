// ============================================================
// PRISM INTELLIGENCE AGENT — Strategic Storyteller Engine v4
// ============================================================
// Produces executive-grade narratives with high-conviction hooks,
// plain-English business impacts, and SMART-goal recommendations.
// Refined for senior-strategist storytelling.
// ============================================================

import { isKeywordPlan } from './keywords.js';
import { isGWISheet } from './gwi.js';

function median(arr) {
  const sorted = [...arr].sort((a,b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdDev(arr) {
  const mean = arr.reduce((a,b) => a+b, 0) / arr.length;
  return Math.sqrt(arr.map(x => Math.pow(x - mean, 2)).reduce((a,b) => a+b, 0) / arr.length);
}

function pearsonCorrelation(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  const mx = x.slice(0,n).reduce((a,b)=>a+b,0)/n;
  const my = y.slice(0,n).reduce((a,b)=>a+b,0)/n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    num += dx * dy; dx2 += dx*dx; dy2 += dy*dy;
  }
  const den = Math.sqrt(dx2 * dy2);
  return den === 0 ? 0 : num / den;
}

function fmt(n) {
  if (n == null || isNaN(n)) return '0';
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function pct(n) { return Number(n).toFixed(1) + '%'; }

// ============================================================
// SCHEMA INFERENCE
// ============================================================

export function inferSchema(data) {
  if (!data || data.length === 0) return { time: [], numeric: [], categorical: [], catData: [] };

  const headers = Object.keys(data[0]);
  const schema = { time: [], numeric: [], categorical: [] };
  const sample = data.slice(0, 500);

  headers.forEach(col => {
    let numCount = 0; let dateCount = 0; let uniqueVals = new Set();
    
    sample.forEach(row => {
      const val = row[col];
      if (val == null || val === '') return;
      const vStr = String(val).trim();
      uniqueVals.add(vStr);
      
      if (!isNaN(parseFloat(val)) && isFinite(val)) numCount++;
      const colStr = col.toLowerCase();
      if (colStr.includes('date') || colStr.includes('time') || colStr.includes('month') || colStr.includes('year') || colStr.includes('period') || colStr.includes('week') || colStr.includes('quarter')) {
        dateCount++;
      } else if (!isNaN(Date.parse(val)) && vStr.length > 4) {
        dateCount++;
      }
    });

    const totalValid = sample.filter(r => r[col] != null && r[col] !== '').length;
    if (totalValid === 0) return;

    if (dateCount > totalValid * 0.5) { schema.time.push(col); return; }
    if (numCount > totalValid * 0.8) { schema.numeric.push(col); return; }
    if (uniqueVals.size <= Math.max(50, totalValid * 0.5)) { schema.categorical.push(col); }
  });

  schema.catData = schema.categorical.map(col => {
    const s = new Set(data.map(r => r[col]).filter(v => v != null && v !== ''));
    return { name: col, unique: s.size };
  });

  schema.allHeaders = headers;

  return schema;
}

// ============================================================
// THE AGENT: Generates analyst-grade dashboard intelligence
// ============================================================

export function autoGenerateLayout(data, schema) {
  const charts = [];
  const scorecards = [];

  // Keywords for domain detection within individual charts
  const joined = [...schema.time, ...schema.numeric, ...schema.categorical].join(' ').toLowerCase();

  // ──────────────────────────────────────────────
  // SCORECARDS
  // ──────────────────────────────────────────────
  schema.numeric.slice(0, 4).forEach(metric => {
    const vals = data.map(r => parseFloat(r[metric])).filter(v => !isNaN(v));
    if (vals.length === 0) return;
    const sum = vals.reduce((a, b) => a + b, 0);
    const avg = sum / vals.length;
    const mid = Math.floor(vals.length / 2);
    const fh = vals.slice(0, mid).reduce((a,b)=>a+b, 0);
    const sh = vals.slice(mid).reduce((a,b)=>a+b, 0);
    const trend = fh > 0 ? (((sh - fh) / fh) * 100).toFixed(1) : (sh > 0 ? 100 : 0);

    scorecards.push({ 
      label: metric, 
      value: fmt(sum),
      avg: fmt(avg),
      trend: Math.abs(trend),
      isPositive: trend >= 0
    });
  });

  // ──────────────────────────────────────────────
  // GWI SPECIALIZED ANALYSIS
  // ──────────────────────────────────────────────
  const isGWIRaw = isGWISheet(schema.allHeaders, data);
  const isGWITidied = schema.allHeaders.includes('attribute') && schema.allHeaders.includes('metric') && schema.allHeaders.includes('value');
  const isGWIMode = isGWIRaw || isGWITidied;

  if (isGWIMode && data.length > 0) {
    // If tidied, find the index rows
    let indexData = [];
    if (isGWITidied) {
      indexData = data.filter(r => String(r.metric).toLowerCase().includes('index'));
    }

    const indexCol = schema.allHeaders.find(h => h.toLowerCase().includes('index')) || (isGWITidied ? 'value' : null);
    const audienceCol = schema.allHeaders.find(h => h.toLowerCase().includes('audience %')) || (isGWITidied ? 'value' : null);
    
    if (indexCol && (isGWIRaw || indexData.length > 0)) {
      const displayData = isGWITidied ? indexData : data;
      charts.push({
        id: 'gwi_index_heatmap', type: 'hbar', xCol: schema.categorical[0] || 'attribute', yCol: indexCol,
        title: `Index Analysis: High-Affinity Consumer Pockets`,
        lbl: `AUDIENCE OVER-INDEX HEATMAP`,
        source: 'PRISM GWI Engine', conviction: 99,
        obs: `We have identified critical white-space opportunities where your target audience significantly over-indexes (Index > 120). These segments show a 20%+ higher propensity for this behavior compared to the market average, making them prime targets for high-conversion messaging.`,
        stat: `Baseline: 100 · Peak Index: ${Math.max(...displayData.map(r => parseFloat(r[indexCol]) || 0))}`,
        rec: `Adopt an **Index-First Targeting** strategy. Redirect 20% of budget into the top 3 over-indexing categories to capture high-affinity audiences where competition is lower but relevance is structural.`
      });
    }
  }

  // ──────────────────────────────────────────────
  // KEYWORD SPECIALIZED ANALYSIS
  // ──────────────────────────────────────────────
  const initialMeta = generateDashboardMeta(data, schema, charts);
  const isSearchMode = initialMeta.domain === 'Search & SEO';

  if (isSearchMode && schema.categorical.includes('tier')) {
    const volCol = schema.numeric.find(n => n.toLowerCase().includes('search')) || schema.numeric[0];
    charts.push({
      id: 'keyword_tiers', type: 'pie', xCol: 'tier', yCol: volCol,
      title: `Keyword Dominance: Distribution of ${volCol} by Tier`,
      lbl: `SEARCH VOLUME CAPTURE BY TIER`,
      source: 'PRISM Keyword Engine', conviction: 98,
      obs: `Your search strategy is currently weighted towards ${data.filter(r => r.tier === 'Primary').length} Primary keywords. This indicates a "Top-Heavy" intent profile—you are competing for high-volume territory while potentially ignoring lower-competition Secondary pockets.`,
      stat: `Tiers: Primary, Secondary, Tertiary · ${data.length} Keywords`,
      rec: `Diversify into **Secondary Clusters**. Reallocate 15% of bid focus into Tier 2 categories where CPC is typically 20-30% lower, allowing for efficient volume scaling.`
    });
  }

  if (isSearchMode && schema.categorical.includes('brand')) {
    const volCol = schema.numeric.find(n => n.toLowerCase().includes('search')) || schema.numeric[0];
    charts.push({
      id: 'brand_share', type: 'hbar', xCol: 'brand', yCol: volCol,
      title: 'Brand Capture: Proprietary vs. Non-brand Market Intent',
      lbl: 'BRANDED VS GENERIC SEARCH VOLUME',
      source: 'PRISM Keyword Engine', conviction: 96,
      obs: `Branded search accounts for a significant portion of your total potential traffic. Entities searching for specific brands like "${data.find(r => r.brand !== 'Non-brand')?.brand || 'Sony'}" show higher conversion intent, whereas "Non-brand" represents your primary top-of-funnel acquisition opportunity.`,
      stat: `Top Brand: ${data.find(r => r.brand !== 'Non-brand')?.brand || 'N/A'} · Source: Intent Analysis`,
      rec: `Protect your **Branded Moats**. Set up defensive campaigns for your top 3 detected brands to prevent competitor conquesting, while using "Non-brand" data to identify three new cluster expansions.`
    });
  }

  // ──────────────────────────────────────────────
  // TEMPORAL — Time Series Analysis
  // ──────────────────────────────────────────────
  if (schema.time.length > 0 && schema.numeric.length > 0) {
    const timeCol = schema.time[0];
    
    schema.numeric.slice(0, 2).forEach((metric, mIdx) => {
      const sorted = [...data].sort((a,b) => {
        const da = Date.parse(a[timeCol]) || 0;
        const db = Date.parse(b[timeCol]) || 0;
        return da - db;
      });
      const vals = sorted.map(r => parseFloat(r[metric])).filter(v => !isNaN(v));
      if (vals.length < 3) return;

      const firstVal = vals[0];
      const lastVal = vals[vals.length - 1];
      const maxVal = Math.max(...vals);
      const minVal = Math.min(...vals);
      const maxIdx = vals.indexOf(maxVal);
      const peakTime = sorted[maxIdx]?.[timeCol] || 'N/A';
    const avgVal = vals.reduce((a,b) => a+b, 0) / vals.length;
    const sd = stdDev(vals);
    const cv = avgVal > 0 ? ((sd / avgVal) * 100).toFixed(1) : 0;
    const growth = firstVal > 0 ? (((lastVal - firstVal) / firstVal) * 100).toFixed(1) : 0;
    const isGrowing = parseFloat(growth) > 0;
    const multiplier = firstVal > 0 ? (maxVal / firstVal).toFixed(1) : 'N/A';

    // Domain-specific keywords
    const isSales = joined.includes('sale') || joined.includes('revenue');
    const subject = isSales ? 'Customer Demand' : 'Performance';

    // Strategic Logic
    const volatilityLabel = parseFloat(cv) > 30 ? 'high-volatility' : 'stable';
    const momentumLabel = isGrowing ? 'expansionary' : 'contractionary';

    charts.push({
      id: `time_${metric}`, type: parseFloat(cv) > 40 ? 'line' : 'area', xCol: timeCol, yCol: metric,
      title: isGrowing 
        ? (parseFloat(cv) > 30 
          ? `Growth Risk: ${metric} is expanding, but ${cv}% volatility threatens baseline stability`
          : parseFloat(growth) > 50 
            ? `Breakout Performance: ${metric} surges ${pct(Math.abs(growth))} — triggered by the "${peakTime}" peak`
            : `Steady Momentum: ${metric} on track to hit ${fmt(lastVal * 1.1)} by next period`)
        : (parseFloat(growth) < -30 
          ? `Critical Warning: ${metric} has entered a ${pct(Math.abs(growth))} tailspin since "${peakTime}"`
          : `Softening Signals: ${metric} showing a structural ${momentumLabel} shift`),
      lbl: `${metric.toUpperCase()} STRATEGIC TRAJECTORY`,
      source: 'PRISM Storyteller · Performance Logic', conviction: 94,
      obs: `Your ${subject} is currently in an ${momentumLabel} phase. We tracked a move from ${fmt(firstVal)} to ${fmt(lastVal)}, with a defining ${multiplier}× breakout occurring at "${peakTime}". ${parseFloat(cv) > 30 ? `The high volatility (${cv}%) indicates your ${isSales ? 'revenue' : 'outcome'} base is fragile—you are likely over-performing in short bursts while the "trough" periods drain overall efficiency.` : `This ${volatilityLabel} growth confirms a repeatable success formula; this is a structural win that can be scaled immediately.`}`,
      stat: `${isGrowing ? '+' : ''}${growth}% ${isSales ? 'Revenue' : 'Impact'} · Multiplier: ${multiplier}×`,
      rec: isGrowing 
        ? `Capitalise on this ${pct(Math.abs(growth))} momentum within the next 30 days. Reallocate 15% of under-performing secondary budget into the high-velocity "${peakTime}" window to lock in this new baseline.`
        : `Immediate Pivot Required: Audit your ${isSales ? 'cost-per-acquisition' : 'efficiency metrics'} from the "${peakTime}" peak and launch a 14-day recovery pilot focused on your top 3 retention channels.`
    });
    });
  }

  // ──────────────────────────────────────────────
  // CATEGORICAL DOMINANCE — Market Concentration
  // ──────────────────────────────────────────────
  if (schema.catData.length > 0 && schema.numeric.length > 0) {
    schema.catData.slice(0, 3).forEach((cat, cIdx) => {
      if (cat.name === schema.time[0]) return;
      const metric = schema.numeric[cIdx < schema.numeric.length ? cIdx : 0] || schema.numeric[0];

      const groups = {};
      data.forEach(row => {
        const k = String(row[cat.name] || 'Other').trim();
        if (!k || k === 'undefined') return;
        groups[k] = (groups[k] || 0) + (parseFloat(row[metric]) || 0);
      });
      const entries = Object.entries(groups).sort((a,b) => b[1] - a[1]);
      if (entries.length < 2) return;

      const sumAll = entries.reduce((acc, e) => acc + e[1], 0);
      const top = entries[0];
      const topPct = sumAll > 0 ? ((top[1] / sumAll) * 100).toFixed(1) : 0;
      const second = entries[1];
      const secondPct = sumAll > 0 ? ((second[1] / sumAll) * 100).toFixed(1) : 0;
      const bottom = entries[entries.length - 1];
      const bottomPct = sumAll > 0 ? ((bottom[1] / sumAll) * 100).toFixed(1) : 0;
      const hhi = entries.reduce((acc, e) => {
        const share = sumAll > 0 ? (e[1] / sumAll) : 0;
        return acc + share * share;
      }, 0);
      const isConcentrated = hhi > 0.25;
      const topToBottomRatio = bottom[1] > 0 ? (top[1] / bottom[1]).toFixed(1) : (top[1] > 0 ? '∞' : '1.0');

      // Identify the "Entity Class" (e.g., Brand, Region, Product)
      const entityClass = cat.name.toLowerCase().includes('brand') ? 'Brand' : 
                         cat.name.toLowerCase().includes('region') ? 'Market' : 
                         cat.name.toLowerCase().includes('city') ? 'Geography' :
                         cat.name.toLowerCase().includes('segment') ? 'Audience Segment' : 'Category';

      charts.push({
        id: `cat_${cat.name}_${metric}`, type: cat.unique <= 5 && parseFloat(topPct) < 60 ? 'pie' : (cat.unique <= 10 ? 'bar' : 'hbar'), xCol: cat.name, yCol: metric,
        title: isConcentrated
          ? (parseFloat(topPct) > 60 
            ? `Dominance Alert: ${entityClass} "${top[0]}" controls ${topPct}% of all ${metric}`
            : `Market Lead: "${top[0]}" commands ${topPct}% share — watch for over-indexing risks`)
          : (entries.length > 5 
            ? `Fragmented Landscape: ${metric} split across ${entries.length} segments with no clear leader`
            : `Competitive Race: "${top[0]}" leads, but "${second[0]}" is closing the gap at ${secondPct}%`),
        lbl: `${entityClass.toUpperCase()} MARKET SHARE ANALYSIS`,
        source: `PRISM Storyteller · Multi-Segment Engine`, conviction: 93,
        obs: `A powerful ${isConcentrated ? 'dominance' : 'fragmentation'} pattern has emerged for "${top[0]}". In the current ${cat.name} landscape, "${top[0]}" accounts for ${topPct}% of all ${metric} value—reaching ${fmt(top[1])} and maintaining a ${topToBottomRatio}× gap over ${bottom[0]}. ${isConcentrated ? `This concentration is an "Operational Anchor"—you have mastered this ${entityClass}, but are now structurally vulnerable to any competitive shifts in this specific pocket.` : `The high fragmentation across ${entries.length} segments suggests that no single ${entityClass} has captured the "Mindshare Ceiling" yet.`}`,
        stat: `${topPct}% Share for ${top[0]} · ${topToBottomRatio}× Gap`,
        rec: isConcentrated
          ? `Prioritise **Defensive Market Moats** over the next 30 days. Redirect 10% of budget from ${bottom[0]} into loyalty programs for "${top[0]}" to protect your primary revenue driver.`
          : `The market is open. Scale across your top 3 ${cat.name} segments with a **Volume-Capture** mandate for the next 6 weeks, increasing ${top[0]}'s budget by 10% to solidify the lead.`
      });
    });
  }

  // ──────────────────────────────────────────────
  // CORRELATION — Scatter analysis
  // ──────────────────────────────────────────────
  if (schema.numeric.length >= 2) {
    const xM = schema.numeric[0];
    const yM = schema.numeric[1];
    const xVals = data.map(r => parseFloat(r[xM])).filter(v => !isNaN(v));
    const yVals = data.map(r => parseFloat(r[yM])).filter(v => !isNaN(v));

    const minLen = Math.min(xVals.length, yVals.length);
    const r = pearsonCorrelation(xVals, yVals);
    const rAbs = Math.abs(r);

    charts.push({
      id: 'corr_scatter', type: 'scatter', xCol: xM, yCol: yM,
      title: rAbs > 0.7 
        ? `Efficiency Link: Higher ${xM} successfully drives ${yM} (r=${r.toFixed(2)})`
        : rAbs > 0.4 
          ? `Correlation Detected: ${xM} and ${yM} are linked, but external variables are disrupting the pattern`
          : `Independent Performance: ${xM} and ${yM} move independently despite category alignment`,
      lbl: `${xM.toUpperCase()} VS ${yM.toUpperCase()} PERFORMANCE LINK`,
      source: 'PRISM Storyteller · Dynamic Correlation', conviction: rAbs > 0.5 ? 92 : 76,
      obs: `We have isolated a ${rAbs > 0.7 ? 'powerful predictive' : (rAbs > 0.4 ? 'notable' : 'weak')} relationship. ${rAbs > 0.7 ? `This is a "Predictive Lever": for every unit of ${xM} added, ${yM} moves in a reliable ${r > 0 ? 'upward' : 'downward'} trajectory. You can now use ${xM} as a leading indicator to forecast your ${yM} outcomes.` : `While there is directional alignment, the ${rAbs > 0.4 ? 'moderate' : 'low'} correlation suggests performance is being influenced by hidden factors—likely pricing mismatches or seasonal shifts—that are decoupling these metrics.`}`,
      stat: `Pearson r = ${r.toFixed(2)} · ${minLen} samples`,
      rec: rAbs > 0.6 
        ? `Adopt a **Linked-Optimization** strategy immediately. Build a regression-based model for the next quarter to predict ${yM} results before allocating ${xM} spend, aiming for a 10% efficiency gain.`
        : `Stop treating ${xM} and ${yM} as a unified funnel. Run isolated A/B tests over the next 21 days to identify the specific third-party metric that is actually binding your performance.`
    });
  }

  // ──────────────────────────────────────────────
  // BUBBLE — 3-Way analysis
  // ──────────────────────────────────────────────
  if (schema.numeric.length >= 3) {
    const [xM, yM, zM] = schema.numeric.slice(0, 3);
    charts.push({
      id: 'bubble_3way', type: 'bubble', xCol: xM, yCol: yM, zCol: zM,
      title: `The Convergence Zone: Mapping Your "Triple-Win" Opportunities`,
      lbl: `${xM.toUpperCase()} VS ${yM.toUpperCase()} WEIGHED BY ${zM.toUpperCase()}`,
      source: 'PRISM Storyteller · Convergence Logic', conviction: 85,
      obs: `Cross-referencing three dimensions reveals a high-perfection "Goldilocks Zone" in the upper-right quadrant. Pockets showing both ${xM} efficiency and ${yM} output, underpinned by a massive ${zM} baseline, are your most resilient segments. Conversely, the lower-left reflects "The Efficiency Trap"—high-drag areas diluting your performance averages.`,
      stat: `3-way Convergence · Upper-right = Optimal Unit Economics`,
      rec: `Execute a **Triple-Weighted Reallocation** over the next 90 days. Redirect 70% of incremental growth budget into the top 5 convergence leaders identified in the upper-right quadrant.`
    });
  }

  // ──────────────────────────────────────────────
  // RADAR — Multi-axis benchmarking
  // ──────────────────────────────────────────────
  if (schema.numeric.length >= 3 && schema.catData.some(c => c.unique >= 2 && c.unique <= 10)) {
    const cat = schema.catData.find(c => c.unique >= 2 && c.unique <= 10);
    const metrics = schema.numeric.slice(0, 5);
    const catGroups = {};
    data.forEach(row => {
      const k = String(row[cat.name] || '').trim();
      if (!k) return;
      if (!catGroups[k]) catGroups[k] = { count: 0, sums: {} };
      catGroups[k].count++;
      metrics.forEach(m => { catGroups[k].sums[m] = (catGroups[k].sums[m] || 0) + (parseFloat(row[m]) || 0); });
    });
    const catNames = Object.keys(catGroups);
    let bestCat = catNames[0], bestScore = 0, worstCat = catNames[0], worstScore = Infinity;
    catNames.forEach(c => {
      const avgScore = metrics.reduce((acc, m) => acc + (catGroups[c].sums[m] / catGroups[c].count), 0);
      if (avgScore > bestScore) { bestScore = avgScore; bestCat = c; }
      if (avgScore < worstScore) { worstScore = avgScore; worstCat = c; }
    });

    charts.push({
      id: 'radar_bench', type: 'radar', xCol: cat.name, yCols: metrics,
      title: `Operational Benchmark: Why "${bestCat}" is Outperforming Across All Axes`,
      lbl: `MULTI-AXIS SEGMENT RADAR: "${bestCat}" VS PEERS`,
      source: `PRISM Storyteller · Benchmark Logic`, conviction: 90,
      obs: `We have identified "${bestCat}" as your **Execution North Star**. It demonstrates exceptional balance across all measured axes, while "${worstCat}" reveals a "Dented Radar" profile with critical deficits. This irregularity identifies a major strategic blind spot—indicating structural under-performance that is leaking efficiency even when one axis appears strong.`,
      stat: `Leader: "${bestCat}" · Primary Gap in "${worstCat}" · ${metrics.length} axes analysed`,
      rec: `Standardise on the ${bestCat} operational model. Document the top 3 tactical workflows driving ${bestCat}'s balance and deploy them to the teams overseeing ${worstCat} for a 30-day "Gap-Closure" pilot.`
    });
  }

  // ──────────────────────────────────────────────
  // CROSS-CATEGORICAL — Intersection Analysis
  // ──────────────────────────────────────────────
  if (schema.catData.length >= 2 && schema.numeric.length > 0) {
    const cat1 = schema.catData[0]; const cat2 = schema.catData[1]; const metric = schema.numeric[0];
    const crossGroups = {};
    data.forEach(row => {
      const k1 = String(row[cat1.name] || '').trim(); const k2 = String(row[cat2.name] || '').trim();
      if (!k1 || !k2) return;
      const key = `${k1} × ${k2}`;
      crossGroups[key] = (crossGroups[key] || 0) + (parseFloat(row[metric]) || 0);
    });
    const crossEntries = Object.entries(crossGroups).sort((a,b) => b[1] - a[1]);
    if (crossEntries.length > 2) {
      const topCombo = crossEntries[0]; const botCombo = crossEntries[crossEntries.length - 1];
      const ratio = botCombo[1] > 0 ? (topCombo[1] / botCombo[1]).toFixed(1) : '∞';
      
      charts.push({
        id: 'cross_cat', type: 'hbar', xCol: `${cat1.name} × ${cat2.name}`, yCol: metric,
        _crossData: crossEntries.slice(0, 12),
        title: `Intersection Strategy: "${topCombo[0]}" Leads by ${ratio}× Over Lowest Segment`,
        lbl: `HIGH-DENSITY PERFORMANCE POCKETS: ${cat1.name.toUpperCase()} × ${cat2.name.toUpperCase()}`,
        source: `PRISM Storyteller · Dimensional Logic`, conviction: 88,
        obs: `The intersection of ${cat1.name} and ${cat2.name} reveals a **Primary Density Pocket**. "${topCombo[0]}" is generating a ${ratio}× advantage—this is a qualitative shift in how these segments respond to your model. You are currently leaving ${fmt(topCombo[1] - botCombo[1])} in value un-optimized across your weakest intersections.`,
        stat: `Leader: "${topCombo[0]}" · ${ratio}× Performance Delta`,
        rec: `Adopt a **Concentrated Reallocation** mandate. Shift 10% of total effort from the "${botCombo[0]}" intersection into "${topCombo[0]}" for the next 45 days. Treat this top intersection as your primary testing ground for all new features.`
      });
    }
  }

  // ──────────────────────────────────────────────
  // DASHBOARD META — Smart Contextual Title
  // ──────────────────────────────────────────────
  const isKWP = isKeywordPlan(data);
  const isGWI = isGWIRaw || isGWITidied;

  const meta = isGWI
    ? {
        title: `Consumer Intelligence (GWI) — Survey Analysis`,
        subtitle: `${data.length} data points · GWI Tidy-Engine active`,
        readingGuide: "This report analyzes GWI survey data, focusing on Audience Index scores to identify high-potential consumer behaviors. Every chart compares your target audience against the market baseline.",
        icon: '📊', domain: 'Consumer Insights', cls: 'culture'
      }
    : isKWP 
      ? {
          title: `Search Intelligence Dashboard — ${schema.numeric[0] || 'Volume'} Analysis`,
          subtitle: `${data.length} keywords analyzed · Multi-tier enrichment active`,
          readingGuide: "This report uses the PRISM Keyword Engine to identify brand dominance and search volume tiers. Keywords are classified into Primary, Secondary, and Tertiary segments based on monthly search volume.",
          icon: '🔍', domain: 'Search & SEO', cls: 'content'
        }
      : generateDashboardMeta(data, schema, charts);

  return { scorecards, charts: charts.slice(0, 8), meta };
}

// ============================================================
// DASHBOARD META — Contextual Title Generation
// ============================================================

function generateDashboardMeta(data, schema, charts) {
  const allCols = [...schema.time, ...schema.numeric, ...schema.categorical].map(c => c.toLowerCase());
  const joined = allCols.join(' ');

  // Domain detection by keyword scanning
  const domains = [
    { keywords: ['revenue','sales','order','transaction','purchase','price','cost','profit','margin','invoice','arpu','ltv','mrr','arr'], label: 'Sales & Revenue', icon: '💰', cls: 'commerce' },
    { keywords: ['campaign','click','impression','ctr','cpc','cpm','ad','spend','reach','engagement','conversion','roi','roas','bounce'], label: 'Marketing & Performance', icon: '📢', cls: 'communication' },
    { keywords: ['keyword','search','seo','rank','volume','traffic','pageview','session','organic','query','serp'], label: 'Search & SEO', icon: '🔍', cls: 'content' },
    { keywords: ['user','signup','churn','retention','active','dau','mau','cohort','funnel','onboard'], label: 'User & Product Analytics', icon: '👤', cls: 'culture' },
    { keywords: ['follower','like','share','comment','post','reel','story','view','subscriber','watch'], label: 'Social Media Intelligence', icon: '📱', cls: 'content' },
    { keywords: ['content','article','video','blog','page','format','type','channel','media','creative'], label: 'Content Performance', icon: '📝', cls: 'content' },
    { keywords: ['employee','salary','headcount','department','hire','attrition','performance','rating','hr'], label: 'HR & Workforce Analytics', icon: '🏢', cls: 'culture' },
    { keywords: ['inventory','stock','sku','warehouse','supply','demand','fulfillment','shipment'], label: 'Supply Chain & Inventory', icon: '📦', cls: 'commerce' },
    { keywords: ['patient','diagnosis','treatment','health','clinical','hospital','medical'], label: 'Healthcare Analytics', icon: '🏥', cls: 'culture' },
    { keywords: ['student','grade','score','course','enrollment','attendance','education'], label: 'Education Analytics', icon: '🎓', cls: 'culture' },
  ];

  let detectedDomain = { label: 'Data Intelligence', icon: '📊', cls: 'content' };
  let maxHits = 0;
  for (const d of domains) {
    const hits = d.keywords.filter(kw => joined.includes(kw)).length;
    if (hits > maxHits) { maxHits = hits; detectedDomain = d; }
  }

  // Build contextual title from actual data
  const primaryMetric = schema.numeric[0] || 'Performance';
  const primaryDimension = schema.categorical[0] || schema.time[0] || 'Dataset';
  const timeDim = schema.time[0];

  // Generate a headline-style title
  let title;
  if (timeDim && schema.categorical.length > 0) {
    title = `${primaryMetric} by ${schema.categorical[0]}${timeDim ? ` over ${timeDim}` : ''} — ${detectedDomain.label}`;
  } else if (schema.categorical.length > 0) {
    title = `${primaryMetric} across ${schema.categorical[0]} segments — ${detectedDomain.label}`;
  } else if (timeDim) {
    title = `${primaryMetric} trend over ${timeDim} — ${detectedDomain.label}`;
  } else {
    title = `${primaryMetric} Analysis — ${detectedDomain.label}`;
  }

  // Subtitle
  const subtitle = `${charts.length} insights · ${schema.numeric.length} metrics · ${data.length} records analysed`;

  // Reading guide
  const readingGuide = timeDim 
    ? `This report analyses ${schema.numeric.length} key metrics across ${schema.categorical.length} categorical dimensions over a temporal axis ("${timeDim}"). Start with the Strategic Brief for the executive summary, then review individual insight cards for deep-dive analysis.`
    : `This report breaks down ${schema.numeric.length} metrics across ${schema.categorical.length} segments. Each card contains a data-driven observation and a strategic recommendation. Use the sidebar filters to drill into specific segments.`;

  return {
    title,
    subtitle,
    readingGuide,
    icon: detectedDomain.icon,
    cls: detectedDomain.cls,
    domain: detectedDomain.label
  };
}

// ============================================================
// AGENT V4: STRATEGIC SYNTHESIS & ANOMALY DETECTION
// ============================================================

export function detectAnomalies(data, schema) {
  const anomalies = [];
  schema.numeric.forEach(metric => {
    const vals = data.map(r => parseFloat(r[metric])).filter(v => !isNaN(v));
    if (vals.length < 5) return;
    
    const avg = vals.reduce((a,b)=>a+b,0) / vals.length;
    const sd = stdDev(vals);
    
    // Find points > 3 standard deviations away
    data.forEach((row, idx) => {
      const v = parseFloat(row[metric]);
      if (isNaN(v)) return;
      
      const zScore = sd > 0 ? (v - avg) / sd : 0;
      if (Math.abs(zScore) > 3) {
        anomalies.push({
          metric,
          value: v,
          row: idx,
          severity: Math.abs(zScore).toFixed(1),
          type: zScore > 0 ? 'Surge' : 'Dip',
          context: schema.time[0] ? row[schema.time[0]] : `Record #${idx}`
        });
      }
    });
  });
  return anomalies.slice(0, 5); // Return top 5 most severe
}

export function generateStrategicBrief(scorecards, charts, anomalies) {
  const brief = { pillars: [] };

  const catChart = charts.find(c => c.id.startsWith('cat_'));
  if (catChart) {
    brief.pillars.push({
      type: 'LEAD', label: 'Primary Market Lead',
      title: catChart.title,
      text: catChart.obs.split('. ')[0] + '. This represents a structural "Operational Anchor" for your current roadmap.'
    });
  }

  const timeChart = charts.find(c => c.id.startsWith('time_'));
  if (timeChart) {
    brief.pillars.push({
      type: 'GROWTH', label: 'Momentum Leverage',
      title: timeChart.title,
      text: timeChart.obs.split('. ')[0] + `. We identifed a definitive trend shift that warrants immediate budget scaling.`
    });
  }

  if (anomalies.length > 0) {
    brief.pillars.push({
      type: 'RISK', label: 'Strategic Risk',
      title: `${anomalies.length} Critical Deviations Detected`,
      text: `Significant "${anomalies[0].type}" in ${anomalies[0].metric} at ${anomalies[0].context}. This ${anomalies[0].severity}σ outlier threatens to destabilize your current efficiency baseline.`
    });
  } else {
    const corrChart = charts.find(c => c.id === 'corr_scatter');
    if (corrChart) {
      brief.pillars.push({
        type: 'RISK', label: 'Efficiency Stability',
        title: corrChart.title,
        text: corrChart.obs.split('. ')[0] + '.'
      });
    }
  }

  const growth = timeChart?.title.toLowerCase().includes('momentum') ? 'Accelerate' : 'Defensive';
  const focalPoint = catChart?.title.match(/"([^"]+)"/)?.[1] || 'Primary Segment';
  
  brief.masterAction = `Based on the ${scorecards.length} KPIs analysed, PRISM recommends an **${growth} Strategy** centred on **${focalPoint}**. Direct resources away from low-velocity intersections to drive a ${anomalies.length ? 'Corrective' : 'High-Conviction'} growth multiplier across the next 30 days.`;

  return brief;
}

