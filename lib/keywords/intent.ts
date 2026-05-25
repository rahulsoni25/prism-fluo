/**
 * lib/keywords/intent.ts
 *
 * Deterministic 4-way keyword-intent classifier. Used by the
 * KeywordIntent nugget to break a brief's keywords into:
 *
 *   • brand-led      — query contains the brief's own brand OR a listed
 *                      competitor. Strongest commercial signal.
 *   • transactional  — buy/order/price/best/cheap/discount/online/etc.
 *                      User is ready to act.
 *   • informational  — how/what/why/guide/tips/vs/which/comparison.
 *                      User is researching.
 *   • category       — fallback: generic category term with no clear
 *                      transactional or informational signal.
 *
 * Rule order matters: brand-led wins over everything (a "buy sargam"
 * search is brand-led, not transactional, because the brand intent is
 * the more useful classification).
 *
 * Then transactional > informational > category in fallback order.
 */

export type KeywordIntent = 'brand-led' | 'transactional' | 'informational' | 'category';

const TRANSACTIONAL_TOKENS = [
  // Commerce verbs
  'buy', 'order', 'shop', 'purchase', 'subscribe',
  // Price markers
  'price', 'cost', 'cheap', 'cheapest', 'discount', 'deal', 'offer',
  'sale', 'coupon', 'voucher', 'under', 'below',
  // Best / superlative (commercial intent)
  'best', 'top', 'top rated', 'top-rated', 'highest rated',
  // Channel intent
  'online', 'amazon', 'flipkart', 'meesho', 'jiomart', 'blinkit',
  'near me', 'nearby', 'store', 'shop near', 'home delivery', 'delivery',
  // Trial/sample intent
  'sample', 'trial', 'free trial', 'free shipping',
  // Reviews are pre-purchase commercial
  'review', 'reviews', 'rating', 'ratings', 'feedback',
];

const INFORMATIONAL_TOKENS = [
  // Question markers
  'how', 'what', 'why', 'when', 'where', 'which', 'who',
  // Research markers
  'guide', 'tips', 'tutorial', 'learn', 'meaning', 'definition',
  'recipe', 'ingredients', 'instructions', 'manual',
  // Comparison (informational)
  ' vs ', 'versus', 'difference between', 'compare',
  // Health/symptom (often informational for FMCG)
  'symptoms', 'causes', 'treatment', 'remedy', 'remedies',
  // Listicle markers
  'ways to', 'list of', 'types of', 'examples of',
];

/** Strip common GWI/Google export annotations from a keyword before matching. */
function normalise(s: string): string {
  return String(s || '').toLowerCase().trim();
}

/** Pull individual brand tokens from a free-text brief.competitors string
 *  ("Tide, Surf Excel; Wheel" → ["tide", "surf excel", "wheel"]). */
function tokenisedBrandList(s: string | null | undefined): string[] {
  if (!s) return [];
  return s.split(/[,;|/]+/)
    .map(t => normalise(t))
    .filter(t => t.length >= 2);
}

/** Word-boundary check that handles multi-word brands ("surf excel"). */
function containsBrand(text: string, brand: string): boolean {
  if (!brand) return false;
  const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}

export interface ClassifyIntentInput {
  keyword: string;
  briefBrand?: string | null;
  briefCompetitors?: string | null;
}

export function classifyIntent(input: ClassifyIntentInput): KeywordIntent {
  const kw = normalise(input.keyword);
  if (!kw) return 'category';

  // 1. Brand-led wins (brief brand OR competitors)
  const briefBrand = normalise(input.briefBrand ?? '');
  if (briefBrand && containsBrand(kw, briefBrand)) return 'brand-led';
  for (const comp of tokenisedBrandList(input.briefCompetitors)) {
    if (containsBrand(kw, comp)) return 'brand-led';
  }

  // 2. Question-opener informational — "which X is best", "how to buy",
  //    "what is the best" all START with research intent even when a
  //    transactional token appears later. Check question openers FIRST.
  const QUESTION_OPENERS = ['how', 'what', 'why', 'when', 'where', 'which', 'who'];
  const firstWord = kw.split(/\s+/)[0];
  if (QUESTION_OPENERS.includes(firstWord)) return 'informational';

  // 3. Transactional — commercial-action tokens. Use word boundaries so
  //    short tokens like "buy" don't match inside "buying" or "buyer".
  for (const t of TRANSACTIONAL_TOKENS) {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(kw)) return 'transactional';
  }

  // 4. Other informational tokens (non-question-opener): "guide", "tutorial",
  //    "vs", "versus", "difference between". Match with proper word boundary
  //    so "vs" doesn't match inside "vsync" or "tips" inside "tipsy".
  for (const t of INFORMATIONAL_TOKENS) {
    const trimmed = t.trim();
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(kw)) return 'informational';
  }

  // 4. Fallback — generic category term
  return 'category';
}

export const INTENT_LABEL: Record<KeywordIntent, string> = {
  'brand-led':     'Brand-led',
  'transactional': 'Transactional',
  'informational': 'Informational',
  'category':      'Category',
};

export const INTENT_COLOR: Record<KeywordIntent, string> = {
  'brand-led':     '#7C3AED',  // purple — brand signal
  'transactional': '#059669',  // green — money
  'informational': '#2563EB',  // blue — research
  'category':      '#94A3B8',  // grey — fallback
};
