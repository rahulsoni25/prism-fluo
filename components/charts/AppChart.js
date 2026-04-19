'use client';
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
  Filler
} from 'chart.js';
import { Bar, Line, Doughnut, Scatter, Radar, Bubble } from 'react-chartjs-2';
import { C_CONSTANTS } from '@/lib/data';

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

const TIP = { backgroundColor: '#0F172A', padding: 10, cornerRadius: 8, titleFont: { size: 11, weight: '700', family: 'Inter' }, bodyFont: { size: 11, family: 'Inter' } };
const XA = { grid: { display: false }, border: { display: false }, ticks: { font: { size: 10, family: 'Inter' }, color: '#64748B' } };
const YA = { grid: { color: '#EEF2F7' }, border: { display: false }, ticks: { font: { size: 10, family: 'Inter' }, color: '#64748B' } };
const BASE = { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false }, tooltip: TIP } };

export function ChartBar({ data, extraOptions = {} }) {
  const options = { ...BASE, aspectRatio: 2.4, scales: { x: XA, y: YA }, ...extraOptions };
  return <Bar data={data} options={options} />;
}

export function ChartHBar({ data, extraOptions = {} }) {
  const options = {
    ...BASE,
    indexAxis: 'y',
    aspectRatio: 1.7,
    scales: { 
      x: { ...XA, grid: { color: '#EEF2F7', display: true } }, 
      y: { ...YA, grid: { display: false } } 
    },
    ...extraOptions
  };
  return <Bar data={data} options={options} />;
}

export function ChartLine({ data, extraOptions = {} }) {
  const options = {
    ...BASE,
    aspectRatio: 2.6,
    scales: { x: XA, y: YA },
    elements: { line: { tension: .4 } },
    ...extraOptions
  };
  return <Line data={data} options={options} />;
}

export function ChartArea({ data, extraOptions = {} }) {
  const options = {
    ...BASE,
    aspectRatio: 2.6,
    scales: { x: XA, y: YA },
    elements: { line: { tension: .4, fill: true } },
    ...extraOptions
  };
  return <Line data={data} options={options} />;
}

export function ChartRadar({ data, extraOptions = {} }) {
  const options = {
    ...BASE,
    aspectRatio: 1.5,
    scales: { r: { ticks: { display: false }, grid: { color: '#E2E8F0' }, pointLabels: { font: { size: 10, family: 'Inter' } } } },
    plugins: { ...BASE.plugins, legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
    ...extraOptions
  };
  return <Radar data={data} options={options} />;
}

export function ChartPie({ data, extraOptions = {} }) {
  const options = {
    ...BASE,
    aspectRatio: 1.7,
    cutout: '60%',
    plugins: {
      legend: { display: true, position: 'right', labels: { font: { size: 10, family: 'Inter' }, padding: 10, boxWidth: 10 } },
      tooltip: TIP
    },
    ...extraOptions
  };
  return <Doughnut data={data} options={options} />;
}

export function ChartScatter({ data, extraOptions = {} }) {
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

export function ChartBubble({ data, extraOptions = {} }) {
  const options = {
    ...BASE,
    aspectRatio: 2.1,
    scales: { x: XA, y: YA },
    ...extraOptions
  };
  return <Bubble data={data} options={options} />;
}

export function Scorecard({ label, value, trend, isPositive }) {
  return (
    <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #E2E8F0', flex: 1 }}>
      <div style={{ color: '#64748B', fontSize: '13px', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
        <div style={{ fontSize: '32px', fontWeight: 800, color: '#0F172A' }}>{value}</div>
        {trend && (
          <div style={{ fontSize: '14px', fontWeight: 700, color: isPositive ? '#059669' : '#DC2626' }}>
            {isPositive ? '↑' : '↓'} {trend}%
          </div>
        )}
      </div>
    </div>
  );
}

export function Heatmap({ data }) {
  const hmColor = (s) => {
    const t = s / 100;
    const r = Math.round(219 + (30 - 219) * t);
    const g = Math.round(234 + (58 - 234) * t);
    const b = Math.round(254 + (163 - 254) * t);
    return `rgb(${r},${g},${b})`;
  };
  const hmText = (s) => (s > 62 ? '#1E3A8A' : '#334155');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {data.map((r, i) => (
        <div key={i}>
          <div className="hm-region-label">
            <span style={{ width: '7px', height: '7px', background: '#CBD5E1', borderRadius: '2px', marginRight: '6px', display: 'inline-block' }}></span>
            {r.region}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '5px' }}>
            {r.cities.map((c, j) => (
              <div
                key={j}
                className="heatmap-cell"
                style={{ background: hmColor(c.s) }}
                title={`${c.n}: ${c.s}/100`}
              >
                <div className="hm-city" style={{ color: hmText(c.s) }}>{c.n}</div>
                <div className="hm-score" style={{ color: hmText(c.s) }}>{c.s}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="hm-legend">
        <span className="hm-legend-text">Low</span>
        <div className="hm-legend-bar"></div>
        <span className="hm-legend-text">High Intent</span>
      </div>
    </div>
  );
}

