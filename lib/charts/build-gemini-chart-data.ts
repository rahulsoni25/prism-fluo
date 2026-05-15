/**
 * Pure-data chart builder shared by the upload flow and the regenerate
 * endpoint. Produces the Chart.js / SVG dataset shape that the insights
 * page renders directly from `chart.computedChartData`.
 *
 * No React, no browser APIs — safe to import from server route handlers.
 *
 * If you change the visual style here, both fresh uploads and regenerated
 * analyses pick it up automatically.
 */

const BUCKET_CHART_COLORS: Record<string, string> = {
  content:       'rgba(37,99,235,0.85)',
  commerce:      'rgba(5,150,105,0.85)',
  communication: 'rgba(124,58,237,0.85)',
  culture:       'rgba(217,119,6,0.85)',
};
const BUCKET_CHART_BORDERS: Record<string, string> = {
  content:       'rgba(30,58,138,1)',
  commerce:      'rgba(6,95,70,1)',
  communication: 'rgba(76,29,149,1)',
  culture:       'rgba(120,53,15,1)',
};

/**
 * Collapse multiple whitespace, and when A and B share a common prefix shorten
 * both to the differentiating tail. Keeps comparison legends crisp:
 *   ["Ghadi Detergent  Female 2", "Ghadi Detergent  Female"]
 *     -> ["Female 2", "Female"]
 */
function shortenAudiencePair(a?: string, b?: string): [string | undefined, string | undefined] {
  const ca = (a ?? '').replace(/\s+/g, ' ').trim();
  const cb = (b ?? '').replace(/\s+/g, ' ').trim();
  if (!ca || !cb || ca === cb) return [a, b];
  let i = 0;
  const maxI = Math.min(ca.length, cb.length);
  while (i < maxI && ca[i] === cb[i]) i++;
  while (i > 0 && ca[i - 1] !== ' ') i--;
  const tailA = ca.slice(i).trim();
  const tailB = cb.slice(i).trim();
  if (tailA && tailB) return [tailA, tailB];
  return [ca, cb];
}

export function buildGeminiChartData(
  type:    string,
  labels:  string[],
  values:  number[],
  bucket:  string,
  values2?: number[],
  series?:  string[],
) {
  const bg     = BUCKET_CHART_COLORS[bucket]  || 'rgba(37,99,235,0.85)';
  const border = BUCKET_CHART_BORDERS[bucket] || 'rgba(37,99,235,1)';

  // When two series are present, normalise their labels so the legend reads
  // cleanly (drops shared brand prefix between Audience A and Audience B).
  if (Array.isArray(series) && series.length >= 2) {
    const [a, b] = shortenAudiencePair(series[0], series[1]);
    series = [a ?? series[0], b ?? series[1]];
  }
  // GWI-style two-tone palette: deep navy alternating with mid blue so each
  // doughnut reads as "primary vs secondary" rather than a multi-coloured pie.
  // (Same change ships on `charts/gwi-look` — duplicated here so the
  // two-audience feature renders correctly even without that branch merged.)
  const PIE_COLORS = ['#1E3A8A','#60A5FA','#1E3A8A','#60A5FA','#1E3A8A','#60A5FA','#1E3A8A','#60A5FA'];

  // ── SVG-based charts: store labels + values directly ─────────────
  if (type === 'waterfall' || type === 'funnel') {
    return { labels, values };
  }

  // ── Pie / Doughnut ────────────────────────────────────────────────
  if (type === 'pie' || type === 'doughnut') {
    return {
      labels,
      datasets: [{
        data: values,
        backgroundColor: PIE_COLORS,
        borderWidth: 2, borderColor: '#fff',
      }],
    };
  }

  // ── Scatter ───────────────────────────────────────────────────────
  if (type === 'scatter' && values2 && values2.length === values.length) {
    return {
      datasets: [{
        label: 'Audience % vs Likelihood',
        data: labels.map((lbl, i) => ({ x: values[i], y: values2[i], label: lbl })),
        backgroundColor: bg,
        pointRadius: 7,
        pointHoverRadius: 9,
      }],
    };
  }

  // ── Combo: two datasets (bar primary + line secondary) ───────────
  if (type === 'combo') {
    const values2Clean = Array.isArray(values2) && values2.length === values.length ? values2 : [];
    return {
      labels,
      datasets: [
        {
          label: 'Volume',
          data: values,
          backgroundColor: bg,
          borderColor: border,
          borderWidth: 1,
          borderRadius: 3,
        },
        ...(values2Clean.length > 0 ? [{
          label: 'Trend',
          data: values2Clean,
          backgroundColor: 'transparent',
          borderColor: 'rgba(5,150,105,1)',
          borderWidth: 2.5,
          pointRadius: 3,
          tension: 0.4,
          fill: false,
        }] : []),
      ],
    };
  }

  // ── Line / Area ──────────────────────────────────────────────────
  if (type === 'line' || type === 'area') {
    return {
      labels,
      datasets: [{
        label: 'Value',
        data: values,
        borderColor: border,
        backgroundColor: `${border.replace('1)', '0.15)')}`,
        borderWidth: 2.5,
        tension: 0.4,
        fill: type === 'area',
        pointRadius: labels.length <= 12 ? 3 : 0,
      }],
    };
  }

  // ── Radar ─────────────────────────────────────────────────────────
  // Two-audience comparison emits TWO polygons (audience A in bucket colour,
  // audience B in teal). Persona-radar single-audience input still gets the
  // 100-baseline second dataset via the existing route.ts override path.
  if (type === 'radar') {
    const hasSecondSeries =
      Array.isArray(values2) && values2.length === values.length && values2.some(v => v !== 0);
    if (hasSecondSeries) {
      const s1Label = series?.[0] || 'Audience A';
      const s2Label = series?.[1] || 'Audience B';
      return {
        labels,
        datasets: [
          {
            label: s1Label,
            data: values,
            backgroundColor: bg.replace('0.85)', '0.2)'),
            borderColor: border,
            borderWidth: 2,
            pointBackgroundColor: border,
          },
          {
            // GWI-style second polygon: teal so A-vs-B reads as two
            // distinct outlines layered over the octagonal grid.
            label: s2Label,
            data: values2!,
            backgroundColor: 'rgba(20,184,166,0.2)',
            borderColor:     'rgba(15,118,110,1)',
            borderWidth: 2,
            pointBackgroundColor: 'rgba(15,118,110,1)',
          },
        ],
      };
    }
    // Single-series radar — unchanged behaviour.
    return {
      labels,
      datasets: [{
        label: 'Score',
        data: values,
        backgroundColor: bg.replace('0.85)', '0.2)'),
        borderColor: border,
        borderWidth: 2,
        pointBackgroundColor: border,
      }],
    };
  }

  // ── Grouped bar / hbar — two series ────
  if ((type === 'bar' || type === 'hbar') && values2 && values2.length === values.length && values2.some(v => v !== 0)) {
    const s1Label = series?.[0] || 'Series 1';
    const s2Label = series?.[1] || 'Series 2';
    return {
      labels,
      datasets: [
        {
          label: s1Label, data: values,
          backgroundColor: 'rgba(37,99,235,0.85)',
          borderColor:     'rgba(30,64,175,1)',
          borderWidth: 1, borderRadius: 4,
        },
        {
          // GWI-style: second audience uses teal instead of orange, so the
          // two-audience comparison reads as a tight palette (navy vs teal)
          // matching the GWI report look.
          // (Same change ships on `charts/gwi-look` — duplicated here so the
          // two-audience feature renders correctly even without that branch
          // merged.)
          label: s2Label, data: values2,
          backgroundColor: 'rgba(20,184,166,0.85)',
          borderColor:     'rgba(15,118,110,1)',
          borderWidth: 1, borderRadius: 4,
        },
      ],
    };
  }

  // ── bar / hbar / histogram — standard single-series ────────
  return {
    labels,
    datasets: [{
      label: series?.[0] || 'Value',
      data: values,
      backgroundColor: bg,
      borderColor: border,
      borderWidth: 1,
      borderRadius: 3,
    }],
  };
}

/**
 * Convert Gemini insight cards → ChartSpec rows for storage in analyses.results_json.
 * Mirrors the frontend `insightsToCharts` exactly so regenerated analyses
 * render identically to fresh uploads.
 */
export function insightsToCharts(insights: any[], idPrefix: string | number = 'gemini'): any[] {
  const prefix = String(idPrefix);
  return insights.map((ins: any, i: number) => {
    const rawLabels: string[]  = Array.isArray(ins.chartLabels)  ? ins.chartLabels  : [];
    const rawValues: number[]  = Array.isArray(ins.chartValues)  ? ins.chartValues.map(Number)  : [];
    const rawValues2: number[] = Array.isArray(ins.chartValues2) ? ins.chartValues2.map(Number) : [];
    const rawSeries: string[]  = Array.isArray(ins.chartSeries)  ? ins.chartSeries.map(String)  : [];

    // Keep only positions where label is non-empty AND value is a real number
    const validPairs = rawLabels
      .map((lbl: any, idx: number) => ({
        lbl: String(lbl ?? '').trim(),
        val: rawValues[idx] ?? 0,
        val2: rawValues2[idx] ?? 0,
      }))
      .filter(p => p.lbl.length > 0 && !isNaN(p.val));

    // Need ≥2 data points with at least one non-zero value
    const hasChart = validPairs.length >= 2 && validPairs.some(p => p.val > 0);

    const cleanLabels  = validPairs.map(p => p.lbl);
    const cleanValues  = validPairs.map(p => p.val);
    const cleanValues2 = rawValues2.length > 0 ? validPairs.map(p => p.val2) : undefined;

    return {
      id:         `gemini_${prefix}_${i}`,
      type:       ins.type || 'hbar',
      xCol:       'Attributes',
      yCol:       'Audience %',
      title:      ins.title,
      lbl:        ins.chartTitle || '',
      source:     ins.toolLabel || 'PRISM',
      conviction: ins.conviction ?? 85,
      obs:        ins.obs  ?? '',
      stat:       ins.stat ?? '',
      rec:        ins.rec  ?? '',
      bucket:     ins.bucket || 'content',
      toolLabel:  ins.toolLabel || 'PRISM',
      computedChartData: hasChart
        ? buildGeminiChartData(
            ins.type,
            cleanLabels,
            cleanValues,
            ins.bucket,
            cleanValues2,
            rawSeries.length >= 2 ? rawSeries : undefined,
          )
        : null,
    };
  });
}
