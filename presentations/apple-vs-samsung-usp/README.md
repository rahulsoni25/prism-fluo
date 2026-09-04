# Apple vs Samsung — USP presentation

21-slide deck for the group presentation comparing Apple's and Samsung's
Unique Selling Propositions.

**Deliverable:** `Apple-vs-Samsung-USP.pptx` (16:9, editable in PowerPoint,
Google Slides and Keynote). Every slide carries speaker notes.

## Running order

| # | Slides | Speaker | Section |
|---|--------|---------|---------|
| 1 | 3–5 | Isha | What a USP is · the two contenders · the four judging criteria |
| 2 | 6–8 | Yashvi | Apple's USP: the seamless ecosystem |
| 3 | 9–10 | Nishita | Apple from the consumer's point of view |
| 4 | 11–13 | Aarya | Samsung's USP: innovation, smart tech and choice |
| 5 | 14–15 | Venesa | Samsung from the consumer's point of view |
| 6 | 16–17 | Simran | Head-to-head scorecard and the verdict |
| 7 | 18–19 | Mann | Deeper analysis of the winning USP · bridge to advertising |
| 8 | 20–21 | Gouraksh | Jingle, audio advertisement and conclusion |

Slides 1–2 are the title and the running order.

## Editorial notes

- The winner is argued as **Apple's seamless ecosystem**. Samsung is
  deliberately scored higher on *uniqueness* so the verdict reads as a
  judgement rather than fandom. To flip the winner, change slides 16, 17,
  18, 20 and 21.
- The 19/20 vs 15/20 scorecard on slide 16 is the team's own assessment
  against the four criteria set out on slide 5. It is labelled as such on
  both slides — it is **not** market research data, and no market-share,
  revenue or sales figures are claimed anywhere in the deck.
- Product claims are limited to publicly described features named in the
  source brief (Handoff, AirDrop, iCloud, AirPods, Apple Watch; Galaxy
  Z Fold/Z Flip, Galaxy AI's Photo Assist, Writing Assist, Interpreter,
  Now Brief; the S/A/Z series line-up).
- All artwork is generated as original vector graphics by `art.js` — no
  stock photography and no third-party product images. Brand logos appear
  only for identification in the comparison.

## Rebuilding

```bash
npm install          # pptxgenjs + sharp
npm run build        # regenerates img/ then writes the .pptx
```

`art.js` draws every background, icon, diagram and illustration into
`img/` (git-ignored, ~2.6 MB). `build.js` lays out the 21 slides.
