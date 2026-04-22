'use client';
import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, X, MessageSquare, Loader2, Sparkles } from 'lucide-react';

export default function ChatCopilot({ sessionId }: { sessionId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{role: string, content: string}[]>([
    { role: 'assistant', content: "Hello! I'm your PRISM Copilot. I've analyzed your data—ask me anything about the trends, metrics, or strategic recommendations I've generated." }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    
    const userMsg = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input, history: messages.slice(-5), sessionId })
      });
      const data = await res.json();
      setMessages(prev => [...prev, data]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: "I'm sorry, I'm having trouble connecting to my intelligence engine. Please ensure Ollama is running or check your API keys." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button 
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          width: '56px',
          height: '56px',
          borderRadius: '20px',
          background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
          color: '#fff',
          border: 'none',
          boxShadow: '0 20px 40px -10px rgba(37,99,235,0.5)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1) translateY(-5px)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
      >
        <Sparkles size={28} />
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          bottom: '90px',
          right: '20px',
          width: 'min(400px, calc(100vw - 24px))',
          height: 'min(600px, calc(100dvh - 110px))',
          background: '#fff',
          borderRadius: '32px',
          boxShadow: '0 30px 60px -15px rgba(0,0,0,0.15)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1001,
          overflow: 'hidden',
          border: '1px solid #E2E8F0',
          animation: 'slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
          {/* Header */}
          <div style={{ 
            padding: '24px', 
            background: '#0F172A', 
            color: '#fff', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ background: '#3B82F6', padding: '8px', borderRadius: '10px' }}>
                 <Bot size={20} />
              </div>

              <div>
                <div style={{ fontWeight: 800, fontSize: '16px' }}>PRISM Copilot</div>
                <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 700 }}>AI STRATEGIST ONLINE</div>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}>
              <X size={20} />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {messages.map((m, i) => (
              <div key={i} style={{ 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
                gap: '8px'
              }}>
                <div style={{ 
                  background: m.role === 'user' ? '#3B82F6' : '#F1F5F9',
                  color: m.role === 'user' ? '#fff' : '#1E293B',
                  padding: '14px 18px',
                  borderRadius: m.role === 'user' ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                  fontSize: '14px',
                  lineHeight: 1.5,
                  maxWidth: '85%',
                  fontWeight: 500,
                  boxShadow: m.role === 'user' ? '0 4px 12px -2px rgba(59,130,246,0.3)' : 'none'
                }}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: '#94A3B8' }}>
                <Loader2 size={16} className="spinning" />
                <span style={{ fontSize: '12px', fontWeight: 600 }}>Analyzing data...</span>
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ padding: '24px', borderTop: '1px solid #F1F5F9' }}>
            <div style={{ display: 'flex', gap: '10px', background: '#F8FAFC', padding: '8px', borderRadius: '20px', border: '1px solid #E2E8F0' }}>
              <input 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask your copilot..."
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  padding: '10px 15px',
                  fontSize: '14px',
                  outline: 'none',
                  color: '#1E293B',
                  fontWeight: 500
                }}
              />
              <button 
                onClick={handleSend}
                disabled={loading}
                style={{
                  background: '#0F172A',
                  color: '#fff',
                  border: 'none',
                  width: '40px',
                  height: '400px',
                  maxHeight: '40px',
                  borderRadius: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .spinning { animation: spin 2s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </>
  );
}
