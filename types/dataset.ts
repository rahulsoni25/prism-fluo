export type SheetType = 'gwi_time_spent' | 'keyword_plan' | 'generic_table';

export interface UploadSummary {
  uploadId: string;
  sheets: SheetMeta[];
  /** Raw text content when structured parsing found 0 rows — sent to Gemini text analysis */
  rawText?: string;
  /** True when this upload was deduplicated against a previous upload of the
   *  same content (by SHA-256 hash) within the dedup window. When true, the
   *  uploadId points to the EXISTING upload and no new rows were created. */
  deduplicated?: boolean;
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
