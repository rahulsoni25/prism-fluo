'use client';
import { useEffect, useState } from 'react';

/**
 * Verified Badge — small pill in the insights hero that reports the
 * 3-agent council's verdict on this analysis. Tap to open the detail modal.
 *
 *   • Green "✅ Data verified"          — 0 confirmed findings
 *   • Amber "⚠ N issues flagged"        — at least 1 major / blocker
 *   • Grey  "⏳ Verification pending"   — never run / still running
 */
export default function VerifiedBadge({ analysisId }) {
  const [state,  setState]  = useState({ kind: 'loading' });
  const [open,   setOpen]   = useState(false);
  const [report, setReport] = useState(null);

  useEffect(() => {
    if (!analysisId) return;
    let cancelled = false;
    fetch(`/api/analyses/${analysisId}/verify`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d) return;
        if (d.status === 'never-run') {
          setState({ kind: 'pending' });
        } else if (d.report) {
          setReport(d.report);
          const s = d.report.summary;
          if (s.confirmedFindings === 0) setState({ kind: 'verified', summary: s });
          else setState({ kind: 'issues', summary: s });
        }
      })
      .catch(() => setState({ kind: 'pending' }));
    return () => { cancelled = true; };
  }, [analysisId]);

  async function runNow() {
    setState({ kind: 'loading' });
    try {
      const r = await fetch(`/api/analyses/${analysisId}/verify`, { method: 'POST' });
      const d = await r.json();
      if (d.report) {
        setReport(d.report);
        const s = d.report.summary;
        setState(s.confirmedFindings === 0 ? { kind: 'verified', summary: s } : { kind: 'issues', summary: s });
      }
    } catch {
      setState({ kind: 'pending' });
    }
  }

  const styles = {
    verified: { bg: 'rgba(16,185,129,.15)', border: 'rgba(16,185,129,.4)', color: '#A7F3D0' },
    issues:   { bg: 'rgba(245,158,11,.15)', border: 'rgba(245,158,11,.4)', color: '#FDE68A' },
    pending:  { bg: 'rgba(148,163,184,.15)', border: 'rgba(148,163,184,.3)', color: '#CBD5E1' },
    loading:  { bg: 'rgba(148,163,184,.10)', border: 'rgba(148,163,184,.2)', color: '#94A3B8' },
  };
  const s = styles[state.kind] || styles.pending;
  const labels = {
    verified: '✅ Data Verified',
    issues:   `⚠ ${state.summary?.confirmedFindings || 0} issues flagged`,
    pending:  '⏳ Verification pending',
    loading:  '⏳ Verifying…',
  };

  return (
    <>
      <button
        type="button"
        onClick={() => state.kind === 'pending' ? runNow() : setOpen(true)}
        title="Click for details from the 3-agent verification council"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 11px', borderRadius: 20,
          background: s.bg, border: `1px solid ${s.border}`, color: s.color,
          fontSize: 11, fontWeight: 700, letterSpacing: '.02em',
          cursor: 'pointer', fontFamily: 'inherit', backdropFilter: 'blur(4px)',
        }}
      >
        {labels[state.kind]}
      </button>

      {open && report && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(15,23,42,.6)', display: 'flex',
            alignItems: 'flex-start', justifyContent: 'center',
            padding: '40px 16px', overflowY: 'auto',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 880, background: '#fff',
              borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,.3)',
              overflow: 'hidden', maxHeight: 'calc(100vh - 80px)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A' }}>
                  🛡 Verification Council Report
                </div>
                <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748B' }}>×</button>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Three agents (proofreader · stat-checker · fact-analyzer) reviewed every card. Only findings 2+ agents agreed on are shown.
              </div>
              <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
                {[
                  { label: 'Total cards', value: report.summary.totalCards, color: '#0F172A' },
                  { label: 'Verified', value: report.summary.verifiedCards, color: '#059669' },
                  { label: 'Issues', value: report.summary.cardsWithIssues, color: '#D97706' },
                  { label: 'Blocker', value: report.summary.bySeverity.blocker, color: '#DC2626' },
                  { label: 'Major', value: report.summary.bySeverity.major, color: '#D97706' },
                  { label: 'Minor', value: report.summary.bySeverity.minor, color: '#64748B' },
                  { label: 'Disputed', value: report.summary.disputedFindings, color: '#94A3B8' },
                ].map(s => (
                  <div key={s.label} style={{ minWidth: 80 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.06em' }}>{s.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: 16 }}>
              {report.cards.filter(c => c.findings.some(f => f.verdict === 'confirmed')).map(c => (
                <div key={c.index} style={{ padding: '12px 14px', marginBottom: 10, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>{c.title}</div>
                  {c.findings.filter(f => f.verdict === 'confirmed').map((f, idx) => (
                    <div key={idx} style={{
                      padding: '8px 12px', marginTop: 6, borderRadius: 8,
                      background: f.severity === 'blocker' ? '#FEF2F2' : f.severity === 'major' ? '#FFFBEB' : '#F8FAFC',
                      borderLeft: `3px solid ${f.severity === 'blocker' ? '#DC2626' : f.severity === 'major' ? '#D97706' : '#64748B'}`,
                    }}>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 2, alignItems: 'baseline', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 9.5, fontWeight: 800, color: f.severity === 'blocker' ? '#DC2626' : f.severity === 'major' ? '#D97706' : '#64748B', textTransform: 'uppercase' }}>{f.severity}</span>
                        <span style={{ fontSize: 10, color: '#94A3B8', textTransform: 'uppercase' }}>{f.field}</span>
                        <span style={{ fontSize: 10, color: '#7C3AED', fontWeight: 600 }}>
                          {f.confirmedBy.length} agent{f.confirmedBy.length !== 1 ? 's' : ''} agree
                        </span>
                        <span style={{ fontSize: 10, color: '#94A3B8' }}>({f.confirmedBy.join(' · ')})</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: '#334155', lineHeight: 1.5 }}>{f.issue}</div>
                      {f.suggest && (
                        <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 4, fontStyle: 'italic' }}>→ {f.suggest}</div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 24px', borderTop: '1px solid #E2E8F0', background: '#F8FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#64748B' }}>
              <span>Mode: <code style={{ background: '#fff', padding: '2px 6px', borderRadius: 4 }}>{state.summary?.mode || 'rules-only'}</code></span>
              <button onClick={runNow} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: '#475569' }}>
                Re-run verification
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
