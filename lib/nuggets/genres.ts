/**
 * lib/nuggets/genres.ts
 *
 * "Content Genres They Prefer" nugget — derives a ranked list of the
 * audience's preferred genres / topics / platforms from GWI rows.
 *
 * Source priority (whichever is present in the brief's uploads):
 *   1. tv_genres     → "Top TV genres watched"
 *   2. content_topics → "Top content topics they're interested in"
 *   3. music_genres  → "Top music genres they listen to"
 *   4. streaming_services → "Top streaming platforms they use"
 *
 * Falls back to null when no genre-shaped GWI data is present — the UI
 * then shows an honest "Upload GWI 'TV Shows Watched' export to populate"
 * placeholder card instead of fabricating numbers.
 */

import { db } from '@/lib/db/client';

export type GenreNuggetKind = 'tv_genres' | 'content_topics' | 'music_genres' | 'streaming_services';

export interface GenreRanking {
  label:    string;
  pct:      number;     // audience_pct
  universe: number | null;
  index:    number | null;
}

export interface GenreNugget {
  kind:           GenreNuggetKind;
  title:          string;
  audienceFilter: string;       // which audience these numbers are for
  rankings:       GenreRanking[];
  totalSampled:   number;
  source:         string;       // "GWI Q4 2024" or sheet name
  sourceSheets:   string[];     // which sheets contributed
}

const KIND_PRIORITY: GenreNuggetKind[] = ['tv_genres', 'content_topics', 'music_genres', 'streaming_services'];

const KIND_TITLES: Record<GenreNuggetKind, string> = {
  tv_genres:          'Top TV genres watched',
  content_topics:     'Top content topics of interest',
  music_genres:       'Top music genres listened to',
  streaming_services: 'Top streaming platforms used',
};

/**
 * Build the genre nugget for a brief from its non-superseded GWI uploads.
 * Returns null if no genre-shaped data is present.
 *
 * @param briefId  ID of the brief
 * @param topN     How many genres to include in the ranking (default 6)
 */
export async function buildGenreNugget(briefId: string, topN = 6): Promise<GenreNugget | null> {
  // 1. Find non-superseded uploads on the brief
  const upRes = await db.query(
    `SELECT id, filename FROM uploads
      WHERE brief_id = $1 AND superseded_by IS NULL`,
    [briefId],
  ).catch(() => ({ rows: [] as any[] }));
  if (upRes.rows.length === 0) return null;
  const uploadIds = upRes.rows.map((r: any) => r.id);

  // 2. For each priority kind, see if data exists
  for (const kind of KIND_PRIORITY) {
    const rowsRes = await db.query(
      `SELECT sheet_name, time_bucket, audience, audience_pct, universe, index_score
         FROM gwi_time_spent
        WHERE upload_id = ANY($1::uuid[])
          AND question_type = $2
          AND audience_pct IS NOT NULL
        ORDER BY audience_pct DESC`,
      [uploadIds, kind],
    ).catch(() => ({ rows: [] as any[] }));

    if (rowsRes.rows.length === 0) continue;

    // 3. Pick the audience: prefer the most specific (non-"Total") with most rows.
    //    Aggregate rows by attribute (time_bucket) for the chosen audience.
    const byAudience = new Map<string, any[]>();
    for (const r of rowsRes.rows) {
      const aud = String(r.audience || 'Total');
      if (!byAudience.has(aud)) byAudience.set(aud, []);
      byAudience.get(aud)!.push(r);
    }
    // Sort audiences: prefer non-Total, then by row count
    const audienceEntries = Array.from(byAudience.entries())
      .sort((a, b) => {
        const aIsTotal = a[0].toLowerCase() === 'total' ? 1 : 0;
        const bIsTotal = b[0].toLowerCase() === 'total' ? 1 : 0;
        if (aIsTotal !== bIsTotal) return aIsTotal - bIsTotal;
        return b[1].length - a[1].length;
      });
    if (audienceEntries.length === 0) continue;
    const [chosenAudience, chosenRows] = audienceEntries[0];

    // 4. Dedupe + rank by audience_pct
    const seen = new Set<string>();
    const rankings: GenreRanking[] = [];
    for (const r of chosenRows) {
      const label = String(r.time_bucket || '').trim();
      if (!label || seen.has(label.toLowerCase())) continue;
      seen.add(label.toLowerCase());
      rankings.push({
        label,
        pct:      Number(r.audience_pct),
        universe: r.universe != null ? Number(r.universe) : null,
        index:    r.index_score != null ? Number(r.index_score) : null,
      });
      if (rankings.length >= topN) break;
    }

    if (rankings.length === 0) continue;

    const sourceSheets = Array.from(new Set(chosenRows.map((r: any) => r.sheet_name))).filter(Boolean);

    return {
      kind,
      title:          KIND_TITLES[kind],
      audienceFilter: chosenAudience,
      rankings,
      totalSampled:   chosenRows.length,
      source:         'GWI',
      sourceSheets:   sourceSheets as string[],
    };
  }

  return null;
}

/** Diagnostic — list which question types ARE present in the brief's GWI uploads.
 *  Used by the UI's honest-skip placeholder card to tell the user what they have
 *  vs what they'd need to upload. */
export async function listGwiQuestionTypes(briefId: string): Promise<string[]> {
  const upRes = await db.query(
    `SELECT id FROM uploads WHERE brief_id = $1 AND superseded_by IS NULL`,
    [briefId],
  ).catch(() => ({ rows: [] as any[] }));
  if (upRes.rows.length === 0) return [];
  const uploadIds = upRes.rows.map((r: any) => r.id);
  const res = await db.query(
    `SELECT DISTINCT question_type FROM gwi_time_spent
      WHERE upload_id = ANY($1::uuid[]) AND question_type IS NOT NULL`,
    [uploadIds],
  ).catch(() => ({ rows: [] as any[] }));
  return res.rows.map((r: any) => r.question_type).filter(Boolean);
}
