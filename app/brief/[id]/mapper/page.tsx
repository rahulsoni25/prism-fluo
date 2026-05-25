'use client';
import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface FocusQuestion {
  question: string;
  status:   'answerable' | 'partial' | 'unanswerable' | 'direction';
  reason:   string;
  supportedBy?: string[];
}

interface DataGap {
  id:         string;
  title:      string;
  severity:   'high' | 'medium' | 'low';
  impacts:    string[];
  suggestion: string;
  blocksFeature?: string;
}

interface CompletenessReport {
  sourcesPresent:   string[];
  toolTypesPresent: string[];
  gaps:             DataGap[];
  score:            number;
}

interface UploadInfo {
  id:        string;
  filename:  string;
  sourceType: string | null;
  createdAt: string;
}

const STATUS_STYLE: Record<FocusQuestion['status'], { color: string; bg: string; icon: string; label: string }> = {
  answerable:   { color: '#065F46', bg: '#D1FAE5', icon: '✓', label: 'Answerable' },
  partial:      { color: '#92400E', bg: '#FEF3C7', icon: '⚠', label: 'Partial' },
  unanswerable: { color: '#991B1B', bg: '#FEE2E2', icon: '✗', label: 'Data missing' },
  direction:    { color: '#5B21B6', bg: '#EDE9FE', icon: '🧭', label: 'Direction' },
};

const SEVERITY_STYLE: Record<DataGap['severity'], { color: string; bg: string; label: string }> = {
  high:   { color: '#991B1B', bg: '#FEE2E2', label: 'HIGH' },
  medium: { color: '#92400E', bg: '#FEF3C7', label: 'MEDIUM' },
  low:    { color: '#1E40AF', bg: '#DBEAFE', label: 'LOW' },
};

export default function MapperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: briefId } = use(params);
  const router = useRouter();

  const [brief,     setBrief]     = useState<any>(null);
  const [uploads,   setUploads]   = useState<UploadInfo[]>([]);
  const [completeness, setCompleteness] = useState<CompletenessReport | null>(null);
  const [focusText, setFocusText] = useState('');
  const [focusQuestions, setFocusQuestions] = useState<FocusQuestion[]>([]);
  const [validating, setValidating] = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [generating, setGenerating] = useState(false);

  // Load everything in parallel
  useEffect(() => {
    Promise.all([
      fetch(`/api/briefs/${briefId}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/briefs/${briefId}/combined-rows`).then(r => r.ok ? r.json() : null),
      fetch(`/api/briefs/${briefId}/data-completeness`).then(r => r.ok ? r.json() : null),
      fetch(`/api/briefs/${briefId}/focus-questions`).then(r => r.ok ? r.json() : null),
    ])
      .then(([b, combined, comp, focus]) => {
        setBrief(b);
        setUploads((combined?.activeUploads ?? []) as UploadInfo[]);
        setCompleteness(comp);
        if (focus) {
          setFocusText(focus.raw || '');
          setFocusQuestions(focus.questions || []);
        }
      })
      .finally(() => setLoading(false));
  }, [briefId]);

  async function handleValidate() {
    if (!focusText.trim()) { setFocusQuestions([]); return; }
    setValidating(true);
    try {
      const res = await fetch(`/api/briefs/${briefId}/focus-questions`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rawText: focusText }),
      });
      if (res.ok) {
        const data = await res.json();
        setFocusQuestions(data.questions || []);
      }
    } finally {
      setValidating(false);
    }
  }

  async function handleGenerate(force = false) {
    setGenerating(true);
    // Trigger analyze on the most recent upload of the brief — the analyze
    // route already pools combined rows when brief has multiple sources.
    // For now, navigate to /upload which has the full analyze trigger flow.
    // Future: build a dedicated trigger endpoint that takes briefId only.
    router.push(`/upload?briefId=${briefId}&force=${force ? '1' : '0'}`);
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F0F4FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: 15 }}>
        Loading Data Mapper…
      </div>
    );
  }

  if (!brief) {
    return (
      <div style={{ minHeight: '100vh', background: '#F0F4FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#0F172A' }}>Brief not found</div>
        <Link href="/dashboard" style={{ color: '#2563EB', fontSize: 13 }}>← Back to dashboard</Link>
      </div>
    );
  }

  const highGaps = completeness?.gaps.filter(g => g.severity === 'high') ?? [];
  const medGaps  = completeness?.gaps.filter(g => g.severity === 'medium') ?? [];
  const score    = completeness?.score ?? 0;
  const scoreColor = score >= 80 ? '#059669' : score >= 50 ? '#D97706' : '#DC2626';

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4FF', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#0F172A,#1E1B4B)', padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/dashboard" style={{ textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#6366F1,#7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 14 }}>P</div>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>PRISM</span>
            </div>
          </Link>
          <span style={{ color: 'rgba(255,255,255,.3)', fontSize: 14 }}>/</span>
          <span style={{ color: '#C7D2FE', fontWeight: 700, fontSize: 14 }}>{brief.brand || 'Untitled brief'}</span>
          <span style={{ color: 'rgba(255,255,255,.3)', fontSize: 14 }}>/</span>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Data Mapper</span>
        </div>
        <Link href="/dashboard" style={{ color: '#94A3B8', fontSize: 13, textDecoration: 'none' }}>← Dashboard</Link>
      </div>

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: '#0F172A', marginBottom: 6 }}>📋 Data Mapper</h1>
        <p style={{ color: '#64748B', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
          Pre-flight check before generating insights. Add direction for what to focus on, see what data is present, and surface any gaps that would limit the analysis.
        </p>

        {/* ── Uploaded data summary ── */}
        <div style={{ background: '#fff', borderRadius: 14, padding: '18px 22px', boxShadow: '0 1px 3px rgba(0,0,0,.04)', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              📁 Uploaded Data ({uploads.length} active source{uploads.length !== 1 ? 's' : ''})
            </div>
            <Link href={`/upload?briefId=${briefId}`} style={{
              fontSize: 12, fontWeight: 700, color: '#2563EB',
              padding: '5px 12px', borderRadius: 8,
              border: '1px solid #DBEAFE', background: '#EFF6FF',
              textDecoration: 'none',
            }}>+ Upload more</Link>
          </div>
          {uploads.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: '#94A3B8', fontSize: 13, background: '#F8FAFC', borderRadius: 10 }}>
              No data uploaded yet for this brief. <Link href={`/upload?briefId=${briefId}`} style={{ color: '#2563EB', fontWeight: 700 }}>Upload now →</Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {uploads.map(u => (
                <div key={u.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center', padding: '8px 10px', background: '#F8FAFC', borderRadius: 8, fontSize: 12.5 }}>
                  <span style={{ color: '#059669', fontWeight: 800 }}>✓</span>
                  <span style={{ color: '#0F172A', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={u.filename}>{u.filename}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#7C3AED', background: '#F5F3FF', padding: '2px 8px', borderRadius: 10 }}>
                    {u.sourceType || 'unknown'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Two-column Add Details + Data Completeness ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 18, marginBottom: 18 }}>
          {/* Add Details */}
          <div style={{ background: '#fff', borderRadius: 14, padding: '18px 22px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
              📝 Add Details
            </div>
            <div style={{ fontSize: 11.5, color: '#64748B', marginBottom: 10, lineHeight: 1.5 }}>
              Tell the analyst what to focus on. Mix specific questions ("What are top trending searches in Tier 2?") with analytical direction ("Think defending share vs attacking"). Validates against your uploaded data.
            </div>
            <textarea
              value={focusText}
              onChange={e => setFocusText(e.target.value)}
              placeholder={`e.g. Focus on price sensitivity in Tier 2 cities and which competitors are gaining ground in the last 90 days.
Think about how this should shape festive Q3 launch creative — are we defending share or attacking?`}
              rows={6}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '10px 12px', fontSize: 12.5, lineHeight: 1.5,
                border: '1px solid #CBD5E1', borderRadius: 8,
                fontFamily: 'inherit', resize: 'vertical', outline: 'none',
              }}
            />
            <button
              onClick={handleValidate}
              disabled={validating || !focusText.trim()}
              style={{
                marginTop: 10,
                padding: '8px 16px', borderRadius: 8, border: 'none',
                background: validating || !focusText.trim() ? '#94A3B8' : '#6366F1',
                color: '#fff', fontSize: 12.5, fontWeight: 700,
                cursor: validating || !focusText.trim() ? 'wait' : 'pointer',
                fontFamily: 'inherit',
              }}>
              {validating ? '⏳ Validating against data…' : '✓ Validate'}
            </button>

            {focusQuestions.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #F1F5F9' }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                  Validation result
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {focusQuestions.map((q, i) => {
                    const s = STATUS_STYLE[q.status];
                    return (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'start', fontSize: 12, lineHeight: 1.4 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: s.color, background: s.bg, padding: '2px 7px', borderRadius: 10, whiteSpace: 'nowrap' }}>
                          {s.icon} {s.label}
                        </span>
                        <div>
                          <div style={{ color: '#0F172A', fontWeight: 500, marginBottom: 2 }}>{q.question}</div>
                          <div style={{ fontSize: 11, color: '#64748B' }}>{q.reason}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Data Completeness */}
          <div style={{ background: '#fff', borderRadius: 14, padding: '18px 22px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                🔍 Data Completeness
              </div>
              {completeness && (
                <span style={{ fontSize: 11, fontWeight: 800, color: scoreColor }}>
                  Score: {score}/100
                </span>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: '#64748B', marginBottom: 12, lineHeight: 1.5 }}>
              What's present vs missing. High-severity gaps will leave nuggets empty or hollow.
            </div>

            {!completeness ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Loading audit…</div>
            ) : completeness.gaps.length === 0 ? (
              <div style={{ padding: 16, background: '#ECFDF5', borderRadius: 10, color: '#065F46', fontSize: 13, fontWeight: 700, textAlign: 'center' }}>
                ✓ All checks pass — data is complete for this brief.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {completeness.gaps.map(g => {
                  const s = SEVERITY_STYLE[g.severity];
                  return (
                    <div key={g.id} style={{ padding: '10px 12px', background: s.bg, borderRadius: 8, fontSize: 12, lineHeight: 1.45 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: s.color }}>{g.title}</span>
                        <span style={{ fontSize: 9.5, fontWeight: 800, color: s.color, background: '#fff', padding: '1px 6px', borderRadius: 8, letterSpacing: '.06em' }}>
                          {s.label}
                        </span>
                      </div>
                      <div style={{ color: s.color, opacity: 0.9 }}>{g.suggestion}</div>
                      {g.blocksFeature && (
                        <div style={{ marginTop: 4, fontSize: 10.5, color: s.color, opacity: 0.7, fontStyle: 'italic' }}>
                          Blocks: {g.blocksFeature}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── 3-action footer ── */}
        <div style={{ background: '#fff', borderRadius: 14, padding: '18px 22px', boxShadow: '0 1px 3px rgba(0,0,0,.04)', display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Link href={`/upload?briefId=${briefId}`} style={{
            padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            border: '1px solid #CBD5E1', background: '#fff', color: '#475569',
            textDecoration: 'none', cursor: 'pointer',
          }}>
            ⬆ Upload more data
          </Link>
          {highGaps.length > 0 ? (
            <button onClick={() => handleGenerate(true)} disabled={generating} style={{
              padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              border: '1px solid #FCD34D', background: '#FFFBEB', color: '#92400E',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              ⚠ Generate anyway with {highGaps.length} high-priority gap{highGaps.length !== 1 ? 's' : ''}
            </button>
          ) : (
            <button onClick={() => handleGenerate(false)} disabled={generating || uploads.length === 0} style={{
              padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 800,
              border: 'none', background: '#059669', color: '#fff',
              cursor: generating || uploads.length === 0 ? 'wait' : 'pointer',
              fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(5,150,105,.3)',
            }}>
              {generating ? '⏳ Generating…' : `✅ Looks good — Generate Insights`}
            </button>
          )}
        </div>

        <div style={{ marginTop: 18, fontSize: 11, color: '#94A3B8', textAlign: 'center' }}>
          Direction + validated questions get injected into the Gemini analyzer prompt as priority focus areas.<br />
          Unanswerable questions surface as honest "data limit" cards instead of fabricated answers.
        </div>
      </main>
    </div>
  );
}
