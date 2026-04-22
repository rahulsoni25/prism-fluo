import { db } from '@/lib/db/client';
import { DatasetGroup } from './grouping';

export interface DatasetProfile {
  datasetId: string;
  source: string;
  topic: string;
  geography: string;
  period: string;
  columns: {
    name: string;
    type: 'numeric' | 'categorical' | 'time';
    stats: {
      min?: number;
      max?: number;
      avg?: number;
      uniqueCount?: number;
      topValues?: string[];
    };
  }[];
  samples: any[];
}

/**
 * BUILDS A GROUNDING CONTEXT FOR THE LLM
 * Fetches stats and samples for all datasets in a group.
 */
export async function getGroundedContext(group: DatasetGroup): Promise<DatasetProfile[]> {
  const profiles: DatasetProfile[] = [];

  for (const ds of group.datasets) {
    const profile: DatasetProfile = {
      datasetId: ds.datasetId,
      source: ds.source,
      topic: ds.topic,
      geography: ds.geography,
      period: ds.period,
      columns: [],
      samples: []
    };

    // 1. Fetch Samples (First 50 rows)
    try {
      let rows: any[] = [];
      if (ds.source === 'GWI') {
        const res = await db.query('SELECT * FROM gwi_time_spent WHERE upload_id = $1 AND sheet_name = $2 LIMIT 50', [ds.uploadId, ds.sheetName]);
        rows = res.rows;
      } else if (ds.source === 'GoogleAds') {
        const res = await db.query('SELECT * FROM keywords WHERE upload_id = $1 AND sheet_name = $2 LIMIT 50', [ds.uploadId, ds.sheetName]);
        rows = res.rows;
      }
      
      // Fallback: If specialized tables are empty, check generic_data
      if (rows.length === 0) {
        const res = await db.query('SELECT row_data FROM generic_data WHERE upload_id = $1 AND sheet_name = $2 LIMIT 50', [ds.uploadId, ds.sheetName]);
        rows = res.rows.map(r => JSON.parse(r.row_data));
      }
      profile.samples = rows;
    } catch (e) {
      console.error(`Sample fetch failed for ${ds.datasetId}:`, e.message);
    }

    // 2. Build Statistical Profile (Min/Max/Avg)
    try {
      let allRows: any[] = [];
      if (ds.source === 'GWI') {
        const res = await db.query('SELECT * FROM gwi_time_spent WHERE upload_id = $1 AND sheet_name = $2', [ds.uploadId, ds.sheetName]);
        allRows = res.rows;
      } else if (ds.source === 'GoogleAds') {
        const res = await db.query('SELECT * FROM keywords WHERE upload_id = $1 AND sheet_name = $2', [ds.uploadId, ds.sheetName]);
        allRows = res.rows;
      }
      
      // Fallback
      if (allRows.length === 0) {
        const res = await db.query('SELECT row_data FROM generic_data WHERE upload_id = $1 AND sheet_name = $2', [ds.uploadId, ds.sheetName]);
        allRows = res.rows.map(r => JSON.parse(r.row_data));
      }
      
      if (allRows.length > 0) {
        const headers = Object.keys(allRows[0]).filter(h => !['id', 'upload_id', 'sheet_name', 'created_at'].includes(h));
        headers.forEach(h => {
          const vals = allRows.map(r => r[h]).filter(v => v != null && v !== '');
          const numVals = vals.map(v => {
            if (typeof v === 'number') return v;
            const clean = String(v).replace(/[%,$]/g, '').trim();
            return parseFloat(clean);
          }).filter(v => !isNaN(v));
          
          // More lenient threshold (50%) for numeric detection
          if (numVals.length > vals.length * 0.5 && numVals.length > 0) {
            // Numeric Column
            profile.columns.push({
              name: h,
              type: 'numeric',
              stats: {
                min: Math.min(...numVals),
                max: Math.max(...numVals),
                avg: numVals.reduce((a, b) => a + b, 0) / numVals.length
              }
            });
          } else if (vals.length > 0) {
            // Categorical Column
            const unique = new Set(vals);
            const freq: Record<string, number> = {};
            vals.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
            const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => String(e[0]));

            profile.columns.push({
              name: h,
              type: 'categorical',
              stats: {
                uniqueCount: unique.size,
                topValues: top
              }
            });
          }
        });
      }
    } catch (e) {
      console.error(`Profiling failed for ${ds.datasetId}:`, e.message);
    }

    profiles.push(profile);
  }

  return profiles;
}
