/**
 * Presentation Deck Generator
 * Takes template + analysis data and generates Gamma presentation
 */

import { getTemplate, Template } from './definitions';

export interface AnalysisData {
  briefName: string;
  headline: string;
  objective: string;
  observations: string[];
  recommendations: string[];
  metrics?: Record<string, any>;
  toolLabel?: string;
  createdAt?: Date;
}

function extractMetrics(observations: string[]): string {
  // Extract numeric metrics from observations
  const metrics = observations
    .filter((obs) => /[\d+%×x]/.test(obs))
    .slice(0, 3)
    .join(' • ');
  return metrics || 'Insights generated from data analysis';
}

function formatObservationsList(observations: string[]): string {
  return observations.map((obs, i) => `${i + 1}. ${obs}`).join('\n\n');
}

function formatObservationsBullets(observations: string[]): string {
  return observations.map((obs) => `• ${obs}`).join('\n');
}

function formatRecommendationsList(recommendations: string[]): string {
  return recommendations.map((rec, i) => `${i + 1}. ${rec}`).join('\n\n');
}

function formatRecommendationsBullets(recommendations: string[]): string {
  return recommendations.map((rec) => `• ${rec}`).join('\n');
}

export function generateDeckContent(
  template: Template,
  data: AnalysisData,
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Build slide content by processing each template slide
  const slides: string[] = [];

  template.slides.forEach((slide, index) => {
    let content = slide.content;

    // Replace placeholders based on layout type
    if (slide.layout.includes('numbered')) {
      content = content.replace(
        '{{observations}}',
        formatObservationsList(data.observations),
      );
      content = content.replace(
        '{{recommendations}}',
        formatRecommendationsList(data.recommendations),
      );
    } else {
      content = content.replace(
        '{{observations}}',
        formatObservationsBullets(data.observations),
      );
      content = content.replace(
        '{{recommendations}}',
        formatRecommendationsBullets(data.recommendations),
      );
    }

    // General placeholders
    content = content.replace('{{headline}}', data.headline);
    content = content.replace('{{briefName}}', data.briefName);
    content = content.replace('{{objective}}', data.objective);
    content = content.replace('{{date}}', dateStr);

    // Metric placeholders
    content = content.replace('{{metrics}}', extractMetrics(data.observations));
    content = content.replace('{{trendData}}', extractMetrics(data.observations));
    content = content.replace('{{firstMetric}}', data.observations[0] || '');
    content = content
      .replace('{{topObservations}}', data.observations.slice(0, 3).join('\n'));

    // Recommendation placeholders
    content = content.replace(
      '{{primaryRecommendation}}',
      data.recommendations[0] || '',
    );
    content = content.replace(
      '{{firstRecommendation}}',
      data.recommendations[0] || '',
    );
    content = content.replace(
      '{{conclusionText}}',
      `Based on ${data.observations.length} key findings, we recommend focusing on the top ${Math.min(3, data.recommendations.length)} priority actions.`,
    );
    content = content.replace('{{contactCTA}}', 'Let\'s discuss the next steps');

    // Add slide separator (Gamma uses simple line breaks, we'll enhance formatting)
    if (index > 0) {
      slides.push('---\n'); // Slide separator
    }

    // Add slide title if it's a title slide
    if (slide.type === 'title') {
      slides.push(`# ${content.split('\n')[0]}\n`);
      slides.push(content.split('\n').slice(1).join('\n'));
    } else if (slide.type === 'content' || slide.type === 'bullets') {
      slides.push(content);
    } else {
      slides.push(content);
    }
  });

  return slides.join('\n\n');
}

export interface DeckGenerationRequest {
  templateId: string;
  analysisId: string;
  briefName: string;
  headline: string;
  objective: string;
  observations: string[];
  recommendations: string[];
}

export function validateDeckRequest(req: DeckGenerationRequest): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!req.templateId) errors.push('Template ID required');
  if (!req.analysisId) errors.push('Analysis ID required');
  if (!req.briefName) errors.push('Brief name required');
  if (!req.headline) errors.push('Headline required');
  if (!req.objective) errors.push('Objective required');
  if (!Array.isArray(req.observations) || req.observations.length === 0)
    errors.push('At least one observation required');
  if (!Array.isArray(req.recommendations) || req.recommendations.length === 0)
    errors.push('At least one recommendation required');

  // Validate template exists
  if (req.templateId && !getTemplate(req.templateId)) {
    errors.push('Template not found');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Prompt for Gamma to generate presentation from template content
 */
export function buildGammaPrompt(
  template: Template,
  deckContent: string,
  data: AnalysisData,
): string {
  return `Create a professional ${template.name} presentation deck with the following specifications:

**Audience**: ${template.style.audience}
**Tone**: ${template.style.tone}
**Color Scheme**: Use blues, purples, and grays for professional appearance

**Presentation Title**: ${data.briefName}

**Content Structure**:
${deckContent}

**Key Requirements**:
1. Each section should be a separate slide
2. Use the headline "${data.headline}" as the main message
3. Include the objective: "${data.objective}"
4. Present observations as concrete findings with metrics
5. Frame recommendations as actionable next steps with clear targets
6. Use professional charts/data visualizations where appropriate
7. Maintain consistent branding throughout
8. Include a conclusion slide that ties findings to business impact

**Style Notes**:
- Keep slides uncluttered with maximum 3-5 key points per slide
- Use data visualization for metrics
- Include one chart/visual every 2-3 slides
- Ensure text is readable (large enough font for audience)
- Professional, business-appropriate imagery
- Consistent color palette: ${template.style.colors.join(', ')}

Generate a compelling, insights-driven presentation that tells the complete story of this analysis.`;
}
