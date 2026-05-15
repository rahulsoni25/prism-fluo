'use client';
/**
 * AppChart.tsx — PRISM unified chart library
 *
 * Chart types available:
 *   Basic:    bar, hbar, line, area, pie, doughnut, scatter
 *   Advanced: combo, waterfall, funnel, histogram, radar, bubble
 *
 * Waterfall and Funnel are custom SVG (no extra npm packages).
 * All others use Chart.js via react-chartjs-2.
 *
 * Gemini picks the type — guidelines in lib/ai/gemini.ts prompt.
 */

import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  PointElement, LineElement, BarElement, ArcElement, RadialLinearScale,
  Title, Tooltip, Legend, Filler,
  ChartOptions,
} from 'chart.js';
import { Bar, Line, Doughnut, Scatter, Radar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale,
  PointElement, LineElement, BarElement, ArcElement, RadialLinearScale,
  Title, Tooltip, Legend, Filler,
);

// ── Design tokens ──────────────────────────────────────────────

const PRIMARY   = '#2563EB';
const ACCENT    = '#7C3AED';
const SUCCESS   = '#059669';
const WARNING   = '#D97706';
const DANGER    = '#DC2626';
const MUTED     = '#64748B';
const BORDER    = '#EEF2F7';

// 12-colour palette (bucket-aware order: blues → purples → greens → ambers)
export const PALETTE = [
  '#2563EB','#7C3AED','#059669','#D97706',
  '#0EA5E9','#8B5CF6','#10B981','#F59E0B',
  '#3B82F6','#A855F7','#34D399','#FBBF24',
];

// ── Shared Chart.js config ─────────────────────────────────────

const TIP = {
  backgroundColor: '#0F172A', padding: 10, cornerRadius: 8,
  titleFont: { size: 11, weight: '700', family: 'Inter' } as any,
  bodyFont:  { size: 11, family: 'Inter' } as any,
};
const XA = { grid: { display: false }, border: { display: false },
  ticks: { font: { size: 10, family: 'Inter' }, color: MUTED } };
const YA = { grid: { color: BORDER }, border: { display: false },
  ticks: { font: { size: 10, family: 'Inter' }, color: MUTED } };
const BASE: any = {
  responsive: true, maintainAspectRatio: true,
  plugins: { legend: { display: false }, tooltip: TIP },
  // Chart.js entrance animation — bars grow from 0, lines draw in, etc.
  animation: { duration: 900, easing: 'easeOutQuart' },
};

interface ChartProps { data: any; extraOptions?: any; title?: string; }

// ── Shared legend config for multi-series (comparison) charts ─
// Larger, bolder labels so brand vs competitor names are immediately readable.
const MULTI_LEGEND = {
  display: true, position: 'top' as const,
  align: 'end' as const,
  labels: {
    font: { size: 11, family: 'Inter', weight: '600' } as any,
    boxWidth: 14, boxHeight: 14,
    padding: 16,
    color: '#1E293B',
    usePointStyle: true,
    pointStyle: 'rectRounded' as const,
  },
};
function multiSeriesPlugins(data: any) {
  return (data?.datasets?.length ?? 0) > 1
    ? { legend: MULTI_LEGEND, tooltip: TIP }
    : { legend: { display: false }, tooltip: TIP };
}

// ── 1. Vertical Bar ───────────────────────────────────────────
export function ChartBar({ data, extraOptions = {} }: ChartProps) {
  const options = {
    ...BASE,
    aspectRatio: 2.4,
    plugins: multiSeriesPlugins(data),
    scales: { x: XA, y: YA },
    ...extraOptions,
  };
  return <Bar data={data} options={options} />;
}

// ── 2. Horizontal Bar ─────────────────────────────────────────
export function ChartHBar({ data, extraOptions = {} }: ChartProps) {
  const options = {
    ...BASE,
    indexAxis: 'y' as const,
    aspectRatio: 1.7,
    plugins: multiSeriesPlugins(data),
    scales: { x: { ...XA, grid: { color: BORDER, display: true } }, y: { ...YA, grid: { display: false } } },
    ...extraOptions,
  };
  return <Bar data={data} options={options} />;
}

// ── 3. Line ───────────────────────────────────────────────────
export function ChartLine({ data, extraOptions = {} }: ChartProps) {
  const options = { ...BASE, aspectRatio: 2.6, scales: { x: XA, y: YA },
    elements: { line: { tension: 0.4 } }, ...extraOptions };
  return <Line data={data} options={options} />;
}

// ── 4. Area ───────────────────────────────────────────────────
export function ChartArea({ data, extraOptions = {} }: ChartProps) {
  // Force fill on all datasets
  const filled = {
    ...data,
    datasets: (data?.datasets ?? []).map((ds: any) => ({
      ...ds, fill: true,
      backgroundColor: ds.backgroundColor ?? `${PRIMARY}22`,
      borderColor:     ds.borderColor     ?? PRIMARY,
    })),
  };
  const options = { ...BASE, aspectRatio: 2.6, scales: { x: XA, y: YA },
    elements: { line: { tension: 0.4 } }, ...extraOptions };
  return <Line data={filled} options={options} />;
}

// ── 5. Pie (Doughnut with hole) ───────────────────────────────
export function ChartPie({ data, extraOptions = {} }: ChartProps) {
  const options = {
    ...BASE, aspectRatio: 1.7, cutout: '60%',
    // Spin + scale in from centre for pie/doughnut
    animation: { animateRotate: true, animateScale: true, duration: 900, easing: 'easeOutQuart' },
    plugins: {
      legend: { display: true, position: 'right' as const,
        labels: { font: { size: 10, family: 'Inter' }, padding: 10, boxWidth: 10 } },
      tooltip: TIP,
    },
    ...extraOptions,
  };
  return <Doughnut data={data} options={options} />;
}

// ── 6. Doughnut (alias for Pie — slightly different legend) ───
export function ChartDoughnut({ data, extraOptions = {} }: ChartProps) {
  const options = {
    ...BASE, aspectRatio: 1.6, cutout: '70%',
    // Spin + scale in from centre
    animation: { animateRotate: true, animateScale: true, duration: 900, easing: 'easeOutQuart' },
    plugins: {
      legend: { display: true, position: 'bottom' as const,
        labels: { font: { size: 10, family: 'Inter' }, padding: 12, boxWidth: 10 } },
      tooltip: TIP,
    },
    ...extraOptions,
  };
  return <Doughnut data={data} options={options} />;
}

// ── 7. Scatter ────────────────────────────────────────────────
export function ChartScatter({ data, extraOptions = {} }: ChartProps) {
  const options = {
    ...BASE, aspectRatio: 2.1,
    scales: {
      x: { ...XA, grid: { color: BORDER, display: true },
        title: { display: true, text: 'Audience %', font: { size: 10, family: 'Inter' }, color: '#94A3B8' } },
      y: { ...YA,
        title: { display: true, text: 'Likelihood (×avg)', font: { size: 10, family: 'Inter' }, color: '#94A3B8' } },
    },
    plugins: {
      ...BASE.plugins,
      tooltip: { ...TIP, callbacks: {
        title: (items: any[]) => (items[0]?.raw as any)?.label ?? '',
        label: (item: any) => {
          const r = item.raw as any;
          return [`Audience: ${(r?.x ?? 0).toFixed(1)}%`, `Likelihood: ${(r?.y ?? 0).toFixed(2)}× avg`];
        },
      }},
    },
    ...extraOptions,
  };
  return <Scatter data={data} options={options} />;
}

// ── 8. Radar / Spider ─────────────────────────────────────────
export function ChartRadar({ data, extraOptions = {} }: ChartProps) {
  const options = {
    ...BASE, aspectRatio: 1.4,
    // Expand outward from centre
    animation: { ...BASE.animation, animateScale: true },
    scales: { r: {
      ticks: { display: false, backdropColor: 'transparent' },
      grid:  { color: BORDER },
      pointLabels: { font: { size: 10, family: 'Inter' }, color: MUTED },
    }},
    plugins: { ...BASE.plugins,
      legend: { display: true, position: 'bottom' as const,
        labels: { boxWidth: 10, font: { size: 10 } } } },
    ...extraOptions,
  };
  return <Radar data={data} options={options} />;
}

// ── 9. Histogram ──────────────────────────────────────────────
// Standard bar with no gap between bars — ideal for frequency distributions
export function ChartHistogram({ data, extraOptions = {} }: ChartProps) {
  const filled = {
    ...data,
    datasets: (data?.datasets ?? []).map((ds: any) => ({
      ...ds,
      backgroundColor: ds.backgroundColor ?? `${PRIMARY}CC`,
      borderColor:     ds.borderColor     ?? PRIMARY,
      borderWidth:     1,
      barPercentage:   1,
      categoryPercentage: 1,
    })),
  };
  const options = { ...BASE, aspectRatio: 2.2,
    scales: { x: { ...XA, grid: { color: BORDER } }, y: YA },
    ...extraOptions };
  return <Bar data={filled} options={options} />;
}

// ── 10. Combo (Column + Line on same axes) ────────────────────
// datasets[0] = bar, datasets[1] = line
export function ChartCombo({ data, extraOptions = {} }: ChartProps) {
  const combo = {
    ...data,
    datasets: (data?.datasets ?? []).map((ds: any, i: number) => ({
      ...ds,
      type: i === 0 ? 'bar' : 'line',
      yAxisID: i === 0 ? 'y' : 'y2',
      backgroundColor: ds.backgroundColor ?? (i === 0 ? `${PRIMARY}CC` : 'transparent'),
      borderColor:     ds.borderColor     ?? (i === 0 ? PRIMARY : SUCCESS),
      borderWidth:     i === 0 ? 0 : 2.5,
      tension:         0.4,
      fill:            false,
      pointRadius:     i === 0 ? 0 : 3,
      order:           i === 0 ? 2 : 1,
    })),
  };
  const options = {
    ...BASE, aspectRatio: 2.4,
    scales: {
      x:  XA,
      y:  { ...YA, position: 'left'  as const },
      y2: { ...YA, position: 'right' as const, grid: { display: false } },
    },
    plugins: { ...BASE.plugins,
      legend: { display: true, position: 'top' as const,
        labels: { boxWidth: 10, font: { size: 10, family: 'Inter' } } } },
    ...extraOptions,
  };
  return <Bar data={combo} options={options} />;
}

// ── 11. Waterfall — custom SVG ────────────────────────────────
// chartLabels: stage names; chartValues: change amounts (+/-)
// First bar = starting value, last bar = total (auto-coloured blue)
interface SvgProps { labels: string[]; values: number[] }

export function ChartWaterfall({ labels, values }: SvgProps) {
  if (!labels.length || !values.length) return null;
  const W = 560, H = 200, PAD_L = 48, PAD_B = 32, PAD_T = 16, PAD_R = 16;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_B - PAD_T;

  // Running total to compute bar bottoms
  const running: number[] = [];
  let cum = 0;
  for (let i = 0; i < values.length; i++) {
    running.push(cum);
    cum += values[i];
  }
  const allVals = [...running, running[running.length - 1] + values[values.length - 1]];
  const minVal = Math.min(0, ...allVals);
  const maxVal = Math.max(...allVals);
  const range  = maxVal - minVal || 1;

  const barW  = innerW / labels.length - 6;
  const toY   = (v: number) => PAD_T + innerH - ((v - minVal) / range) * innerH;
  const zeroY = toY(0);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      {/* Zero line */}
      <line x1={PAD_L} y1={zeroY} x2={W - PAD_R} y2={zeroY}
        stroke={BORDER} strokeWidth={1} />

      {labels.map((label, i) => {
        const base    = running[i];
        const val     = values[i];
        const isTotal = i === labels.length - 1;
        const color   = isTotal ? PRIMARY : val >= 0 ? SUCCESS : DANGER;
        const barTop  = toY(Math.max(base, base + val));
        const barBot  = toY(Math.min(base, base + val));
        const barH    = Math.max(2, barBot - barTop);
        const bx      = PAD_L + i * (innerW / labels.length) + 3;
        // Staggered fade-in for each bar
        const barStyle = { animation: `svgFadeIn 0.45s ease-out ${i * 0.07}s both` } as React.CSSProperties;

        return (
          <g key={i} style={barStyle}>
            {/* Connector line to next bar */}
            {i < labels.length - 1 && (
              <line
                x1={bx + barW} y1={toY(base + val)}
                x2={bx + barW + (innerW / labels.length) - 6} y2={toY(base + val)}
                stroke={BORDER} strokeWidth={1} strokeDasharray="3,2"
              />
            )}
            <rect x={bx} y={barTop} width={barW} height={barH} fill={color}
              rx={3} opacity={0.88} />
            {/* Value label */}
            <text x={bx + barW / 2} y={barTop - 4}
              textAnchor="middle" fontSize={9} fill={color} fontWeight="700"
              fontFamily="Inter, sans-serif">
              {val > 0 ? '+' : ''}{val}
            </text>
            {/* X axis label */}
            <text x={bx + barW / 2} y={H - 8}
              textAnchor="middle" fontSize={9} fill={MUTED}
              fontFamily="Inter, sans-serif">
              {label.length > 10 ? label.slice(0, 9) + '…' : label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── 12. Funnel — custom SVG ───────────────────────────────────
// chartLabels: stage names; chartValues: stage volumes (descending recommended)
export function ChartFunnel({ labels, values }: SvgProps) {
  if (!labels.length || !values.length) return null;
  const W = 420, STAGE_H = 38, GAP = 4;
  const H = labels.length * (STAGE_H + GAP) + 16;
  const maxV = Math.max(...values) || 1;
  const colours = [PRIMARY, ACCENT, SUCCESS, WARNING, '#0EA5E9', '#8B5CF6'];

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      {labels.map((label, i) => {
        const ratio  = values[i] / maxV;
        const barW   = 60 + (W - 80) * ratio;      // shrinks toward bottom
        const bx     = (W - barW) / 2;
        const by     = 8 + i * (STAGE_H + GAP);
        const color  = colours[i % colours.length];
        // Each funnel stage slides in from left with stagger
        const stageStyle = { animation: `svgSlideInLeft 0.45s ease-out ${i * 0.09}s both` } as React.CSSProperties;

        return (
          <g key={i} style={stageStyle}>
            <rect x={bx} y={by} width={barW} height={STAGE_H}
              rx={6} fill={color} opacity={0.85 - i * 0.04} />
            {/* Stage label */}
            <text x={W * 0.22} y={by + STAGE_H / 2 + 4}
              textAnchor="middle" fontSize={10} fill="#fff" fontWeight="600"
              fontFamily="Inter, sans-serif">
              {label.length > 14 ? label.slice(0, 13) + '…' : label}
            </text>
            {/* Value */}
            <text x={W * 0.72} y={by + STAGE_H / 2 + 4}
              textAnchor="middle" fontSize={11} fill="#fff" fontWeight="800"
              fontFamily="Inter, sans-serif">
              {values[i].toLocaleString()}
            </text>
            {/* Conversion rate */}
            {i > 0 && (
              <text x={W - 10} y={by + STAGE_H / 2 + 4}
                textAnchor="end" fontSize={9} fill={MUTED}
                fontFamily="Inter, sans-serif">
                {((values[i] / values[i - 1]) * 100).toFixed(0)}%
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── 13. Dumbbell — custom SVG (A vs B comparison) ─────────────
// One row per attribute. Two dots per row: Audience A in deep navy
// (left dot), Audience B in teal (right dot, but plotted at its own
// horizontal value). A connecting line shows the GAP between them.
// Designed for GWI 2-audience reports where the strategic question is
// "how far apart are A and B on each attribute".
interface DumbbellProps {
  labels:  string[];
  valuesA: number[];
  valuesB: number[];
  series?: [string, string]; // ["Audience A name", "Audience B name"]
}
export function ChartDumbbell({ labels, valuesA, valuesB, series }: DumbbellProps) {
  if (!labels.length || !valuesA.length || !valuesB.length) return null;
  // Filter to rows where both audiences have data + at least one non-zero
  const rows = labels
    .map((lbl, i) => ({ label: String(lbl), a: Number(valuesA[i]) || 0, b: Number(valuesB[i]) || 0 }))
    .filter(r => r.a > 0 || r.b > 0)
    .slice(0, 10); // cap at 10 rows for readability
  if (rows.length === 0) return null;

  const aLabel = series?.[0] || 'Audience A';
  const bLabel = series?.[1] || 'Audience B';
  const NAVY = 'rgba(30,58,138,1)';
  const TEAL = 'rgba(15,118,110,1)';

  // Layout — explicit pixel scale, scaled by SVG viewBox
  const W = 720;
  const ROW_H = 36;
  const PAD_T = 36; // room for legend
  const PAD_B = 14;
  const H = PAD_T + rows.length * ROW_H + PAD_B;

  // Column widths
  const LABEL_W = 220;
  const PLOT_X = LABEL_W + 12;
  const VALUE_W = 64;        // right-side value labels per row
  const PLOT_W = W - PLOT_X - VALUE_W - 12;

  // Pick a max that gives the longest dot room without crowding
  const maxV = Math.max(100, ...rows.flatMap(r => [r.a, r.b]));
  const toX = (v: number) => PLOT_X + (v / maxV) * PLOT_W;

  // Round-up tick step
  const tickStep = maxV <= 50 ? 10 : maxV <= 100 ? 20 : 25;
  const ticks: number[] = [];
  for (let t = 0; t <= maxV; t += tickStep) ticks.push(t);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      {/* Legend (top right of plot) */}
      <g transform={`translate(${PLOT_X},14)`}>
        <circle cx={6} cy={6} r={5} fill={NAVY} />
        <text x={18} y={9.5} fontSize={11} fill={MUTED} fontFamily="Inter, sans-serif" fontWeight={600}>
          {aLabel.length > 22 ? aLabel.slice(0, 21) + '…' : aLabel}
        </text>
        <circle cx={Math.min(190, aLabel.length * 6.6 + 30)} cy={6} r={5} fill={TEAL} />
        <text x={Math.min(190, aLabel.length * 6.6 + 30) + 12} y={9.5} fontSize={11} fill={MUTED} fontFamily="Inter, sans-serif" fontWeight={600}>
          {bLabel.length > 22 ? bLabel.slice(0, 21) + '…' : bLabel}
        </text>
      </g>

      {/* Vertical gridlines + tick labels */}
      {ticks.map((t, i) => (
        <g key={`t${i}`}>
          <line x1={toX(t)} y1={PAD_T - 4} x2={toX(t)} y2={H - PAD_B}
                stroke={BORDER} strokeWidth={1} strokeDasharray={t === 0 ? '0' : '2,3'} />
          <text x={toX(t)} y={PAD_T - 10} textAnchor="middle" fontSize={9} fill={MUTED}
                fontFamily="Inter, sans-serif">{t}%</text>
        </g>
      ))}

      {/* Rows */}
      {rows.map((r, i) => {
        const cy = PAD_T + i * ROW_H + ROW_H / 2;
        const xA = toX(r.a);
        const xB = toX(r.b);
        const gap = Math.abs(r.a - r.b);
        const leadIsA = r.a >= r.b;
        const lineX1 = Math.min(xA, xB);
        const lineX2 = Math.max(xA, xB);
        const rowStyle = { animation: `svgFadeIn 0.45s ease-out ${i * 0.05}s both` } as React.CSSProperties;
        return (
          <g key={i} style={rowStyle}>
            {/* Attribute label (left) */}
            <text x={LABEL_W} y={cy + 3.5} textAnchor="end" fontSize={11} fill="#1F2937"
                  fontFamily="Inter, sans-serif" fontWeight={500}>
              {r.label.length > 30 ? r.label.slice(0, 29) + '…' : r.label}
            </text>
            {/* Gap connector line */}
            <line x1={lineX1} y1={cy} x2={lineX2} y2={cy}
                  stroke="#94A3B8" strokeWidth={2.5} strokeLinecap="round" opacity={0.55} />
            {/* Audience A dot (navy) */}
            <circle cx={xA} cy={cy} r={6} fill={NAVY} stroke="#FFFFFF" strokeWidth={1.5} />
            {/* Audience B dot (teal) */}
            <circle cx={xB} cy={cy} r={6} fill={TEAL} stroke="#FFFFFF" strokeWidth={1.5} />
            {/* Right-side gap label */}
            <text x={W - VALUE_W} y={cy + 3.5} fontSize={10.5} fill={leadIsA ? NAVY : TEAL}
                  fontFamily="Inter, sans-serif" fontWeight={700}>
              {leadIsA ? '▲' : '▼'} {gap.toFixed(1)} pts
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Bubble ────────────────────────────────────────────────────
export function ChartBubble({ data, extraOptions = {} }: ChartProps) {
  const options = { ...BASE, aspectRatio: 2.1, scales: { x: XA, y: YA }, ...extraOptions };
  const { Bubble } = require('react-chartjs-2');
  return <Bubble data={data} options={options} />;
}

// ── Scorecard ─────────────────────────────────────────────────
interface ScorecardProps { label: string; value: string | number; trend?: number; isPositive?: boolean; }
export function Scorecard({ label, value, trend, isPositive }: ScorecardProps) {
  return (
    <div style={{ background: '#fff', padding: 24, borderRadius: 12, border: `1px solid ${BORDER}`, flex: 1 }}>
      <div style={{ color: MUTED, fontSize: 13, fontWeight: 600, marginBottom: 8,
        textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: '#0F172A' }}>{value}</div>
        {trend && (
          <div style={{ fontSize: 14, fontWeight: 700, color: isPositive ? SUCCESS : DANGER }}>
            {isPositive ? '↑' : '↓'} {trend}%
          </div>
        )}
      </div>
    </div>
  );
}

// ── Heatmap ───────────────────────────────────────────────────
interface HeatmapData { region: string; cities: Array<{ n: string; s: number }>; }
export function Heatmap({ data }: { data: HeatmapData[] }) {
  const hmColor = (s: number) => {
    const t = s / 100;
    return `rgb(${Math.round(219 + (30 - 219) * t)},${Math.round(234 + (58 - 234) * t)},${Math.round(254 + (163 - 254) * t)})`;
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {data.map((r, i) => (
        <div key={i}>
          <div className="hm-region-label"><span style={{ width: 7, height: 7, background: '#CBD5E1', borderRadius: 2, marginRight: 6, display: 'inline-block' }} />{r.region}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 5 }}>
            {r.cities.map((c, j) => (
              <div key={j} className="heatmap-cell" style={{ background: hmColor(c.s) }} title={`${c.n}: ${c.s}/100`}>
                <div className="hm-city">{c.n}</div>
                <div className="hm-score">{c.s}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
