/**
 * Skill — export a deck spec to a real .pptx file.
 *
 * Closes the loop on build_report: takes its `deck` spec, POSTs it to PRISM's
 * render endpoint (which uses the app's PptxGenJS pipeline), and writes the
 * resulting .pptx to disk — returning the saved path. Requires PRISM_RENDER_URL
 * to be set (e.g. https://prism-fluo.vercel.app/api/connector/render-deck).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, isAbsolute } from 'node:path';
import { request } from '../http.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, '..', '.data', 'decks');

export default [
  {
    name: 'export_deck_pptx',
    title: 'Export a deck to .pptx',
    description:
      'Render a deck spec (from build_report) into a real .pptx file via PRISM\'s renderer and save it to disk. Requires PRISM_RENDER_URL to be configured. Returns the saved file path and slide count.',
    inputSchema: {
      type: 'object',
      properties: {
        deck: { type: 'object', description: 'The `deck` object returned by build_report (must contain a slides array).', additionalProperties: true },
        filename: { type: 'string', description: 'Optional output filename (e.g. acme_audit.pptx).' },
        outputPath: { type: 'string', description: 'Optional absolute directory to save into. Defaults to connector/.data/decks/.' },
      },
      required: ['deck'],
    },
    async handler(args, ctx) {
      const url = ctx.config.renderUrl;
      if (!url) {
        throw new Error('PRISM_RENDER_URL is not set. Point it at your deployed /api/connector/render-deck endpoint to enable .pptx export.');
      }
      const deck = args.deck?.slides ? args.deck : args.deck?.deck?.slides ? args.deck.deck : undefined;
      if (!deck || !Array.isArray(deck.slides) || deck.slides.length === 0) {
        throw new Error('Provide the `deck` object from build_report (with a non-empty slides array).');
      }

      const r = await request(url, {
        method: 'POST',
        platform: 'prism-render',
        headers: { 'content-type': 'application/json' },
        body: { deck },
        timeoutMs: ctx.config.httpTimeoutMs,
      });
      if (!r.json?.ok || !r.json.pptxBase64) {
        throw new Error(`Renderer did not return a file: ${r.json?.error || `HTTP ${r.status}`}`);
      }

      const dir = args.outputPath && isAbsolute(args.outputPath) ? args.outputPath : OUT_DIR;
      mkdirSync(dir, { recursive: true });
      const name = (args.filename || r.json.filename || 'ads_audit.pptx').replace(/[^a-z0-9._-]+/gi, '_');
      const filePath = join(dir, name.endsWith('.pptx') ? name : `${name}.pptx`);
      writeFileSync(filePath, Buffer.from(r.json.pptxBase64, 'base64'));

      return { exported: true, filePath, slideCount: r.json.slideCount ?? deck.slides.length, bytes: Buffer.from(r.json.pptxBase64, 'base64').length };
    },
  },
];
