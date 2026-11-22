export const SEARCH_FEE_USD: number;
export function percentile(sorted: number[], p: number): number | null;
export interface EvalCandidate {
  name: string;
  company: string;
  status: string;
  sources: { url: string; evidence: string }[];
}
export interface EvalResult {
  industry?: string;
  company?: string;
  title?: string;
  ok: boolean;
  error?: string;
  latencyMs?: number;
  note?: string | null;
  candidates: EvalCandidate[];
  usage?: { searches: number; fetches: number; inputTokens: number; outputTokens: number };
}
/* eslint-disable @typescript-eslint/no-explicit-any -- the script returns loosely shaped summaries that its tests read field by field */
export function summarize(results: unknown[], prices?: { searchFee?: number; inPerMTok?: number; outPerMTok?: number }): any;
export function parseLookup(text: string): any;
/* eslint-enable @typescript-eslint/no-explicit-any */
export function validateJobs(jobs: unknown): string[];
