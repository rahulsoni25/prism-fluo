/**
 * Verify generateStrategicRead produces:
 *   1. Different outputs for different briefs (opener-style seed working)
 *   2. Same output for the same brief twice (caching-friendly)
 *   3. A real paragraph even when Gemini is unavailable (deterministic fallback)
 *
 * Run with GEMINI_API_KEY UNSET to force the fallback path.
 *
 * Usage:
 *   cd <repo> && GEMINI_API_KEY= npx tsx scripts/test-strategic-read.mts
 *   cd <repo> && npx --env-file=.env.local tsx scripts/test-strategic-read.mts  # real Gemini
 */
import { generateStrategicRead } from '../lib/ai/gemini';

const nuggetsLaundry = {
  keyword: {
    headline: "Category search runs +18.3% YoY across 2.2M monthly queries — 1202 keywords carry the long tail.",
    hoverLines: ['Volume buckets — Mega 2 · High 13 · Mid 235 · Long-tail 474 · Micro 493'],
  },
  helium10: {
    headline: "Tide owns 35% of category revenue · Surf Excel second at 26% — HHI 2121 (moderately concentrated).",
    hoverLines: ['Brand split: Tide 35% · Surf Excel 26% · Presto! 14%'],
  },
  competition: {
    headline: "Surf Excel leads category search at 13% across 8 tracked brands.",
    hoverLines: ['Surf Excel ← our brand — search 13% · shelf 26%'],
  },
  trust: {
    headline: "74% of search is unbranded — trial-trust gap means recognition + recommendation matter more than brand recall.",
    hoverLines: [],
  },
  cultural: {
    headline: "\"fabric conditioner\" leads the conversation at 9K monthly queries — strongest creative territory.",
    hoverLines: [],
  },
};

const nuggetsCoffee = {
  keyword: {
    headline: "Category search up +35% YoY · 1.4M monthly queries — premium pods drive 38% of search.",
    hoverLines: [],
  },
  helium10: {
    headline: "Nescafé leads at 42% of category revenue · Davidoff #2 at 18% — HHI 2890 (highly concentrated).",
    hoverLines: [],
  },
  competition: {
    headline: "Blue Tokai grows from 4% to 11% search share over 12 months — fastest challenger movement.",
    hoverLines: [],
  },
  trust: {
    headline: "Reviews × sales correlation r=0.71 — reviews are the primary buy lever for premium coffee.",
    hoverLines: [],
  },
};

const brief1 = { brand: 'Sargam Det', category: 'Laundry detergent', objective: 'New product launch', geography: 'India', competitors: 'Ghadi, Nirma, Rin' };
const brief2 = { brand: 'Bharat Bean', category: 'Premium coffee', objective: 'Grow share from 4% to 10%', geography: 'India', competitors: 'Nescafé, Davidoff' };
const brief3 = { brand: 'Hero Wash', category: 'Laundry detergent', objective: 'Defend leadership', geography: 'India', competitors: 'Ghadi, Nirma' };

(async () => {
  console.log('\n════ TEST 1: Sargam Det / Laundry / LAUNCH ════');
  const r1 = await generateStrategicRead({ brief: brief1, nuggets: nuggetsLaundry });
  console.log(r1);

  console.log('\n════ TEST 2: Bharat Bean / Coffee / GROW ════');
  const r2 = await generateStrategicRead({ brief: brief2, nuggets: nuggetsCoffee });
  console.log(r2);

  console.log('\n════ TEST 3: Hero Wash / Laundry / DEFEND (same category as Test 1) ════');
  const r3 = await generateStrategicRead({ brief: brief3, nuggets: nuggetsLaundry });
  console.log(r3);

  console.log('\n════ DIVERSITY CHECK ════');
  console.log('Test 1 vs Test 3 (same category, different brand+flavour):');
  console.log('  Identical?           ', r1 === r3);
  console.log('  First 60 chars Test 1:', r1.slice(0, 60));
  console.log('  First 60 chars Test 3:', r3.slice(0, 60));

  console.log('\n════ CACHE STABILITY ════');
  const r1b = await generateStrategicRead({ brief: brief1, nuggets: nuggetsLaundry });
  console.log('Same brief rerun produces SAME paragraph:', r1 === r1b);

  console.log('\n════ BANNED PHRASE CHECK ════');
  const banned = ['focused entry window','wide-open territory','single tension','strategic posture','lean into'];
  [r1, r2, r3].forEach((text, i) => {
    const hits = banned.filter(b => text.toLowerCase().includes(b));
    console.log(`Test ${i + 1} banned-phrase hits:`, hits.length ? hits : '(none)');
  });
})();
