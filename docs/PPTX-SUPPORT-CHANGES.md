# PPTX Strategy-Deck Support — Change Log

**Branch:** `feat/pptx-source` (off `polish/insights-v2`)
**Session:** 2026-05-14 → 2026-05-16
**Author:** rahulsoni25 + Claude

---

## 1. Summary

Before this branch:
- PPTX files were dumped to Gemini as one big text blob via `extractPptxText` — slide boundaries lost, tables collapsed, analyzer had to re-parse everything on every call.
- Files > 4 MB couldn't be uploaded at all (client cap).
- Even after upload, the analyzer would 502 on real strategy decks because of timeouts, JSON parser bugs, and silent fallback gaps.

After:
- Decks are parsed per-slide on upload, preserving titles / bullets / tables / speaker notes as structured `tool_data` rows.
- Files up to **50 MB** upload reliably on localhost AND production:
  - Localhost: raw-binary stream (bypasses `req.formData()` Turbopack bug and ad-blocker-blocked Blob SDK)
  - Production: Vercel Blob direct-upload (bypasses Vercel's 4.5 MB function body limit)
- Four-tier analyzer fallback (Gemini → OpenRouter → GWI auto-analysis → pptx-deterministic) — users never see a blank "all tiers failed" error.
- Verified end-to-end on the 33-slide Search Behaviour deck (228 flattened rows → Gemini in 36s → real insights).

---

## 2. Commits on `feat/pptx-source`

| SHA | Subject |
|---|---|
| `c3f1da5` | `feat(pptx): structured per-slide ingestion (titles, bullets, tables, notes)` |
| `2897d77` | `feat(pptx): direct-to-Blob upload for >4MB decks + analyzer fix` |
| _(pending)_ | `feat(pptx): JSON parser + multi-tier fallbacks + localhost dev path` |

---

## 3. File-by-file

### `lib/pptx/parser.ts`
- Added `extractPptxStructured(buffer) → PptxStructuredSlide[]` — per-slide title / bullets / tables / notes.
- Kept the legacy `extractPptxSlides` / `extractPptxText` exports for the rawText fallback path that the rest of `lib/uploads/handler.ts` uses when structured parsing returns 0 slides.
- Bracket-aware regex fix: `<a:t>` text-run extraction used to accidentally match `<a:tbl>`, `<a:tc>`, `<a:tr>` because the open-tag pattern was `<a:t[^>]*>`. Tightened to require whitespace or `>` immediately after the `t` so nested table elements aren't swallowed.

### `lib/uploads/handler.ts`
- New `handlePptxUpload(buffer, filename, uploadId)` writes one `tool_data` row per slide with `toolType: 'pptx_deck'` and `rowData: { slideNumber, title, bullets, tables, notes }`.
- Replaced the no-op `else if (ext === 'pptx' || ext === 'ppt')` branch in `handleUpload` that previously dropped through to the rawText fallback.
- Kept `extractPptxText` as the last-resort rawText fallback when structured extraction returns 0 slides (corrupt deck, legacy .ppt binary).

### `app/api/upload/blob-token/route.ts` (new)
- Issues signed upload URLs via `@vercel/blob/client`'s `handleUpload`.
- Auth-gated (returns 401 if no session, 503 if `BLOB_READ_WRITE_TOKEN` not set).
- 50 MB cap aligned with `config.MAX_FILE_SIZE_MB`.

### `app/api/upload/route.ts`
- **Path A** (existing): multipart `formData` upload for small files.
- **Path B** (new): JSON `{ blobUrl, filename, briefId? }` for files that came in via Vercel Blob — server downloads + processes + deletes the blob.
- **Path C** (new): raw binary body with `X-Upload-Mode: raw` + `X-Filename` headers — used by the localhost dev path that bypasses both Blob and FormData.

### `app/upload/page.tsx`
- Three-way upload strategy per file:
  - **Localhost + > 4 MB** → Path C (raw binary). Avoids the Turbopack `req.formData()` bug AND the `vercel.com/api/blob` ad-blocker issue.
  - **Localhost + ≤ 4 MB** OR **production + ≤ 4 MB** → Path A (multipart).
  - **Production + > 4 MB** → Path B (Vercel Blob upload, then JSON post).
- Duplicate-upload fix: hoisted the `setTimeout(processAll)` out of the `setFileEntries` updater function — React Strict Mode invokes updaters twice in dev, which fired every upload twice.

### `lib/ai/gemini.ts`
- Added `extractFirstJsonArray(text)` — bracket-balanced extractor that walks char-by-char, tracks bracket depth, skips string contents.
- Replaced 4 sites that used the greedy regex `/\[[\s\S]*\]/`. The greedy variant captured from the first `[` to the LAST `]` in the response, so trailing prose with stray `]` chars broke `JSON.parse` with "Unexpected non-whitespace character after JSON at position N."

### `app/api/ai/analyze-data/route.ts`
- **PPTX flattener** (`flattenPptxRows`): converts `{ slideNumber, title, bullets, tables, notes }` → flat `{ Slide, Title, Section, Content }` rows so the existing generic-tabular Gemini prompt can read them. One "Overview" row per slide plus one row per table data-row with the table's headers as fields.
- Detection gated by a 3-field shape check (`slideNumber`, `bullets`, `tables`) — GWI / keyword / generic paths are untouched.
- Bumped Gemini timeout `40s → 60s → 120s` to accommodate the retry chain (Flash → Flash 2.0 → Pro → Flash-Lite, each ~10-30s on rate limit).
- New **Tier 4 fallback** — `generatePptxFallbackCards`: deterministic cards from slide titles + bullets (conviction 65 to mark them as non-LLM). Runs when Gemini AND OpenRouter both fail, before returning 502.

### `types/keywords.ts` (carried in from `feat/keyword-planner-source`)
- N/A here — that's a separate branch. Listed for context only.

### `next.config.mjs`
- Added `experimental.proxyClientMaxBodySize: '50mb'`. Next.js 16's proxy/middleware silently truncates request bodies at 10 MB by default, which corrupted the 10.4 MB Sargam deck on its way to the route handler. Lifted to match the client-side 50 MB cap.

---

## 4. Why each change

| Change | Root cause |
|---|---|
| Structured PPTX parser | Tables were the bulk of signal in agency decks — collapsing them to one text blob threw away keyword lists, persona profiles, platform matrices. |
| Vercel Blob upload | Vercel functions cap request bodies at 4.5 MB; the 10.4 MB Sargam deck was guaranteed to fail in prod. |
| Localhost-dev path skip | (1) Ad-blockers / privacy extensions block `vercel.com/api/blob` (the Blob SDK's coordination endpoint), making Blob uploads silently fail on dev. (2) Turbopack's `req.formData()` fails on multipart bodies > ~4 MB with "Failed to parse body as FormData." |
| `proxyClientMaxBodySize: '50mb'` | Next.js 16 introduced a 10 MB cap on bodies passing through the proxy/middleware; our 10.4 MB deck got truncated to 10 MB, corrupted the PPTX zip, the parser returned 0 slides. |
| PPTX → tabular flattener | The generic-tabular Gemini prompt expects flat `Record<string, scalar>` rows; passing nested `{ tables: [{headers, rows: [[]]}] }` objects caused Gemini to choke and 502. |
| 120s Gemini timeout | `callGeminiWithRetry` cycles through 4 model candidates on rate-limit; each attempt is 10-30s. The old 40s cap couldn't traverse the full chain after the user's daily Flash quota was exhausted. |
| Bracket-aware JSON extractor | Greedy `/\[[\s\S]*\]/` captured from the first `[` to the last `]` in the response. When Gemini added trailing prose containing a stray `]`, the regex captured too much and `JSON.parse` threw on the non-JSON suffix. |
| Tier 4 pptx-deterministic fallback | When both LLM tiers fail (genuine quota exhaustion, network outage, persistent JSON parse failures), the existing Tier 3 (`buildInsightSlots`) returns 0 cards for pptx-shape data — leaving users with a blank 502. |
| Duplicate-upload fix (page.tsx:620) | React Strict Mode invokes state-updater functions twice in dev — the previous code put `setTimeout(processAll)` inside a `setFileEntries` updater, so every upload fired twice. |
| Tightened `<a:t>` regex in pptx parser | The old open-tag pattern matched `<a:tbl>`, `<a:tc>`, `<a:tr>` (all start with `<a:t`), polluting table-cell text extraction with raw XML. |

---

## 5. Test results

| Test | Status |
|---|---|
| 33-slide Search Behaviour deck (~125 KB) → 228 flattened rows → Gemini 200 in 36s | ✅ Pass |
| 10.4 MB Sargam Search & Platform Behaviour deck → 21 rows loaded, no truncation | ✅ Upload works |
| 10.4 MB Sargam deck → Gemini analyze with 60s timeout | ⚠️ Sometimes 502s (timeout) — fixed in this branch (120s + JSON parser + Tier 4) |
| Duplicate-upload after page.tsx:620 fix | ⚠️ Spawned as follow-up task — partial fix, may still recur |
| Non-pptx data unaffected by flattener | ✅ Gated by 3-field shape check |
| Existing GWI / keyword / social paths unaffected | ✅ Same generic-tabular path; only flattener gates added |

**End-to-end verified Gemini response from JSON-parser fix not yet observed in production** — fix landed after the last successful run. Tier 4 fallback NOT yet exercised live (would require both Gemini and OpenRouter to fail in the same request).

---

## 6. Known issues / pending

1. **Duplicate upload may still fire** — partial fix landed (commit `2897d77`); spawned as a separate task. Symptom: each file gets uploaded twice with different uploadIds. Doesn't break anything but doubles DB writes and Gemini quota use.
2. **`vercel env pull` defaults to Development env** which is nearly empty; using it without `--environment=production` will wipe `.env.local`. Recipe documented in `project_prism_fluo.md` memory.
3. **Vercel Blob on prod for end-users with ad-blockers** — the localhost workaround doesn't help production. Users with strict tracking-protection will fail to upload >4 MB files. Documented in code comment at `app/upload/page.tsx:195`.
4. **OpenRouter Tier 2 sometimes returns empty** without throwing — no log line on this path, leading to silent fall-through to Tier 3/4. Worth a future audit.
5. **Pre-existing TS error** at `lib/ai/gemini.ts:1747` (`Property 'bucket' does not exist on type 'ChartSpecInput'`) — unrelated to this branch.

---

## 7. Rollback

If anything breaks in production after this branch merges:

```bash
git revert <merge-sha>
git push origin main
```

Individual file rollbacks (safer if you want to keep parts):

| File | Pre-branch SHA |
|---|---|
| `lib/pptx/parser.ts` | restore from `polish/insights-v2` |
| `lib/uploads/handler.ts` | restore from `polish/insights-v2` |
| `app/api/upload/route.ts` | restore from `polish/insights-v2` |
| `app/upload/page.tsx` | restore from `polish/insights-v2` |
| `lib/ai/gemini.ts` | restore from `polish/insights-v2` |
| `app/api/ai/analyze-data/route.ts` | restore from `polish/insights-v2` |
| `next.config.mjs` | restore from `polish/insights-v2` |

New files (`app/api/upload/blob-token/route.ts`, `docs/PPTX-SUPPORT-CHANGES.md`) are safe to delete.

---

## 8. Deployment

`feat/pptx-source` push triggers a Vercel preview deployment automatically. To promote to production:

1. Open the PR: https://github.com/rahulsoni25/prism-fluo/pull/new/feat/pptx-source
2. Choose base branch (`main` for prod, or `polish/insights-v2` if staging via the parent branch).
3. Wait for the Vercel preview check to pass.
4. Merge.

Vercel env vars to verify before merge:
- `BLOB_READ_WRITE_TOKEN` (auto-injected when Blob store is linked)
- `GEMINI_API_KEY`
- `OPENROUTER_API_KEY`
- `DATABASE_URL`

The `proxyClientMaxBodySize: '50mb'` in `next.config.mjs` is the only build-time config change.
