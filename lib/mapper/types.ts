/**
 * lib/mapper/types.ts
 * Shared types for the Data Mapper agent council.
 */

export type FileKind = 'pdf' | 'pptx' | 'xlsx' | 'csv' | 'image' | 'other';
export type AgentName = 'compressor' | 'mapper-qa' | 'senior-audit';
export type Severity = 'blocker' | 'major' | 'minor';

export interface MapperFinding {
  agent:    AgentName;
  severity: Severity;
  issue:    string;
  suggest?: string;
}

export interface CompressorResult {
  originalSize:    number;
  compressedSize:  number;
  ratio:           number;            // compressed / original (< 1.0 = saved space)
  buffer:          Buffer;            // compressed output
  strategiesApplied: string[];
  /** Hard guarantee: extracted text from compressed file MATCHES original. */
  textPreserved:   boolean;
  /** Notes on lossy steps (image quality reduced, etc.) for the QA agent. */
  lossyNotes:      string[];
  elapsedMs:       number;
}

export interface QaResult {
  ok:              boolean;
  textMatchPct:    number;            // 0-100, how much of original text we recovered
  structurePreserved: boolean;        // PPTX slide count, PDF page count match
  findings:        MapperFinding[];
  elapsedMs:       number;
}

export interface MapperVerdict {
  grade:           number;            // 0–10, council's consensus
  ready:           boolean;            // grade >= 10
  attempts:        number;
  finalBuffer:     Buffer;            // either compressed or original
  compressor?:     CompressorResult;
  qa?:             QaResult;
  senior?:         SeniorAuditResult;
  findings:        MapperFinding[];
  elapsedMs:       number;
}

export interface SeniorAuditResult {
  ok:           boolean;
  findings:     MapperFinding[];
  reranOnce:    boolean;
  elapsedMs:    number;
}
