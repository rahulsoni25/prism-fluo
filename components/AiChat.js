'use client';
import { useState, useRef, useEffect } from 'react';
import { Brain, Send, X, Sparkles, Cpu, Cloud, Loader2 } from 'lucide-react';

export default function AiChat({ dataContext }) {
  const [isOpen, setIsOpen] = useState(false);
  const [provider, setProvider] = useState('gemini'); // 'gemini' | 'ollama'
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMsg = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          messages: newMessages,
          dataContext,
        }),
      });

      const data = await res.json();
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.reply || data.error || 'No response.',
        provider: data.provider
      }]);
    } catch (err) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `❌ Connection failed: ${err.message}` 
      }]);
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = [
    '📊 What are the top 3 strategic insights from this data?',
    '🎯 Which segment shows the highest growth potential?',
    '⚠️ What risks or anomalies should I be aware of?',
    '📝 Write an executive summary for this dataset.',
  ];

  return (
    <>
      {/* FLOATING TRIGGER BUTTON */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            position: 'fixed', bottom: '28px', right: '28px', zIndex: 999,
            width: '64px', height: '64px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #2563EB, #7C3AED)',
            border: 'none', cursor: 'pointer',
            boxShadow: '0 8px 32px rgba(37, 99, 235, 0.4), 0 0 0 4px rgba(37, 99, 235, 0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.3s',
            animation: 'float 3s ease-in-out infinite'
          }}
          title="Ask PRISM AI"
        >
          <Sparkles size={28} color="#fff" />
        </button>
      )}

      {/* CHAT PANEL */}
      {isOpen && (
        <div style={{
          position: 'fixed', bottom: '28px', right: '28px', zIndex: 1000,
          width: '440px', height: '620px',
          background: '#fff', borderRadius: '28px',
          boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0,0,0,0.05)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: 'slideUp 0.3s ease'
        }}>
          {/* HEADER */}
          <div style={{
            background: 'linear-gradient(135deg, #0F172A, #1E1B4B)',
            padding: '20px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '12px',
                background: 'linear-gradient(135deg, #2563EB, #7C3AED)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Brain size={20} color="#fff" />
              </div>
              <div>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: '15px' }}>PRISM AI Analyst</div>
                <div style={{ color: '#94A3B8', fontSize: '11px', fontWeight: 600 }}>
                  Powered by {provider === 'gemini' ? 'Gemini' : 'Gemma (Local)'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* PROVIDER TOGGLE */}
              <div style={{
                display: 'flex',
                background: 'rgba(255,255,255,0.1)',
                borderRadius: '10px', padding: '3px',
              }}>
                <button
                  onClick={() => setProvider('gemini')}
                  style={{
                    padding: '6px 12px', borderRadius: '8px', border: 'none',
                    fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '4px',
                    background: provider === 'gemini' ? '#2563EB' : 'transparent',
                    color: provider === 'gemini' ? '#fff' : '#94A3B8',
                    transition: 'all 0.2s'
                  }}
                  title="Google Gemini (Cloud)"
                >
                  <Cloud size={12} /> Gemini
                </button>
                <button
                  onClick={() => setProvider('ollama')}
                  style={{
                    padding: '6px 12px', borderRadius: '8px', border: 'none',
                    fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '4px',
                    background: provider === 'ollama' ? '#7C3AED' : 'transparent',
                    color: provider === 'ollama' ? '#fff' : '#94A3B8',
                    transition: 'all 0.2s'
                  }}
                  title="Gemma via Ollama (Local)"
                >
                  <Cpu size={12} /> Gemma
                </button>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', padding: '6px', borderRadius: '8px', cursor: 'pointer' }}
              >
                <X size={16} color="#94A3B8" />
              </button>
            </div>
          </div>

          {/* MESSAGES */}
          <div ref={scrollRef} style={{
            flex: 1, overflowY: 'auto', padding: '20px',
            display: 'flex', flexDirection: 'column', gap: '16px',
            background: '#F8FAFC'
          }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <Sparkles size={32} color="#CBD5E1" style={{ margin: '0 auto 12px' }} />
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                  Ask anything about your data
                </div>
                <div style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '20px' }}>
                  PRISM AI has full context of your uploaded dataset.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {quickPrompts.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => { setInput(p); }}
                      style={{
                        padding: '10px 14px', background: '#fff', border: '1px solid #E2E8F0',
                        borderRadius: '12px', fontSize: '12px', color: '#475569',
                        cursor: 'pointer', textAlign: 'left', fontWeight: 500,
                        transition: 'all 0.15s'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.background = '#EFF6FF'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.background = '#fff'; }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  maxWidth: '85%',
                  padding: '12px 16px',
                  borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  background: msg.role === 'user' 
                    ? 'linear-gradient(135deg, #2563EB, #3B82F6)' 
                    : '#fff',
                  color: msg.role === 'user' ? '#fff' : '#334155',
                  fontSize: '13px', lineHeight: 1.6, fontWeight: 500,
                  boxShadow: msg.role === 'user' 
                    ? 'none' 
                    : '0 2px 8px rgba(0,0,0,0.06)',
                  border: msg.role === 'user' ? 'none' : '1px solid #E2E8F0',
                  whiteSpace: 'pre-wrap',
                }}>
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94A3B8', fontSize: '12px' }}>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                <span>{provider === 'gemini' ? 'Gemini' : 'Gemma'} is thinking...</span>
              </div>
            )}
          </div>

          {/* INPUT */}
          <div style={{
            padding: '16px 20px',
            borderTop: '1px solid #E2E8F0',
            background: '#fff',
            display: 'flex', gap: '10px', alignItems: 'center',
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Ask about your data..."
              style={{
                flex: 1, padding: '12px 16px',
                border: '2px solid #E2E8F0', borderRadius: '14px',
                fontSize: '13px', fontFamily: 'inherit', fontWeight: 500,
                outline: 'none', color: '#0F172A',
                transition: 'border-color 0.2s'
              }}
              onFocus={e => e.currentTarget.style.borderColor = '#3B82F6'}
              onBlur={e => e.currentTarget.style.borderColor = '#E2E8F0'}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              style={{
                width: '44px', height: '44px', borderRadius: '14px',
                background: input.trim() ? 'linear-gradient(135deg, #2563EB, #7C3AED)' : '#E2E8F0',
                border: 'none', cursor: input.trim() ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s',
              }}
            >
              <Send size={18} color={input.trim() ? '#fff' : '#94A3B8'} />
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
