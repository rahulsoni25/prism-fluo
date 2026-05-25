import type { Worksheet } from 'exceljs';
import type { GwiTimeSpentRow, GwiQuestionType } from '@/types/gwi';

/**
 * Infer the canonical GwiQuestionType from col 0 contents + the row labels.
 * Returns 'unknown' for GWI sheets that match the standard tabular shape
 * but whose topic isn't in our enum.
 *
 * Detection priority:
 *   1. Explicit "time spent" / "hours per day" → time_spent
 *   2. Genre-style keywords in col 0 OR a strong cluster of genre tokens
 *      among row labels → tv_genres / music_genres
 *   3. Topic / interest mentions → content_topics
 *   4. Platform / service / app names → streaming_services / social_platforms
 *   5. Device names → devices
 *   6. Fallback: unknown (still parsed + stored, just not surfaced as a
 *      typed nugget)
 */
export function inferQuestionType(col0Text: string, sampleRowLabels: string[]): GwiQuestionType {
  const t = col0Text.toLowerCase();
  const labels = sampleRowLabels.map(s => s.toLowerCase());

  // 1. Time spent (the original supported case)
  if (/\btime spent\b|\bhours per\b|\bin a typical day\b/.test(t)) return 'time_spent';

  // 2. Genres
  if (/\btv (shows|genres|programmes)\b|\bgenres watched\b|\bwhat genres\b/.test(t)) return 'tv_genres';
  if (/\bmusic genres\b|\bgenres listened\b|\bgenres of music\b/.test(t)) return 'music_genres';

  // Music-genre labels FIRST — if labels look distinctly musical, classify
  // as music_genres regardless of how many TV-style tokens are present.
  const musicTokens = ['bollywood', 'pop', 'rock', 'hip-hop', 'hip hop', 'hiphop', 'classical', 'edm', 'country', 'folk', 'jazz', 'electronic', 'r&b', 'rnb', 'metal', 'punjabi', 'tamil', 'telugu'];
  const musicHits = labels.filter(l => musicTokens.some(g => l.includes(g))).length;
  if (musicHits >= 3) return 'music_genres';

  const genreTokens = ['drama', 'comedy', 'reality', 'news', 'sports', 'thriller', 'documentary', 'romance', 'horror', 'sci-fi', 'animation', 'kids'];
  const tvHits = labels.filter(l => genreTokens.some(g => l.includes(g))).length;
  if (tvHits >= 3) {
    // Could still be music if some music labels are mixed in
    return musicHits >= 2 ? 'music_genres' : 'tv_genres';
  }

  // 3. Content topics / interests
  if (/\binterests\b|\btopics\b|\bcontent.*interested\b|\bsubject matter\b/.test(t)) return 'content_topics';
  const topicTokens = ['fashion', 'food', 'travel', 'tech', 'beauty', 'fitness', 'finance', 'parenting', 'gaming', 'sports', 'health', 'lifestyle'];
  if (labels.filter(l => topicTokens.some(g => l.includes(g))).length >= 3) return 'content_topics';

  // 4. Platforms / services
  if (/\bstreaming services\b|\bvideo streaming\b|\bOTT\b/i.test(t)) return 'streaming_services';
  const streamingTokens = ['hotstar', 'netflix', 'prime video', 'amazon prime', 'jiocinema', 'sonyliv', 'zee5', 'youtube', 'voot'];
  if (labels.filter(l => streamingTokens.some(g => l.includes(g))).length >= 2) return 'streaming_services';

  if (/\bsocial media (services|platforms|accounts)\b|\bplatforms used\b/.test(t)) return 'social_platforms';
  const socialTokens = ['instagram', 'facebook', 'whatsapp', 'twitter', 'linkedin', 'snapchat', 'tiktok', 'sharechat', 'moj', 'koo', 'pinterest'];
  if (labels.filter(l => socialTokens.some(g => l.includes(g))).length >= 2) return 'social_platforms';

  // 5. Devices
  if (/\bdevices\b|\bownership of devices\b/.test(t)) return 'devices';
  const deviceTokens = ['mobile', 'laptop', 'tablet', 'smart tv', 'smartphone', 'desktop', 'console'];
  if (labels.filter(l => deviceTokens.some(g => l.includes(g))).length >= 2) return 'devices';

  return 'unknown';
}

export function extractMainQuestion(col0: string[]): {
  questionName: string;
  questionMessage: string;
  questionType: GwiQuestionType;
} {
  const col0Joined = col0.join(' | ');
  // Try to find a meaningful question name — first non-empty descriptive line
  const q = col0.find(v => v && (
    /time spent|genres?|interests?|topics|platforms|services|devices/i.test(v)
  )) || col0.find(v => v && v.length > 5 && !/source: gwi|combines data/i.test(v)) || 'GWI Analysis';
  const msg = col0.find(v => v && v.toLowerCase().includes('this question combines data')) || '';
  // Sample labels for question-type inference come from later in col 0 (after the question header)
  const sampleLabels = col0.slice(Math.max(0, col0.findIndex(v => v && v.toLowerCase().includes('audience')) + 1))
    .filter(s => s && s.length > 0 && s.length < 60).slice(0, 12);
  return {
    questionName:    q.trim(),
    questionMessage: msg.trim(),
    questionType:    inferQuestionType(col0Joined, sampleLabels),
  };
}

export function tidyGwiTimeSpent(
  uploadId: string,
  sheetName: string,
  worksheet: Worksheet
): GwiTimeSpentRow[] {
  const rows: any[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    rows.push(row.values);
  });

  // 1. Identify Header Row (Metric Labels)
  let headerIdx = -1;
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const rowStr = (rows[i] || []).join(' ').toLowerCase();
    if (rowStr.includes('audience %') && rowStr.includes('data point %')) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) return [];

  const headers = rows[headerIdx] as any[];
  const audiences = rows[headerIdx - 1] as any[] || [];
  const col0Values = rows.map(r => String(r[1] || ''));
  const { questionName, questionMessage, questionType } = extractMainQuestion(col0Values);

  // 2. Identify Metric Clusters
  const metricBlocks: { audience: string; cols: Record<string, number> }[] = [];
  let currentAudience = 'Total';

  for (let c = 1; c < headers.length; c++) {
    const h = String(headers[c] || '').toLowerCase();
    const a = String(audiences[c] || '').trim();
    if (a && a.length > 1) currentAudience = a;

    if (h.includes('audience %')) {
      metricBlocks.push({ audience: currentAudience, cols: { audiencePct: c } });
    } else if (metricBlocks.length > 0) {
      const last = metricBlocks[metricBlocks.length - 1];
      if (h.includes('data point %')) last.cols.dataPointPct = c;
      if (h.includes('universe')) last.cols.universe = c;
      if (h.includes('index')) last.cols.index = c;
      if (h.includes('responses')) last.cols.responses = c;
    }
  }

  // 3. Find Attribute and Short Label columns
  const _attrIdx  = headers.findIndex(h => String(h || '').toLowerCase().includes('attributes'));
  const _labelIdx = headers.findIndex(h => String(h || '').toLowerCase().includes('short label'));
  const attrCol   = _attrIdx  !== -1 ? _attrIdx  : 1;
  const labelCol  = _labelIdx !== -1 ? _labelIdx : 2;

  // 4. Extract Data Rows
  const tidy: GwiTimeSpentRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const attribute = String(row[attrCol] || '').trim();
    if (!attribute || attribute.toLowerCase().includes('base')) continue;

    metricBlocks.forEach(block => {
      tidy.push({
        uploadId,
        sheetName,
        questionName,
        questionMessage,
        questionType,
        timeBucket: attribute,
        audience: block.audience,
        audiencePct: parseFloat(row[block.cols.audiencePct]) || null,
        dataPointPct: parseFloat(row[block.cols.dataPointPct]) || null,
        universe: parseFloat(row[block.cols.universe]) || null,
        index: parseFloat(row[block.cols.index]) || null,
        responses: parseFloat(row[block.cols.responses]) || null,
      });
    });
  }

  return tidy;
}
