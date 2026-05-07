'use client';

/**
 * /analyze — Token-efficient Gemini culture/media analysis dashboard
 *
 * TOKEN STRATEGY:
 * - Basic view:   ~200 tokens/call — loads on "Analyze" click
 * - Deep view:    ~1000 tokens/call — loads only on "Deeper Insights" per card
 * - Cache:        24h in-memory — never re-queries same input
 * - Flash model:  gemini-2.0-flash for speed + cost efficiency
 */

import { useState, useRef } from 'react';
import Navbar from '@/components/Navbar';

// ── Types ─────────────────────────────────────────────────────

interface BasicResult {
  score: number;
  summary: string;
  cultureDrop: string[];
  behaviors: string[];
  psychographics: string[];
  fitScore: string[];
  cached?: boolean;
}

interface DeepCard {
  title: string;
  insight: string;
  stat: string;
  action: string;
}

interface DeepResult {
  section: string;
  cards: DeepCard[];
  cached?: boolean;
}

type SectionKey = 'cultureDrop' | 'behaviors' | 'psychographics' | 'fitScore';

// ── Section config ─────────────────────────────────────────────

const SECTIONS: { key: SectionKey; label: string; icon: string; color: string; bg: string; border: string }[] = [
  { key: 'cultureDrop',    label: 'Culture Drop',    icon: '🌊', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  { key: 'behaviors',      label: 'Behaviors',       icon: '🎯', color: '#0369A1', bg: '#F0F9FF', border: '#BAE6FD' },
  { key: 'psychographics', label: 'Psychographics',  icon: '🧠', color: '#065F46', bg: '#ECFDF5', border: '#A7F3D0' },
  { key: 'fitScore',       label: 'Fit Score',       icon: '📊', color: '#92400E', bg: '#FFFBEB', border: '#FDE68A' },
];

// ── Score ring ─────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 42;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 75 ? '#10B981' : score >= 50 ? '#F59E0B' : '#EF4444';

  return (
    <div style={{ position: 'relative', width: 110, height: 110 }}>
      <svg width={110} height={110} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={55} cy={55} r={r} fill="none" stroke="#E5E7EB" strokeWidth={8} />
        <circle
          cx={55} cy={55} r={r} fill="none"
          stroke={color} strokeWidth={8}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 10, color: '#6B7280', fontWeight: 600 }}>/100</span>
      </div>
    </div>
  );
}

// ── Deep cards accordion ───────────────────────────────────────

function DeepSection({ section, input }: { section: SectionKey; input: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [data, setData] = useState<DeepResult | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(true);

  async function load() {
    setState('loading');
    try {
      const res = await fetch('/api/gemini/deep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, section }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setData(json);
      setState('loaded');
    } catch (e: any) {
      setError(e.message);
      setState('error');
    }
  }

  if (state === 'idle') return null;

  const meta = SECTIONS.find(s => s.key === section)!;

  return (
    <div style={{
      marginTop: 12,
      border: `1px solid ${meta.border}`,
      borderRadius: 12,
      overflow: 'hidden',
      background: meta.bg,
    }}>
      {/* Accordion header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: meta.color }}>
          {state === 'loading' ? '⏳ Loading deep analysis...' : `${meta.icon} Deep ${meta.label} Analysis`}
          {data?.cached && <span style={{ marginLeft: 8, fontSize: 10, background: '#D1FAE5', color: '#065F46', padding: '2px 6px', borderRadius: 999 }}>CACHED</span>}
        </span>
        <span style={{ color: meta.color, fontSize: 12 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 16px 16px' }}>
          {state === 'loading' && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[1,2,3,4].map(i => (
                <div key={i} style={{
                  height: 100, flex: '1 1 200px', borderRadius: 10,
                  background: 'linear-gradient(90deg, #E5E7EB 25%, #F3F4F6 50%, #E5E7EB 75%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 1.5s infinite',
                }} />
              ))}
            </div>
          )}

          {state === 'error' && (
            <p style={{ color: '#DC2626', fontSize: 13 }}>⚠ {error}</p>
          )}

          {state === 'loaded' && data && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
              {data.cards.map((card, i) => (
                <div key={i} style={{
                  background: '#fff', borderRadius: 10, padding: '14px',
                  border: `1px solid ${meta.border}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: meta.color, marginBottom: 6 }}>
                    {card.title}
                  </div>
                  <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, marginBottom: 8 }}>
                    {card.insight}
                  </div>
                  {card.stat && (
                    <div style={{
                      fontSize: 11, fontWeight: 700, color: meta.color,
                      background: meta.bg, padding: '4px 8px', borderRadius: 6, marginBottom: 6,
                      display: 'inline-block',
                    }}>
                      📈 {card.stat}
                    </div>
                  )}
                  {card.action && (
                    <div style={{ fontSize: 11, color: '#6B7280', borderTop: '1px solid #F3F4F6', paddingTop: 6 }}>
                      → {card.action}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Section card (basic view) ──────────────────────────────────

function SectionCard({
  section, bullets, input,
}: { section: typeof SECTIONS[0]; bullets: string[]; input: string }) {
  const [expanded, setExpanded] = useState(false);
  const deepRef = useRef<HTMLDivElement>(null);

  function handleExpand() {
    setExpanded(true);
    setTimeout(() => deepRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
  }

  return (
    <div style={{
      background: '#fff',
      borderRadius: 14,
      border: `1px solid ${section.border}`,
      padding: '20px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      display: 'flex', flexDirection: 'column', gap: 0,
    }}>
      {/* Card header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{
          width: 32, height: 32, borderRadius: 8, background: section.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
        }}>{section.icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: section.color, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {section.label}
        </span>
        {/* Token badge */}
        <span style={{
          marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: '#9CA3AF',
          border: '1px solid #E5E7EB', borderRadius: 999, padding: '2px 6px',
        }}>~200 tokens</span>
      </div>

      {/* Bullets */}
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', flex: 1 }}>
        {bullets.map((b, i) => (
          <li key={i} style={{
            display: 'flex', gap: 8, fontSize: 13, color: '#374151',
            lineHeight: 1.55, marginBottom: i < bullets.length - 1 ? 8 : 0,
          }}>
            <span style={{ color: section.color, flexShrink: 0, marginTop: 2 }}>◆</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      {/* Expand button */}
      <button
        onClick={handleExpand}
        disabled={expanded}
        style={{
          marginTop: 16,
          width: '100%', padding: '8px 0',
          borderRadius: 8, border: `1px solid ${section.border}`,
          background: expanded ? section.bg : '#fff',
          color: section.color, fontSize: 12, fontWeight: 700,
          cursor: expanded ? 'default' : 'pointer',
          transition: 'all 0.2s',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        {expanded ? '✓ Deeper Insights Loaded' : '⚡ Deeper Insights'}
        {!expanded && (
          <span style={{
            fontSize: 9, fontWeight: 700, color: '#9CA3AF',
            border: '1px solid #E5E7EB', borderRadius: 999, padding: '1px 5px',
          }}>~1k tokens</span>
        )}
      </button>

      {/* Deep section mounts here */}
      <div ref={deepRef}>
        {expanded && <DeepSection section={section.key} input={input} />}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────

export default function AnalyzePage() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BasicResult | null>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<string[]>([]);

  async function handleAnalyze() {
    if (!input.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/gemini/basic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: input.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Analysis failed');
      setResult(json);
      setHistory(h => [input.trim(), ...h.filter(x => x !== input.trim())].slice(0, 5));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="screen fade-in">

      {/* ── Shimmer animation ── */}
      <style>{`
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes fadeIn  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .analyze-card { animation: fadeIn 0.4s ease both; }
      `}</style>

      <Navbar />

      {/* ── Main content ── */}
      <div className="main">
      <main className="container" style={{ maxWidth: 960 }}>

        {/* Page title */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: '#0F172A', letterSpacing: '-.5px', marginBottom: 6 }}>
            ⚡ Culture & Media Analyzer
          </h1>
          <p style={{ fontSize: 14, color: '#6B7280' }}>
            Token-efficient analysis — basic view loads instantly, deep insights on demand.
          </p>
        </div>

        {/* ── Input box ── */}
        <div style={{
          background: '#fff', borderRadius: 16, padding: '20px',
          border: '1px solid #E5E7EB', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          marginBottom: 28,
        }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Enter a brand, topic, URL, or keywords
          </label>
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !loading && handleAnalyze()}
              placeholder="e.g. Nike India Gen Z running, Zomato loyalty, Blinkit dark stores..."
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 9,
                border: '1px solid #E5E7EB', fontSize: 14, color: '#0F172A',
                outline: 'none', fontFamily: 'Inter, sans-serif',
              }}
            />
            <button
              onClick={handleAnalyze}
              disabled={loading || !input.trim()}
              style={{
                padding: '10px 22px', borderRadius: 9, border: 'none', cursor: loading ? 'wait' : 'pointer',
                background: loading || !input.trim()
                  ? '#E5E7EB'
                  : 'linear-gradient(135deg,#3B82F6,#8B5CF6)',
                color: loading || !input.trim() ? '#9CA3AF' : '#fff',
                fontWeight: 700, fontSize: 14, transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {loading ? (
                <>
                  <span style={{
                    width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff', borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite', display: 'inline-block',
                  }} />
                  Analyzing...
                </>
              ) : '⚡ Analyze'}
            </button>
          </div>

          {/* Recent searches */}
          {history.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {history.map(h => (
                <button key={h} onClick={() => setInput(h)} style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 999,
                  background: '#F1F5F9', border: '1px solid #E2E8F0',
                  color: '#475569', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                }}>
                  {h}
                </button>
              ))}
            </div>
          )}

          {/* Token counter hint */}
          <div style={{ marginTop: 10, fontSize: 11, color: '#9CA3AF', display: 'flex', gap: 12 }}>
            <span>💡 Basic view: ~200 tokens</span>
            <span>🔍 Each deep section: ~1,000 tokens (loaded on demand)</span>
            <span>⚡ Cached 24h — never re-queries same input</span>
          </div>
        </div>

        {/* ── Error state ── */}
        {error && (
          <div style={{
            background: '#FEF2F2', border: '1px solid #FCA5A5',
            borderRadius: 10, padding: '14px 16px', marginBottom: 20, color: '#DC2626', fontSize: 13,
          }}>
            ⚠ {error}
          </div>
        )}

        {/* ── Loading skeleton ── */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{
              height: 120, borderRadius: 14, background: '#fff', border: '1px solid #E5E7EB',
              padding: 20, display: 'flex', gap: 20, alignItems: 'center',
            }}>
              <div style={{ width: 110, height: 110, borderRadius: '50%', background: '#F1F5F9' }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ height: 20, width: '60%', background: '#F1F5F9', borderRadius: 6 }} />
                <div style={{ height: 14, width: '80%', background: '#F1F5F9', borderRadius: 6 }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
              {[1,2,3,4].map(i => (
                <div key={i} style={{
                  height: 200, borderRadius: 14, background: '#fff',
                  border: '1px solid #E5E7EB', overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', width: '100%',
                    background: 'linear-gradient(90deg, #F1F5F9 25%, #F8FAFC 50%, #F1F5F9 75%)',
                    backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite',
                  }} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {result && !loading && (
          <div style={{ animation: 'fadeIn 0.5s ease' }}>

            {/* Hero: Score + Summary */}
            <div style={{
              background: '#fff', borderRadius: 16, padding: '24px',
              border: '1px solid #E5E7EB', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              display: 'flex', alignItems: 'center', gap: 24, marginBottom: 20,
            }}>
              <ScoreRing score={result.score} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                  Overall Fit Score
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', lineHeight: 1.35, letterSpacing: '-.3px' }}>
                  {result.summary}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, background: '#F0FDF4', color: '#166534', padding: '3px 10px', borderRadius: 999, fontWeight: 600 }}>
                    Analyzing: {result.input}
                  </span>
                  {result.cached && (
                    <span style={{ fontSize: 11, background: '#F0FDF4', color: '#166534', padding: '3px 10px', borderRadius: 999, fontWeight: 600 }}>
                      ⚡ Cached result
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 4 Section cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
              {SECTIONS.map((section, i) => (
                <div key={section.key} className="analyze-card" style={{ animationDelay: `${i * 0.07}s` }}>
                  <SectionCard
                    section={section}
                    bullets={result[section.key]}
                    input={result.input}
                  />
                </div>
              ))}
            </div>

          </div>
        )}

        {/* ── Empty state ── */}
        {!result && !loading && !error && (
          <div style={{
            textAlign: 'center', padding: '60px 20px',
            background: '#fff', borderRadius: 16, border: '1px solid #E5E7EB',
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⚡</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
              Enter anything to analyze
            </div>
            <div style={{ fontSize: 13, color: '#6B7280', maxWidth: 400, margin: '0 auto' }}>
              Brand names, campaign topics, cultural trends, competitor names, keywords —
              get instant culture + behavior analysis with deep-dive on demand.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 16 }}>
              {['Nike India Gen Z', 'Blinkit dark stores', 'IPL 2025 audience', 'Zepto vs Swiggy Instamart'].map(s => (
                <button key={s} onClick={() => setInput(s)} style={{
                  fontSize: 12, padding: '6px 14px', borderRadius: 999,
                  background: '#F8FAFC', border: '1px solid #E2E8F0',
                  color: '#475569', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                  fontWeight: 500,
                }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
