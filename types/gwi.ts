export interface GwiTimeSpentRow {
  uploadId: string;
  sheetName: string;
  questionName: string;
  questionMessage: string;
  timeBucket: string;
  audience: string;
  audiencePct: number | null;
  dataPointPct: number | null;
  universe: number | null;
  index: number | null;
  responses: number | null;
}
