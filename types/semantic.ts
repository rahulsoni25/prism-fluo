export type SourceType = 'GWI' | 'GoogleTrends' | 'GoogleAds' | 'Brandwatch' | 'Helium10' | 'SimilarWeb' | 'Konnect' | 'Other';

export type TopicType =
  | 'TimeSpent'
  | 'SearchDemand'
  | 'Culture'
  | 'Content'
  | 'Commerce'
  | 'Communication'
  | 'KeywordPlan'
  | 'BrandInterest'
  | 'SalesPerformance'
  | 'SocialSentiment'
  | 'TrafficYield'
  | 'Other';


export type GrainType =
  | 'SegmentByTimeBucket'
  | 'SegmentByAudience'
  | 'SegmentByKeyword'
  | 'TimeSeries'
  | 'Other';

export interface SemanticDataset {
  uploadId: string;
  sheetName: string;
  datasetId: string;    // unique id per sheet
  source: SourceType;
  topic: TopicType;
  geography: string;    // e.g. "India"
  period: string;       // e.g. "Q2 2024–Q1 2025"
  metricType: string;   // e.g. "ShareOfAudience", "SearchVolumeIndex"
  grain: GrainType;
  primaryKeys: string[]; // e.g. ['timeBucket','audience'] or ['keyword']
}
