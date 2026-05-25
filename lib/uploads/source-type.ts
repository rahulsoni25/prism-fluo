/**
 * lib/uploads/source-type.ts
 *
 * Source-type inference for the multi-upload-per-brief merge logic
 * (Tier 2 per docs/PENDING-DECISIONS.md). Two related goals:
 *
 *   1. Classify any uploaded file into ONE of the canonical source types
 *      so we can detect "same source type re-uploaded → supersede" cases.
 *   2. Stay decoupled from the parse layer — this is called BEFORE parse
 *      uses filename heuristics + (optionally) first-row peek.
 *
 * The supersede rule for the brief-merge feature:
 *   • Same SourceType uploaded again → mark old as superseded
 *   • Different SourceTypes → both stay active, both feed analysis
 */

export type SourceType =
  | 'gwi'
  | 'keywords'
  | 'helium10'
  | 'trends'
  | 'konnect'
  | 'social'
  | 'amazon-sales'
  | 'generic-tabular'
  | 'pdf'
  | 'pptx'
  | 'unknown';

/**
 * Classify based on the dominant `tool_type` across this upload's tool_data
 * rows (set by the parsers in handleUpload). Falls back to filename hints
 * when tool_data lookup is empty (e.g. PDF/PPTX uploads that didn't go
 * through Excel parsing).
 */
export function classifySourceType(opts: {
  toolTypes?: string[];   // distinct tool_type values from tool_data for this upload
  filename:   string;
}): SourceType {
  const ext = opts.filename.split('.').pop()?.toLowerCase() ?? '';

  // PDF / PPTX shortcut — these never produce tool_data rows
  if (ext === 'pdf')  return 'pdf';
  if (ext === 'pptx' || ext === 'ppt') return 'pptx';

  // Use the tool_type set if available
  const types = new Set((opts.toolTypes ?? []).map(t => String(t).toLowerCase()));
  if (types.has('gwi_time_spent') || types.has('gwi'))                   return 'gwi';
  if (types.has('keyword_plan')   || types.has('keywords'))              return 'keywords';
  if (types.has('helium10'))                                              return 'helium10';
  if (types.has('google_trends')  || types.has('trends'))                return 'trends';
  if (types.has('konnect'))                                               return 'konnect';
  if (types.has('social_listening') || types.has('social'))              return 'social';
  if (types.has('amazon_sales')   || types.has('amazon'))                return 'amazon-sales';
  if (types.has('generic_table')  || types.has('generic'))               return 'generic-tabular';

  // Filename fallback (for the edge cases where tool_type wasn't stored).
  // Tokenize on word + underscore + dot + dash so "gwi_export" actually
  // matches "gwi" (\b treats underscore as a word char which is wrong here).
  const lower  = opts.filename.toLowerCase();
  const tokens = lower.split(/[_.\-\s\d/]+/).filter(Boolean);  // includes digits as separators
  if (tokens.includes('gwi'))                            return 'gwi';
  if (tokens.includes('helium') || tokens.includes('h')) return 'helium10';
  if (/keyword[_-]?planner|keyword[_-]?stats/.test(lower)) return 'keywords';
  if (/google[_-]?trends|^trends/.test(lower))           return 'trends';
  if (tokens.includes('konnect'))                        return 'konnect';
  if (/brandwatch|meltwater|talkwalker|sprinklr/.test(lower)) return 'social';

  return 'unknown';
}

/** Display-friendly label for the source type (used in UI logs + banners). */
export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  'gwi':             'GWI',
  'keywords':        'Google Keyword Planner',
  'helium10':        'Helium10',
  'trends':          'Google Trends',
  'konnect':         'Konnect Insights',
  'social':          'Social listening',
  'amazon-sales':    'Amazon sales',
  'generic-tabular': 'Tabular data',
  'pdf':             'PDF document',
  'pptx':            'PowerPoint deck',
  'unknown':         'File',
};

/**
 * Decide whether two source types should TRIGGER A SUPERSEDE.
 * Same canonical type → yes (newer wins). Different types → no, they stack.
 *
 * Unknown never supersedes anything (could be anything) and is never
 * superseded by anything else either.
 */
export function shouldSupersede(prior: SourceType, incoming: SourceType): boolean {
  if (prior === 'unknown' || incoming === 'unknown') return false;
  return prior === incoming;
}
