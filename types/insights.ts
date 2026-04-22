import { SourceType, TopicType } from './semantic';

export interface InsightMetric {
  label: string;
  value: number | string;
  unit?: string;
  source: SourceType;
}

export interface InsightChartRef {
  datasetId: string;
  chartSpecId: string;  // e.g. 'distribution', 'trend', 'top_primary'
}

export interface InsightCard {
  id: string;
  title: string;
  sources: SourceType[];
  topic: TopicType;
  geography: string;
  period: string;
  metrics: InsightMetric[];
  charts: InsightChartRef[];
  observation: string;
  recommendation: string;
  conviction: number;
  chartData?: {
    labels: string[];
    datasets: {
      label: string;
      data: number[];
    }[];
  };
}
