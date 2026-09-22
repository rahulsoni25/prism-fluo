# PRISM Learning Book

An illustrated, book-style edition of [`PRISM_LEARNING.md`](../../PRISM_LEARNING.md).

- `PRISM_LEARNING_BOOK.html` — the book. Self-contained (figures are inline SVG, fonts from Google Fonts with local fallbacks). Open it in a browser, or print it to A4 — it carries its own print stylesheet with one chapter per page break.
- `figures/*.svg` — every figure as a standalone SVG, plus the cover art.

## Regenerating

```bash
npm run book:build                 # HTML + SVGs
npm run book:pdf                   # also docs/book/PRISM_LEARNING_BOOK.pdf (needs playwright-core + Chromium)
node scripts/build-learning-book.mjs --check   # verify only, write nothing
```

The notes are the single source of truth. The build script (`scripts/build-learning-book.mjs`) renders the markdown as-is and injects figures as separate `<figure>` blocks at fixed anchor headings (`scripts/learning-book/figures-a.mjs`, `figures-b.mjs`). Before writing anything it checks that every text line of the notes is present in the output and that heading, table, code-block and blockquote counts match — so the text can never drift from the notes.

## Figures

| # | Anchor in the notes | What it shows |
|---|---|---|
| 1.1 | Platform Overview | The five-step user workflow |
| 2.1 | The Four PRISM Buckets | The four buckets |
| 2.2 | Bucket Assignment — Three-tier Priority | Rule → keyword → chart-type fall-through |
| 3.1 | 3-Tier AI Cascade Architecture | Both paths, three tiers, conviction per tier |
| 3.2 | 3-Tier AI Cascade Architecture | The 60-second Vercel timeline with and without `withTimeout()` |
| 4.1 | GWI Data Pipeline | Detect → build slots → batch → fallback |
| 4.2 | Step 3: Batch and Send to Gemini | 18 slots into 3 parallel batches |
| 5.1 | 5.1 GWI Slot Analysis Prompt | Slot → card anatomy and the allowed number translations |
| 5.2 | 5.3 Social Listening Prompt | Data block → chart-type glyphs |
| 6.1 | Insight Title Patterns | The A–F pattern picker |
| 7.1 | Auto-Analysis Fallback Logic | How `generateFallbackCards` assembles a card |
| 7.2 | Number Translation Functions | `pctToWords` and `indexToWords` rulers |
| 8.1 | Tool Detection | Route detection order |
| 8.2 | Stratified Sampling | Head-only vs stratified 120-row sample |
| 9.1 | Chart Generation Priority | The nine generators in priority order |
| 10.1 | Model Cascade | Sequential batches and the 7-model OpenRouter ladder |
| 11.1 | SLA Formula | SLA hours vs active briefs, 6-hour cap |
| 12.1 | Why No Smoke Test | Probe calls vs the 15 RPM quota |
| 12.2 | Why `Promise.allSettled` | `Promise.all` vs `Promise.allSettled` with one failed batch |
| 13.1 | Key Files Map | Layered map of the key files |
| 14.1 | Conviction Score System | Every conviction score on one scale |
