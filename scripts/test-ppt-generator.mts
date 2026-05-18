/**
 * Smoke test for the redesigned PPTX generator. Builds a sample
 * PresentationData payload that exercises every new field (audience
 * descriptor, briefFlavour, categoryValue, nuggets, strategicRead,
 * nextMoves, sourceCount) and writes the output to /tmp/test-deck.pptx.
 *
 * Usage:
 *   cd <repo> && npx tsx scripts/test-ppt-generator.mts
 *
 * Verifies: TS compiles, generator runs without throwing, file is produced.
 * Does NOT verify visual quality — for that you open the .pptx in
 * PowerPoint or Keynote and inspect each slide manually.
 */
import { writeFileSync } from 'node:fs';
import { generatePresentation, type PresentationData } from '../lib/pptx/generator';

const sample: PresentationData = {
  templateId: 'executive_briefing',
  briefName:  'Surf Excel — 2026 PPC + SEO Plan',
  headline:   'Surf Excel leads category at 13% search SOV, but 72% of demand is still unbranded — open ground to claim before Tide responds.',
  objective:  'Identify high-intent search opportunities for 2026 PPC + SEO plan',
  date:       new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),

  // 9 pillars — populate 4 with real-looking insight cards
  content: {
    insights: [
      {
        title: 'Liquid Detergent Searches Surge +23% YoY — Brand-Free Discovery Window',
        obs: 'Across 2.2M monthly category queries, liquid-detergent variants grew +23% YoY while powder declined -8%. 72% of these queries carry no brand name — shoppers are exploring formats, not brands.',
        rec: 'CREATIVE: Build a "Why Liquid?" content series for YouTube and Instagram Reels. BRAND: Position Surf Excel Liquid as the premium liquid leader. MEDIA: Allocate 30% of search budget to unbranded liquid queries before Q2.',
        stat: 'Liquid +23% YoY · powder -8% YoY · 72% non-branded mix',
        source: 'KEYWORD_PLANNER',
        conviction: 92,
        chartType: 'bar',
        chartLabels: ['Liquid', 'Powder', 'Pods', 'Bar'],
        chartValues: [23, -8, 18, -3],
      },
      {
        title: 'Fabric Conditioner Theme Owns 9K Monthly Queries — Strongest Adjacent Territory',
        obs: 'Bigram theme clustering surfaces "fabric conditioner" at 9K monthly queries — the leading content territory adjacent to detergent. "Soda use" and "tub cleaning" follow at 5K and 4K.',
        rec: 'CREATIVE: Build a fabric-care content franchise covering conditioning + finishing. MEDIA: Run paired search campaigns on "detergent + fabric conditioner" co-occurrence. BRAND: Add a fabric-conditioner SKU to defend the territory.',
        stat: '9K monthly queries on "fabric conditioner"',
        source: 'KEYWORD_PLANNER',
        conviction: 86,
      },
    ],
  },
  commerce: {
    insights: [
      {
        title: 'Tide Plus 10kg Mega Saver Captures 33% of Category Revenue — Pack-Size Strategy is the Lever',
        obs: 'Tide Plus Detergent Powder 10kg Mega Saver Pack does ₹4.14 Cr/month — 33% of the entire Amazon category revenue tracked. Bulk-pack pricing (~₹40/kg) beats Surf Excel\'s 4kg pack on per-kg economics.',
        rec: 'BRAND: Launch a Surf Excel Mega Saver 10kg SKU at competitive per-kg pricing. MEDIA: Lead Amazon Ads with "value pack" + "bulk" keyword targeting. CREATIVE: Develop A+ content showing per-wash cost vs competition.',
        stat: 'Tide 10kg = ₹4.14 Cr/month = 33% of category Amazon revenue',
        source: 'AMAZON',
        conviction: 95,
        chartType: 'doughnut',
        chartLabels: ['Tide', 'Surf Excel', 'Presto', 'Godrej Fab', 'Others'],
        chartValues: [35, 26, 14, 11, 14],
      },
    ],
  },
  communication: {
    insights: [
      {
        title: '74% of Search is Unbranded — Recommendation > Recall in This Category',
        obs: 'Branded mix sits at 26% vs non-branded 74% across 2.2M monthly queries. Reviews-to-sales correlation r=0.54 confirms the trial-trust pattern: shoppers convert on recommendation signals, not brand awareness.',
        rec: 'CREATIVE: Lead with review-style demos and creator unboxing. BRAND: Invest in retailer placement + in-store sampling over brand-recall TV. MEDIA: Bid heavily on generic queries; let reviews close the conversion.',
        stat: '74% unbranded · Reviews × Sales r=0.54',
        source: 'MULTI-SOURCE',
        conviction: 88,
      },
    ],
  },
  culture: {
    insights: [
      {
        title: 'Festive + Wedding-Season Cleaning Drives 1.4× Search Spike Oct-Feb',
        obs: 'Search volume for laundry-related queries spikes 1.4× during Diwali (Oct-Nov) and wedding season (Nov-Feb). Surf Excel\'s ad calendar currently under-indexes on this window.',
        rec: 'CREATIVE: Build a "Festive-Ready Whites" creative campaign for Oct-Dec. MEDIA: Front-load 40% of Q4 budget into the festive spike. BRAND: Tie Surf Excel to family + ritual narratives, not just stain-removal.',
        stat: '1.4× search spike during Oct-Feb',
        source: 'GOOGLE_TRENDS',
        conviction: 84,
      },
    ],
  },

  observations: [
    'Category search runs +18.3% YoY across 2.2M monthly queries.',
    'Tide owns 35% of category revenue · Surf Excel second at 26%.',
    '74% of search is unbranded.',
  ],
  recommendations: [
    'Launch Surf Excel Mega Saver 10kg SKU at competitive per-kg pricing.',
    'Allocate 40% of search budget to unbranded liquid queries before Q2.',
    'Build review-driven creative content; defer brand-recall TV.',
  ],

  // ── Tier 1 fields ──────────────────────────────────────────────────
  brand:              'Surf Excel',
  category:           'FMCG — Home Care',
  audienceDescriptor: '18-34 · Metro+Tier 1/Tier 2 · All SECs',
  audienceSnapshot:   'For this brief, we are really talking to Indian families making considered choices for their daily laundry needs. The strategic tension is that while cost remains crucial, their searches increasingly reflect a desire for advanced care and specialised detergent formats.',
  strategicRead:      "Surf Excel's defend-the-leader brief lands at a pivotal moment in Indian laundry: with 2.2M monthly queries growing +18.3% YoY, the category is expanding faster than any single brand can claim alone — and 72% of that demand sits outside any brand name. Tide leads shelf revenue at 35% on the strength of its 10kg Mega Saver SKU at ₹4.14 Cr/month, but Surf Excel's 13% search SOV across 8 tracked brands proves the brand still owns the consideration set. The catch: reviews-to-sales correlation r=0.54 means trust is bought through demos and creators, not TV recall. Surf Excel grows next by claiming the unbranded long tail through fabric-conditioner content + a mega-saver pack strategy — sharper than brand-awareness spend, faster than scale.",
  nextMoves: [
    'Launch a Surf Excel Mega Saver 10kg SKU at ₹40/kg pricing within the next 90 days to counter Tide\'s shelf-revenue dominance.',
    'Allocate 40% of Q1 search budget to unbranded liquid + fabric-conditioner queries before Tide repositions.',
    'Build a review-led creative system for YouTube + Instagram Reels — shift 30% of brand-recall TV to demo-driven content by Q2.',
  ],
  briefFlavour:       'DEFEND',
  competitors:        'Ghadi, Nirma, Rin, Wheel, Active Wheel, Fena, Mr. White, Patanjali, Nise',
  categoryValue:      '₹45,000 Cr',
  categoryCAGR:       '4.1%',
  sourceCount:        3,
  sourceFiles:        ['Keyword Stats 2026-05-15.csv', 'IN_AMAZON_blackBoxProducts_niche_detergents.xlsx', 'GWI Media + Purchases.xlsx'],
  nuggets: {
    keyword:     { headline: 'Category search runs +18.3% YoY across 2.2M monthly queries — 1202 keywords carry the long tail.' },
    helium10:    { headline: 'Tide owns 35% of category revenue · Surf Excel second at 26% — HHI 2121 (moderately concentrated).' },
    competition: { headline: 'Surf Excel leads category search at 13% across 8 tracked brands.' },
    cultural:    { headline: '"fabric conditioner" leads the conversation at 9K monthly queries — strongest creative territory.' },
    trust:       { headline: '74% of search is unbranded — trial-trust gap means recognition + recommendation matter more than brand recall.' },
  },
};

const main = async () => {
  console.log('Generating sample PPTX deck…');
  const buf = await generatePresentation(sample);
  const outPath = `${process.cwd()}/docs/test-deck.pptx`;
  writeFileSync(outPath, buf);
  console.log(`✓ Wrote ${buf.length.toLocaleString()} bytes to ${outPath}`);
  console.log('Open in PowerPoint or Keynote to inspect the visual rebuild.');
};

main().catch(err => {
  console.error('Generation failed:', err);
  process.exit(1);
});
