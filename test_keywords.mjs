import { isKeywordPlan, enrichKeywordData, classifyKeyword } from './lib/keywords.js';
import { inferSchema, autoGenerateLayout } from './lib/inference.js';

const mockData = [
  { Keyword: 'sony noise cancelling headphones', 'Avg. monthly searches': 45000, 'Concept: Brand': 'Sony', 'Searches: Jan': 40000 },
  { Keyword: 'cheap wireless earbuds', 'Avg. monthly searches': 12000, 'Concept: Type': 'Earbuds', 'Searches: Jan': 11000 },
  { Keyword: 'bose quietcomfort 45 price', 'Avg. monthly searches': 8000, 'Concept: Brand': 'Bose', 'Searches: Jan': 7500 },
  { Keyword: 'gaming headset under 5000', 'Avg. monthly searches': 5000, 'Concept: Category': 'Gaming', 'Searches: Jan': 4800 },
  { Keyword: 'jbl tune 510bt review', 'Avg. monthly searches': 2000, 'Concept: Brand': 'JBL', 'Searches: Jan': 1900 },
];

console.log('--- DETECTION TEST ---');
const detected = isKeywordPlan(mockData);
console.log('Is Keyword Plan?', detected);

if (detected) {
    console.log('--- ENRICHMENT TEST ---');
    const enriched = enrichKeywordData(mockData);
    console.log('First Row Enriched:', JSON.stringify(enriched[0], null, 2));
    
    console.log('--- INFERENCE TEST ---');
    const schema = inferSchema(enriched);
    const layout = autoGenerateLayout(enriched, schema);
    
    console.log('Dashboard Domain:', layout.meta.domain);
    console.log('Dashboard Title:', layout.meta.title);
    
    console.log('--- SPECIALIZED CHARTS ---');
    layout.charts.forEach(c => {
        if (c.id === 'keyword_tiers' || c.id === 'brand_share') {
            console.log(`[${c.id}] Title: ${c.title}`);
        }
    });
}
