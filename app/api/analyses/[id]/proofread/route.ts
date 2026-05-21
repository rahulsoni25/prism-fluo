/**
 * POST /api/analyses/[id]/proofread
 *
 * Walks every chart in an analysis and runs a deterministic proofreader
 * over its title / obs / stat / rec text. Returns a structured per-card
 * report so the UI can highlight issues inline.
 *
 * The pass is deterministic-first (regex rules for brand-name consistency,
 * jargon ban-list, number-formatting, length caps) — no LLM needed unless
 * the caller opts in via ?llm=1, in which case each card with issues gets
 * an additional LLM-grounded reading for grammar and factual consistency.
 *
 * Why deterministic-first: the rule-based pass is free, instant, never
 * hallucinates, and catches 80% of the issues an analyst actually cares
 * about (banned words, brand spelling, number style). The LLM is reserved
 * for the harder grammar + consistency calls.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';
import { callOpenRouterText } from '@/lib/ai/openrouter';
import { cache } from '@/lib/cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface ProofIssue {
  field:    'title' | 'obs' | 'stat' | 'rec';
  severity: 'blocker' | 'major' | 'minor';
  issue:    string;
  suggest?: string;
}

interface ProofCard {
  index:  number;
  title:  string;
  bucket: string | null;
  issues: ProofIssue[];
}

// ── Rule library ────────────────────────────────────────────────────────

const JARGON_BANLIST = [
  'leverage', 'synergy', 'holistic', 'robust', 'utilize', 'paradigm',
  'seamless', 'ecosystem', 'unlock', 'supercharge', 'over-index', 'touchpoint',
  'optimize the funnel', 'best-in-class', 'best in class',
  'state-of-the-art', 'state of the art', 'cutting-edge', 'cutting edge',
];

// Platform / format keywords we expect a good `rec` to contain at least one of
const PLATFORMS = [
  'youtube', 'reels', 'shorts', 'instagram', 'sharechat', 'moj',
  'hotstar', 'jiocinema', 'meesho', 'flipkart', 'amazon', 'whatsapp',
  'facebook', 'twitter', 'x.com', 'google', 'search', 'play store',
];

const FORMATS = [
  'reel', 'pre-roll', 'preroll', 'mid-roll', 'carousel', 'static',
  'short video', 'long-form', 'long form', 'search ad', 'display ad',
  'sponsored', 'demo', 'tutorial', 'unboxing', 'before/after',
];

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function checkTitle(t: string, issues: ProofIssue[]) {
  const wc = wordCount(t);
  if (wc > 14) {
    issues.push({
      field: 'title', severity: 'major',
      issue: `Title is ${wc} words — keep under 12 for headline-style scan-ability.`,
    });
  }
  if (t === t.toLowerCase()) {
    issues.push({
      field: 'title', severity: 'minor',
      issue: 'Title is entirely lowercase — use sentence-case capitalisation.',
    });
  }
  if (/\s\s+/.test(t)) {
    issues.push({ field: 'title', severity: 'minor', issue: 'Double space in title.' });
  }
  if (/[.;]$/.test(t.trim())) {
    issues.push({ field: 'title', severity: 'minor', issue: 'Title ends in a period — magazine-style titles should drop trailing punctuation.' });
  }
}

function checkJargon(field: ProofIssue['field'], text: string, issues: ProofIssue[]) {
  const lower = text.toLowerCase();
  for (const word of JARGON_BANLIST) {
    if (lower.includes(word)) {
      issues.push({
        field, severity: 'major',
        issue: `Uses banned PRISM jargon word: "${word}".`,
        suggest: 'Rewrite in plain English. Replace with a concrete verb or specific noun.',
      });
    }
  }
}

function checkSpecificity(rec: string, issues: ProofIssue[]) {
  const lower = rec.toLowerCase();
  const hasPlatform = PLATFORMS.some(p => lower.includes(p));
  const hasFormat   = FORMATS.some(f => lower.includes(f));
  if (!hasPlatform && !hasFormat) {
    issues.push({
      field: 'rec', severity: 'major',
      issue: 'Recommendation names no specific platform (YouTube, Reels, ShareChat, Meesho, etc.) or format (15s Reel, carousel, search ad).',
      suggest: 'Anchor the action to a platform + format so the analyst can hand it to a media planner directly.',
    });
  }
}

function checkNumberStyle(field: ProofIssue['field'], text: string, issues: ProofIssue[]) {
  // Flag mixed currency styles within a single card — pick one
  const hasInr   = /₹\s*[\d.,]+/.test(text);
  const hasRs    = /\bRs\.?\s*[\d.,]+/.test(text);
  if (hasInr && hasRs) {
    issues.push({
      field, severity: 'minor',
      issue: 'Mixes ₹ and Rs. in the same card — pick one style and use consistently.',
    });
  }
  // No space between number and Cr/L
  if (/\d(Cr|L)\b/.test(text)) {
    issues.push({
      field, severity: 'minor',
      issue: 'Missing space between number and Cr/L unit (e.g. "₹12.7Cr" should be "₹12.7 Cr").',
    });
  }
}

function checkObs(obs: string, issues: ProofIssue[]) {
  const sentences = obs.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length > 3) {
    issues.push({
      field: 'obs', severity: 'major',
      issue: `Observation is ${sentences.length} sentences — keep to 1–2 for at-a-glance readability.`,
    });
  }
  if (wordCount(obs) > 60) {
    issues.push({
      field: 'obs', severity: 'minor',
      issue: `Observation is ${wordCount(obs)} words — aim for ≤ 50.`,
    });
  }
}

function checkBrandConsistency(cards: any[], brandCanonical: string | null, issues: { card: ProofCard, issue: ProofIssue }[]) {
  if (!brandCanonical) return;
  const canonicalLower = brandCanonical.toLowerCase();
  const tokenStem = canonicalLower.split(/\s+/)[0];  // e.g. 'sargam' from 'Sargam Detergents'

  cards.forEach((card, i) => {
    const allText = `${card.title} ${card.obs} ${card.rec} ${card.stat}`;
    const lower = allText.toLowerCase();
    if (!lower.includes(tokenStem)) return;
    // Find every occurrence of the stem and check capitalisation
    const re = new RegExp(`\\b(${tokenStem})\\b`, 'gi');
    let m;
    while ((m = re.exec(allText)) !== null) {
      const found = m[0];
      // Stem must be capitalised — Sargam, not sargam
      if (found !== found[0].toUpperCase() + found.slice(1).toLowerCase()) {
        issues.push({
          card: { index: i, title: card.title, bucket: card.bucket, issues: [] },
          issue: {
            field: 'title', severity: 'blocker',
            issue: `Brand stem "${found}" should be capitalised as "${brandCanonical.split(/\s+/)[0]}".`,
          },
        });
        break;
      }
    }
  });
}

// ── LLM helper (optional) ───────────────────────────────────────────────

async function llmProofreadCard(card: any): Promise<ProofIssue[]> {
  if (!process.env.OPENROUTER_API_KEY) return [];
  const prompt = `You are a sharp copy-editor for a brand strategy report. Review this insight card for: (a) grammar errors that change meaning, (b) factual inconsistency between the obs text and the stat, (c) overly vague language that should be more specific. Return ONLY a JSON array of issues — empty array [] if the card is clean. Do not invent issues.

CARD:
TITLE: ${card.title}
OBS:   ${card.obs || '(empty)'}
STAT:  ${card.stat || '(empty)'}
REC:   ${card.rec || '(empty)'}

Return shape: [{"field":"title|obs|stat|rec","severity":"blocker|major|minor","issue":"plain-English description","suggest":"optional one-line rewrite"}]

Return ONLY the JSON array. No prose, no markdown.`;
  try {
    const raw = await callOpenRouterText(prompt, 600, 'analysis-proofread');
    const match = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').match(/\[[\s\S]*\]/);
    if (!match) return [];
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x: any) =>
      x && ['title','obs','stat','rec'].includes(x.field) &&
      ['blocker','major','minor'].includes(x.severity) &&
      typeof x.issue === 'string'
    );
  } catch {
    return [];
  }
}

// ── Route ────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const useLlm = req.nextUrl.searchParams.get('llm') === '1';
  const cacheKey = `proofread:${id}:llm=${useLlm ? '1' : '0'}`;
  const cached = cache.get<object>(cacheKey);
  if (cached) return NextResponse.json({ ...cached, cached: true });

  const { rows } = await db.query(
    `SELECT a.id, a.results_json, b.brand
       FROM analyses a
       LEFT JOIN briefs b ON b.id = a.brief_id
      WHERE a.id = $1 AND (a.user_id = $2 OR a.user_id IS NULL)`,
    [id, session.userId],
  );
  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const charts: any[] = rows[0].results_json?.charts ?? [];
  const brand: string | null = rows[0].brand ?? null;

  // Per-card deterministic pass
  const cards: ProofCard[] = charts.map((c, i) => {
    const issues: ProofIssue[] = [];
    if (c.title) checkTitle(c.title, issues);
    if (c.title) checkJargon('title', c.title, issues);
    if (c.obs) { checkObs(c.obs, issues); checkJargon('obs', c.obs, issues); checkNumberStyle('obs', c.obs, issues); }
    if (c.stat){ checkJargon('stat', c.stat, issues); checkNumberStyle('stat', c.stat, issues); }
    if (c.rec) { checkJargon('rec',  c.rec,  issues); checkSpecificity(c.rec, issues); }
    return { index: i, title: c.title || '(no title)', bucket: c.bucket || null, issues };
  });

  // Brand-consistency pass (cross-card)
  const brandFlags: { card: ProofCard, issue: ProofIssue }[] = [];
  checkBrandConsistency(charts, brand, brandFlags);
  for (const f of brandFlags) {
    const target = cards[f.card.index];
    if (target) target.issues.unshift(f.issue);
  }

  // Optional LLM pass for cards that already have rule-based hits
  if (useLlm) {
    for (let i = 0; i < charts.length; i++) {
      if (cards[i].issues.length === 0) continue;
      const extra = await llmProofreadCard(charts[i]);
      cards[i].issues.push(...extra);
    }
  }

  const cardsWithIssues = cards.filter(c => c.issues.length > 0).length;
  const totalIssues     = cards.reduce((n, c) => n + c.issues.length, 0);
  const bySeverity = {
    blocker: cards.reduce((n, c) => n + c.issues.filter(i => i.severity === 'blocker').length, 0),
    major:   cards.reduce((n, c) => n + c.issues.filter(i => i.severity === 'major').length, 0),
    minor:   cards.reduce((n, c) => n + c.issues.filter(i => i.severity === 'minor').length, 0),
  };

  const payload = {
    analysisId: id,
    brand,
    summary: {
      totalCards: cards.length,
      cardsWithIssues,
      totalIssues,
      bySeverity,
      mode: useLlm ? 'rules+llm' : 'rules-only',
    },
    cards: cards.filter(c => c.issues.length > 0),
  };

  cache.set(cacheKey, payload, 60 * 60); // 1h
  return NextResponse.json(payload);
}
