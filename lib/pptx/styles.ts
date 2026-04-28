/**
 * PPTX Styling Constants & Utilities
 * Professional color schemes, typography, and layout guidelines
 */

export const FONTS = {
  TITLE: 'Arial',
  BODY: 'Calibri',
  ACCENT: 'Arial',
};

export const FONT_SIZES = {
  TITLE_MAIN: 54,
  TITLE_SLIDE: 44,
  HEADING: 32,
  SUBHEADING: 24,
  BODY: 14,
  CAPTION: 11,
  SMALL: 10,
};

// Color palettes for each template
export const COLOR_PALETTES = {
  executive: {
    primary: '1F2937',    // Dark slate
    secondary: '3B82F6',   // Blue
    accent: 'F3F4F6',      // Light gray
    text: '111827',        // Dark text
    lightText: '6B7280',   // Muted text
    background: 'FFFFFF', // White
  },
  sales: {
    primary: '059669',    // Green
    secondary: '10B981',   // Light green
    accent: 'ECFDF5',      // Very light green
    text: '111827',        // Dark text
    lightText: '6B7280',   // Muted text
    background: 'FFFFFF', // White
  },
  research: {
    primary: '4F46E5',    // Indigo
    secondary: '6366F1',   // Light indigo
    accent: 'EEF2FF',      // Very light indigo
    text: '111827',        // Dark text
    lightText: '6B7280',   // Muted text
    background: 'FFFFFF', // White
  },
  governance: {
    primary: '1E293B',    // Dark slate
    secondary: '475569',   // Medium slate
    accent: 'F1F5F9',      // Light slate
    text: '111827',        // Dark text
    lightText: '6B7280',   // Muted text
    background: 'FFFFFF', // White
  },
  internal: {
    primary: '7C3AED',    // Purple
    secondary: 'A78BFA',   // Light purple
    accent: 'F3E8FF',      // Very light purple
    text: '111827',        // Dark text
    lightText: '6B7280',   // Muted text
    background: 'FFFFFF', // White
  },
  investor: {
    primary: 'DC2626',    // Red
    secondary: 'EF4444',   // Light red
    accent: 'FEE2E2',      // Very light red
    text: '111827',        // Dark text
    lightText: '6B7280',   // Muted text
    background: 'FFFFFF', // White
  },
  quick: {
    primary: 'F59E0B',    // Amber
    secondary: 'FBBF24',   // Light amber
    accent: 'FEF3C7',      // Very light amber
    text: '111827',        // Dark text
    lightText: '6B7280',   // Muted text
    background: 'FFFFFF', // White
  },
};

// Standard spacing
export const SPACING = {
  MARGIN_H: 0.5,           // Horizontal margin (inches)
  MARGIN_V: 0.5,           // Vertical margin (inches)
  GUTTER: 0.3,             // Space between columns
  LINE_HEIGHT: 1.4,
};

// Slide dimensions
export const SLIDE = {
  WIDTH: 10,
  HEIGHT: 7.5,
};

// Reusable text styles
export const TEXT_STYLES = {
  title: {
    fontSize: FONT_SIZES.TITLE_MAIN,
    bold: true,
    color: '111827',
    fontFace: FONTS.TITLE,
    lineSpacing: 48,
  },
  heading: {
    fontSize: FONT_SIZES.HEADING,
    bold: true,
    color: '111827',
    fontFace: FONTS.TITLE,
  },
  subheading: {
    fontSize: FONT_SIZES.SUBHEADING,
    bold: true,
    color: '111827',
    fontFace: FONTS.ACCENT,
  },
  body: {
    fontSize: FONT_SIZES.BODY,
    color: '374151',
    fontFace: FONTS.BODY,
    lineSpacing: 18,
  },
  bodyMuted: {
    fontSize: FONT_SIZES.BODY,
    color: '6B7280',
    fontFace: FONTS.BODY,
  },
  caption: {
    fontSize: FONT_SIZES.CAPTION,
    color: '9CA3AF',
    fontFace: FONTS.BODY,
  },
};

/**
 * Get color palette for a template
 */
export function getPalette(templateId: string) {
  const key = templateId.replace('_', '') as keyof typeof COLOR_PALETTES;
  return COLOR_PALETTES[key] || COLOR_PALETTES.executive;
}

/**
 * Create a colored box background
 */
export function createColoredBox(
  slide: any,
  x: number,
  y: number,
  w: number,
  h: number,
  bgColor: string,
  opacity: number = 1,
) {
  slide.addShape(slide.ShapeType.rect, {
    x, y, w, h,
    fill: { color: bgColor, transparency: 100 - opacity * 100 },
    line: { type: 'solid', color: bgColor, width: 0 },
  });
}

/**
 * Add a divider line
 */
export function addDivider(
  slide: any,
  x: number,
  y: number,
  w: number,
  color: string = 'E5E7EB',
  thickness: number = 2,
) {
  slide.addShape(slide.ShapeType.line, {
    x, y, w, h: 0,
    line: { color, width: thickness },
  });
}

/**
 * Create a gradient background (simulated with overlays)
 */
export function addGradientBackground(
  slide: any,
  color1: string,
  color2: string,
) {
  // Gradient not directly supported, so use solid primary color
  // In professional use, could use color blending
  slide.background = { color: color1 };
}

/**
 * Format bullet points with proper styling
 */
export function formatBullets(items: string[]): Array<{
  text: string;
  options: any;
}> {
  return items.map((item) => ({
    text: item,
    options: {
      fontSize: FONT_SIZES.BODY,
      fontFace: FONTS.BODY,
      color: '374151',
      bullet: true,
      indent: 0.3,
    },
  }));
}

/**
 * Create a professional number list
 */
export function formatNumberedList(items: string[]): Array<{
  text: string;
  options: any;
}> {
  return items.map((item, index) => ({
    text: item,
    options: {
      fontSize: FONT_SIZES.BODY,
      fontFace: FONTS.BODY,
      color: '374151',
      bullet: `${index + 1}.`,
      indent: 0.3,
    },
  }));
}
