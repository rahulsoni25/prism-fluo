'use client';
/**
 * components/Copilot.jsx
 *
 * Floating PRISM Copilot — chat panel pinned to bottom-right of the
 * insights page. Sends questions + chat history + the current analysisId
 * to /api/copilot, which grounds the answer in that analysis only.
 *
 * Self-contained styling (inline) so it ships without touching globals.
 */

import { useState, useRef, useEffect } from 'react';

export default function Copilot({ analysisId, analysisTitle }) {
  const [open,    setOpen]    = useState(false);
  const [input,   setInput]   = useState('');
  const [sending, setSending] = useState(false);
  const [error,   setError]   = useState(null);
  const [history, setHistory] = useState([]); // {role, content}[]
  const scrollRef = useRef(null);

  // Auto-scroll on new message
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history, sending]);

  async function send(e) {
    e?.preventDefault();
    const q = input.trim();
    if (!q || sending || !analysisId) return;

    const next = [...history, { role: 'user', content: q }];
    setHistory(next);
    setInput('');
    setSending(true);
    setError(null);

    try {
      const res = await fetch('/api/copilot', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ analysisId, question: q, history: next.slice(0, -1) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || `HTTP ${res.status}`);
      } else {
        setHistory((h) => [...h, { role: 'assistant', content: body.answer || '(empty)' }]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  if (!analysisId) return null;

  // ── Styles (inline so this component is fully portable) ──
  const sx = {
    fab: {
      position: 'fixed', right: 24, bottom: 24, zIndex: 50,
      background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
      color: '#fff', border: 'none', cursor: 'pointer',
      width: 56, height: 56, borderRadius: '50%',
      boxShadow: '0 10px 30px rgba(99, 102, 241, 0.4)',
      fontSize: 22, fontWeight: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    panel: {
      position: 'fixed', right: 24, bottom: 24, zIndex: 51,
      width: 380, maxWidth: 'calc(100vw - 32px)',
      height: 560, maxHeight: 'calc(100vh - 48px)',
      background: '#fff', borderRadius: 16,
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.18)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      border: '1px solid rgba(99, 102, 241, 0.18)',
    },
    header: {
      padding: '14px 16px',
      background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
      color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    },
    headerTitle: { fontSize: 14, fontWeight: 700 },
    headerSub: { fontSize: 11, opacity: 0.85, marginTop: 2 },
    closeBtn: {
      background: 'rgba(255,255,255,0.18)', color: '#fff', border: 'none',
      borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
    },
    body: {
      flex: 1, overflowY: 'auto', padding: 16, background: '#FAFAFB',
      display: 'flex', flexDirection: 'column', gap: 12,
    },
    bubble: (role) => ({
      maxWidth: '88%',
      padding: '10px 13px',
      borderRadius: 12,
      fontSize: 13, lineHeight: 1.5,
      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
      background: role === 'user' ? '#6366F1' : '#fff',
      color:      role === 'user' ? '#fff'    : '#1F2937',
      border:     role === 'user' ? 'none'    : '1px solid #E5E7EB',
      boxShadow:  role === 'user' ? '0 2px 6px rgba(99,102,241,0.25)' : '0 1px 2px rgba(0,0,0,0.04)',
    }),
    empty: {
      color: '#6B7280', fontSize: 12, textAlign: 'center',
      padding: '40px 16px', lineHeight: 1.6,
    },
    err: {
      background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B',
      padding: '8px 12px', borderRadius: 8, fontSize: 12,
    },
    form: {
      borderTop: '1px solid #E5E7EB', padding: 12, background: '#fff',
      display: 'flex', gap: 8,
    },
    input: {
      flex: 1, padding: '10px 12px', borderRadius: 10,
      border: '1px solid #D1D5DB', fontSize: 13, outline: 'none',
      fontFamily: 'inherit',
    },
    send: {
      background: '#6366F1', color: '#fff', border: 'none', borderRadius: 10,
      padding: '0 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
      opacity: sending || !input.trim() ? 0.5 : 1,
    },
  };

  if (!open) {
    return (
      <button
        type="button"
        style={sx.fab}
        title="PRISM Copilot — ask about this analysis"
        onClick={() => setOpen(true)}
      >
        ✨
      </button>
    );
  }

  const suggestions = [
    'Summarise this report in 3 bullets.',
    'Which insight has the strongest signal?',
    'Give me one campaign idea I can run on Instagram Reels.',
  ];

  return (
    <div style={sx.panel} role="dialog" aria-label="PRISM Copilot">
      <div style={sx.header}>
        <div>
          <div style={sx.headerTitle}>✨ PRISM Copilot</div>
          <div style={sx.headerSub}>Grounded in: {analysisTitle || 'this analysis'}</div>
        </div>
        <button style={sx.closeBtn} onClick={() => setOpen(false)}>✕</button>
      </div>

      <div ref={scrollRef} style={sx.body}>
        {history.length === 0 && (
          <div style={sx.empty}>
            Ask anything about the insights you're viewing.
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setInput(s)}
                  style={{
                    background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8,
                    padding: '8px 10px', fontSize: 12, color: '#374151', cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {history.map((m, i) => (
          <div key={i} style={sx.bubble(m.role)}>{m.content}</div>
        ))}

        {sending && (
          <div style={{ ...sx.bubble('assistant'), opacity: 0.7, fontStyle: 'italic' }}>
            Thinking…
          </div>
        )}

        {error && <div style={sx.err}>⚠ {error}</div>}
      </div>

      <form style={sx.form} onSubmit={send}>
        <input
          style={sx.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this analysis…"
          disabled={sending}
        />
        <button type="submit" style={sx.send} disabled={sending || !input.trim()}>
          {sending ? '…' : 'Send'}
        </button>
      </form>
    </div>
  );
}
