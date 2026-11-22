// Pure functions for measuring recruiter discovery. No network, no files: tested in tests/eval.test.ts.

/** The documented price of one Anthropic web search (USD). Token costs are extra and depend on the model, so they are only
 * included when you pass prices. */
export const SEARCH_FEE_USD = 0.01;

const normName = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const normCompany = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/\b(?:incorporated|inc|ltd|limited|corp|corporation|co|company|llc|plc)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const percentile = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : null);
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
const mean = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/**
 * One result per searched job:
 *   { industry, company, title, ok, error?, latencyMs, candidates: [{ name, company, status, sources: [{url, evidence}] }], usage? }
 * Returns the figures that matter, and never a figure it cannot compute (null instead).
 */
export function summarize(results, prices = {}) {
  const ran = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const all = ran.flatMap((r) => r.candidates.map((c) => ({ ...c, job: r })));

  // A "relevant" contact is one with medium or high confidence: employment and a recruiting role are both supported.
  const withAny = ran.filter((r) => r.candidates.length > 0);
  const withRelevant = ran.filter((r) => r.candidates.some((c) => c.status === "Verified" || c.status === "Likely match"));
  const withHigh = ran.filter((r) => r.candidates.some((c) => c.status === "Verified"));

  const sourced = all.filter((c) => Array.isArray(c.sources) && c.sources.length > 0 && c.sources.every((s) => s.url && s.evidence));

  // The same person twice in one search (same name at the same employer) is a duplicate.
  let duplicates = 0;
  for (const r of ran) {
    const seen = new Set();
    for (const c of r.candidates) {
      const k = `${normName(c.name)}|${normCompany(c.company)}`;
      if (seen.has(k)) duplicates += 1;
      seen.add(k);
    }
  }

  const latencies = ran.map((r) => r.latencyMs).filter((x) => typeof x === "number").sort((a, b) => a - b);
  const usage = ran.reduce(
    (u, r) => ({ searches: u.searches + (r.usage?.searches ?? 0), fetches: u.fetches + (r.usage?.fetches ?? 0), inputTokens: u.inputTokens + (r.usage?.inputTokens ?? 0), outputTokens: u.outputTokens + (r.usage?.outputTokens ?? 0) }),
    { searches: 0, fetches: 0, inputTokens: 0, outputTokens: 0 },
  );
  const searchFees = usage.searches * (prices.searchFee ?? SEARCH_FEE_USD);
  const tokenCost = prices.inPerMTok != null && prices.outPerMTok != null ? (usage.inputTokens / 1e6) * prices.inPerMTok + (usage.outputTokens / 1e6) * prices.outPerMTok : null;
  const totalCost = tokenCost === null ? null : searchFees + tokenCost;

  const industries = {};
  for (const r of results) {
    const k = r.industry || "Unlabelled";
    industries[k] ??= { searches: 0, withRelevant: 0, failed: 0 };
    industries[k].searches += 1;
    if (!r.ok) industries[k].failed += 1;
    else if (r.candidates.some((c) => c.status === "Verified" || c.status === "Likely match")) industries[k].withRelevant += 1;
  }

  return {
    searches: results.length,
    failures: { count: failed.length, rate: pct(failed.length, results.length), messages: [...new Set(failed.map((f) => f.error ?? "unknown"))] },
    hitRate: { anyContact: pct(withAny.length, ran.length), relevantContact: pct(withRelevant.length, ran.length), highConfidence: pct(withHigh.length, ran.length) },
    contacts: { total: all.length, withVerifiableSource: sourced.length, verifiableRate: pct(sourced.length, all.length), byStatus: { Verified: all.filter((c) => c.status === "Verified").length, "Likely match": all.filter((c) => c.status === "Likely match").length, "Possible match": all.filter((c) => c.status === "Possible match").length } },
    duplicateRate: pct(duplicates, all.length),
    latencyMs: { mean: mean(latencies), p50: percentile(latencies, 50), p95: percentile(latencies, 95), max: latencies.length ? latencies[latencies.length - 1] : null },
    usage,
    cost: { searchFeesUsd: Math.round(searchFees * 1000) / 1000, tokenCostUsd: tokenCost === null ? null : Math.round(tokenCost * 1000) / 1000, totalUsd: totalCost === null ? null : Math.round(totalCost * 1000) / 1000, perSearchUsd: totalCost === null || !ran.length ? null : Math.round((totalCost / ran.length) * 1000) / 1000, note: tokenCost === null ? "Token cost not included: pass --price-in and --price-out (USD per million tokens) for your model." : "Includes search fees at the documented price and tokens at the prices you gave." },
    byIndustry: industries,
    coverage: { industries: Object.keys(industries).length, enoughJobs: results.length >= 10 },
  };
}

/** Turns the streamed lines a lookup returns into the result for one job. */
export function parseLookup(text) {
  const lines = String(text)
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const result = lines.find((l) => l.type === "result");
  const error = lines.find((l) => l.type === "error");
  if (error) return { ok: false, error: error.error };
  if (!result) return { ok: false, error: "No result line in the response." };
  return {
    ok: true,
    note: result.result.note ?? null,
    latencyMs: result.result.latencyMs,
    usage: result.result.usage,
    candidates: (result.result.candidates ?? []).map((c) => ({ name: c.name, company: c.company, status: c.status, sources: (c.sources ?? []).map((s) => ({ url: s.url, evidence: s.evidence })) })),
  };
}

/** Rejects a jobs file that still holds the template placeholders, so no search is paid for by accident. */
export function validateJobs(jobs) {
  const problems = [];
  if (!Array.isArray(jobs) || jobs.length === 0) return ["The jobs file must be a list of jobs."];
  jobs.forEach((j, i) => {
    for (const f of ["title", "company"]) {
      if (typeof j?.[f] !== "string" || !j[f].trim()) problems.push(`Job ${i + 1}: ${f} is missing.`);
      else if (/REPLACE/i.test(j[f])) problems.push(`Job ${i + 1}: ${f} is still the template placeholder.`);
    }
  });
  return problems;
}
