/**
 * POST /api/connector/render-deck
 *
 * Renders a PRISM Ads Connector deck spec (the output of the connector's
 * `build_report` skill) into a real .pptx file. This is the bridge that lets
 * the MCP connector turn its structured audit decks into downloadable
 * presentations using PRISM's existing PptxGenJS pipeline.
 *
 * Body: { deck: DeckSpec }  — or the build_report result `{ deck, ... }`.
 * Returns: { ok, filename, pptxBase64 }  (mirrors /api/presentations/generate).
 */
import { NextRequest, NextResponse } from 'next/server';
import { renderDeck, type DeckSpec } from '@/lib/connector/render-deck';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  // Accept either { deck } or a full build_report result that contains `deck`.
  const deck: DeckSpec | undefined = body?.deck?.slides ? body.deck : body?.slides ? body : undefined;
  if (!deck || !Array.isArray(deck.slides) || deck.slides.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'Provide a deck spec with a non-empty `slides` array (the output of build_report).' },
      { status: 400 },
    );
  }

  try {
    const buffer = await renderDeck(deck);
    const safe = (deck.title || 'ads_audit').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase();
    return NextResponse.json({
      ok: true,
      filename: `${safe || 'ads_audit'}.pptx`,
      slideCount: deck.slides.length,
      pptxBase64: buffer.toString('base64'),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: 'Failed to render deck', details: msg }, { status: 500 });
  }
}
