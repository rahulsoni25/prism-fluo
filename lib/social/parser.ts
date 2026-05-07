/**
 * lib/social/parser.ts
 *
 * Parses social-listening / share-of-voice exports (Brandwatch, Meltwater,
 * Talkwalker, etc.) and PRE-AGGREGATES raw post rows into structured summary
 * rows that Gemini can read meaningfully.
 *
 * Why pre-aggregate:
 * Raw exports have 1,000–10,000 individual post rows.  Sampling 120 random
 * posts gives Gemini no reliable sentiment distribution.  Aggregating first
 * (sentiment counts, platform breakdown, top posts by reach) lets Gemini
 * write accurate insight cards grounded in real percentages.
 *
 * Output structure stored in tool_data.row_data (toolType = 'social_listening'):
 *   { dimension, value, count, pct, extraA?, extraB? }
 */

import type { Worksheet } from 'exceljs';

export interface SocialAggRow {
  uploadId:  string;
  sheetName: string;
  toolType:  'social_listening';
  rowData:   Record<string, any>;
}

// ── Column-name resolver (handles naming variations across tools) ──

function colIdx(headers: string[], ...candidates: string[]): number {
  const lower = headers.map(h => String(h || '').toLowerCase().trim());
  for (const c of candidates) {
    const i = lower.findIndex(h => h.includes(c.toLowerCase()));
    if (i !== -1) return i;
  }
  return -1;
}

// ── Stop-words for message theme extraction ────────────────────

const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by',
  'is','it','this','that','was','are','be','as','from','have','has','i','we',
  'you','he','she','they','my','your','our','their','its','do','did','does',
  'not','no','so','if','then','than','like','just','get','got','can','will',
  'would','could','should','been','being','go','come','up','out','off','down',
  'http','https','www','rt','via','pic','co',
]);

function extractTopWords(messages: string[], topN = 15): Array<{ word: string; count: number }> {
  const freq: Record<string, number> = {};
  for (const msg of messages) {
    const words = msg
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w));
    for (const w of words) freq[w] = (freq[w] || 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word, count]) => ({ word, count }));
}

// ── Main parser ────────────────────────────────────────────────

export function parseSocialListening(
  uploadId:  string,
  sheetName: string,
  worksheet: Worksheet,
): SocialAggRow[] {
  // 1. Read all rows
  const allRows: any[][] = [];
  worksheet.eachRow({ includeEmpty: false }, row => {
    allRows.push(row.values as any[]);
  });
  if (allRows.length < 2) return [];

  // 2. Find header row (first row with ≥3 non-empty cells)
  let headerIdx = -1;
  let headers:  string[] = [];
  for (let i = 0; i < Math.min(5, allRows.length); i++) {
    const row = allRows[i] as any[];
    const filled = row.filter(c => c != null && String(c).trim() !== '');
    if (filled.length >= 3) {
      headerIdx = i;
      headers   = row.map(c => String(c ?? '').trim());
      break;
    }
  }
  if (headerIdx === -1) return [];

  // 3. Resolve column indices
  const sentimentIdx    = colIdx(headers, 'sentiment');
  const mediaTypeIdx    = colIdx(headers, 'mediatype', 'media type', 'platform', 'source');
  const messageIdx      = colIdx(headers, 'message', 'text', 'content');
  const followersIdx    = colIdx(headers, 'userfollowerscount', 'followers', 'followercount');
  const publishDateIdx  = colIdx(headers, 'publishdate', 'publish date', 'date', 'created');
  const nameIdx         = colIdx(headers, 'name', 'brand', 'topic');
  const userNameIdx     = colIdx(headers, 'userscreenname', 'username', 'author', 'handle');

  if (sentimentIdx === -1) return []; // can't aggregate without sentiment

  // 4. Parse raw post rows
  interface PostRow {
    sentiment:   string;
    mediaType:   string;
    message:     string;
    followers:   number;
    publishDate: string;
    userName:    string;
    name:        string;
  }

  const posts: PostRow[] = [];
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const row = allRows[i] as any[];
    const sentiment = String(row[sentimentIdx] ?? '').trim();
    if (!sentiment) continue;

    posts.push({
      sentiment:   sentiment.toLowerCase() === 'positive' ? 'Positive'
                 : sentiment.toLowerCase() === 'negative' ? 'Negative'
                 : 'Neutral',
      mediaType:   mediaTypeIdx  !== -1 ? String(row[mediaTypeIdx]   ?? '').trim() : 'Unknown',
      message:     messageIdx    !== -1 ? String(row[messageIdx]     ?? '').trim() : '',
      followers:   followersIdx  !== -1 ? Number(row[followersIdx]   ?? 0)         : 0,
      publishDate: publishDateIdx !== -1 ? String(row[publishDateIdx] ?? '').trim() : '',
      userName:    userNameIdx   !== -1 ? String(row[userNameIdx]    ?? '').trim() : '',
      name:        nameIdx       !== -1 ? String(row[nameIdx]        ?? '').trim() : '',
    });
  }

  if (posts.length === 0) return [];

  const total = posts.length;
  const pct   = (n: number) => parseFloat(((n / total) * 100).toFixed(1));
  const result: SocialAggRow[] = [];

  const push = (rowData: Record<string, any>) =>
    result.push({ uploadId, sheetName, toolType: 'social_listening', rowData });

  // ── 5a. Overview ──────────────────────────────────────────────
  push({ dimension: '_overview', total_posts: total, source: sheetName });

  // ── 5b. Sentiment breakdown ───────────────────────────────────
  const sentCounts: Record<string, number> = {};
  for (const p of posts) sentCounts[p.sentiment] = (sentCounts[p.sentiment] || 0) + 1;
  for (const [sentiment, count] of Object.entries(sentCounts)) {
    push({ dimension: 'Sentiment', value: sentiment, count, pct: pct(count), total_posts: total });
  }

  // ── 5c. Platform (MediaType) breakdown ────────────────────────
  const platformCounts: Record<string, number> = {};
  for (const p of posts) {
    // Normalise: "Twitter Public Tweets" → "Twitter"
    const platform = p.mediaType
      .replace(/public\s+(tweets?|posts?|updates?)/i, '').trim()
      .replace(/\btweet\b/i, 'Twitter')
      .replace(/\bfacebook\b/i, 'Facebook')
      .replace(/\binstagram\b/i, 'Instagram')
      .replace(/\byoutube\b/i, 'YouTube')
      .replace(/\bnews\b/i, 'News/Blogs')
      .replace(/\bblog\b/i, 'News/Blogs')
      || p.mediaType;
    platformCounts[platform] = (platformCounts[platform] || 0) + 1;
  }
  for (const [platform, count] of Object.entries(platformCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    push({ dimension: 'Platform', value: platform, count, pct: pct(count), total_posts: total });
  }

  // ── 5d. Sentiment × Platform cross-tab ───────────────────────
  const crossCounts: Record<string, number> = {};
  for (const p of posts) {
    const platform = Object.keys(platformCounts).find(pl =>
      p.mediaType.toLowerCase().includes(pl.toLowerCase().split('/')[0].toLowerCase())
    ) || p.mediaType;
    const key = `${platform} — ${p.sentiment}`;
    crossCounts[key] = (crossCounts[key] || 0) + 1;
  }
  for (const [combo, count] of Object.entries(crossCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    push({ dimension: 'Platform×Sentiment', value: combo, count, pct: pct(count), total_posts: total });
  }

  // ── 5e. Top posts by follower reach per sentiment ─────────────
  for (const sentiment of ['Positive', 'Negative', 'Neutral']) {
    const top = posts
      .filter(p => p.sentiment === sentiment && p.followers > 0 && p.message)
      .sort((a, b) => b.followers - a.followers)
      .slice(0, 3);
    for (const p of top) {
      push({
        dimension:   `Top ${sentiment} Post`,
        value:       p.userName || '(unknown)',
        followers:   p.followers,
        message:     p.message.slice(0, 200),
        platform:    p.mediaType,
        publishDate: p.publishDate,
      });
    }
  }

  // ── 5f. Top themes from message text ──────────────────────────
  const allMessages     = posts.map(p => p.message).filter(Boolean);
  const positiveMessages = posts.filter(p => p.sentiment === 'Positive').map(p => p.message).filter(Boolean);
  const negativeMessages = posts.filter(p => p.sentiment === 'Negative').map(p => p.message).filter(Boolean);

  const allThemes  = extractTopWords(allMessages, 12);
  const posThemes  = extractTopWords(positiveMessages, 8);
  const negThemes  = extractTopWords(negativeMessages, 8);

  for (const { word, count } of allThemes) {
    push({ dimension: 'Top Theme (All)', value: word, count, pct: pct(count) });
  }
  for (const { word, count } of posThemes) {
    push({ dimension: 'Top Theme (Positive)', value: word, count });
  }
  for (const { word, count } of negThemes) {
    push({ dimension: 'Top Theme (Negative)', value: word, count });
  }

  // ── 5g. Volume over time (monthly) ───────────────────────────
  if (publishDateIdx !== -1) {
    const monthCounts: Record<string, number> = {};
    for (const p of posts) {
      const match = p.publishDate.match(/(\d{1,2})[\/\-\s](\d{1,2})[\/\-\s](\d{4})/);
      if (match) {
        // Parse as DD/MM/YYYY or MM/DD/YYYY heuristically
        const [, d, m, y] = match;
        const key = `${y}-${String(m).padStart(2, '0')}`;
        monthCounts[key] = (monthCounts[key] || 0) + 1;
      }
    }
    for (const [month, count] of Object.entries(monthCounts)
      .sort((a, b) => a[0].localeCompare(b[0]))) {
      push({ dimension: 'Volume Over Time', value: month, count, pct: pct(count) });
    }
  }

  return result;
}
