/**
 * lib/presentations/template-rules.ts
 *
 * Per-template rule packs. The deck inspector loads the rule pack matching
 * the presentation's template_name and validates the deck against it.
 *
 * Adding a new template = adding an entry to TEMPLATE_RULES. Each pack
 * declares:
 *   • slide count range (min / max / ideal)
 *   • required slide types in order (title, exec summary, insight, …)
 *   • palette colours that MUST appear in chart fills
 *   • font-size bands per slide type (titles vs body)
 *   • whether charts are required
 *
 * Why per-template: an Executive Briefing with 3 slides is a defect, but
 * a Client Pitch with 3 slides is fine. Generic rules can't catch this.
 */

export interface TemplateRule {
  /** Match by presentation.template_name (case-insensitive, contains). */
  matches: string[];
  slideCount: { min: number; max: number; ideal: number };
  requireCharts: boolean;
  /** If true, the inspector flags high-conviction source insights that
   *  didn't get a slide. False for executive/short templates that
   *  intentionally summarise. */
  enforceComprehensive: boolean;
  /** Sequence of expected slide types — pattern-matched against slide
   *  text. If you have stricter requirements, list them in order. Use
   *  null to indicate "any slide type at this position". */
  expectedFlow: Array<'title' | 'summary' | 'insight' | 'data' | 'recommendation' | 'thanks' | null>;
  /** Hex colours (without #) that must appear in chart fills. Misses are
   *  reported as `palette-off-brand`. Order doesn't matter. */
  brandPalette: string[];
  /** Title font sizes in EMU/100 (PPTX `sz` attribute). E.g. 32–44pt for
   *  exec briefing title. Anything outside this range is flagged. */
  titleSizeRange: { min: number; max: number };
  /** Body font sizes range. */
  bodySizeRange:  { min: number; max: number };
}

export const TEMPLATE_RULES: TemplateRule[] = [
  // ── Executive Briefing — short, dense, brand-coloured ────────
  {
    matches: ['executive briefing', 'exec briefing'],
    slideCount: { min: 5, max: 22, ideal: 8 },
    requireCharts: true,
    enforceComprehensive: false,
    expectedFlow: ['title', 'summary', 'insight', 'insight', 'insight', 'recommendation'],
    brandPalette: ['2563EB', '7C3AED', '0F172A'],
    titleSizeRange: { min: 2800, max: 4800 },  // 28–48pt
    bodySizeRange:  { min: 1100, max: 1800 },
  },

  // ── Deep Dive — long-form, lots of charts ────────────────────
  {
    matches: ['deep dive', 'deep-dive'],
    slideCount: { min: 12, max: 40, ideal: 22 },
    requireCharts: true,
    enforceComprehensive: true,
    expectedFlow: ['title', 'summary', null, null, null, null, null, null, null, 'recommendation'],
    brandPalette: ['2563EB', '7C3AED', '0F172A', '14B8A6'],
    titleSizeRange: { min: 2400, max: 4000 },
    bodySizeRange:  { min: 1000, max: 1600 },
  },

  // ── Client Pitch — narrative, fewer charts, hero visuals ─────
  {
    matches: ['client pitch', 'pitch'],
    slideCount: { min: 6, max: 14, ideal: 10 },
    requireCharts: false,
    enforceComprehensive: false,
    expectedFlow: ['title', 'summary', 'insight', 'insight', 'recommendation', 'thanks'],
    brandPalette: ['1E1B4B', '2563EB', '7C3AED'],
    titleSizeRange: { min: 3200, max: 5400 },
    bodySizeRange:  { min: 1200, max: 2000 },
  },
];

/** Default fallback when the template isn't in the registry — generic
 *  sanity rules so we still apply something. */
export const DEFAULT_RULE: TemplateRule = {
  matches: ['*'],
  slideCount: { min: 3, max: 60, ideal: 12 },
  requireCharts: false,
  enforceComprehensive: false,
  expectedFlow: [],
  brandPalette: [],
  titleSizeRange: { min: 1800, max: 6000 },
  bodySizeRange:  { min: 800,  max: 2400 },
};

export function ruleFor(templateName: string | null | undefined): TemplateRule {
  if (!templateName) return DEFAULT_RULE;
  const lower = templateName.toLowerCase();
  for (const r of TEMPLATE_RULES) {
    if (r.matches.some(m => lower.includes(m))) return r;
  }
  return DEFAULT_RULE;
}

/** Classify a slide by its first text run. Cheap heuristic — good for ~85%
 *  of slides in our templates. */
export function classifySlide(firstText: string, allText: string[], slideIndex: number, total: number): TemplateRule['expectedFlow'][number] {
  const t = firstText.toLowerCase();
  const body = allText.slice(1).join(' ').toLowerCase();
  if (slideIndex === 0) return 'title';
  if (slideIndex === total - 1 && /thank|q&a|next steps?|contact/.test(t + body)) return 'thanks';
  if (/^(executive |key |strategic )?(summary|takeaways?|tl;dr|at a glance)/.test(t)) return 'summary';
  if (/recommend|next moves?|action|playbook|what we'll do/.test(t)) return 'recommendation';
  if (/insight|finding|observation/.test(t)) return 'insight';
  if (/data|chart|metric|breakdown|by (region|category|segment)/.test(t)) return 'data';
  // If the slide has a chart and looks like a body slide, call it 'insight'
  if (allText.length >= 2) return 'insight';
  return null;
}
