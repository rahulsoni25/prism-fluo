'use client';

import React, { useState, useEffect } from 'react';

const TEMPLATE_ICONS = {
  executive_briefing: '📊',
  client_pitch: '🎯',
  deep_dive: '🔍',
  board_presentation: '🏛️',
  team_update: '👥',
  investor_update: '💰',
  quick_overview: '⚡',
};

const TEMPLATE_COLORS = {
  Executive: 'from-blue-50 to-blue-100',
  Sales: 'from-green-50 to-green-100',
  Research: 'from-indigo-50 to-indigo-100',
  Governance: 'from-slate-50 to-slate-100',
  Internal: 'from-purple-50 to-purple-100',
  Investor: 'from-red-50 to-red-100',
  Quick: 'from-amber-50 to-amber-100',
};

export default function TemplateGallery({ onSelectTemplate, analysisId }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/templates');
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTemplate = async (template) => {
    setGenerating(true);
    try {
      const res = await fetch('/api/presentations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: template.id,
          analysisId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        onSelectTemplate(data);
      } else {
        alert('Failed to generate presentation. Please try again.');
      }
    } catch (error) {
      console.error('Error generating presentation:', error);
      alert('Error generating presentation');
    } finally {
      setGenerating(false);
    }
  };

  const categories = ['All', ...new Set(templates.map((t) => t.category))];
  const filteredTemplates =
    selectedCategory === 'All'
      ? templates
      : templates.filter((t) => t.category === selectedCategory);

  return (
    <div className="w-full max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-900 mb-2">
          Choose a Presentation Style
        </h2>
        <p className="text-slate-600">
          Select a template to auto-generate your presentation deck with all your analysis insights
        </p>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2 mb-8">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-2 rounded-full font-medium transition-all ${
              selectedCategory === cat
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-slate-600">Loading templates...</p>
        </div>
      )}

      {/* Template Grid */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className={`group bg-gradient-to-br ${
                TEMPLATE_COLORS[template.category] || TEMPLATE_COLORS.Quick
              } rounded-2xl p-6 cursor-pointer transition-all hover:shadow-xl hover:scale-105 border-2 border-transparent hover:border-blue-400`}
              onClick={() => handleSelectTemplate(template)}
            >
              {/* Icon */}
              <div className="text-5xl mb-4">
                {TEMPLATE_ICONS[template.id] || '📌'}
              </div>

              {/* Title */}
              <h3 className="text-xl font-bold text-slate-900 mb-2">
                {template.name}
              </h3>

              {/* Category Badge */}
              <div className="inline-block bg-white bg-opacity-60 px-3 py-1 rounded-full text-xs font-semibold text-slate-700 mb-3">
                {template.category}
              </div>

              {/* Description */}
              <p className="text-slate-700 text-sm mb-4">
                {template.description}
              </p>

              {/* Audience */}
              <div className="flex items-center text-xs text-slate-600 mb-4">
                <span className="inline-block">👥 {template.audience}</span>
              </div>

              {/* Preview Info */}
              <div className="pt-4 border-t border-slate-300 border-opacity-50">
                <p className="text-xs text-slate-600 italic">{template.previewText}</p>
              </div>

              {/* CTA */}
              <button
                disabled={generating}
                className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition-colors disabled:opacity-50 group-hover:shadow-lg"
              >
                {generating ? 'Generating...' : 'Use This Template'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredTemplates.length === 0 && (
        <div className="text-center py-12">
          <p className="text-slate-500 text-lg">No templates found in this category</p>
        </div>
      )}
    </div>
  );
}
