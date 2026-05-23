/**
 * lib/research/blueprints.ts
 *
 * The Research Methodology Blueprint — the Fluo "Digital Audience
 * Research Framework". Source of truth for what an analysis SHOULD
 * cover, where the data lives, and how confidently each metric can
 * be fetched.
 *
 * Consumed by:
 *   • lib/ai/verify/coverage.ts — Coverage Agent (5th voice in council)
 *     checks whether analysis cards actually address each metric
 *   • lib/ai/gemini.ts (future)  — prompt addendum so AI generates cards
 *     structured around these sections from the start
 *   • Optional surface          — drawer behind a small ⓘ icon
 *
 * Single edit point: change a row here and both the AI prompt and the
 * coverage check update on next deploy.
 */

export type Feasibility = 'syndicated' | 'platform' | 'primary';

export interface BlueprintMetric {
  k:      string;       // Metric / row label
  fetch:  string;       // What to capture
  src:    string[];     // Source / method abbreviations
  f:      Feasibility;  // syndicated | platform | primary
  /** Keywords used by the coverage agent to detect whether a card addresses
   *  this metric. Lowercase, hyphens fine. Defaults to a slug of `k`. */
  keywords?: string[];
}

export interface BlueprintSection {
  id:      string;          // A | B | C …
  title:   string;
  obj:     string;          // Objective
  col0:    string;          // Header label for column 0 ("Metric", "Platform", …)
  deliver?: string;         // Optional output description
  foot:    string;          // The READ callout
  /** Brief categories this section is most relevant to. Empty = all. */
  relevantFor?: string[];
  /** Whether the metric list is brand-specific (e.g. J uses brief.competitors). */
  brandDynamic?: boolean;
  rows:    BlueprintMetric[];
}

const S: Feasibility = 'syndicated';
const P: Feasibility = 'platform';
const R: Feasibility = 'primary';

// ── Section data — faithfully translated from the Fluo framework ────────
export const BLUEPRINT_SECTIONS: BlueprintSection[] = [
  {
    id: 'A', title: 'Who, When & How They Use Digital',
    obj: 'Establish the TG\'s size, daily rhythm and device context — the spine every later section hangs on.',
    col0: 'Metric',
    foot: 'Lock the TG definition first (age/SEC/town-class/language). Every reach & size number downstream must use this same filter or the sections won\'t reconcile.',
    rows: [
      { k: 'Audience size',          fetch: 'TG universe by age × SEC × geo (T1/T2) × Hindi-language filter', src: ['IAMAI–Kantar','GWI','Nielsen Bharat','Census proj.'], f: S, keywords: ['audience size','universe','tg size','population'] },
      { k: 'Daily time on digital',  fetch: 'Avg minutes/day, total and split by device',                     src: ['GWI','We Are Social','Comscore'],                  f: S, keywords: ['time on digital','daily time','minutes per day','time spent'] },
      { k: 'Primary device',         fetch: 'Smartphone vs feature-phone split; smartphone price band; data-plan type', src: ['IAMAI','Counterpoint/IDC','GWI','Nielsen Bharat'], f: S, keywords: ['device','smartphone','feature phone','price band'] },
      { k: 'Day-parts',              fetch: '% usage morning / afternoon / evening / late-night',             src: ['Comscore','Meta+YouTube peaks','Fluo listening'],   f: P, keywords: ['day-part','dayparts','morning','evening','time-of-day'] },
      { k: 'Vertical vs horizontal', fetch: '% time vertical vs horizontal — proxied via Shorts/Reels vs long-form mix', src: ['Platform format mix','Primary survey'],     f: P, keywords: ['vertical','horizontal','shorts','reels','long-form'] },
      { k: 'Weekday vs weekend',     fetch: 'Usage index Mon–Fri vs Sat–Sun',                                 src: ['Comscore','data.ai','Platform analytics'],         f: P, keywords: ['weekday','weekend','mon-fri','sat-sun'] },
      { k: 'Work vs leisure time',   fetch: 'Share of usage by context (at-work vs leisure)',                 src: ['Primary survey','GWI context cuts'],               f: R, keywords: ['work','leisure','context'] },
    ],
  },
  {
    id: 'B', title: 'Where They Spend Time — Platforms',
    obj: 'Rank platforms by relevance. For each, capture reach, time and frequency, then derive a priority score.',
    col0: 'Platform',
    deliver: 'Per-platform: reach % · MAU/DAU · time/day · frequency → priority matrix',
    foot: 'Output a single priority matrix = reach × time × category-fit. WhatsApp ranks high on reach but is a distribution layer (forwarding), not a content-measurement surface — score it accordingly.',
    rows: [
      { k: 'YouTube',             fetch: 'Reach %, time/day, Shorts vs long-form split',           src: ['GWI','Comscore','data.ai','Google'],   f: S },
      { k: 'Instagram',           fetch: 'Reach %, time, Reels engagement',                        src: ['GWI','Meta Insights','data.ai'],       f: S },
      { k: 'Facebook',            fetch: 'Reach %, time, group/feed activity',                     src: ['GWI','Meta','Comscore'],               f: S },
      { k: 'WhatsApp',            fetch: 'Penetration %, time — note: in-app content behaviour is encrypted/opaque', src: ['GWI','IAMAI','data.ai (usage only)'], f: S },
      { k: 'OTTs',                fetch: 'Which platforms, reach, AVOD vs SVOD, time',             src: ['FICCI–EY','Ormax','data.ai'],          f: S, keywords: ['ott','hotstar','prime','netflix','jiocinema'] },
      { k: 'E-commerce',          fetch: 'Reach, visit frequency, time (Amazon / Flipkart / Meesho)', src: ['RedSeer','Bain–Flipkart','data.ai'], f: S, keywords: ['e-commerce','ecommerce','amazon','flipkart','meesho'] },
      { k: 'Google / Search',     fetch: 'Reach, query/category behaviour',                        src: ['Comscore','Google Trends'],            f: S, keywords: ['google','search'] },
      { k: 'Short-video (others)',fetch: 'Reach, time, language mix (ShareChat / Moj / Josh)',     src: ['data.ai','Sensor Tower','IAMAI'],      f: P, keywords: ['sharechat','moj','josh','short-video'] },
      { k: 'News platforms',      fetch: 'Reach, source mix, language of consumption',             src: ['Comscore','Reuters DNR','IAMAI'],      f: S, keywords: ['news'] },
    ],
  },
  {
    id: 'C', title: 'What They Use Digital For — Motivations',
    obj: 'Quantify the jobs the TG hires digital for, so content maps to real intent rather than assumption.',
    col0: 'Need / motivation',
    foot: 'House management, deals/savings & parenting are the category-critical motivations for detergent — generic GWI covers the first 6 well; the last few likely need listening + a primary cut to be category-specific.',
    rows: [
      { k: 'Entertainment',        fetch: '% citing as primary reason; activity incidence',          src: ['GWI motivations','IAMAI activity','Fluo listening'], f: S },
      { k: 'Shopping',             fetch: 'Browse/buy incidence; category overlap with FMCG',       src: ['GWI','RedSeer','Fluo listening'],                  f: S },
      { k: 'Education / learning', fetch: 'Incidence; topic mix',                                    src: ['GWI','IAMAI'],                                     f: S, keywords: ['education','learning'] },
      { k: 'Business / work',      fetch: 'Incidence (esp. small-town earners)',                     src: ['GWI','IAMAI'],                                     f: S, keywords: ['business','work'] },
      { k: 'News & information',   fetch: 'Incidence; language',                                     src: ['GWI','Reuters DNR'],                               f: S, keywords: ['news','information'] },
      { k: 'Social connect / chat',fetch: 'Incidence; platform of choice',                           src: ['GWI','IAMAI'],                                     f: S, keywords: ['social connect','chat'] },
      { k: 'Religious / spiritual',fetch: 'Incidence; format & festival linkage',                    src: ['Fluo listening','GWI interests'],                  f: P, keywords: ['religious','spiritual','devotional','festival'] },
      { k: 'Parenting / family',   fetch: 'Incidence; category-adjacent intent',                     src: ['GWI interests','Fluo listening','Primary'],        f: R },
      { k: 'House management',     fetch: 'Incidence of home-care / chores intent (high category relevance)', src: ['Fluo listening','Primary survey'],          f: R, keywords: ['house management','home care','chores','cleaning'] },
      { k: 'Deals / offers / savings', fetch: 'Incidence; price-sensitivity signal',                src: ['GWI','RedSeer','Fluo listening'],                  f: S, keywords: ['deals','offers','savings','price-sensitive'] },
    ],
  },
  {
    id: 'D', title: 'Content Genres They Prefer',
    obj: 'Identify and rank the most-consumed & preferred genres by conversation volume and platform views.',
    col0: 'Genre',
    deliver: 'Per genre: consumption incidence · conversation volume · preference score → ranked list',
    foot: 'Ranking is best driven by Fluo listening volume + YouTube category views together; treat GWI interests as a sense-check. Watch the cleaning-hacks / home-DIY intersection — that\'s where the category lives natively.',
    rows: [
      { k: 'Comedy',                       fetch: 'View/engagement volume; preference rank',                      src: ['Fluo listening','YouTube category','GWI'], f: P },
      { k: 'Cooking',                      fetch: 'Volume; regional-cuisine cut',                                  src: ['Fluo listening','YouTube category'],       f: P },
      { k: 'Hacks',                        fetch: 'Volume; home/cleaning-hack sub-genre (category-adjacent)',     src: ['Fluo listening','YouTube'],                f: P, keywords: ['hacks','cleaning hack','life hack'] },
      { k: 'DIY',                          fetch: 'Volume; home-care overlap',                                     src: ['Fluo listening','YouTube'],                f: P, keywords: ['diy','do it yourself'] },
      { k: 'Religious / devotional',       fetch: 'Volume; festival spikes',                                       src: ['Fluo listening','YouTube','Google Trends'],f: P, keywords: ['religious','devotional','bhajan'] },
      { k: 'Family drama',                 fetch: 'Volume; TV-catch-up overlap',                                   src: ['FICCI–EY','Fluo listening','BARC'],        f: P, keywords: ['family drama','serial','tv'] },
      { k: 'Beauty / personal care',       fetch: 'Volume; creator density',                                       src: ['Fluo listening','YouTube'],                f: P },
      { k: 'Health & wellness',            fetch: 'Volume; topic mix',                                             src: ['Fluo listening','GWI interests'],          f: P },
      { k: 'Parenting',                    fetch: 'Volume; mother-audience overlap',                               src: ['Fluo listening','GWI'],                    f: P },
      { k: 'Motivational',                 fetch: 'Volume; language',                                              src: ['Fluo listening','YouTube'],                f: P },
      { k: 'Finance / savings tips',       fetch: 'Volume; savings-mindset link to category',                      src: ['Fluo listening','Google Trends'],          f: P },
      { k: 'Local-language entertainment', fetch: 'Volume by language; dialect cut',                               src: ['Fluo listening','FICCI–EY','data.ai'],     f: P },
      { k: 'Filmy content / gossip',       fetch: 'Volume; catch-up clip behaviour',                               src: ['Fluo listening','YouTube'],                f: P },
      { k: 'Regional content',             fetch: 'Volume by state/dialect within Hindi belt',                     src: ['Fluo listening','Nielsen Bharat'],         f: P },
      { k: 'Festival-led content',         fetch: 'Spike volume around festival calendar',                         src: ['Fluo listening','Google Trends'],          f: P },
    ],
  },
  {
    id: 'E', title: 'Preferred Content Formats',
    obj: 'Find which formats win on both preference and actual time spent — not just what the platform pushes.',
    col0: 'Format',
    deliver: 'Per format: share of consumption · time spent · engagement rate',
    foot: 'Big-format mix (Reels/Shorts/long) is well-measured; the granular ones (memes, demos, testimonials) need listening + a primary read. End goal: which format earns the most attention per second for this TG.',
    rows: [
      { k: 'Reels',                       fetch: 'Share of IG time; completion/engagement',     src: ['Meta Insights','data.ai','FICCI–EY'], f: S },
      { k: 'Shorts',                      fetch: 'Share of YouTube time; completion',           src: ['YouTube/Google','data.ai'],            f: S },
      { k: 'Long videos',                 fetch: 'Avg view duration; share of video time',      src: ['YouTube','Comscore','FICCI–EY'],       f: S, keywords: ['long-form','long video','long form'] },
      { k: 'Catch-up TV',                 fetch: 'Clip/moment consumption; catch-up incidence', src: ['FICCI–EY','BARC','Fluo listening'],    f: P, keywords: ['catch-up','catchup tv','clip'] },
      { k: 'Static posts',                fetch: 'Reach/engagement vs video',                   src: ['Meta Insights','Fluo listening'],      f: P, keywords: ['static post','image post'] },
      { k: 'Carousels',                   fetch: 'Engagement vs single-image/video',            src: ['Meta Insights'],                        f: P },
      { k: 'Memes',                       fetch: 'Share & shareability; format of virality',    src: ['Fluo listening'],                       f: P },
      { k: 'Live videos',                 fetch: 'Watch incidence; commerce-live overlap',      src: ['Meta/YouTube','data.ai'],              f: P, keywords: ['live video','livestream'] },
      { k: 'Product demos',               fetch: 'View & conversion signal',                    src: ['Fluo listening','Primary'],            f: R, keywords: ['demo','product demo'] },
      { k: 'Reviews / testimonials',      fetch: 'Trust & pre-purchase consumption',            src: ['Fluo listening','Primary'],            f: R, keywords: ['review','testimonial'] },
    ],
  },
  {
    id: 'F', title: 'What Kind of Creators They Follow',
    obj: 'Map creator tiers and pin down who drives trust & action — and the attributes behind that trust.',
    col0: 'Creator type',
    deliver: 'Per type: follow incidence · engagement quality · trust score · conversion influence',
    foot: 'Trust attributes to test: language/dialect match · relatability over polish · demonstrability (before/after) · audience credibility (real followers) · consistency · regional familiarity. Identification = our tools (robust); the "what drives trust" question needs a primary read.',
    rows: [
      { k: 'Micro creators',                  fetch: 'Reach in TG; engagement-rate vs cost; authenticity signal', src: ['FLUO Framework','Qoruz/HypeAuditor','Fluo listening'], f: S, keywords: ['micro creator','micro influencer','nano'] },
      { k: 'Mid-size creators',               fetch: 'Reach × engagement; category fit',                          src: ['FLUO Framework','Qoruz/HypeAuditor'],                  f: S, keywords: ['mid-size','mid tier'] },
      { k: 'Large influencers',               fetch: 'Reach; audience credibility (real vs bought)',              src: ['FLUO Framework','HypeAuditor'],                        f: S, keywords: ['large influencer','macro'] },
      { k: 'Celebrities',                     fetch: 'Aided recall; aspiration vs relatability trade-off',        src: ['FLUO Framework','Primary'],                            f: R, keywords: ['celebrity','celeb'] },
      { k: 'Experts / specialists',           fetch: 'Trust on efficacy claims (stain/wash demos)',               src: ['Fluo listening','Primary'],                            f: R, keywords: ['expert','specialist'] },
      { k: 'Regional creators',               fetch: 'Dialect match; in-belt reach',                              src: ['FLUO Framework','Fluo listening'],                     f: S, keywords: ['regional creator','dialect','vernacular'] },
      { k: 'Family / lifestyle creators',     fetch: 'Home-context fit; mother-audience overlap',                 src: ['FLUO Framework','Qoruz'],                              f: S, keywords: ['family creator','lifestyle creator','mother'] },
      { k: 'Religious leaders',               fetch: 'Reach & trust; brand-safety considerations',                src: ['Fluo listening','Primary'],                            f: R, keywords: ['religious leader','spiritual leader'] },
      { k: 'Shopping reviewers',              fetch: 'Pre-purchase influence; conversion proximity',              src: ['Fluo listening','Primary'],                            f: R, keywords: ['shopping reviewer','review creator'] },
    ],
  },
  {
    id: 'G', title: 'User Behaviour on Digital',
    obj: 'Determine whether the TG is active or passive, and how far down the create→share→buy chain they go.',
    col0: 'Behaviour',
    foot: 'Engagement behaviours (1–6) are GWI-measurable; WhatsApp forwarding and buying-from-link need a primary read because the surfaces don\'t expose clean data. The forwarding behaviour is likely a defining trait of this TG — prioritise it.',
    rows: [
      { k: 'Active vs passive',          fetch: 'Lurker vs participant ratio',                       src: ['GWI behaviours','Fluo listening'],     f: S, keywords: ['active','passive','lurker','participant'] },
      { k: 'Post regularly',             fetch: 'Posting incidence & frequency',                     src: ['GWI','Fluo listening'],                f: S, keywords: ['post','posting'] },
      { k: 'Create reels/videos',        fetch: 'Creation incidence',                                src: ['GWI','data.ai'],                       f: S, keywords: ['create','creation'] },
      { k: 'Share on WhatsApp',          fetch: 'Forwarding incidence (key for this TG)',            src: ['GWI','Primary'],                       f: P, keywords: ['whatsapp share','forwarding','forward'] },
      { k: 'Comment / like / save',      fetch: 'Engagement-action rates',                            src: ['GWI','Meta Insights'],                 f: S, keywords: ['comment','like','save','engagement'] },
      { k: 'Search before purchase',     fetch: 'Pre-purchase research incidence',                    src: ['GWI','RedSeer','Google Trends'],       f: S, keywords: ['pre-purchase','search before'] },
      { k: 'Trust creator recommendations', fetch: 'Stated reliance on creator advice',              src: ['GWI','Primary'],                       f: P, keywords: ['creator reco','creator recommendation'] },
      { k: 'Buy from in-content links',  fetch: 'Social-commerce / shoppable-link conversion',       src: ['RedSeer','Meta Commerce','Primary'],   f: R, keywords: ['social commerce','shoppable','in-content link'] },
    ],
  },
  {
    id: 'H', title: 'Time Spent by Format & Source',
    obj: 'Quantify share of attention across the key tensions — to name the single content type to bet on.',
    col0: 'Attention split',
    foot: 'This card is the decision layer — it converges A–G into "where attention actually sits". Creator-vs-platform split needs custom analysis on top of panel data; TV-vs-digital and format mix are directly measurable.',
    rows: [
      { k: 'Creator-led vs platform-led',  fetch: 'Share of time on creator content vs platform/algorithmic feed', src: ['Comscore','GWI','Custom analysis'], f: P, keywords: ['creator-led','platform-led','algorithmic feed'] },
      { k: 'Reels vs long-form',           fetch: 'Time split short vs long video',                                src: ['data.ai','Comscore','YouTube'],     f: S },
      { k: 'Entertainment vs shopping',    fetch: 'Time split by purpose',                                          src: ['GWI','Comscore'],                   f: P },
      { k: 'E-comm browse vs buy',         fetch: 'Browsing time vs transaction incidence',                         src: ['RedSeer','data.ai'],                f: S, keywords: ['browse','buy','transaction'] },
      { k: 'TV vs digital video',          fetch: 'Share of video time TV vs digital',                              src: ['BARC','FICCI–EY','Nielsen'],        f: S, keywords: ['tv vs digital'] },
      { k: 'Cross-platform attention',     fetch: '% attention split across the Section-B platforms',               src: ['Comscore','GWI'],                   f: P, keywords: ['cross-platform','multi-platform'] },
    ],
  },
  {
    id: 'I', title: 'Trust & Preference Building for Brands',
    obj: 'Identify what builds consideration in this category — and separate trial drivers from loyalty drivers.',
    col0: 'Driver',
    deliver: 'Two ranked lists: what creates trial vs what builds long-term preference',
    foot: 'This is the most primary-research-dependent section — a MaxDiff / key-driver study is the right instrument. Listening & review-mining supply directional support, but driver importance can\'t be fetched off-the-shelf.',
    rows: [
      { k: 'Product performance / before-after', fetch: 'Importance weight; demonstrability',          src: ['Primary (key-driver)','Fluo listening'], f: R, keywords: ['product performance','before/after','before after','efficacy'] },
      { k: 'Creator recommendations',           fetch: 'Influence weight on consideration',          src: ['Primary','Fluo listening'],              f: R, keywords: ['creator recommendation','influencer reco'] },
      { k: 'Family / friends recommendations',  fetch: 'Word-of-mouth weight',                        src: ['Primary'],                                f: R, keywords: ['word of mouth','wom','family reco'] },
      { k: 'Reviews & ratings',                 fetch: 'Pre-purchase reliance; rating sensitivity',   src: ['RedSeer','Review mining','Primary'],     f: P, keywords: ['review','rating'] },
      { k: 'Price & offers',                    fetch: 'Price-elasticity & promo sensitivity',        src: ['Primary','RedSeer'],                     f: R, keywords: ['price','offer','promo','discount'] },
      { k: 'Brand reputation',                  fetch: 'Equity / familiarity weight',                 src: ['Primary','Fluo listening'],              f: R, keywords: ['brand reputation','equity','familiarity'] },
      { k: 'Celebrity endorsement',             fetch: 'Endorsement impact vs relatability',          src: ['Primary'],                                f: R, keywords: ['celebrity endorsement','celebrity'] },
      { k: 'Regional relevance',                fetch: 'Local-context resonance',                     src: ['Primary','Fluo listening'],              f: P, keywords: ['regional relevance','local'] },
      { k: 'Language familiarity',              fetch: 'Dialect/Hindi-creative impact',               src: ['Primary','Fluo listening'],              f: P, keywords: ['language','dialect','hindi'] },
      { k: 'Cross-platform visibility',         fetch: 'Frequency/SoV effect on preference',          src: ['Primary','Comscore'],                    f: P, keywords: ['cross-platform visibility','sov','share of voice'] },
    ],
  },
  {
    id: 'J', title: 'Competition — Digital Plan & Budget',
    obj: 'Map each rival\'s platforms, digital plan & estimated annual spend. Creative output is secondary.',
    col0: 'Brand',
    deliver: 'Per brand: platforms + SoV · creative themes & flighting · est. measured-media spend · est. digital share · cadence',
    foot: 'Platforms & live creatives are directly fetchable from Meta Ad Library + Google Ads Transparency Center (free, current). Exact digital budgets are estimates — TAM AdEx skews to TV/print; label every spend figure as an estimate with its derivation.',
    brandDynamic: true,  // rows generated from brief.competitors
    rows: [],            // populated at runtime per brief
  },
];

/** Resolve sections for a specific brief — keeps generic A–I, expands J
 *  from brief.competitors into per-brand rows. */
export function blueprintsForBrief(brief: { competitors?: string | null } | null | undefined): BlueprintSection[] {
  return BLUEPRINT_SECTIONS.map(s => {
    if (!s.brandDynamic) return s;
    // Expand competitor list into rows
    const competitors = String(brief?.competitors || '')
      .split(/[,;·|\/]+/).map(x => x.trim()).filter(Boolean);
    if (competitors.length === 0) return { ...s, rows: [] };
    return {
      ...s,
      rows: competitors.map(brand => ({
        k:     brand,
        fetch: 'Platforms, live creatives, flighting, est. spend & digital share',
        src:   ['Meta Ad Library','Google ATC','TAM AdEx','Fluo tracking'],
        f:     P,
        keywords: [brand.toLowerCase()],
      })),
    };
  });
}

/** Build a flat list of all keywords this analysis is expected to address.
 *  Used by the coverage agent to score how many were addressed. */
export function expectedKeywordsForBrief(brief: { competitors?: string | null } | null | undefined): Array<{ section: string; metric: string; keywords: string[]; feasibility: Feasibility }> {
  const out: Array<{ section: string; metric: string; keywords: string[]; feasibility: Feasibility }> = [];
  for (const s of blueprintsForBrief(brief)) {
    for (const r of s.rows) {
      const kws = r.keywords && r.keywords.length > 0
        ? r.keywords.map(k => k.toLowerCase())
        : [r.k.toLowerCase()];
      out.push({ section: s.id, metric: r.k, keywords: kws, feasibility: r.f });
    }
  }
  return out;
}
