/**
 * Professional PPTX Generator
 * Generates enterprise-grade presentations using pptxgen-js
 */

import PptxGenJS from 'pptxgenjs';
import { getTemplate } from './templates';
import { COLOR_PALETTES, SPACING, SLIDE, TEXT_STYLES, FONT_SIZES, FONTS, getPalette } from './styles';

export interface PresentationData {
  templateId: string;
  briefName: string;
  headline: string;
  objective: string;
  observations: string[];
  recommendations: string[];
  date?: string;
}

/**
 * Generate a professional PPTX presentation
 */
export async function generatePresentation(data: PresentationData): Promise<Buffer> {
  const prs = new PptxGenJS();
  const template = getTemplate(data.templateId);

  if (!template) {
    throw new Error(`Template not found: ${data.templateId}`);
  }

  const palette = getPalette(data.templateId);

  // Set presentation properties
  prs.defineLayout({ name: 'BLANK', master: 'BLANK' });
  prs.defineLayout({ name: 'MASTER', master: 'MASTER' });

  // Set default font
  prs.defaultFontFace = FONTS.BODY;

  // Generate each slide
  template.slides.forEach((slideTemplate, slideIndex) => {
    const slide = prs.addSlide();

    // Add background color
    slide.background = { color: palette.background };

    // Add header line for non-title slides
    if (slideIndex > 0) {
      addHeaderLine(slide, palette);
    }

    // Render slide content based on type
    renderSlide(slide, slideTemplate, data, palette, slideIndex === 0);
  });

  // Return as buffer
  return new Promise((resolve, reject) => {
    prs.write({ outputType: 'arraybuffer' })
      .then((buffer: any) => {
        resolve(Buffer.from(buffer));
      })
      .catch((err: any) => {
        reject(err);
      });
  });
}

/**
 * Add a professional header line
 */
function addHeaderLine(slide: any, palette: any) {
  slide.addShape(slide.ShapeType.line, {
    x: SPACING.MARGIN_H,
    y: SPACING.MARGIN_V - 0.3,
    w: SLIDE.WIDTH - SPACING.MARGIN_H * 2,
    h: 0,
    line: { color: palette.secondary, width: 2 },
  });
}

/**
 * Render a slide based on its template
 */
function renderSlide(
  slide: any,
  slideTemplate: any,
  data: PresentationData,
  palette: any,
  isTitleSlide: boolean,
) {
  let currentY = isTitleSlide ? SLIDE.HEIGHT / 2 - 1.5 : SPACING.MARGIN_V + 0.4;

  slideTemplate.sections.forEach((section: any) => {
    const result = renderSection(
      slide,
      section,
      data,
      palette,
      SPACING.MARGIN_H,
      currentY,
      SLIDE.WIDTH - SPACING.MARGIN_H * 2,
    );
    currentY = result.nextY;
  });
}

/**
 * Render a section within a slide
 */
function renderSection(
  slide: any,
  section: any,
  data: PresentationData,
  palette: any,
  x: number,
  y: number,
  w: number,
): { nextY: number } {
  let nextY = y;

  // Replace placeholders in content
  let content = section.content || '';
  content = replacePlaceholders(content, data);

  switch (section.type) {
    case 'heading':
      nextY = renderHeading(slide, content, x, y, w, palette, section.style);
      break;
    case 'text':
      nextY = renderText(slide, content, x, y, w, palette, section.style);
      break;
    case 'bullets':
      nextY = renderBullets(slide, content, x, y, w, palette);
      break;
    case 'numbers':
      nextY = renderNumberedList(slide, content, x, y, w, palette);
      break;
    case 'spacer':
      nextY = y + 0.3;
      break;
  }

  return { nextY };
}

/**
 * Render a heading
 */
function renderHeading(
  slide: any,
  text: string,
  x: number,
  y: number,
  w: number,
  palette: any,
  style?: string,
): number {
  let fontSize = FONT_SIZES.HEADING;
  let color = palette.primary;
  let bold = true;

  if (style === 'title-main') {
    fontSize = FONT_SIZES.TITLE_MAIN;
    color = palette.text;
  } else if (style === 'subtitle') {
    fontSize = FONT_SIZES.SUBHEADING;
    color = palette.lightText;
    bold = false;
  } else if (style === 'title-hero') {
    fontSize = FONT_SIZES.TITLE_SLIDE;
    color = palette.primary;
  } else if (style === 'title-closing' || style === 'title-cta') {
    fontSize = FONT_SIZES.TITLE_SLIDE;
    color = palette.primary;
  } else if (style === 'section-heading' || style === 'section-heading-accent') {
    fontSize = FONT_SIZES.HEADING;
    color = palette.primary;
    bold = true;
  } else if (style === 'subheading') {
    fontSize = FONT_SIZES.SUBHEADING;
    color = palette.text;
  }

  const textOptions: any = {
    x,
    y,
    w,
    h: 1,
    fontSize,
    bold,
    color,
    fontFace: FONTS.TITLE,
    align: 'left',
    valign: 'top',
    wrap: true,
  };

  slide.addText(text, textOptions);

  return y + (fontSize / 72) * 1.5 + 0.2; // Rough height estimation
}

/**
 * Render body text
 */
function renderText(
  slide: any,
  text: string,
  x: number,
  y: number,
  w: number,
  palette: any,
  style?: string,
): number {
  let fontSize = FONT_SIZES.BODY;
  let color = palette.text;
  let bold = false;

  if (style === 'caption' || style === 'caption-muted') {
    fontSize = FONT_SIZES.CAPTION;
    color = palette.lightText;
  } else if (style === 'body-statement' || style === 'body-large' || style === 'body-bold') {
    fontSize = FONT_SIZES.BODY;
    color = palette.text;
    bold = style === 'body-bold';
  } else if (style === 'metric-highlight') {
    fontSize = FONT_SIZES.SUBHEADING;
    color = palette.primary;
    bold = true;
  } else if (style === 'subtitle-sales') {
    fontSize = FONT_SIZES.SUBHEADING;
    color = palette.primary;
  } else if (style === 'subtitle-casual') {
    fontSize = FONT_SIZES.SUBHEADING;
    color = palette.lightText;
  } else if (style === 'caption-accent') {
    fontSize = FONT_SIZES.CAPTION;
    color = palette.primary;
    bold = true;
  }

  const textOptions: any = {
    x,
    y,
    w,
    h: 3,
    fontSize,
    bold,
    color,
    fontFace: FONTS.BODY,
    align: 'left',
    valign: 'top',
    wrap: true,
  };

  slide.addText(text, textOptions);

  // Estimate height based on text length and font size
  const estimatedLines = Math.ceil((text.length / (w * 15)) + 1);
  return y + (fontSize / 72) * estimatedLines * 1.4 + 0.3;
}

/**
 * Render bullet points
 */
function renderBullets(
  slide: any,
  text: string,
  x: number,
  y: number,
  w: number,
  palette: any,
): number {
  const items = text.split('\n').filter((i) => i.trim());

  const bulletText = items.map((item) => ({
    text: item.trim(),
    options: {
      fontSize: FONT_SIZES.BODY,
      fontFace: FONTS.BODY,
      color: palette.text,
      bullet: true,
      indent: 0.3,
    },
  }));

  slide.addText(bulletText, {
    x,
    y,
    w,
    h: 4,
    align: 'left',
    valign: 'top',
  });

  return y + (FONT_SIZES.BODY / 72) * items.length * 1.8 + 0.4;
}

/**
 * Render numbered list
 */
function renderNumberedList(
  slide: any,
  text: string,
  x: number,
  y: number,
  w: number,
  palette: any,
): number {
  const items = text.split('\n').filter((i) => i.trim());

  const numberText = items.map((item, index) => ({
    text: item.trim(),
    options: {
      fontSize: FONT_SIZES.BODY,
      fontFace: FONTS.BODY,
      color: palette.text,
      bullet: `${index + 1}.`,
      indent: 0.3,
    },
  }));

  slide.addText(numberText, {
    x,
    y,
    w,
    h: 5,
    align: 'left',
    valign: 'top',
  });

  return y + (FONT_SIZES.BODY / 72) * items.length * 1.8 + 0.4;
}

/**
 * Replace template placeholders with actual data
 */
function replacePlaceholders(content: string, data: PresentationData): string {
  let result = content;

  result = result.replace('{{headline}}', data.headline);
  result = result.replace('{{briefName}}', data.briefName);
  result = result.replace('{{objective}}', data.objective);
  result = result.replace('{{date}}', data.date || new Date().toLocaleDateString());
  result = result.replace('{{obsCount}}', String(data.observations.length));

  // Observations
  result = result.replace('{{observations}}', data.observations.join('\n'));
  result = result.replace('{{topObservations}}', data.observations.slice(0, 3).join('\n'));
  result = result.replace('{{firstMetric}}', data.observations[0] || 'No data available');
  result = result.replace('{{trendData}}', data.observations.slice(0, 3).join(' • '));
  result = result.replace(
    '{{metrics}}',
    data.observations.filter((o) => /[\d%]/.test(o)).slice(0, 3).join(' • ') ||
      'Growth metrics from analysis',
  );

  // Recommendations
  result = result.replace('{{recommendations}}', data.recommendations.join('\n'));
  result = result.replace('{{primaryRecommendation}}', data.recommendations[0] || 'Review findings');
  result = result.replace('{{firstRecommendation}}', data.recommendations[0] || 'Next steps TBD');

  return result;
}
