import { db } from '@/lib/db/client';
import { SemanticDataset } from '@/types/semantic';

export interface DatasetGroup {
  geography: string;
  topic: string;
  datasets: SemanticDataset[];
}

/**
 * GROUPS DATASETS BY GEOGRAPHY (across multiple uploads)
 * Accepts comma-separated uploadIds for cross-file synthesis.
 */
export async function groupDatasetsForUnifiedView(uploadId: string): Promise<DatasetGroup[]> {
  // Support comma-separated uploadIds for multi-file synthesis
  const ids = uploadId.split(',').map(id => id.trim()).filter(Boolean);
  
  let allRows: any[] = [];
  for (const id of ids) {
    const result = await db.query(
      'SELECT * FROM datasets WHERE upload_id = $1',
      [id]
    );
    allRows = [...allRows, ...result.rows];
  }

  const datasets: SemanticDataset[] = allRows.map(r => ({
    datasetId: r.dataset_id,
    uploadId: r.upload_id,
    sheetName: r.sheet_name,
    source: r.source,
    topic: r.topic,
    geography: r.geography,
    period: r.period,
    metricType: r.metric_type,
    grain: r.grain,
    primaryKeys: JSON.parse(r.primary_keys || '[]'),
    entities: JSON.parse(r.entities || '{}')
  }));

  // Group by GEOGRAPHY only — so different sources in the same region can be cross-referenced
  const groups: Record<string, DatasetGroup> = {};

  datasets.forEach(ds => {
    const key = ds.geography;
    if (!groups[key]) {
      groups[key] = {
        geography: ds.geography,
        topic: 'Unified',
        datasets: []
      };
    }
    groups[key].datasets.push(ds);
  });

  return Object.values(groups);
}
