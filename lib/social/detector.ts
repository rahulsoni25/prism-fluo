/**
 * lib/social/detector.ts
 *
 * Detects social-listening / share-of-voice exports.
 * Covers Brandwatch, Meltwater, Talkwalker, Pulsar, and similar tools
 * that export raw post-level data with Sentiment, MediaType, Message columns.
 *
 * Minimum signal: has "Sentiment" column + at least 2 of the supporting columns.
 */

const SENTIMENT_COL  = 'sentiment';
const SUPPORTING_COLS = [
  'mediatype', 'media type',
  'message',
  'publishdate', 'publish date', 'date',
  'userfollowerscount', 'followers',
  'name',            // brand/topic name
  'ticketid', 'ticket id',
  'sharetype', 'share type',
  'relativeshareofvoice', 'share of voice',
];

export function isSocialListeningFormat(headers: string[]): boolean {
  if (!headers || headers.length === 0) return false;
  const lower = headers.map(h => String(h || '').toLowerCase().trim());

  // Must have a Sentiment column
  if (!lower.some(h => h === SENTIMENT_COL || h.includes('sentiment'))) return false;

  // Must have at least 2 supporting columns
  const supportingMatches = SUPPORTING_COLS.filter(sig =>
    lower.some(h => h.includes(sig))
  ).length;

  return supportingMatches >= 2;
}
