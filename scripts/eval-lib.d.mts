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
export function summarize(results: unknown[], prices?: { searchFee?: number; inPerMTok?: number; outPerMTok?: number }): any;
export function parseLookup(text: string): any;
export function validateJobs(jobs: unknown): string[];
