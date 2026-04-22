'use client';
import { Brain, ShieldCheck, TrendingUp, Search, Cloud, BarChart3, ArrowUpRight } from 'lucide-react';
import Navbar from '@/components/Navbar';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function UnifiedPrototype() {
  const lineData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    datasets: [
      {
        label: 'Search Interest (Google Trends)',
        data: [35, 38, 42, 45, 52, 60, 68, 72, 75, 78, 82, 85],
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 0,
      },
      {
        label: 'Time Spent (GWI)',
        data: [45, 46, 48, 50, 55, 58, 62, 65, 70, 75, 80, 84],
        borderColor: '#7C3AED',
        backgroundColor: 'rgba(124, 58, 237, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 0,
      }
    ],
  };

  const barData = {
    labels: ['Running Shoes', 'Gym Wear', 'Fitness Tracker', 'Yoaga Mats', 'Protein Powder'],
    datasets: [
      {
        label: 'Search Volume (Google Ads)',
        data: [85, 72, 65, 45, 38],
        backgroundColor: '#10B981',
        borderRadius: 8,
      }
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { enabled: true }
    },
    scales: {
      x: { display: true, grid: { display: false }, ticks: { font: { size: 10 } } },
      y: { display: false }
    }
  };

  const cards = [
    {
      title: "Engagement vs. Search Demand",
      sources: ["GWI", "GoogleTrends"],
      geography: "India",
      period: "Q2 2024 / Last 12 Months",
      metrics: [
        { label: "Avg. daily audience using social media", value: "84", unit: "% of population", source: "GWI" },
        { label: "Search interest growth in category", value: "28", unit: "% YoY", source: "GoogleTrends" }
      ],
      observation: "As search interest for the category has risen, time spent among the target audience has also increased, suggesting genuine engagement rather than passive awareness.",
      recommendation: "Align always-on search and content investment with periods where both search demand and time spent spike.",
      confidence: 91,
      chart: <Line data={lineData} options={chartOptions} />
    },
    {
      title: "Top Keywords Aligned with Search Trends",
      sources: ["GoogleAds", "GoogleTrends"],
      geography: "India",
      period: "Keyword Plan Q1 2025",
      metrics: [
        { label: "Primary Keyword CTR (Estimated)", value: "4.2", unit: "%", source: "GoogleAds" },
        { label: "Seasonal Interest Spike", value: "Dec/Jan", unit: "", source: "GoogleTrends" }
      ],
      observation: "The highest-volume primary keywords show strong alignment with rising trend lines, indicating room to scale spend efficiently.",
      recommendation: "Increase bids and budgets for keywords where Google Ads volume and Google Trends interest are both rising.",
      confidence: 79,
      chart: <Bar data={barData} options={chartOptions} />
    }
  ];

  return (
    <div className="screen fade-in" style={{ backgroundColor: '#F8FAFC', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
      <Navbar />
      <main style={{ padding: '60px 40px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '50px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <span style={{ fontSize: '10px', fontWeight: 900, background: '#3B82F6', color: '#fff', padding: '2px 8px', borderRadius: '4px' }}>BETA</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Unified Strategic Synthesis</span>
              </div>
              <h1 style={{ fontSize: '42px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.04em', lineHeight: 1 }}>Executive Unified Insights</h1>
              <p style={{ color: '#64748B', marginTop: '12px', fontSize: '16px' }}>Combined analysis of GWI, Google Trends, and Google Ads Keyword Plans.</p>
            </div>
            <div style={{ background: '#fff', padding: '16px 24px', borderRadius: '24px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', border: '1px solid #E2E8F0', display: 'flex', gap: '32px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', marginBottom: '8px' }}>DATA SOURCES</div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <Cloud size={18} color="#2563EB" />
                  <Search size={18} color="#7C3AED" />
                  <BarChart3 size={18} color="#10B981" />
                </div>
              </div>
              <div style={{ width: '1px', background: '#F1F5F9' }}></div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', marginBottom: '6px' }}>CONFIDENCE</div>
                <div style={{ color: '#10B981', fontSize: '18px', fontWeight: 900 }}>HIGH (85%)</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '40px' }}>
            {cards.map((c, idx) => (
              <div key={idx} className="unified-card shadow-xl" style={{ 
                background: '#fff', 
                borderRadius: '40px', 
                border: '1px solid #E2E8F0',
                padding: '40px',
                position: 'relative',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {c.sources.map(s => (
                      <span key={s} style={{ 
                        fontSize: '11px', fontWeight: 800, background: '#F1F5F9', color: '#475569', 
                        padding: '6px 14px', borderRadius: '30px', border: '1px solid #E2E8F0',
                        display: 'flex', alignItems: 'center', gap: '6px'
                      }}>
                        {s === 'GWI' && <Cloud size={12} />}
                        {s === 'GoogleTrends' && <Search size={12} />}
                        {s === 'GoogleAds' && <BarChart3 size={12} />}
                        {s}
                      </span>
                    ))}
                  </div>
                  <div style={{ color: '#10B981', fontSize: '13px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ShieldCheck size={16} /> {c.confidence}% Conviction
                  </div>
                </div>

                <h3 style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', marginBottom: '32px', lineHeight: 1.1, letterSpacing: '-0.02em' }}>{c.title}</h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '40px' }}>
                  {c.metrics.map((m, i) => (
                    <div key={i} style={{ padding: '20px', background: '#F8FAFC', borderRadius: '24px', border: '1px solid #F1F5F9' }}>
                      <div style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>{m.label}</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                        <span style={{ fontSize: '30px', fontWeight: 900, color: '#0F172A' }}>{m.value}</span>
                        <span style={{ fontSize: '15px', fontWeight: 700, color: '#64748B' }}>{m.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ height: '180px', marginBottom: '40px', position: 'relative' }}>
                  {c.chart}
                </div>

                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '32px', marginBottom: '32px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 900, color: '#3B82F6', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.1em' }}>📝 THE OBSERVATION</div>
                  <p style={{ fontSize: '16px', color: '#334155', lineHeight: 1.6, fontWeight: 500 }}>{c.observation}</p>
                </div>

                <div style={{ padding: '24px', background: '#ECFDF5', borderRadius: '24px', border: '1px solid #D1FAE5' }}>
                  <div style={{ fontSize: '11px', fontWeight: 900, color: '#059669', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '0.1em' }}>
                    💡 ADVISORY RECOMMENDATION
                  </div>
                  <p style={{ fontSize: '15px', color: '#065F46', fontWeight: 700, lineHeight: 1.5 }}>{c.recommendation}</p>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '40px', textAlign: 'center' }}>
             <p style={{ fontSize: '14px', color: '#94A3B8' }}>This is a high-fidelity output preview. Implementation will include live DB-backed synthesis.</p>
          </div>
        </div>
      </main>
      
      <style jsx>{`
        .unified-card:hover { transform: translateY(-4px); transition: transform 0.3s ease; }
      `}</style>
    </div>
  );
}
