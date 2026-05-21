'use client';
import { useState } from 'react';

/**
 * Proofread Button + modal — POSTs /api/analyses/[id]/proofread, opens a
 * modal with the grouped issues report. Deterministic-first pass; opt into
 * the LLM grammar pass via the toggle.
 */
export default function ProofreadButton({ analysisId }) {
  const [open,     setOpen]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [report,   setReport]   = useState(null);
  const [error,    setError]    = useState(null);
  const [useLlm,   setUseLlm]   = useState(false);
  const [filter,   setFilter]   = useState('all'); // 'all' | 'blocker' | 'major' | 'minor'

  async function run() {
    setLoading(true); setError(null);
    try {
      const url = `/api/analyses/${analysisId}/proofread${useLlm ? '?llm=1' : ''}`;
      const r = await fetch(url, { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setReport(d);
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  }

  function trigger() {
    setOpen(true);
    if (!report) run();
  }

  const sevColor = { blocker: '#DC2626', major: '#D97706', minor: '#64748B' };
  const sevBg    = { blocker: '#FEF2F2', major: '#FFFBEB', minor: '#F8FAFC' };

  const cards = report?.cards || [];
  const visible = filter === 'all' ? cards : cards.filter(c => c.issues.some(i => i.severity === filter));

  return (
    <>
      <button
        type="button"
        onClick={trigger}
        className="no-print"
        style={{
          fontSize: 11, fontWeight: 700, color: '#475569',
          background: '#fff', padding: '6px 14px', borderRadius: 20,
          border: '1px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,.04)',
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: 'inherit',
        }}
      >
        🔍 Proofread
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(15,23,42,.55)', display: 'flex',
            alignItems: 'flex-start', justifyContent: 'center',
            padding: '40px 16px', overflowY: 'auto',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 900, background: '#fff',
              borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,.3)',
              overflow: 'hidden', maxHeight: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A' }}>🔍 Proofread Report</div>
                {report?.brand && (
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    {report.brand} · {report.summary.totalCards} cards · {report.summary.mode}
                  </div>
                )}
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748B', padding: 6 }}>×</button>
            </div>

            <div style={{ padding: '16px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['all', 'blocker', 'major', 'minor'].map(s => {
                  const count = s === 'all'
                    ? report?.summary?.totalIssues || 0
                    : report?.summary?.bySeverity?.[s] || 0;
                  return (
                    <button
                      key={s}
                      onClick={() => setFilter(s)}
                      disabled={loading || !report}
                      style={{
                        padding: '5px 12px', borderRadius: 14,
                        border: `1.5px solid ${filter === s ? (sevColor[s] || '#2563EB') : '#E2E8F0'}`,
                        background: filter === s ? (sevBg[s] || '#EFF6FF') : '#fff',
                        color: filter === s ? (sevColor[s] || '#1D4ED8') : '#475569',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                        textTransform: 'capitalize',
                      }}
                    >
                      {s} {count > 0 && `· ${count}`}
                    </button>
                  );
                })}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={useLlm}
                  onChange={e => { setUseLlm(e.target.checked); setReport(null); }}
                  disabled={loading}
                />
                Deep proofread (LLM)
              </label>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>
              {loading && (
                <div style={{ padding: 60, textAlign: 'center', color: '#64748B' }}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div>
                  Scanning {useLlm ? 'with LLM grammar pass' : '142 cards'}…
                </div>
              )}

              {error && (
                <div style={{ margin: 24, padding: 16, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, color: '#991B1B', fontSize: 13 }}>
                  ⚠ {error}
                </div>
              )}

              {!loading && !error && report && visible.length === 0 && (
                <div style={{ padding: 60, textAlign: 'center', color: '#059669' }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    {report.summary.totalIssues === 0 ? 'No issues found' : `No ${filter} issues in this analysis`}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 6, color: '#64748B' }}>
                    {report.summary.totalCards} cards scanned · {report.summary.totalIssues} total issues
                  </div>
                </div>
              )}

              {!loading && !error && report && visible.length > 0 && (
                <div style={{ padding: '8px 24px 16px' }}>
                  {visible.map(c => (
                    <div key={c.index} style={{
                      padding: '14px 16px', marginBottom: 10,
                      background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', flex: 1, lineHeight: 1.35 }}>
                          {c.title}
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', whiteSpace: 'nowrap' }}>
                          {c.bucket} · #{c.index + 1}
                        </span>
                      </div>
                      {c.issues
                        .filter(i => filter === 'all' || i.severity === filter)
                        .map((i, idx) => (
                          <div key={idx} style={{
                            padding: '8px 12px', marginTop: 6, borderRadius: 8,
                            background: sevBg[i.severity], borderLeft: `3px solid ${sevColor[i.severity]}`,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
                              <span style={{ fontSize: 9.5, fontWeight: 800, color: sevColor[i.severity], textTransform: 'uppercase', letterSpacing: '.06em' }}>
                                {i.severity}
                              </span>
                              <span style={{ fontSize: 10, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.05em' }}>{i.field}</span>
                            </div>
                            <div style={{ fontSize: 12.5, color: '#334155', lineHeight: 1.5 }}>{i.issue}</div>
                            {i.suggest && (
                              <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 4, fontStyle: 'italic' }}>
                                → {i.suggest}
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
