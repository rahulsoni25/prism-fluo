/**
 * Presentation Template Definitions
 * Pre-built templates for different deck styles
 */

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  slides: TemplateSlide[];
  style: {
    tone: string;
    colors: string[];
    audience: string;
  };
  previewText: string;
}

export interface TemplateSlide {
  type: 'title' | 'content' | 'bullets' | 'chart' | 'image' | 'closing';
  layout: string;
  content: string; // Template string with {{placeholders}}
}

export const PRESENTATION_TEMPLATES: Record<string, Template> = {
  // Template 1: Executive Briefing
  executive_briefing: {
    id: 'executive_briefing',
    name: 'Executive Briefing',
    description: 'Concise C-level overview. Perfect for board meetings and executive reports.',
    category: 'Executive',
    previewText: 'Clean, professional, focused on strategic outcomes',
    style: {
      tone: 'professional',
      colors: ['#1F2937', '#3B82F6', '#F3F4F6'],
      audience: 'C-suite, Board Members',
    },
    slides: [
      {
        type: 'title',
        layout: 'centered-headline',
        content: '{{headline}}\n\n{{briefName}}',
      },
      {
        type: 'content',
        layout: 'two-column',
        content: 'OBJECTIVE\n{{objective}}\n\nMETRICS\n{{firstMetric}}',
      },
      {
        type: 'bullets',
        layout: 'left-aligned',
        content: 'KEY OBSERVATIONS\n{{observations}}',
      },
      {
        type: 'bullets',
        layout: 'left-aligned',
        content: 'STRATEGIC RECOMMENDATIONS\n{{recommendations}}',
      },
      {
        type: 'closing',
        layout: 'centered',
        content: 'Next Steps\n{{firstRecommendation}}',
      },
    ],
  },

  // Template 2: Client Pitch Deck
  client_pitch: {
    id: 'client_pitch',
    name: 'Client Pitch Deck',
    description: 'Sales and marketing focused. Great for presenting to prospects and clients.',
    category: 'Sales',
    previewText: 'Engaging, visual, action-oriented',
    style: {
      tone: 'dynamic',
      colors: ['#059669', '#10B981', '#ECFDF5'],
      audience: 'Prospects, Clients, Partners',
    },
    slides: [
      {
        type: 'title',
        layout: 'hero-with-subtitle',
        content: '{{headline}}\n\nInsights for {{briefName}}',
      },
      {
        type: 'content',
        layout: 'statement',
        content: 'THE OPPORTUNITY\n{{objective}}',
      },
      {
        type: 'bullets',
        layout: 'numbered',
        content: 'WHAT WE FOUND\n{{observations}}',
      },
      {
        type: 'chart',
        layout: 'data-visual',
        content: 'IMPACT METRICS\n{{metrics}}',
      },
      {
        type: 'bullets',
        layout: 'action-items',
        content: 'WHAT YOU SHOULD DO\n{{recommendations}}',
      },
      {
        type: 'closing',
        layout: 'call-to-action',
        content: 'Ready to act?\n{{contactCTA}}',
      },
    ],
  },

  // Template 3: Deep Dive Analysis
  deep_dive: {
    id: 'deep_dive',
    name: 'Deep Dive Analysis',
    description: 'Detailed exploration. For comprehensive research presentations and reports.',
    category: 'Research',
    previewText: 'Thorough, data-rich, insightful',
    style: {
      tone: 'analytical',
      colors: ['#4F46E5', '#6366F1', '#EEF2FF'],
      audience: 'Analysts, Researchers, Teams',
    },
    slides: [
      {
        type: 'title',
        layout: 'research-title',
        content: '{{briefName}} Research Analysis\n\n{{headline}}',
      },
      {
        type: 'content',
        layout: 'research-overview',
        content: 'RESEARCH OBJECTIVE\n{{objective}}\n\nMETHODOLOGY\nData-driven analysis of market trends, consumer behavior, and competitive landscape',
      },
      {
        type: 'bullets',
        layout: 'detailed-bullets',
        content: 'FINDINGS\n{{observations}}\n\nEach finding backed by market data and consumer insights',
      },
      {
        type: 'chart',
        layout: 'multi-chart',
        content: 'TREND ANALYSIS\n{{trendData}}',
      },
      {
        type: 'bullets',
        layout: 'detailed-bullets',
        content: 'STRATEGIC IMPLICATIONS\n{{recommendations}}',
      },
      {
        type: 'content',
        layout: 'conclusion',
        content: 'CONCLUSION\n{{conclusionText}}',
      },
    ],
  },

  // Template 4: Board Presentation
  board_presentation: {
    id: 'board_presentation',
    name: 'Board Presentation',
    description: 'Formal governance style. For board meetings and investor updates.',
    category: 'Governance',
    previewText: 'Formal, comprehensive, decision-ready',
    style: {
      tone: 'formal',
      colors: ['#1E293B', '#475569', '#F1F5F9'],
      audience: 'Board Members, Investors',
    },
    slides: [
      {
        type: 'title',
        layout: 'formal-title',
        content: 'BOARD PRESENTATION\n\n{{briefName}} Analysis Report\n{{date}}',
      },
      {
        type: 'content',
        layout: 'executive-summary',
        content: 'EXECUTIVE SUMMARY\n\n{{headline}}\n\nObjective: {{objective}}',
      },
      {
        type: 'bullets',
        layout: 'formal-bullets',
        content: 'KEY FINDINGS\n{{observations}}',
      },
      {
        type: 'chart',
        layout: 'boardroom-chart',
        content: 'PERFORMANCE METRICS\n{{metrics}}',
      },
      {
        type: 'bullets',
        layout: 'formal-bullets',
        content: 'RECOMMENDATIONS FOR BOARD CONSIDERATION\n{{recommendations}}',
      },
      {
        type: 'content',
        layout: 'risk-assessment',
        content: 'RISK ASSESSMENT\nContinued monitoring recommended',
      },
    ],
  },

  // Template 5: Internal Team Update
  team_update: {
    id: 'team_update',
    name: 'Internal Team Update',
    description: 'Casual and collaborative. Perfect for team syncs and internal communications.',
    category: 'Internal',
    previewText: 'Friendly, collaborative, discussion-friendly',
    style: {
      tone: 'collaborative',
      colors: ['#7C3AED', '#A78BFA', '#F3E8FF'],
      audience: 'Internal Teams, Departments',
    },
    slides: [
      {
        type: 'title',
        layout: 'casual-hero',
        content: '{{briefName}} Insights\n\n{{headline}}',
      },
      {
        type: 'content',
        layout: 'conversational',
        content: 'WHAT WE WERE LOOKING FOR\n\n{{objective}}',
      },
      {
        type: 'bullets',
        layout: 'friendly-bullets',
        content: 'WHAT WE LEARNED\n{{observations}}',
      },
      {
        type: 'bullets',
        layout: 'discussion-items',
        content: 'WHAT WE SHOULD DO\n{{recommendations}}\n\nLet\'s discuss!',
      },
      {
        type: 'closing',
        layout: 'next-steps',
        content: 'NEXT MEETING\nLet\'s align on priorities',
      },
    ],
  },

  // Template 6: Investor Update
  investor_update: {
    id: 'investor_update',
    name: 'Investor Update',
    description: 'Growth and metrics focused. For investors and stakeholder briefings.',
    category: 'Investor',
    previewText: 'Growth-focused, metrics-heavy, opportunity-driven',
    style: {
      tone: 'growth-oriented',
      colors: ['#DC2626', '#EF4444', '#FEE2E2'],
      audience: 'Investors, Stakeholders',
    },
    slides: [
      {
        type: 'title',
        layout: 'investor-hero',
        content: '{{briefName}}\nGROWTH & OPPORTUNITY ANALYSIS\n\n{{headline}}',
      },
      {
        type: 'content',
        layout: 'statement',
        content: 'STRATEGIC FOCUS\n{{objective}}',
      },
      {
        type: 'chart',
        layout: 'growth-metrics',
        content: 'MARKET OPPORTUNITY\n{{metrics}}\nCompound growth indicators',
      },
      {
        type: 'bullets',
        layout: 'numbered',
        content: 'MARKET INSIGHTS\n{{observations}}',
      },
      {
        type: 'bullets',
        layout: 'action-items',
        content: 'GROWTH LEVERS\n{{recommendations}}',
      },
      {
        type: 'closing',
        layout: 'investment-thesis',
        content: 'INVESTMENT OPPORTUNITY\nHigh-growth, data-backed strategy',
      },
    ],
  },

  // Template 7: Quick Overview (1-page summary style)
  quick_overview: {
    id: 'quick_overview',
    name: 'Quick Overview',
    description: 'Snappy single-slide summary. For quick briefs and status updates.',
    category: 'Quick',
    previewText: 'Concise, visual, scannable',
    style: {
      tone: 'concise',
      colors: ['#F59E0B', '#FBBF24', '#FEF3C7'],
      audience: 'Quick Reference, Status Updates',
    },
    slides: [
      {
        type: 'title',
        layout: 'summary-slide',
        content: `{{briefName}} — QUICK INSIGHTS

HEADLINE: {{headline}}

OBJECTIVE: {{objective}}

TOP 3 FINDINGS:
{{topObservations}}

NEXT STEP: {{primaryRecommendation}}

Generated: {{date}}`,
      },
    ],
  },
};

export function getTemplate(templateId: string): Template | undefined {
  return PRESENTATION_TEMPLATES[templateId];
}

export function listTemplates(): Array<{
  id: string;
  name: string;
  description: string;
  category: string;
  audience: string;
}> {
  return Object.values(PRESENTATION_TEMPLATES).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
    audience: t.style.audience,
  }));
}
