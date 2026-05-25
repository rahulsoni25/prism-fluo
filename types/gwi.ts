/** Canonical GWI question types we recognize. Used by Genre nugget +
 *  any future "interest" / "vehicle" cards. */
export type GwiQuestionType =
  | 'time_spent'         // duration buckets (1-2 hrs, etc.)
  | 'tv_genres'          // Drama, Comedy, News, Reality...
  | 'music_genres'       // Bollywood, Pop, Classical, Hip-hop...
  | 'content_topics'     // Fashion, Food, Travel, Tech, Beauty...
  | 'streaming_services' // Hotstar, Netflix, Prime, JioCinema...
  | 'social_platforms'   // Instagram, YouTube, Facebook, WhatsApp...
  | 'devices'            // Mobile, Laptop, Tablet, Smart TV...
  | 'unknown';           // GWI sheet that fits the standard shape but topic isn't recognized

export interface GwiTimeSpentRow {
  uploadId: string;
  sheetName: string;
  questionName: string;
  questionMessage: string;
  /** Original field name kept for back-compat with existing rows. For
   *  non-time-spent question types this stores the item label (e.g. "Drama",
   *  "Bollywood", "Fashion") — the row-level attribute being measured. */
  timeBucket: string;
  /** GWI question type — inferred from col 0 + sheet name. Lets downstream
   *  consumers (genre nugget, etc.) target the right rows. */
  questionType?: GwiQuestionType;
  audience: string;
  audiencePct: number | null;
  dataPointPct: number | null;
  universe: number | null;
  index: number | null;
  responses: number | null;
}
