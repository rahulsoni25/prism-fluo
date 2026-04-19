// ============================================================
// PRISM GWI INTELLIGENCE ENGINE — Survey Parser v1
// ============================================================
// Specialized engine for Global Web Index (GWI) survey data.
// Handles multi-sheet workbooks with hierarchical headers.
// ============================================================

export function isGWISheet(headers, rows) {
  if (!headers || headers.length === 0) return false;
  
  const headerText = headers.join(' ').toLowerCase();
  
  const hasAudience = (headerText.match(/audience %/g) || []).length >= 2;
  const hasDataPoint = headerText.includes('data point %');
  const hasUniverse = headerText.includes('universe');
  const hasIndex = headerText.includes('index');
  const hasResponses = headerText.includes('responses');
  const hasShortLabel = headers.some(h => h.toLowerCase().includes('short label'));
  const hasAttributes = headers.some(h => h.toLowerCase().includes('attributes'));

  // Scan first few rows for source markers
  const topRowsText = rows.slice(0, 10).map(r => Object.values(r).join(' ')).join(' ').toLowerCase();
  const looksLikeGWI = topRowsText.includes('source: gwi') || topRowsText.includes('time spent on social media');

  return (
    hasAudience &&
    hasDataPoint &&
    hasUniverse &&
    hasIndex &&
    hasResponses &&
    hasShortLabel &&
    hasAttributes &&
    looksLikeGWI
  );
}

export function parseGWIQuestion(rows) {
  // GWI files usually have the question in the first few rows of the first column
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const vals = Object.values(rows[i]);
    if (vals[0] && String(vals[0]).length > 20) {
      return {
        question: String(vals[0]).trim(),
        description: vals[1] ? String(vals[1]).trim() : ''
      };
    }
  }
  return { question: 'Survey Analysis', description: '' };
}

/**
 * Tidies GWI table into a flat array of objects.
 * GWI format: [Attributes] [Short Label] [Metrics for Audience 1] [Metrics for Audience 2] ...
 */
export function tidyGWIData(headers, rows) {
  const meta = parseGWIQuestion(rows);
  
  const attrCol = headers.find(h => h.toLowerCase().includes('attributes')) || headers[0];
  const labelCol = headers.find(h => h.toLowerCase().includes('short label')) || headers[1];
  
  // Identify metric columns and their audiences
  const metricCols = headers.filter(h => 
    h.toLowerCase().includes('audience %') || 
    h.toLowerCase().includes('data point %') || 
    h.toLowerCase().includes('index') || 
    h.toLowerCase().includes('universe')
  );

  // GWI tables often have a "Base" or "Total" audience first.
  // We'll extract rows where Attribute is present
  const tidy = [];
  rows.forEach(row => {
    const attribute = row[attrCol];
    const label = row[labelCol];
    
    if (!attribute || String(attribute).toLowerCase().includes('base')) return;

    metricCols.forEach(mCol => {
      const val = parseFloat(row[mCol]);
      if (isNaN(val)) return;

      tidy.push({
        attribute,
        label,
        metric: mCol,
        value: val,
        question: meta.question
      });
    });
  });

  return { meta, data: tidy };
}
