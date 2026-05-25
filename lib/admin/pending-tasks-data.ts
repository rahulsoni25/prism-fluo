/**
 * lib/admin/pending-tasks-data.ts
 *
 * Single source of truth for everything currently parked / deferred /
 * hidden / waiting on a decision. Surfaces in /admin/pending-tasks for
 * the user, AND is the reference for future Claude sessions per the
 * <hidden-features-reminder> + <proactive-solve-rule> in AGENTS.md.
 *
 * Adding a new task: append a row to PENDING_TASKS below. Mirror it in
 * the relevant docs/*.md file. Keep the id stable (kebab-case) — it's
 * how the admin UI deep-links.
 */

export type TaskCategory =
  | 'hidden-feature'        // UI gated behind {false && ...}
  | 'decision'              // awaiting user input
  | 'deferred-improvement'  // intentionally deferred — not blocking
  | 'technical-debt';       // known cleanup work

export type Criticality = 'high' | 'medium' | 'low';

export type TaskStatus =
  | 'open'                  // raised, not yet acted on
  | 'parked'                // user said "later" explicitly
  | 'in-progress'           // partial work shipped, more to do
  | 'awaiting-confirmation' // proposal made, user reply pending
  | 'resolved';             // shipped + verified working — kept as historical record

export interface PendingTask {
  id:             string;
  title:          string;
  emoji?:         string;
  category:       TaskCategory;
  criticality:    Criticality;
  /** ISO date when the topic was last discussed in chat. */
  dateDiscussed:  string;
  /** Why it came up + what triggered it. 1-3 sentences. */
  context:        string;
  status:         TaskStatus;
  /** Rough effort estimate to resolve. */
  effort?:        string;
  /** Comma-separated file paths where the relevant code lives. */
  whereInCode?:   string;
  /** Concrete steps that must precede resolution (if non-trivial). */
  blockers?:      string[];
  /** Link to the markdown doc that carries the longer narrative. */
  doc?:           string;
  /** ISO date when status flipped to 'resolved'. Display-only — UI greys
   *  out resolved tasks and shows this date next to a ✓. */
  resolvedDate?:  string;
  /** Short note on HOW it was resolved — surfaces on the resolved card. */
  resolution?:    string;
}

export const PENDING_TASKS: PendingTask[] = [
  // ── HIGH ────────────────────────────────────────────────────────────
  {
    id:            'oauth-login-google',
    title:         'Google OAuth login — LIVE',
    emoji:         '🔐',
    category:      'hidden-feature',
    criticality:   'high',
    dateDiscussed: '2026-05-25',
    context:       'Google OAuth button restored on /login (2026-05-25). Server-driven via /api/auth/providers — button auto-appears when env vars are present. Backend routes /api/auth/oauth/google + callback already existed.',
    status:        'resolved',
    resolvedDate:  '2026-05-25',
    resolution:    'User registered redirect URI https://prism-fluo.vercel.app/api/auth/oauth/google/callback in Google Cloud Console (Prism Fluo Web client), pasted AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET into Vercel env, Vercel redeployed, button appeared at /login, round-trip verified working. Old duplicate client secret (****hyck Apr 29) disabled per security hygiene — only the Apr 30 secret remains active.',
    effort:        '~10 min Vercel env + 5 min Google Console (actual: ~15 min)',
    whereInCode:   'app/login/page.js (UI) · app/api/auth/oauth/google/route.ts (backend) · app/api/auth/providers/route.ts (env-detection)',
    doc:           'docs/HIDDEN-FEATURES.md#2-🔐-oauth-login-google-ui-live-env-vars-pending',
  },

  // ── MEDIUM ──────────────────────────────────────────────────────────
  {
    id:            'live-google-trends-panel',
    title:         'Live Google Trends panel (dashboard)',
    emoji:         '📊',
    category:      'hidden-feature',
    criticality:   'medium',
    dateDiscussed: '2026-05-25',
    context:       'Panel surfaced "indicative trend · live data syncing" copy without a verified Trends API behind it. Pulled until we wire a real grounded source.',
    status:        'parked',
    effort:        '~4 hrs (code) + cost of API tier',
    whereInCode:   'app/dashboard/page.js:163 (gate) · components/TrendPanel.jsx (component)',
    blockers:      [
      'Pick a real Trends source: paid Google Trends API, Glimpse, in-house puppeteer cache, or third-party enrichment SaaS',
      'Match "Indicative trend" copy to the actual data freshness',
      'Add a verified-source badge so users see provenance',
      'Re-add tests for the rendered panel state',
    ],
    doc:           'docs/HIDDEN-FEATURES.md#1-📊-live-google-trends-panel',
  },
  {
    id:            'genre-nuggets-gwi-tier2',
    title:         'Genre preferences from GWI ("Content Genres They Prefer" card)',
    emoji:         '🎬',
    category:      'decision',
    criticality:   'medium',
    dateDiscussed: '2026-05-25',
    context:       'User wants a card ranking most-consumed/preferred content genres. GWI is the right source (direct survey data). Today our parser only handles "Time Spent" GWI exports — needs generalizing to also recognize "TV genres", "music genres", "content topics", "media platforms" question shapes. Picked Option 2 (generalize GWI handling). Awaiting confirmation that user actually uploads non-time-spent GWI files + a sample to verify the parser.',
    status:        'awaiting-confirmation',
    effort:        '~4 hrs',
    whereInCode:   'lib/gwi/parser.ts · lib/gwi/detector.ts · would add lib/nuggets/genres.ts + <GenreNuggetCard>',
    blockers:      [
      'Confirm user uploads non-time-spent GWI exports in practice',
      'Share a sample non-time-spent GWI file (or screenshot of col 0) to verify detector recognizes it',
      'Confirm placement: card lives in Content tab (per spec) with MEDIA cross-ref pill — NOT in Creative as initially requested',
    ],
    doc:           'docs/PENDING-DECISIONS.md',
  },
  {
    id:            'classifier-mode-b-audit',
    title:         'PRISM Insight Classifier — Mode B (bulk audit + retag)',
    emoji:         '🏷',
    category:      'decision',
    criticality:   'medium',
    dateDiscussed: '2026-05-24',
    context:       'Option B classifier (variable-axis tagging at write-time) shipped today. Mode B — bulk-audit existing analyses against the 9-bucket spec and surface MOVE recommendations — is parked. Would re-bucket a non-trivial portion of historical analyses.',
    status:        'parked',
    effort:        '~16 hrs (was Option 5 in the original feasibility doc)',
    whereInCode:   'Would add lib/ai/verify/classifier.ts + admin audit UI',
    blockers:      [
      'Confirm OK with directional re-bucketing of historical analyses',
      'Decide: classifier auto-applies for High confidence OR always requires human approve',
      'Decide: run at analyze-time, on-demand, or both',
    ],
    doc:           'docs/PENDING-DECISIONS.md#-prism-insight-classifier-9-bucket-spec',
  },
  {
    id:            'presentation-templates-4-7',
    title:         'Re-validate + re-enable presentation templates 4-7',
    emoji:         '📑',
    category:      'hidden-feature',
    criticality:   'medium',
    dateDiscussed: 'pre-session',
    context:       'Templates for Board / Internal Team / Investor / Quick Overview were hidden because their generated decks did not meet the 10/10 client-ready bar. Code + content intact in the templates file.',
    status:        'parked',
    effort:        '~3-5 hrs per template to re-validate',
    whereInCode:   'lib/templates/definitions.ts:164, 211, 253, 300',
    blockers:      [
      'Re-validate each template against the ppt-review skill rubric',
      'Test with real client data (not synthetic fixtures)',
      'Update Coverage agent if templates introduce new methodology sections',
    ],
    doc:           'docs/HIDDEN-FEATURES.md#3-📑-presentation-templates-4-7-board--internal--investor--quick-overview',
  },
  {
    id:            'tsc-errors-cleanup',
    title:         '31 pre-existing tsc errors in untouched files',
    emoji:         '🧹',
    category:      'technical-debt',
    criticality:   'medium',
    dateDiscussed: '2026-05-25',
    context:       'After today\'s work, repo still has 31 typecheck errors in code paths we did not touch this session (auth routes RateLimitVerdict narrowing, analyze/page.tsx, etc.). They predate the agent network work. Blocking literal 10/10 typecheck cleanliness.',
    status:        'open',
    effort:        '~2 hrs careful work in unrelated code',
    whereInCode:   'app/api/auth/* (RateLimitVerdict narrowing), app/analyze/page.tsx, app/api/analyses/route.ts, app/api/health/route.ts',
    blockers:      [
      'Scope: explicitly NOT touched in agent-network session to avoid regression risk',
      'Need dedicated focused pass with QA on each affected route',
    ],
  },

  // ── LOW ─────────────────────────────────────────────────────────────
  {
    id:            'tools-used-panel-insights',
    title:         'Tools-used panel on /insights (redesign + re-enable)',
    emoji:         '🛠',
    category:      'hidden-feature',
    criticality:   'low',
    dateDiscussed: '2026-05-07',
    context:       'Per-tool data-source breakdown panel was hidden because it duplicated the per-card source badge. Component still in code.',
    status:        'parked',
    effort:        '~2 hrs (redesign) + 1 hr to re-enable',
    whereInCode:   'app/insights/page.js:2108',
    blockers:      [
      'Redesign so it does not duplicate the per-card source badge',
      'Decide: surface on every analysis OR only on multi-source uploads',
    ],
    doc:           'docs/HIDDEN-FEATURES.md#4-🛠-tools-used-panel-on-insights',
  },
  {
    id:            'mobile-responsive-admin',
    title:         'Mobile-responsive admin pages',
    emoji:         '📱',
    category:      'deferred-improvement',
    criticality:   'low',
    dateDiscussed: '2026-05-25',
    context:       'Admin dashboards (mapper-history, verification-history, export-history, agents, pending-tasks) are desktop-only. Acceptable because admin workflows happen on desktop in practice.',
    status:        'parked',
    effort:        '~3 hrs',
    whereInCode:   'app/admin/**/page.tsx',
    blockers:      [
      'No real demand yet — defer until first admin asks for mobile access',
    ],
  },
  {
    id:            'per-user-cloudconvert-quota',
    title:         'Per-user CloudConvert quota guard',
    emoji:         '💰',
    category:      'deferred-improvement',
    criticality:   'low',
    dateDiscussed: '2026-05-25',
    context:       'CloudConvert usage is shared across all users on the same API key. A single heavy user could burn the daily free-tier budget (25 minutes/day) and block everyone else.',
    status:        'parked',
    effort:        '~2 hrs',
    whereInCode:   'app/api/compress/route.ts · app/api/upload/via-cloudconvert/* · lib/compress/cloudconvert.ts',
    blockers:      [
      'No real risk until 10+ active users — defer',
    ],
  },
];

/** Sort tasks for display: critical first, then by date desc, then by title. */
export function sortedTasks(): PendingTask[] {
  const critOrder: Record<Criticality, number> = { high: 0, medium: 1, low: 2 };
  return [...PENDING_TASKS].sort((a, b) => {
    if (critOrder[a.criticality] !== critOrder[b.criticality]) {
      return critOrder[a.criticality] - critOrder[b.criticality];
    }
    if (a.dateDiscussed !== b.dateDiscussed) {
      return a.dateDiscussed < b.dateDiscussed ? 1 : -1;
    }
    return a.title.localeCompare(b.title);
  });
}

/** Summary counts for the page header. */
export function taskStats() {
  const byCriticality = { high: 0, medium: 0, low: 0 };
  const byStatus = { open: 0, parked: 0, 'in-progress': 0, 'awaiting-confirmation': 0, resolved: 0 };
  const byCategory: Record<TaskCategory, number> = {
    'hidden-feature': 0, 'decision': 0, 'deferred-improvement': 0, 'technical-debt': 0,
  };
  for (const t of PENDING_TASKS) {
    byCriticality[t.criticality]++;
    byStatus[t.status]++;
    byCategory[t.category]++;
  }
  return { total: PENDING_TASKS.length, byCriticality, byStatus, byCategory };
}
