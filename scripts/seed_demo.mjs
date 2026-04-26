/**
 * scripts/seed_demo.mjs
 *
 * Seeds the prototype demo data so a fresh deployment renders a fully-populated
 * dashboard on first load — useful for client demos.
 *
 * Idempotent: if a "Nike India" brief already exists OR SEED_DEMO is explicitly
 * set to "false", this script does nothing. Re-running is safe.
 *
 * Mirrors the prototype-v2 HTML the team uses for client previews:
 *   • 4 briefs (Nike India, Nescafé Premium, L'Oréal Paris, Tata Motors EV)
 *   • 1 saved analysis (Nike India) with 16 insight cards across all 4 buckets,
 *     verbatim from the prototype.
 */

import pkg from 'pg';
const { Client } = pkg;

const NIKE_CHARTS = [
  // ── CONTENT ──────────────────────────────────────────────
  {
    title: 'Short-form video dominates engagement for the 18–34 segment',
    bucket: 'content', type: 'bar', conviction: 94,
    toolLabel: 'GWI', lbl: 'CONTENT FORMAT ENGAGEMENT INDEX',
    obs: 'Among 18–34 sports & fitness enthusiasts in India, short-form video (15–30s) generates 4.2× higher engagement than static posts. Instagram Reels drives 62% of content consumption in this segment; YouTube Shorts accounts for 28%. Daily viewing time for short-form video has grown 67% YoY.',
    stat: '4.2× higher engagement for short-form vs. static content',
    rec: 'Shift 65–70% of content budget to short-form video. Build a Reels-first content calendar with weekly cadence. Prioritise vertical video production to reduce repurposing friction across platforms.',
    computedChartData: {
      labels: ['Short-form Video', 'Long-form Video', 'Stories', 'Carousels', 'Static Image'],
      datasets: [{ label: 'Engagement Multiplier', data: [4.2, 2.1, 1.8, 1.5, 1.0], backgroundColor: ['#2563EB','rgba(37,99,235,.7)','rgba(37,99,235,.5)','rgba(37,99,235,.35)','rgba(37,99,235,.22)'] }],
    },
  },
  {
    title: 'Behind-the-scenes athlete content drives highest save & share rates',
    bucket: 'content', type: 'hbar', conviction: 91,
    toolLabel: 'KONNECT INSIGHTS', lbl: 'CONTENT FORMAT BY ENGAGEMENT TYPE',
    obs: 'Analysis of 1.4M content pieces shows BTS athlete content drives 3.8× higher save rate and 2.1× higher share rate vs. polished campaign content. Indian athletes generate disproportionately high engagement among 18–34 target segments.',
    stat: '3.8× higher save rate for BTS athlete content',
    rec: 'Develop a recurring BTS series with Nike-partnered Indian athletes. A monthly "Training Ground" series on Instagram and YouTube showing authentic moments will build loyalty and differentiation.',
    computedChartData: {
      labels: ['BTS Athlete', 'Tutorial', 'Product Demo', 'Campaign Hero', 'Lifestyle'],
      datasets: [{ label: 'Save Rate Multiplier', data: [3.8, 2.6, 2.1, 1.4, 1.0], backgroundColor: '#2563EB' }],
    },
  },
  {
    title: 'User-generated content drives 28% higher purchase intent',
    bucket: 'content', type: 'bar', conviction: 89,
    toolLabel: 'BRANDWATCH', lbl: 'CONVERSION % BY CONTENT SOURCE',
    obs: 'Target audience shows significantly higher purchase intent from peer-created content. "Product in use" UGC drives 28% higher conversion for footwear. Nike India currently has limited UGC amplification vs. Adidas and Puma.',
    stat: '28% higher conversion with UGC vs. brand-produced content',
    rec: 'Launch a structured UGC campaign (#JustMoveIndia) incentivising customers to share authentic product-in-use content. Build a clear submission and amplification pipeline across tier 1 and tier 2 markets.',
    computedChartData: {
      labels: ['UGC Product-in-use', 'Influencer', 'Brand Content', 'Celebrity'],
      datasets: [{ label: 'Conversion %', data: [28, 24, 22, 19], backgroundColor: ['#2563EB','#10B981','rgba(37,99,235,.5)','rgba(37,99,235,.3)'] }],
    },
  },
  {
    title: 'Voice search in the fitness category growing at 34% YoY',
    bucket: 'content', type: 'line', conviction: 87,
    toolLabel: 'GOOGLE TRENDS', lbl: 'VOICE SEARCH GROWTH — FITNESS CATEGORY',
    obs: 'Voice-based search queries in sports & fitness have grown 34% YoY among 18–34 Indians. Queries are conversational and intent-heavy ("best running shoes for flat feet under ₹5000"). Voice search optimisation remains largely untapped across the sportswear category.',
    stat: '34% YoY growth in voice search within fitness category',
    rec: 'Develop FAQ-structured long-form content targeting conversational voice-query formats. Partner with fitness podcasts for voice-first advertising placements.',
    computedChartData: {
      labels: ['2021', '2022', '2023', '2024', '2025'],
      datasets: [{ label: 'Voice search index', data: [100, 118, 142, 178, 239], borderColor: '#2563EB', backgroundColor: 'rgba(37,99,235,.18)', fill: true }],
    },
  },

  // ── COMMERCE ─────────────────────────────────────────────
  {
    title: '73% of the target audience researches on social before purchasing',
    bucket: 'commerce', type: 'bar', conviction: 95,
    toolLabel: 'GWI', lbl: 'PRE-PURCHASE RESEARCH PLATFORMS',
    obs: '73% of 18–34 Nike target consumers in India research on Instagram or YouTube before visiting a brand website or e-commerce platform. The average purchase journey spans 4.7 touchpoints, with social as discovery and Amazon/Myntra as conversion. Nike\'s DTC website conversion rate sits at 12% vs. a category average of 19%.',
    stat: '4.7 touchpoints in the average purchase journey',
    rec: 'Integrate Instagram Shopping and YouTube product tagging to create shoppable content touchpoints. Invest in retargeting that bridges social discovery to purchase. Prioritise DTC website UX improvements to close the 7-point gap vs. category peers.',
    computedChartData: {
      labels: ['Instagram', 'YouTube', 'Google Search', 'Amazon', 'Brand Site'],
      datasets: [{ label: '% of journeys', data: [73, 58, 41, 36, 22], backgroundColor: '#059669' }],
    },
  },
  {
    title: 'Amazon India drives 34% of sportswear discovery — Nike underindexes vs. Adidas',
    bucket: 'commerce', type: 'hbar', conviction: 93,
    toolLabel: 'HELIUM10', lbl: 'AMAZON INDIA AD PRESENCE — TOP 10 KEYWORDS',
    obs: 'Helium10 data shows Nike-related keywords generating 890,000+ monthly searches on Amazon India, yet brand sponsored ad presence score is 40% lower than Adidas. Nike ranks below Adidas in organic results for 6 of the top 10 high-intent search terms.',
    stat: '890K monthly Amazon searches · Nike ad presence 40% lower than Adidas',
    rec: 'Significantly increase Amazon Ads investment with a keyword-first strategy. Build A+ content for top-selling SKUs with lifestyle imagery. Consider exclusive Amazon launch bundles to leverage the platform\'s discovery power.',
    computedChartData: {
      labels: ['Adidas', 'Puma', 'Nike', 'Reebok', 'New Balance', 'Asics'],
      datasets: [{ label: 'Ad presence score', data: [82, 71, 49, 38, 31, 24], backgroundColor: '#059669' }],
    },
  },
  {
    title: 'Price-to-value perception gap in tier 2/3 cities is a significant opportunity',
    bucket: 'commerce', type: 'bar', conviction: 90,
    toolLabel: 'COMSCORE', lbl: 'TIER-WISE BRAND ASPIRATION VS CONVERSION',
    obs: 'Brand consideration for Nike remains high in tier 2/3 cities (score: 74%), but purchase conversion is 3× lower than tier 1. The primary barrier is price-to-value perception. The ₹2,000–₹4,000 price band has the highest search velocity in non-metro markets, where Nike has minimal SKU presence.',
    stat: '3× lower conversion in tier 2/3 despite 74% brand aspiration score',
    rec: 'Introduce a dedicated mid-range line for tier 2/3 markets positioned as "premium accessible". Create new entry-point SKUs that protect premium brand equity while driving volume — avoid discounting hero products.',
    computedChartData: {
      labels: ['Tier 1', 'Tier 2', 'Tier 3'],
      datasets: [
        { label: 'Aspiration %', data: [88, 74, 68], backgroundColor: '#059669' },
        { label: 'Conversion %', data: [22, 9, 7],   backgroundColor: 'rgba(5,150,105,.45)' },
      ],
    },
  },
  {
    title: 'Top 5 city clusters drive 58% of all sportswear purchase signals',
    bucket: 'commerce', type: 'pie', conviction: 88,
    toolLabel: 'SIMILARWEB', lbl: 'CITY CLUSTER SHARE OF PURCHASE INTENT',
    obs: 'Purchase intent signals for sportswear show a clear metro-heavy concentration. Bangalore (Koramangala, Whitefield), Mumbai (Central, Andheri) and Delhi NCR (South Delhi, Gurgaon) show the highest intent scores. Tier 2 cities like Pune, Chandigarh, and Kochi show emerging intent pockets.',
    stat: 'Top 5 high-intent city clusters contribute 58% of all sportswear online purchase signals',
    rec: 'Prioritise hyperlocal digital media investment in top-intent pin code clusters. Run Bangalore and Mumbai first-wave launch campaigns, followed by Delhi NCR. Build a phased tier 2 rollout starting with Pune, Chandigarh, and Kochi.',
    computedChartData: {
      labels: ['Bangalore', 'Mumbai', 'Delhi NCR', 'Hyderabad', 'Pune', 'Other'],
      datasets: [{ data: [16, 14, 13, 8, 7, 42], backgroundColor: ['#059669','#10B981','#34D399','#6EE7B7','#A7F3D0','#D1FAE5'] }],
    },
  },

  // ── COMMUNICATION ────────────────────────────────────────
  {
    title: 'Purpose-led messaging drives 41% higher brand affinity in the category',
    bucket: 'communication', type: 'bar', conviction: 92,
    toolLabel: 'BRANDWATCH', lbl: 'AFFINITY SCORE BY MESSAGE TYPE',
    obs: 'Sentiment analysis of 2.3M brand mentions shows purpose-driven campaigns generate 41% higher brand affinity scores vs. product-led advertising. Adidas\'s "Impossible Is Nothing" India adaptations outperformed Nike\'s recent campaigns in earned media value by 28%.',
    stat: '41% higher brand affinity for purpose-led vs. product-led communication',
    rec: 'Develop a long-term purpose campaign rooted in Indian grassroots sports. A "Nayi Daud" platform spotlighting non-elite Indian athletes across kabaddi, athletics, and local football would build authentic cultural capital and differentiate from Adidas.',
    computedChartData: {
      labels: ['Purpose-led', 'Humour', 'Social Proof', 'Celebrity', 'Product-led'],
      datasets: [{ label: 'Affinity score', data: [78, 71, 68, 62, 55], backgroundColor: ['#7C3AED','rgba(124,58,237,.7)','rgba(124,58,237,.55)','rgba(124,58,237,.4)','rgba(124,58,237,.28)'] }],
    },
  },
  {
    title: '"Quality" and "durability" are the top positive brand associations',
    bucket: 'communication', type: 'pie', conviction: 89,
    toolLabel: 'BRANDWATCH', lbl: 'POSITIVE BRAND ASSOCIATIONS — SHARE OF MENTIONS',
    obs: 'NLP analysis of Nike-related social conversations shows "quality" (38%), "durability" (31%), and "style" (27%) as top positive associations. Negative sentiment clusters around "price" (44%) and "availability in India" (28%). Conversation volume is growing 18% YoY but share of voice declined 4 points vs. last year.',
    stat: '"Quality" & "durability" account for 69% of all positive brand mentions',
    rec: 'Lead communication with product quality and durability proof-points. Develop a "Built to Last" content series showcasing Nike\'s performance in Indian conditions — heat, terrain, urban life — to own and defend the quality narrative.',
    computedChartData: {
      labels: ['Quality', 'Durability', 'Style', 'Comfort', 'Innovation'],
      datasets: [{ data: [38, 31, 27, 18, 12], backgroundColor: ['#7C3AED','#A78BFA','#C4B5FD','#DDD6FE','#EDE9FE'] }],
    },
  },
  {
    title: 'Marathon season triggers a 3.4× spike in running shoe search intent',
    bucket: 'communication', type: 'line', conviction: 91,
    toolLabel: 'GOOGLE TRENDS', lbl: 'MONTHLY SEARCH INDEX — RUNNING SHOES',
    obs: 'Search data shows a 3.4× spike in running-related queries during Oct–Dec and Jan–Feb marathon seasons (Mumbai, Delhi, Bengaluru, Hyderabad marathons). The current Nike India communication calendar does not align with these intent peaks. Asics and New Balance already capitalise on this window.',
    stat: '3.4× search spike during marathon season — currently a missed window',
    rec: 'Build a marathon-season communication calendar with 6-week lead-up activations for each major city race. Create city-specific, runner-targeted creatives with search-backed messaging. Sponsor city marathon events for earned media amplification.',
    computedChartData: {
      labels: ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'],
      datasets: [{ label: 'Search index', data: [100, 108, 122, 198, 287, 340, 308, 232, 144], borderColor: '#7C3AED', backgroundColor: 'rgba(124,58,237,.18)', fill: true }],
    },
  },
  {
    title: 'Nano and micro-influencers outperform celebrities 3:1 on conversion',
    bucket: 'communication', type: 'bar', conviction: 88,
    toolLabel: 'KONNECT INSIGHTS', lbl: 'INFLUENCER TIER vs CONVERSION',
    obs: 'Sportswear influencer campaign analysis shows nano-influencers (10K–50K) and micro-influencers (50K–200K) in fitness drive 3.1× higher conversion than celebrity ambassadors. Authenticity scores are 2.7× higher. 61% of 18–34 consumers report skipping celebrity-fronted social ads.',
    stat: '3.1× higher conversion from nano/micro vs. celebrity influencers',
    rec: 'Rebalance influencer spend towards a larger base of nano and micro fitness creators. Build a "Nike India Creator Community" of 50–100 fitness-authentic voices across metro and tier 1 cities. Use celebrities for brand-building reach; micro-influencers for performance conversion.',
    computedChartData: {
      labels: ['Nano (10–50K)', 'Micro (50–200K)', 'Mid (200K–1M)', 'Macro (1M+)', 'Celebrity'],
      datasets: [{ label: 'Conversion index', data: [310, 270, 175, 130, 100], backgroundColor: '#7C3AED' }],
    },
  },

  // ── CULTURE ──────────────────────────────────────────────
  {
    title: 'Everyday fitness culture is replacing elite sport aspiration',
    bucket: 'culture', type: 'line', conviction: 93,
    toolLabel: 'GWI', lbl: '% EXERCISING 3+ TIMES/WEEK — 18–34 INDIANS',
    obs: '67% of 18–34 year olds in India now report exercising 3+ times/week — a 23% increase in 4 years. Fitness identity has shifted from "spectator sport fan" to "everyday mover". Searches for "home workout", "running tips", and "yoga for beginners" have collectively grown 89% since 2022.',
    stat: '67% of target audience exercises 3+ times/week — up 23% in 4 years',
    rec: 'Reposition Nike India\'s core narrative from elite sport to "everyday movement for everyone". Communicate inclusively to first-time fitness adopters celebrating personal progress over podium finishes. "Your Run. Your Rules." positioning would land strongly.',
    computedChartData: {
      labels: ['2021','2022','2023','2024','2025'],
      datasets: [{ label: '% 3+ times/week', data: [52, 55, 60, 64, 67], borderColor: '#D97706', backgroundColor: 'rgba(217,119,6,.18)', fill: true }],
    },
  },
  {
    title: 'Football is India\'s fastest-growing sport by cultural conversation volume',
    bucket: 'culture', type: 'line', conviction: 89,
    toolLabel: 'BRANDWATCH', lbl: 'CULTURAL CONVERSATION SHARE — INDIA',
    obs: 'While cricket dominates cultural conversation (54% share), football has grown its share from 11% to 19% in 3 years among 18–34 urban Indians. The ISL and global club football (especially Premier League) are key drivers. Nike has global football equity but underinvests in India\'s football culture.',
    stat: 'Football cultural conversation share up from 11% → 19% in 3 years among 18–34s',
    rec: 'Build a dedicated India football strategy beyond ISL jersey deals. Invest in grassroots football content, urban football culture storytelling, and partnerships with emerging Indian talent. Position Nike as "the football brand that believed in India before football did."',
    computedChartData: {
      labels: ['2022','2023','2024','2025'],
      datasets: [
        { label: 'Cricket', data: [62, 58, 56, 54], borderColor: '#D97706', backgroundColor: 'rgba(217,119,6,.12)', fill: false },
        { label: 'Football', data: [11, 14, 17, 19], borderColor: '#FBBF24', backgroundColor: 'rgba(251,191,36,.12)', fill: false },
      ],
    },
  },
  {
    title: 'Gen Z treats brand stance on mental wellness as a purchase signal',
    bucket: 'culture', type: 'hbar', conviction: 86,
    toolLabel: 'GWI', lbl: 'GEN Z PURCHASE INFLUENCERS — % STRONGLY INFLUENCED',
    obs: 'Among 18–24 year olds, 58% say a brand\'s position on mental health influences their purchase decisions. Fitness and mental health are increasingly connected. Brands integrating mental wellness into fitness communication see 19% higher preference score among Gen Z vs. pure physical performance messaging.',
    stat: '58% of 18–24s say brand mental health stance affects purchase decisions',
    rec: 'Integrate a mental wellness layer into Nike India\'s fitness communication. A "Move for the Mind" content series — featuring authentic athlete mental health conversations and recovery narratives — would build strong differentiation among the 18–24 cohort.',
    computedChartData: {
      labels: ['Product Quality', 'Brand Purpose', 'Mental Health Stance', 'Peer Endorsement', 'Price', 'Sustainability'],
      datasets: [{ label: '% strongly influenced', data: [35, 22, 20, 15, 12, 8], backgroundColor: '#D97706' }],
    },
  },
  {
    title: 'Sustainability awareness vs. conversion — non-linear demographic pattern',
    bucket: 'culture', type: 'bar', conviction: 84,
    toolLabel: 'GWI', lbl: 'SUSTAINABILITY INDEX BY AUDIENCE SEGMENT',
    obs: 'GWI data shows sustainability as a growing consideration, particularly among urban women 22–32 (index 142 vs. baseline 100). However, 43% of the target segment express scepticism towards brand sustainability claims. The relationship is non-linear — high awareness doesn\'t uniformly translate to conversion.',
    stat: 'Sustainability consideration index: 142 among urban women 22–32 (vs. 100 baseline)',
    rec: 'Lead with product-first sustainability stories (recycled materials, circular economy) over generic brand-level CSR. Tie Move to Zero directly to specific Nike India products in a transparent, evidence-backed way. Avoid "greenwashing" language.',
    computedChartData: {
      labels: ['Urban W 22–32', 'Urban M 22–32', 'Tier 1 W 33–45', 'Tier 1 M 33–45', 'Tier 2 W 18–24', 'Tier 2 M 18–24'],
      datasets: [{ label: 'Index', data: [142, 118, 124, 109, 98, 92], backgroundColor: '#D97706' }],
    },
  },
];

const BRIEFS = [
  {
    brand: 'Nike India', category: 'Sportswear & Footwear',
    objective: 'New Product Launch',
    age_ranges: '18-34', gender: 'All Genders', sec: 'A1, A2, B1',
    market: 'India', geography: 'Pan India',
    competitors: 'Adidas, Puma, Reebok, Asics',
    background: 'Launching the next-gen India-first running franchise targeting everyday fitness adopters across metro and tier 1.',
    insight_buckets: 'content,commerce,communication,culture',
    status: 'ready',                // links to seeded analysis
    sla_hours: 5,                   // delivered ahead of plan
    created_offset_hours: -50,      // 2 days ago
    completed_offset_hours: -45,    // delivered 5h after submission
    icon_hint: '👟',
  },
  {
    brand: 'Nescafé Premium', category: 'FMCG — Food & Beverages',
    objective: 'New Communication / Campaign',
    age_ranges: '25-44', gender: 'All Genders', sec: 'A1, A2',
    market: 'India', geography: 'Metro Cities',
    competitors: 'Bru, Davidoff, Starbucks At Home',
    background: 'Premium positioning campaign aimed at urban professionals 25–44.',
    insight_buckets: 'content,commerce,communication,culture',
    status: 'processing',
    sla_hours: 6,
    created_offset_hours: -8,
    completed_offset_hours: null,
    icon_hint: '☕',
  },
  {
    brand: 'L\'Oréal Paris', category: 'Beauty & Cosmetics',
    objective: 'Brand Refresh',
    age_ranges: '18-45', gender: 'Female', sec: 'A1, A2, B1',
    market: 'India', geography: 'Urban India',
    competitors: 'Maybelline, Lakmé, Nykaa beauty',
    background: 'Brand refresh for urban Indian women — celebrating authenticity and diverse beauty narratives.',
    insight_buckets: 'content,commerce,communication,culture',
    status: 'ready',
    sla_hours: 6,
    created_offset_hours: -120,
    completed_offset_hours: -114,
    icon_hint: '💄',
  },
  {
    brand: 'Tata Motors EV', category: 'Automotive',
    objective: 'New Product Launch',
    age_ranges: '28-50', gender: 'All Genders', sec: 'A1, A2, B1',
    market: 'India', geography: 'Pan India',
    competitors: 'MG ZS EV, Hyundai Kona, Mahindra XUV400 EV',
    background: 'Mass-market EV positioning across pan-India markets.',
    insight_buckets: 'content,commerce,communication,culture',
    status: 'draft',
    sla_hours: null,
    created_offset_hours: -36,
    completed_offset_hours: null,
    icon_hint: '🚗',
  },
];

async function main() {
  if (process.env.SEED_DEMO === 'false') {
    console.log('[seed] SEED_DEMO=false — skipping');
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.warn('[seed] DATABASE_URL not set — skipping demo seed');
    return;
  }

  const ssl = process.env.NODE_ENV === 'production'
    ? { ssl: { rejectUnauthorized: false } } : {};
  const c = new Client({ connectionString: process.env.DATABASE_URL, ...ssl });
  await c.connect();

  try {
    // Idempotency check — bail if Nike India brief already seeded
    const existing = await c.query(`SELECT 1 FROM briefs WHERE brand = 'Nike India' LIMIT 1`);
    if (existing.rows.length > 0) {
      console.log('[seed] demo data already present — skipping');
      return;
    }

    console.log('[seed] inserting prototype demo data…');

    // 1) Upload + Nike analysis
    const upRes = await c.query(
      `INSERT INTO uploads (id, filename) VALUES (gen_random_uuid(), $1) RETURNING id`,
      ['prism-demo-nike-india.json'],
    );
    const uploadId = upRes.rows[0].id;

    const analysisResults = {
      meta: {
        domain: 'multi-source',
        title: 'Nike India — New Product Launch',
        sources: ['GWI', 'KONNECT INSIGHTS', 'BRANDWATCH', 'GOOGLE TRENDS', 'COMSCORE', 'SIMILARWEB', 'HELIUM10'],
      },
      charts: NIKE_CHARTS,
    };

    const anRes = await c.query(
      `INSERT INTO analyses (upload_id, sheet_name, filename, results_json)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [uploadId, 'PRISM Combined — Nike India',
       'prism-demo-nike-india.json',
       JSON.stringify(analysisResults)],
    );
    const analysisId = anRes.rows[0].id;

    // 2) Briefs — capture the Nike brief id so we can backlink the analysis
    let nikeBriefId = null;
    for (const b of BRIEFS) {
      const created = new Date(Date.now() + b.created_offset_hours * 3600 * 1000);
      const slaDue  = b.sla_hours ? new Date(created.getTime() + b.sla_hours * 3600 * 1000) : null;
      const actual  = b.completed_offset_hours != null
        ? new Date(Date.now() + b.completed_offset_hours * 3600 * 1000)
        : null;

      const isNike = b.brand === 'Nike India';

      const ins = await c.query(
        `INSERT INTO briefs
           (brand, category, objective, age_ranges, gender, sec, market, geography,
            competitors, background, insight_buckets, status,
            sla_hours, sla_due_at, actual_completed_at,
            analysis_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING id`,
        [b.brand, b.category, b.objective, b.age_ranges, b.gender, b.sec,
         b.market, b.geography, b.competitors, b.background, b.insight_buckets,
         b.status,
         b.sla_hours, slaDue, actual,
         isNike ? analysisId : null,
         created],
      );
      if (isNike) nikeBriefId = ins.rows[0].id;
    }

    // 3) Backlink — analysis.brief_id + uploads.brief_id → Nike brief.
    // This powers the "Planned vs Actual" SLA strip on the insights hero.
    if (nikeBriefId) {
      await c.query('UPDATE analyses SET brief_id = $1 WHERE id = $2', [nikeBriefId, analysisId]);
      await c.query('UPDATE uploads  SET brief_id = $1 WHERE id = $2', [nikeBriefId, uploadId]);
    }

    console.log(`[seed] inserted ${BRIEFS.length} briefs + 1 analysis with ${NIKE_CHARTS.length} insight cards`);
  } finally {
    try { await c.end(); } catch {}
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // Don't fail startup if seed fails — log and move on so the server still boots
    console.error('[seed] failed:', err.message);
    process.exit(0);
  });
