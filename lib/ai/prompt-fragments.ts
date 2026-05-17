/**
 * Shared prompt fragments — the "blueprint" that every PRISM analyzer
 * (GWI, Keyword Planner, generic tabular, social listening, PPTX) should
 * inject into its Gemini prompt.
 *
 * Why this exists: before this module, only the GWI path had the McKinsey
 * pyramid + storytelling discipline baked into its prompt. The other paths
 * had thin prompts and produced inconsistent voice + no Executive Summary
 * on the frontend. Now every path imports these constants so the output
 * voice is identical regardless of data source.
 *
 * Source of truth for the rules:
 *   .claude/skills/gwi-insight-strategist/SKILL.md (storytelling discipline)
 *   .claude/skills/keyword-strategist/SKILL.md     (3-lens curation)
 *
 * If you change the wording here, update those skill files in the same PR.
 */

/* ───────────────────────────────────────────────────────────────────────────
 * STORYTELLING DISCIPLINE — voice rules
 *
 * McKinsey pyramid principle (lead with the answer) + creative storytelling
 * (tension hinge, human moment, India imagery). Goes into every analyzer's
 * card-generation prompt.
 * ─────────────────────────────────────────────────────────────────────────── */
export const STORYTELLING_DISCIPLINE = `━━ McKINSEY-STYLE DISCIPLINE — pyramid principle ━━
Lead with the answer, then the evidence. The Title IS the answer. The Observation supports it. The Recommendation is the action.
• Cut throat-clearing. No "interestingly", "notably", "it is important to note", "the data shows that".
• Every number earns its place. Pick the strongest signal. Drop the rest.
• Short, declarative sentences. No corporate hedging ("could possibly", "may suggest").
• Brevity is non-negotiable.

━━ STORYTELLING DISCIPLINE — voice ━━
Write like a strategist describing the audience to a creative director, not a researcher reading the table.
• Title uses a TENSION hinge (but / yet / still / not / more than / despite) OR a specific image.
  ✓ "She trusts WhatsApp forwards more than brand ads"
  ✓ "Buys new tech early but blocks every ad she sees"
  ✓ "Reels at 11pm beat prime-time TV two-to-one"
  ✗ "Audience shows strong online discovery behaviour" (data readout, no story)
  ✗ "Female 2 is 10.2 points more likely to block ads" (label readout, no hook)
• Observation opens with a HUMAN moment or the punchline, not "The data shows" or "[Label] demonstrates".
  One concrete image (kitchen, WhatsApp group, evening tea, music videos at 11pm, Blinkit run,
  saas-bahu prime time, regional Reels) when the data supports it.
• India-specific imagery when relevant: pressure cookers, evening tea, WhatsApp groups, monthly
  grocery runs, festive shopping, Tier 1/2/3 metros as real places, regional language content.
• Banned openers: "Interestingly,", "Notably,", "It is important to note,", "The data shows that",
  "[Label] demonstrates / engages / shows…".
• Banned words: leverage, engage, ecosystem, diversify, amplify, drive engagement, build presence,
  over-index, cohort, synergy, touchpoint, whitespace, holistic, robust, utilize, paradigm,
  seamless, momentum, tailspin, dominance, volatility, multiplier, capitalise.
• Use specific verbs and concrete nouns: shoppers, families, viewers, buyers, "1 in 3", "nearly
  twice", "here's the thing", "the catch", "the wrinkle".`;

/* ───────────────────────────────────────────────────────────────────────────
 * THREE-LENS RUBRIC — audience-first card curation
 *
 * Every card serves one of three audiences. Used by the keyword path today;
 * being rolled out to generic-tabular and social-listening so every output
 * is balanced across creative / media / category.
 * ─────────────────────────────────────────────────────────────────────────── */
export const THREE_LENS_RUBRIC = `━━ THREE LENSES — MANDATORY ━━
Every card must serve ONE of three audiences. Each card carries a \`lens\` field.

1. CREATIVE LENS — for creative directors, copywriters, content strategists.
   What makes a card "creative"? It reveals what to SAY in ads, copy, content:
   • Intent, searcher language, theme clusters → creative angles
   • Questions → content briefs (what to write about)
   • Comparator pairs (X vs Y) → narrative angles
   • N-grams, exact phrases → ad copy language
   • Pain-point keywords / topics → ad hooks
   • Cultural and lifestyle attitudes → creative tone
   Always answer: "what should the creative SAY based on what people are doing / searching / saying?"

2. MEDIA LENS — for media planners, PPC/SEO leads, performance teams.
   What makes a card "media"? It reveals where to SPEND and HOW to bid/place:
   • Volume Pareto, top-N concentration → budget priorities
   • Competition × Cost quadrants → quick wins, battlegrounds, easy long-tail, premium
   • Channel mix, platform share → media allocation
   • Match-type strategy, negatives → campaign structure
   • Funnel mapping (TOFU / MOFU / BOFU) → funnel investment
   • Audience reach + frequency signals → buy plans
   Always answer: "where should media dollars go and how should we structure campaigns?"

3. CATEGORY LENS — for brand managers, category strategists, CMOs.
   What makes a card "category"? It reveals competitive landscape + market shape:
   • Brand SOV — own brand vs competitors
   • Competitor-steal opportunities
   • YoY trend winners / losers across the category
   • Seasonality patterns and category momentum
   • Price-sensitivity signals
   • Volume / mind-share concentration → who owns the category
   Always answer: "what's happening in this category and where does the brand sit?"`;

/* ───────────────────────────────────────────────────────────────────────────
 * ANTI-HALLUCINATION — the universal rule
 * ─────────────────────────────────────────────────────────────────────────── */
export const ANTI_HALLUCINATION = `━━ ANTI-HALLUCINATION ━━
Every number, percentage, ratio, keyword, brand or stat in your output MUST come verbatim from the
sample data above (or be a simple plain-English translation: "1.83×" → "nearly twice").
Do NOT invent platforms, brands, segments, benchmarks, or behaviours not visible in the data.
If you can't compute it from the data, leave it out — a missing card is better than a fabricated one.`;

/* ───────────────────────────────────────────────────────────────────────────
 * BRIEF BLOCK — wraps the client brief if provided
 * ─────────────────────────────────────────────────────────────────────────── */
export function briefBlock(briefContext: string): string {
  if (!briefContext) return '';
  return `
━━ CLIENT BRIEF — READ BEFORE WRITING ANY CARD ━━
${briefContext}
RELEVANCE RULE: Every observation and recommendation must serve this brief's objective. Cite the
brand by name where relevant. Skip data signals with no bearing on this brand or category.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

/* ───────────────────────────────────────────────────────────────────────────
 * CONVICTION GRADING — strict 0-100 self-score for frontend curation
 * ─────────────────────────────────────────────────────────────────────────── */
export const CONVICTION_GRADING = `━━ CONVICTION SCORE — STRICT ━━
Score every card 0-100 on \`conviction\`. This is how confident you are the insight is REAL and ACTIONABLE.
• 90-100: huge dataset support, unambiguous pattern, clear action.
• 75-89:  solid pattern, action is clear with caveats.
• 60-74:  pattern is real but action requires more investigation.
• below 60: skip the card entirely; don't include it.
Be honest. The frontend sorts by conviction — low scores get hidden from the default view.`;
