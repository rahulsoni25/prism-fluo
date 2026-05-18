---
name: ppt-review
description: Use this skill whenever a user uploads a .pptx file (or references one in docs/) and asks for a rating, review, critique, audit, QA, or feedback. Triggers on phrases like "rate this deck", "review this ppt", "what do you think of this presentation", "critique this", "audit this slide deck", "is this deck client-ready". Produces a grounded, defect-anchored review against a 10/10 client-ready bar using a 6-dimension scorecard, mandatory render-before-rating, and an honesty requirement that prevents grade inflation. Skip when the user asks to GENERATE a deck — this skill REVIEWS existing decks only.
---

# PRISM PPT Review & Critique Standard

A reusable protocol for evaluating any `.pptx` against a 10/10 client-ready bar.
Designed to prevent grade inflation, force visual inspection, and produce an
actionable fix list — not generic praise.

When this skill fires, follow the protocol exactly. Do not rate any deck
without completing every step in order.

## Step 1 — Extract and render (mandatory)

Before forming any opinion:

1. Extract the full text of every slide. Options:
   - `npx tsx scripts/test-ppt-generator.mts` for in-repo decks
   - For arbitrary uploads, use the `pptx` parsing already in `lib/pptx/parser.ts`
2. Render every slide to an image. Use the helper at `scripts/render_deck.sh`
   (wraps LibreOffice → PDF → pdftoppm → JPG). On Windows this requires
   LibreOffice installed; on macOS/Linux it's a one-liner.
3. View enough rendered slides to ground the visual assessment — at minimum:
   - Cover
   - Agenda
   - Two representative content slides
   - One section divider
   - One "so what" / summary slide
   - The closing slide
   For decks under 15 slides, view EVERY slide.

**Never rate from extracted text alone.** Layout defects, clipping, contrast
issues, and overflow are invisible in text extraction.

## Step 2 — Score against six dimensions

Score each dimension 1–10 with a one-line justification grounded in what you
observed:

1. **Structure & Flow** — clear framework, logical section sequencing,
   navigable agenda, consistent insight pattern across slides?
2. **Data Grounding** — every numeric claim has a visible source? Confidence
   scores defined? Specific data or vague generalisations?
3. **Insight Quality** — each insight answers a different strategic question,
   or do multiple slides make the same point with different framing? Sharp +
   specific, or generic?
4. **Recommendation Quality** — pass the 3-of-5 specificity test (specific
   channel, format, trigger, brand-proposition tie-in, success measure)? Or
   could they be lifted into a competitor's deck unchanged?
5. **Visual Design** — palette, typography hierarchy, layout consistency,
   chart presence on data slides, whitespace, design-motif consistency?
6. **Client-Readiness** — would this pass a senior strategist's review? Would
   a client notice anything as a defect within the first three slides?

**Compute overall** as:
- Weighted average (suggested weights: Structure 15% · Grounding 20% · Insight
  Quality 20% · Recommendations 20% · Visual 10% · Client-Readiness 15%), OR
- The minimum of all dimensions if any single dimension falls below 5/10
  (unshippable floor).

State which calculation was used.

## Step 3 — Run critical defect scan

Walk every slide and flag every instance of the following. These are NOT
subjective — they are objective defects. List slide numbers and exact quotes
where applicable.

### Truncation defects
- Sentences ending mid-word, mid-number, or mid-clause
- Numbers cut at the decimal point (`"+5."`, `"a 10."`, `"(+8."`)
- Ellipses (`"…"`) hiding data the reader needs
- Text overflowing its container or cut off at shape boundaries

### Leaked scaffolding
- References to `"(Slide N)"` from an upstream document
- Internal codenames the client wouldn't recognise
- Placeholder text (`"lorem"`, `"TODO"`, `"[insert]"`, `"xxxx"`)
- Project codenames, working-doc filenames, or internal taxonomy terms

### Grounding failures
- Statistics without a visible source tag
- Descriptors that imply uncalibrated certainty (`"infinite"`, `"guaranteed"`,
  `"every"`, `"always"`, `"unprecedented"`) without measurable backing
- Confidence scores present but undefined anywhere in the deck
- Claims of trends without a chart that visualises them on the same slide

### Visual defects
- Decorative shapes clipped at slide edges
- Elements bleeding off-canvas (unless full-bleed is an explicit design pattern)
- Text overlapping shapes or other text
- Low-contrast text (light on light, dark on dark)
- Icons or list items wrapping inconsistently across siblings in the same list
- Accent lines positioned for single-line titles when titles wrap to two lines
- Source footers colliding with content above
- Inconsistent margins or alignment across sibling slides

### Structural defects
- Sections with 1 insight sitting next to sections with 4+ (imbalance without
  justification)
- Three or more insights using the same data archetype with only the metric
  changed
- Recommendations that repeat across multiple "so what" slides
- Missing methodology slide when confidence scores or proprietary source tags
  appear

For each defect, name the specific slide and quote the specific text or
describe the specific visual issue. Do not say "some slides have truncation"
— say **"Slide 6: '+6.8 pts) and post about their own lives (+5.' — number
cut off."**

## Step 4 — Present the review

Structure the response in this order:

1. **Overall Rating** — single number out of 10, plus a one-sentence verdict
   that captures the deck's character (e.g. "Solid skeleton, leaky body" or
   "Strong data, weak narrative").
2. **Scorecard** — six dimensions in a table with score and one-line reasoning.
3. **Critical Issues** — every defect from Step 3, grouped by category, with
   slide numbers and quoted evidence. This is the section the user will act
   on — make it concrete and copy-pasteable.
4. **What's Working** — 3–5 specific things the deck does well, grounded in
   actual slides. Not generic praise — name the slide and what makes it work.
5. **Fix List** — prioritised action items the user can hand to a developer
   or designer. Order by impact: shippability blockers first, polish last.
6. **Grounding Disclaimer** — explicitly state what you could and could not
   verify. If the deck references upstream source files (Fluo exports, GWI
   tables, keyword-planner data) that aren't attached, say you couldn't verify
   the numbers against source and recommend a human reviewer spot-checks
   before the deck ships.

## Scoring anchors (to prevent grade inflation)

| Band | Meaning |
|---|---|
| **10/10** | Ships to a Fortune 500 client unchanged. Zero defects across all four defect categories. Every recommendation passes 3-of-5 specificity. Methodology fully documented. Visual design distinctive and consistent. |
| **8–9/10** | Ships after a single round of polish. Minor visual nits only. All numbers complete and sourced. Recommendations specific. No leaked scaffolding. |
| **6–7/10** | Solid foundation but needs a real revision pass. Some truncation, some generic recommendations, some visual defects, or some grounding gaps. Would not pass senior review without rework. |
| **4–5/10** | Structural skeleton is okay but execution issues are visible throughout. Multiple defect categories present. Client would notice defects in the first few slides. |
| **1–3/10** | Major rework required. Truncation everywhere, scaffolding leaked, recommendations interchangeable with any other brand's deck, or visual design unfinished. |

**Hard cap rule:** A deck cannot score 10/10 if a single critical defect is
present, regardless of how strong other dimensions are. Truncated numbers,
leaked scaffolding, and clipped visuals are shippability blockers — they cap
the maximum score at 7/10 until fixed.

## Honesty requirement

Do not soften the review to be polite. The user is using the rating to decide
what to fix before sending the deck to a client. A 6.5/10 deck rated 8/10
because the user worked hard on it is a deck that gets sent to the client with
defects intact — that damages the user's credibility, not yours.

If the deck is excellent, say 9/10 and explain why specifically. If it's
broken, say so plainly with evidence. Treat the user as a senior professional
who wants the truth, not encouragement. They asked for a rating because they
want to **improve** the deck — give them the rating that actually helps them
improve it.

Reasonable users prefer accurate feedback over inflated feedback. A senior
strategist would rather hear "this is a 6.5, here's why, here's the fix list"
than "this is great, just a few small things to tweak."

## What not to do

- ✗ Do not rate from extracted text alone. Always render and view.
- ✗ Do not list defects vaguely ("some truncation issues"). Quote the slide
  and text.
- ✗ Do not score every dimension 7–8 by default. Use the full range honestly.
- ✗ Do not invent issues that aren't in the deck to seem thorough.
- ✗ Do not invent strengths that aren't in the deck to seem encouraging.
- ✗ Do not skip the grounding disclaimer when source files are not attached.
- ✗ Do not give a 10/10 if any critical defect is present.
- ✗ Do not bury the fix list — it is the most actionable section of the review.

## How to invoke (for clarity)

This skill fires automatically when the user uploads a `.pptx` and asks for a
rating / review / audit. The user does NOT need to manually invoke it. If
firing manually, use `/ppt-review` followed by the deck path.

For decks generated by this codebase's `lib/pptx/generator.ts`, render via
`scripts/render_deck.sh docs/test-deck-<template>.pptx` and review the JPG
output.
