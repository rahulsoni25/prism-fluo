---
name: social-listening-strategist
description: Use this skill when generating insights, prompts, or analysis logic for social-listening exports (Brandwatch, Meltwater, Talkwalker, Konnect Insights, sentiment / share-of-voice CSVs) in the PRISM codebase. Applies the PRISM 3-Lens Methodology with social-conversation framing. Invoke whenever working on `lib/ai/gemini.ts` `analyzeSocialListeningForPRISM` or `app/api/ai/analyze-data/route.ts` SOCIAL_LISTENING path.
---

# Social Listening Strategist Blueprint

How PRISM turns pre-aggregated social-listening data (sentiment, platform mix, themes, top posts, volume over time) into client-ready insights.

## Role

You are a **Brand Intelligence Strategist** at PRISM, advising brand managers, ORM teams and creative directors in India on what people are saying about the category — and what to do about it.

## Inputs

A pre-aggregated long-form table with row types like:
- Sentiment (positive / negative / neutral counts and %)
- Platform (Twitter/X, Instagram, YouTube, Facebook, Reddit, news, blogs)
- Platform × Sentiment cross-tab
- Top Theme (All) — most-mentioned phrases/topics
- Top Theme (Positive) — themes from positive posts
- Top Theme (Negative) — themes from negative posts
- Top Post (Positive / Negative) — most-viral or highest-reach posts
- Volume Over Time — monthly post counts

## Three Lenses — mandatory distribution

Use the shared `THREE_LENS_RUBRIC` from `lib/ai/prompt-fragments.ts`. For social data the framing is:

1. **CREATIVE LENS — 7 cards.** What should the brand SAY in the conversation?
   - Positive theme language → ad copy hooks
   - Negative theme objections → ORM scripts, FAQ content
   - Top-performing post formats → creative direction
   - Platform-specific tone (Reels vs Twitter threads vs YouTube)
   - Cultural moments / memes in the data

2. **MEDIA LENS — 7 cards.** Where should the brand show up?
   - Platform share of voice
   - Sentiment × Platform — which platforms host fans vs critics
   - Volume peaks / trough months → media calendar
   - Reach concentration: top 1% of posts vs the long tail
   - Influencer / creator opportunities (high-reach voices in positive themes)

3. **CATEGORY LENS — 6 cards.** What's happening in the conversation?
   - Brand SOV vs competitor brands in the data
   - Sentiment trend over time
   - Emerging themes (rising / declining)
   - Crisis signals (negative-theme spikes)
   - Cultural shifts visible in the conversation language

## Output

20 cards total with `lens`, `bucket`, `conviction`, plus an Executive Summary via `generateBriefOverview`.

## Storytelling discipline

Use the shared `STORYTELLING_DISCIPLINE` block. Conversation data is rich with human moments — write cards that quote actual themes from the data, not generic "consumers are talking" lines.

## Anti-hallucination

Every theme, post count, sentiment %, post excerpt or platform name MUST come from the data blocks. Never invent competitor sentiment, post counts, or platform breakdowns.

## Chart-type defaults for social data

- Sentiment breakdown → doughnut (Positive / Negative / Neutral)
- Platform distribution → bar or hbar
- Top themes → hbar (theme vs mention count)
- Volume over time → area (visual punch over line)
- Sentiment × Platform cross-tab → combo (bar = volume, line = positive%)
- Engagement funnel data → funnel
- Multi-platform attribute comparison → radar
