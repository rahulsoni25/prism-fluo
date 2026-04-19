// ============================================================
// PRISM KEYWORD INTELLIGENCE HUB — Enrichment Engine v1
// ============================================================
// Ported from Python keyword_detector.py
// Automatically detects and enriches Search Keyword Data with:
// Tiers, Brands, Feature Categories, and Price Intent.
// ============================================================

const BRAND_NAMES = [
  "apple", "boat", "jbl", "bose", "sony", "samsung", "sennheiser",
  "mi", "oneplus", "realme", "skullcandy", "hyperx", "anker", "razer", "marshall"
];

const PRICE_KEYWORDS = ["price", "cheap", "cost", "budget", "buy", "online", "shop"];
const PRICE_PAT = /under\s*(\d+)/i;

const FEATURE_RULES = [
  ["Gaming", ["gaming", "ps4", "xbox", "latency", "rgb"]],
  ["Noise Cancelling", ["noise cancelling", "nc 700", "anc", "isolation"]],
  ["Wireless", ["wireless", "bluetooth", "tws", "true wireless", "unplugged"]],
  ["Wired", ["wired", "aux", "cable", "jack"]],
  ["Over-ear", ["over ear", "over-ear", "earcup", "headphones"]],
  ["In-ear", ["earphones", "earbuds", "earpods", "pods"]]
];

export function isKeywordPlan(data) {
  if (!data || data.length === 0) return false;
  const originalCols = Object.keys(data[0]);
  const cols = originalCols.map(c => c.trim().toLowerCase());
  
  const hasKeyword = cols.includes("keyword");
  const hasVolume = cols.includes("avg. monthly searches");
  
  if (!hasKeyword || !hasVolume) return false;

  const hasConcept = originalCols.some(c => c.trim().toLowerCase().startsWith("concept:"));
  const hasMonthly = originalCols.some(c => c.trim().toLowerCase().startsWith("searches:"));
  
  return hasConcept || hasMonthly;
}

export function classifyKeyword(text) {
  const t = (text || "").toLowerCase();
  
  // Brand detection
  const brandMatch = BRAND_NAMES.find(b => t.includes(b));
  const brand = brandMatch ? brandMatch.charAt(0).toUpperCase() + brandMatch.slice(1) : "Non-brand";
  
  // Price intent
  const isPrice = PRICE_PAT.test(t) || PRICE_KEYWORDS.some(kw => t.includes(kw));
  
  // Categories
  const cats = new Set();
  FEATURE_RULES.forEach(([name, needles]) => {
    if (needles.some(n => t.includes(n))) {
      cats.add(name);
    }
  });

  if (cats.size === 0) {
    cats.add("Generic");
  }

  return {
    brand,
    is_price_intent: isPrice,
    categories: Array.from(cats).sort().join(", ")
  };
}

export function enrichKeywordData(data) {
  if (!data || data.length === 0) return data;

  const originalCols = Object.keys(data[0]);
  const kwCol = originalCols.find(c => c.trim().toLowerCase() === "keyword");
  const volCol = originalCols.find(c => c.trim().toLowerCase() === "avg. monthly searches");

  if (!kwCol || !volCol) return data;

  // 1. Sort by volume to calculate tiers
  const enriched = [...data].sort((a, b) => {
    const vA = parseFloat(a[volCol]) || 0;
    const vB = parseFloat(b[volCol]) || 0;
    return vB - vA;
  });

  const total = enriched.length;

  return enriched.map((row, idx) => {
    const pct = (idx + 1) / total;
    
    // Volume Tiering
    let tier = "Tertiary";
    if (pct <= 0.2) tier = "Primary";
    else if (pct <= 0.6) tier = "Secondary";

    // Classification
    const classification = classifyKeyword(row[kwCol]);

    return {
      ...row,
      tier,
      volume_pct: (pct * 100).toFixed(1),
      ...classification
    };
  });
}
