/**
 * Professional PPTX Template Definitions
 * 7 enterprise-ready presentation styles with complete slide structures
 */

import { COLOR_PALETTES, SPACING, SLIDE, TEXT_STYLES, FONT_SIZES } from './styles';

export interface TemplateLayout {
  templateId: string;
  name: string;
  description: string;
  slides: SlideTemplate[];
  colors: typeof COLOR_PALETTES.executive;
  audience: string;
}

export interface SlideTemplate {
  type: 'title' | 'content' | 'two-column' | 'observations' | 'recommendations' | 'conclusion';
  layout: string;
  sections: SlideSection[];
}

export interface SlideSection {
  type: 'heading' | 'text' | 'bullets' | 'numbers' | 'spacer';
  content?: string;
  style?: string;
  size?: 'large' | 'medium' | 'small';
}

export const TEMPLATE_LAYOUTS: Record<string, TemplateLayout> = {
  executive_briefing: {
    templateId: 'executive_briefing',
    name: 'Executive Briefing',
    description: 'Concise C-level overview. Perfect for board meetings and executive reports.',
    audience: 'C-suite, Board Members',
    colors: COLOR_PALETTES.executive,
    slides: [
      // Slide 1: Title Slide
      {
        type: 'title',
        layout: 'centered-headline',
        sections: [
          { type: 'heading', content: '{{headline}}', style: 'title-main' },
          { type: 'spacer' },
          { type: 'text', content: '{{briefName}}', style: 'subtitle' },
          { type: 'spacer' },
          { type: 'text', content: '{{date}}', style: 'caption-muted' },
        ],
      },
      // Slide 2: Objective & Key Metrics
      {
        type: 'two-column',
        layout: 'objective-metrics',
        sections: [
          {
            type: 'heading',
            content: 'STRATEGIC OBJECTIVE',
            style: 'section-heading',
          },
          { type: 'text', content: '{{objective}}', style: 'body' },
          { type: 'spacer' },
          {
            type: 'heading',
            content: 'KEY METRICS',
            style: 'section-heading',
          },
          { type: 'text', content: '{{firstMetric}}', style: 'metric-highlight' },
        ],
      },
      // Slide 3: Observations
      {
        type: 'observations',
        layout: 'observations',
        sections: [
          {
            type: 'heading',
            content: 'KEY OBSERVATIONS',
            style: 'section-heading',
          },
          {
            type: 'numbers',
            content: '{{observations}}',
            style: 'numbered-list',
          },
        ],
      },
      // Slide 4: Recommendations
      {
        type: 'recommendations',
        layout: 'recommendations',
        sections: [
          {
            type: 'heading',
            content: 'STRATEGIC RECOMMENDATIONS',
            style: 'section-heading',
          },
          {
            type: 'numbers',
            content: '{{recommendations}}',
            style: 'numbered-list',
          },
        ],
      },
      // Slide 5: Closing
      {
        type: 'conclusion',
        layout: 'closing',
        sections: [
          { type: 'heading', content: 'Next Steps', style: 'title-closing' },
          { type: 'spacer' },
          {
            type: 'text',
            content: '{{firstRecommendation}}',
            style: 'body-large',
          },
        ],
      },
    ],
  },

  client_pitch: {
    templateId: 'client_pitch',
    name: 'Client Pitch Deck',
    description: 'Sales and marketing focused. Great for presenting to prospects and clients.',
    audience: 'Prospects, Clients, Partners',
    colors: COLOR_PALETTES.sales,
    slides: [
      // Title with hero style
      {
        type: 'title',
        layout: 'hero-pitch',
        sections: [
          { type: 'heading', content: '{{headline}}', style: 'title-hero' },
          { type: 'spacer' },
          { type: 'text', content: 'Insights for {{briefName}}', style: 'subtitle-sales' },
        ],
      },
      // The Opportunity
      {
        type: 'content',
        layout: 'statement-bold',
        sections: [
          {
            type: 'heading',
            content: 'THE OPPORTUNITY',
            style: 'section-heading-accent',
          },
          { type: 'spacer' },
          { type: 'text', content: '{{objective}}', style: 'body-statement' },
        ],
      },
      // What We Found
      {
        type: 'observations',
        layout: 'findings',
        sections: [
          {
            type: 'heading',
            content: 'WHAT WE FOUND',
            style: 'section-heading',
          },
          { type: 'numbers', content: '{{observations}}', style: 'bullet-list' },
        ],
      },
      // Impact
      {
        type: 'content',
        layout: 'impact',
        sections: [
          {
            type: 'heading',
            content: 'IMPACT & METRICS',
            style: 'section-heading',
          },
          { type: 'text', content: '{{metrics}}', style: 'metric-highlight' },
        ],
      },
      // What You Should Do
      {
        type: 'recommendations',
        layout: 'action-items',
        sections: [
          {
            type: 'heading',
            content: 'WHAT YOU SHOULD DO',
            style: 'section-heading',
          },
          { type: 'numbers', content: '{{recommendations}}', style: 'bullet-list' },
        ],
      },
      // Call to Action
      {
        type: 'conclusion',
        layout: 'cta',
        sections: [
          { type: 'heading', content: 'Ready to Act?', style: 'title-cta' },
          { type: 'spacer' },
          { type: 'text', content: 'Let\'s discuss the next steps', style: 'body-large' },
        ],
      },
    ],
  },

  deep_dive: {
    templateId: 'deep_dive',
    name: 'Deep Dive Analysis',
    description: 'Detailed exploration. For comprehensive research presentations.',
    audience: 'Analysts, Researchers, Teams',
    colors: COLOR_PALETTES.research,
    slides: [
      // Title
      {
        type: 'title',
        layout: 'research-title',
        sections: [
          { type: 'text', content: '{{briefName}} Research Analysis', style: 'subtitle' },
          { type: 'spacer' },
          { type: 'heading', content: '{{headline}}', style: 'title-main' },
        ],
      },
      // Objective & Methodology
      {
        type: 'two-column',
        layout: 'research-overview',
        sections: [
          {
            type: 'heading',
            content: 'RESEARCH OBJECTIVE',
            style: 'section-heading',
          },
          { type: 'text', content: '{{objective}}', style: 'body' },
          { type: 'spacer' },
          {
            type: 'heading',
            content: 'METHODOLOGY',
            style: 'section-heading',
          },
          {
            type: 'text',
            content: 'Data-driven analysis from 7 platforms and sources',
            style: 'body',
          },
        ],
      },
      // Detailed Findings
      {
        type: 'observations',
        layout: 'detailed-findings',
        sections: [
          {
            type: 'heading',
            content: 'KEY FINDINGS',
            style: 'section-heading',
          },
          { type: 'numbers', content: '{{observations}}', style: 'numbered-list' },
          {
            type: 'text',
            content: 'Each finding backed by market data and consumer insights',
            style: 'caption',
          },
        ],
      },
      // Trend Analysis
      {
        type: 'content',
        layout: 'trends',
        sections: [
          {
            type: 'heading',
            content: 'TREND ANALYSIS',
            style: 'section-heading',
          },
          { type: 'text', content: '{{trendData}}', style: 'body' },
        ],
      },
      // Strategic Implications
      {
        type: 'recommendations',
        layout: 'implications',
        sections: [
          {
            type: 'heading',
            content: 'STRATEGIC IMPLICATIONS',
            style: 'section-heading',
          },
          { type: 'numbers', content: '{{recommendations}}', style: 'numbered-list' },
        ],
      },
      // Conclusion
      {
        type: 'conclusion',
        layout: 'research-conclusion',
        sections: [
          { type: 'heading', content: 'CONCLUSION', style: 'section-heading' },
          { type: 'spacer' },
          {
            type: 'text',
            content:
              'Based on {{obsCount}} key findings, we recommend focusing on the top 3 priority actions.',
            style: 'body-large',
          },
        ],
      },
    ],
  },

  board_presentation: {
    templateId: 'board_presentation',
    name: 'Board Presentation',
    description: 'Formal governance style. For board meetings and investor updates.',
    audience: 'Board Members, Investors',
    colors: COLOR_PALETTES.governance,
    slides: [
      // Formal Title
      {
        type: 'title',
        layout: 'formal-title',
        sections: [
          { type: 'text', content: 'BOARD PRESENTATION', style: 'caption-accent' },
          { type: 'spacer' },
          {
            type: 'heading',
            content: '{{briefName}} Analysis Report',
            style: 'title-main',
          },
          { type: 'text', content: '{{date}}', style: 'caption-muted' },
        ],
      },
      // Executive Summary
      {
        type: 'content',
        layout: 'executive-summary',
        sections: [
          {
            type: 'heading',
            content: 'EXECUTIVE SUMMARY',
            style: 'section-heading',
          },
          { type: 'spacer' },
          { type: 'heading', content: '{{headline}}', style: 'subheading' },
          { type: 'text', content: 'Objective: {{objective}}', style: 'body' },
        ],
      },
      // Key Findings
      {
        type: 'observations',
        layout: 'key-findings',
        sections: [
          {
            type: 'heading',
            content: 'KEY FINDINGS',
            style: 'section-heading',
          },
          { type: 'numbers', content: '{{observations}}', style: 'numbered-list' },
        ],
      },
      // Performance Metrics
      {
        type: 'content',
        layout: 'metrics',
        sections: [
          {
            type: 'heading',
            content: 'PERFORMANCE METRICS',
            style: 'section-heading',
          },
          { type: 'text', content: '{{metrics}}', style: 'metric-highlight' },
        ],
      },
      // Recommendations
      {
        type: 'recommendations',
        layout: 'board-recommendations',
        sections: [
          {
            type: 'heading',
            content: 'RECOMMENDATIONS FOR BOARD CONSIDERATION',
            style: 'section-heading',
          },
          { type: 'numbers', content: '{{recommendations}}', style: 'numbered-list' },
        ],
      },
      // Risk Assessment
      {
        type: 'conclusion',
        layout: 'risk',
        sections: [
          {
            type: 'heading',
            content: 'RISK ASSESSMENT',
            style: 'section-heading',
          },
          {
            type: 'text',
            content: 'Continued monitoring and proactive management recommended',
            style: 'body',
          },
        ],
      },
    ],
  },

  team_update: {
    templateId: 'team_update',
    name: 'Internal Team Update',
    description: 'Casual and collaborative. Perfect for team syncs.',
    audience: 'Internal Teams, Departments',
    colors: COLOR_PALETTES.internal,
    slides: [
      // Casual Title
      {
        type: 'title',
        layout: 'casual-hero',
        sections: [
          { type: 'heading', content: '{{headline}}', style: 'title-main' },
          { type: 'spacer' },
          {
            type: 'text',
            content: '{{briefName}} Insights',
            style: 'subtitle-casual',
          },
        ],
      },
      // What We Were Looking For
      {
        type: 'content',
        layout: 'conversational',
        sections: [
          {
            type: 'heading',
            content: 'WHAT WE WERE LOOKING FOR',
            style: 'section-heading',
          },
          { type: 'spacer' },
          { type: 'text', content: '{{objective}}', style: 'body-statement' },
        ],
      },
      // What We Learned
      {
        type: 'observations',
        layout: 'friendly',
        sections: [
          {
            type: 'heading',
            content: 'WHAT WE LEARNED',
            style: 'section-heading',
          },
          { type: 'numbers', content: '{{observations}}', style: 'bullet-list' },
        ],
      },
      // What We Should Do
      {
        type: 'recommendations',
        layout: 'discussion',
        sections: [
          {
            type: 'heading',
            content: 'WHAT WE SHOULD DO',
            style: 'section-heading',
          },
          { type: 'numbers', content: '{{recommendations}}', style: 'bullet-list' },
          {
            type: 'text',
            content: 'Let\'s discuss and align on priorities!',
            style: 'body-muted',
          },
        ],
      },
      // Next Steps
      {
        type: 'conclusion',
        layout: 'next-steps',
        sections: [
          { type: 'heading', content: 'Next Meeting', style: 'title-closing' },
          { type: 'spacer' },
          {
            type: 'text',
            content: 'Let\'s align on priorities and action items',
            style: 'body-large',
          },
        ],
      },
    ],
  },

  investor_update: {
    templateId: 'investor_update',
    name: 'Investor Update',
    description: 'Growth and metrics focused. For investors and stakeholders.',
    audience: 'Investors, Stakeholders',
    colors: COLOR_PALETTES.investor,
    slides: [
      // Hero Title
      {
        type: 'title',
        layout: 'investor-hero',
        sections: [
          {
            type: 'heading',
            content: '{{briefName}}',
            style: 'title-main',
          },
          {
            type: 'text',
            content: 'GROWTH & OPPORTUNITY ANALYSIS',
            style: 'subtitle-accent',
          },
          { type: 'spacer' },
          { type: 'text', content: '{{headline}}', style: 'subheading' },
        ],
      },
      // Strategic Focus
      {
        type: 'content',
        layout: 'statement',
        sections: [
          {
            type: 'heading',
            content: 'STRATEGIC FOCUS',
            style: 'section-heading',
          },
          { type: 'spacer' },
          { type: 'text', content: '{{objective}}', style: 'body-statement' },
        ],
      },
      // Market Opportunity
      {
        type: 'content',
        layout: 'growth-metrics',
        sections: [
          {
            type: 'heading',
            content: 'MARKET OPPORTUNITY',
            style: 'section-heading',
          },
          { type: 'text', content: '{{metrics}}', style: 'metric-highlight' },
          {
            type: 'text',
            content: 'Compound growth indicators',
            style: 'caption',
          },
        ],
      },
      // Market Insights
      {
        type: 'observations',
        layout: 'insights',
        sections: [
          {
            type: 'heading',
            content: 'MARKET INSIGHTS',
            style: 'section-heading',
          },
          { type: 'numbers', content: '{{observations}}', style: 'numbered-list' },
        ],
      },
      // Growth Levers
      {
        type: 'recommendations',
        layout: 'growth-levers',
        sections: [
          {
            type: 'heading',
            content: 'GROWTH LEVERS',
            style: 'section-heading',
          },
          { type: 'numbers', content: '{{recommendations}}', style: 'numbered-list' },
        ],
      },
      // Investment Thesis
      {
        type: 'conclusion',
        layout: 'investment-thesis',
        sections: [
          {
            type: 'heading',
            content: 'INVESTMENT OPPORTUNITY',
            style: 'title-cta',
          },
          { type: 'spacer' },
          {
            type: 'text',
            content: 'High-growth, data-backed strategy with clear execution path',
            style: 'body-large',
          },
        ],
      },
    ],
  },

  quick_overview: {
    templateId: 'quick_overview',
    name: 'Quick Overview',
    description: 'Snappy single-slide summary. For quick briefs and updates.',
    audience: 'Quick Reference, Status Updates',
    colors: COLOR_PALETTES.quick,
    slides: [
      // Single comprehensive slide
      {
        type: 'content',
        layout: 'summary-slide',
        sections: [
          {
            type: 'heading',
            content: '{{briefName}} — QUICK INSIGHTS',
            style: 'title-main',
          },
          { type: 'spacer' },
          {
            type: 'heading',
            content: 'HEADLINE',
            style: 'section-heading-small',
          },
          { type: 'text', content: '{{headline}}', style: 'body-bold' },
          { type: 'spacer' },
          {
            type: 'heading',
            content: 'OBJECTIVE',
            style: 'section-heading-small',
          },
          { type: 'text', content: '{{objective}}', style: 'body' },
          { type: 'spacer' },
          {
            type: 'heading',
            content: 'TOP 3 FINDINGS',
            style: 'section-heading-small',
          },
          { type: 'numbers', content: '{{topObservations}}', style: 'bullet-list' },
          { type: 'spacer' },
          {
            type: 'heading',
            content: 'NEXT STEP',
            style: 'section-heading-small',
          },
          {
            type: 'text',
            content: '{{primaryRecommendation}}',
            style: 'body-bold',
          },
        ],
      },
    ],
  },
};

export function getTemplate(templateId: string): TemplateLayout | undefined {
  return TEMPLATE_LAYOUTS[templateId];
}

export function listTemplates(): Array<{
  templateId: string;
  name: string;
  description: string;
  audience: string;
}> {
  return Object.values(TEMPLATE_LAYOUTS).map((t) => ({
    templateId: t.templateId,
    name: t.name,
    description: t.description,
    audience: t.audience,
  }));
}
