'use client';
import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartOptions
} from 'chart.js';
import { Bar, Line, Doughnut, Scatter, Radar, Bubble } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Legend,
  Filler
);

const TIP = { 
  backgroundColor: '#0F172A', 
  padding: 10, 
  cornerRadius: 8, 
  titleFont: { size: 11, weight: '700', family: 'Inter' } as any, 
  bodyFont: { size: 11, family: 'Inter' } as any 
};

const XA = { 
  grid: { display: false }, 
  border: { display: false }, 
  ticks: { font: { size: 10, family: 'Inter' }, color: '#64748B' } 
};

const YA = { 
  grid: { color: '#EEF2F7' }, 
  border: { display: false }, 
  ticks: { font: { size: 10, family: 'Inter' }, color: '#64748B' } 
};

const BASE = { 
  responsive: true, 
  maintainAspectRatio: true, 
  plugins: { 
    legend: { display: false }, 
    tooltip: TIP 
  } 
};

interface ChartProps {
  data: any;
  extraOptions?: any;
  title?: string;
}

export function ChartBar({ data, extraOptions = {} }: ChartProps) {
  const options = { ...BASE, aspectRatio: 2.4, scales: { x: XA, y: YA }, ...extraOptions };
  return <Bar data={data} options={options} />;
}

export function ChartHBar({ data, extraOptions = {} }: ChartProps) {
  const options = {
    ...BASE,
    indexAxis: 'y' as const,
    aspectRatio: 1.7,
    scales: { 
      x: { ...XA, grid: { color: '#EEF2F7', display: true } }, 
      y: { ...YA, grid: { display: false } } 
    },
    ...extraOptions
  };
  return <Bar data={data} options={options} />;
}

export function ChartLine({ data, extraOptions = {} }: ChartProps) {
  const options = {
    ...BASE,
    aspectRatio: 2.6,
    scales: { x: XA, y: YA },
    elements: { line: { tension: 0.4 } },
    ...extraOptions
  };
  return <Line data={data} options={options} />;
}

export function ChartArea({ data, extraOptions = {} }: ChartProps) {
  const options = {
    ...BASE,
    aspectRatio: 2.6,
    scales: { x: XA, y: YA },
    elements: { line: { tension: 0.4, fill: true } },
    ...extraOptions
  };
  return <Line data={data} options={options} />;
}

export function ChartRadar({ data, extraOptions = {} }: ChartProps) {
  const options = {
    ...BASE,
    aspectRatio: 1.5,
    scales: { r: { ticks: { display: false }, grid: { color: '#E2E8F0' }, pointLabels: { font: { size: 10, family: 'Inter' } } } },
    plugins: { ...BASE.plugins, legend: { display: true, position: 'bottom' as const, labels: { boxWidth: 10, font: { size: 10 } } } },
    ...extraOptions
  };
  return <Radar data={data} options={options} />;
}

export function ChartPie({ data, extraOptions = {} }: ChartProps) {
  const options = {
    ...BASE,
    aspectRatio: 1.7,
    cutout: '60%',
    plugins: {
      legend: { display: true, position: 'right' as const, labels: { font: { size: 10, family: 'Inter' }, padding: 10, boxWidth: 10 } },
      tooltip: TIP
    },
    ...extraOptions
  };
  return <Doughnut data={data} options={options} />;
}

export function ChartScatter({ data, extraOptions = {} }: ChartProps) {
  const options = {
    ...BASE,
    aspectRatio: 2.1,
    scales: {
      x: { ...XA, grid: { color: '#EEF2F7', display: true } },
      y: { ...YA }
    },
    ...extraOptions
  };
  return <Scatter data={data} options={options} />;
}

export function ChartBubble({ data, extraOptions = {} }: ChartProps) {
  const options = {
    ...BASE,
    aspectRatio: 2.1,
    scales: { x: XA, y: YA },
    ...extraOptions
  };
  return <Bubble data={data} options={options} />;
}

interface ScorecardProps {
  label: string;
  value: string | number;
  trend?: number;
  isPositive?: boolean;
}

export function Scorecard({ label, value, trend, isPositive }: ScorecardProps) {
  return (
    <div style={{ 
      background: '#fff', 
      padding: '32px 28px', 
      borderRadius: '24px', 
      border: '1px solid #E2E8F0', 
      flex: 1, 
      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.03), 0 8px 10px -6px rgba(0,0,0,0.03)',
      transition: 'all 0.3s ease'
    }}>
      <div style={{ color: '#64748B', fontSize: '11px', fontWeight: 800, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px' }}>
        <div style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em' }}>{value}</div>
        {trend && (
          <div style={{ 
            fontSize: '14px', 
            fontWeight: 800, 
            color: isPositive ? '#059669' : '#DC2626',
            background: isPositive ? '#F0FDF4' : '#FEF2F2',
            padding: '4px 10px',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '2px'
          }}>
            {isPositive ? '↑' : '↓'} {trend}%
          </div>
        )}
      </div>
    </div>
  );
}

interface HeatmapData {
  region: string;
  cities: Array<{ n: string; s: number }>;
}

export function Heatmap({ data }: { data: HeatmapData[] }) {
  const hmColor = (s: number) => {
    const t = s / 100;
    const r = Math.round(248 + (37 - 248) * t);
    const g = Math.round(250 + (99 - 250) * t);
    const b = Math.round(252 + (235 - 252) * t);
    return `rgb(${r},${g},${b})`;
  };
  const hmText = (s: number) => (s > 60 ? '#fff' : '#334155');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {data.map((r, i) => (
        <div key={i} style={{ background: '#F8FAFC', padding: '16px', borderRadius: '16px' }}>
          <div className="hm-region-label" style={{ fontSize: '11px', fontWeight: 800, color: '#94A3B8', marginBottom: '12px', display: 'flex', alignItems: 'center', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span style={{ width: '8px', height: '8px', background: '#3B82F6', borderRadius: '2px', marginRight: '8px', display: 'inline-block' }}></span>
            {r.region}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(60px, 18%), 1fr))', gap: '8px' }}>
            {r.cities.map((c, j) => (
              <div
                key={j}
                className="heatmap-cell"
                style={{ 
                  background: hmColor(c.s), 
                  padding: '12px 8px', 
                  borderRadius: '12px', 
                  textAlign: 'center',
                  boxShadow: c.s > 70 ? '0 4px 12px rgba(37,99,235,0.2)' : 'none',
                  transition: 'transform 0.2s'
                }}
                title={`${c.n}: ${c.s}/100`}
              >
                <div className="hm-city" style={{ color: hmText(c.s), fontSize: '9px', fontWeight: 700, marginBottom: '2px' }}>{c.n}</div>
                <div className="hm-score" style={{ color: hmText(c.s), fontSize: '14px', fontWeight: 900 }}>{c.s}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
