export interface Schema {
  time: string[];
  numeric: string[];
  categorical: string[];
  catData: Array<{ name: string; unique: number }>;
  allHeaders: string[];
}

export type ChartType = 'bar' | 'line' | 'hbar' | 'pie' | 'area' | 'scatter' | 'bubble' | 'radar';

export interface ChartSpec {
  id: string;
  type: ChartType;
  xCol: string;
  yCol?: string;
  zCol?: string;
  yCols?: string[];
  title: string;
  lbl: string;
  source: string;
  conviction: number;
  obs: string;
  stat: string;
  rec: string;
  _crossData?: [string, number][];
  computedChartData?: unknown;
}

export interface Scorecard {
  label: string;
  value: string;
  avg: string;
  trend: number;
  isPositive: boolean;
}

export interface DashboardMeta {
  title: string;
  subtitle: string;
  readingGuide: string;
  icon: string;
  domain: string;
  cls: string;
  chartCount?: number;
}

export interface Layout {
  scorecards: Scorecard[];
  charts: ChartSpec[];
  meta: DashboardMeta;
}

export interface Anomaly {
  metric: string;
  value: number;
  row: number;
  severity: string;
  type: 'Surge' | 'Dip';
  context: string;
}

export interface StrategicPillar {
  type: 'LEAD' | 'GROWTH' | 'RISK';
  label: string;
  title: string;
  text: string;
}

export interface StrategicBrief {
  pillars: StrategicPillar[];
  masterAction: string;
}
