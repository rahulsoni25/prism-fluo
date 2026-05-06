'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, MessageCircle, X } from 'lucide-react';

/**
 * InsightsCopilot Component
 * Provides AI-powered deeper insights on uploaded data using Grok API
 * Constrained to only answer based on the analysis data provided
 */
export default function InsightsCopilot({ analysisId, isOpen, onClose }) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hi! 👋 I\'m PRISM Fluo\'s Copilot. Ask me any questions about this analysis data. I\'ll provide deeper insights across the 4 pillars: Content, Commerce, Communication, and Culture.'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    // Add user message to chat
    const userMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      // Prepare conversation history for context
      const conversationHistory = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role,
          content: m.content
        }));

      // Call copilot API
      const response = await fetch('/api/copilot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          analysisId,
          question: input,
          conversationHistory
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to get response');
      }

      const { answer } = await response.json();

      // Add assistant response
      const assistantMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: answer
      };
      setMessages(prev => [...prev, assistantMessage]);

    } catch (err) {
      setError(err.message);
      // Add error message to chat
      const errorMessage = {
        id: (Date.now() + 2).toString(),
        role: 'assistant',
        content: `❌ Error: ${err.message}. Please try again.`
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end z-50">
      {/* Copilot Panel */}
      <div className="w-full md:w-96 h-screen md:h-[600px] md:rounded-lg md:mr-4 md:mb-4 bg-white flex flex-col shadow-2xl">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 rounded-t-lg md:rounded-t-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle size={20} />
            <div>
              <h2 className="font-bold">PRISM Copilot</h2>
              <p className="text-xs opacity-90">Deeper data insights powered by Grok</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="hover:bg-blue-800 p-1 rounded transition-colors"
            aria-label="Close copilot"
          >
            <X size={20} />
          </button>
        </div>

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-lg p-3 ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-none'
                    : 'bg-white text-gray-900 border border-gray-200 rounded-bl-none'
                }`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </p>
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white text-gray-900 border border-gray-200 rounded-lg rounded-bl-none p-3 flex items-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">Generating insight...</span>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Error Display */}
        {error && (
          <div className="mx-4 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Input Area */}
        <form
          onSubmit={handleSendMessage}
          className="border-t border-gray-200 p-4 bg-white rounded-b-lg md:rounded-b-lg flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask a question about this data..."
            disabled={isLoading}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white p-2 rounded-lg transition-colors flex items-center justify-center"
            aria-label="Send message"
          >
            {isLoading ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <Send size={20} />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
