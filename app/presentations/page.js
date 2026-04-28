'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

const TEMPLATE_ICONS = {
  'Executive Briefing': '📊',
  'Client Pitch Deck': '🎯',
  'Deep Dive Analysis': '🔍',
  'Board Presentation': '🏛️',
  'Internal Team Update': '👥',
  'Investor Update': '💰',
  'Quick Overview': '⚡',
};

export default function PresentationsPage() {
  const [presentations, setPresentations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPresentations();
  }, []);

  const fetchPresentations = async () => {
    try {
      const res = await fetch('/api/presentations');
      if (res.ok) {
        const data = await res.json();
        setPresentations(data.presentations || []);
      }
    } catch (error) {
      console.error('Error fetching presentations:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <nav className="nav">
          <Link href="/dashboard" className="nav-brand">
            <div className="nav-prism-icon">P</div>
            <span className="nav-prism-text">PRISM</span>
          </Link>
          <div className="nav-links">
            <Link href="/dashboard" className="nav-link">My Briefs</Link>
            <Link href="/culture" className="nav-link">Culture</Link>
          </div>
        </nav>
      </div>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* Page Title */}
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">My Presentations</h1>
          <p className="text-slate-600">
            All your auto-generated presentation decks from analysis insights
          </p>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-slate-600">Loading presentations...</p>
          </div>
        )}

        {/* Presentations Grid */}
        {!loading && presentations.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {presentations.map((pres) => (
              <Link
                key={pres.id}
                href={`/presentations/${pres.id}`}
              >
                <div className="bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-shadow group cursor-pointer border border-slate-200">
                  {/* Header */}
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 border-b border-slate-200">
                    <div className="text-4xl mb-3">
                      {TEMPLATE_ICONS[pres.template_name] || '📌'}
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                      {pres.brief_name}
                    </h3>
                  </div>

                  {/* Content */}
                  <div className="p-6">
                    {/* Template Info */}
                    <div className="mb-4">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Template</p>
                      <p className="text-slate-700 font-medium">{pres.template_name}</p>
                    </div>

                    {/* Headline */}
                    <div className="mb-4">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Headline</p>
                      <p className="text-slate-700 text-sm line-clamp-2">{pres.headline}</p>
                    </div>

                    {/* Status */}
                    <div className="mb-4">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                        pres.status === 'generated'
                          ? 'bg-green-100 text-green-800'
                          : pres.status === 'generating'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {pres.status === 'generated' ? '✓ Ready' : pres.status === 'generating' ? 'Generating...' : 'Failed'}
                      </span>
                    </div>

                    {/* Date */}
                    <p className="text-xs text-slate-500">
                      {formatDate(pres.created_at)}
                    </p>
                  </div>

                  {/* Footer CTA */}
                  <div className="px-6 py-4 border-t border-slate-200 bg-slate-50">
                    <button className="w-full text-blue-600 hover:text-blue-700 font-semibold text-sm transition-colors">
                      View Presentation →
                    </button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && presentations.length === 0 && (
          <div className="text-center py-20 bg-white rounded-2xl border-2 border-dashed border-slate-300">
            <div className="text-6xl mb-4">🎨</div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">No Presentations Yet</h2>
            <p className="text-slate-600 mb-8">
              Generate your first presentation from an analysis to get started
            </p>
            <Link
              href="/insights"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors"
            >
              View Analyses
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
