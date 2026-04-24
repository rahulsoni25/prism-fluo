export type SheetType = 'gwi_time_spent' | 'keyword_plan' | 'generic_table';

export interface UploadSummary {
  uploadId: string;
  sheets: SheetMeta[];
}

export interface SheetMeta {
  sheetName: string;
  type: SheetType;
  question?: string;
  description?: string;
  chartSpecs: ChartSpec[];
}

export interface ChartSpec {
  id: string;
  title: string;
  x: string;
  y?: string;
  z?: string;
  legend?: string;
  filter?: Record<string, string | number>;
  yLabel?: string;
  zLabel?: string;
}
