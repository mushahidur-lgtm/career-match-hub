/**
 * Old-vs-new comparison on the labelled fixtures. `tests/fixtures/baseline-v1.json` was written by the v1 engine
 * (commit 8e8b101) with CMH_WRITE_BASELINE=1. This file prints the comparison and checks the snapshot is complete;
 * the behaviour each scenario must show is asserted in tests/scenarios.test.ts.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scoreJob } from "@/lib/matching/engine";
import { CANDIDATE, CANDIDATE_PREFS, CANDIDATE_RESUME, SCENARIOS } from "./fixtures/matching-fixtures";

const FILE = fileURLToPath(new URL("./fixtures/baseline-v1.json", import.meta.url));

interface Row {
  id: string;
  score: number;
  confidence: string;
  requiredMatched: string[];
  requiredMissing: string[];
  caps: string[];
}

function current(): Row[] {
  return SCENARIOS.map((s) => {
    const m = scoreJob(s.job, { profile: CANDIDATE, resumeText: CANDIDATE_RESUME, preferences: CANDIDATE_PREFS });
    return { id: s.id, score: m.score, confidence: m.detail!.confidence, requiredMatched: m.detail!.requiredMatched, requiredMissing: m.detail!.requiredMissing, caps: m.detail!.caps };
  });
}

describe("old vs new engine on labelled fixtures", () => {
  if (process.env.CMH_WRITE_BASELINE === "1") {
    it("writes the baseline", () => {
      writeFileSync(FILE, JSON.stringify(current(), null, 2) + "\n");
    });
    return;
  }

  it("has a baseline for every scenario", () => {
    expect(existsSync(FILE)).toBe(true);
    const old = JSON.parse(readFileSync(FILE, "utf8")) as Row[];
    const now = current();
    expect(old.map((r) => r.id)).toEqual(SCENARIOS.map((s) => s.id));
    if (process.env.CMH_PRINT_COMPARISON === "1") {
      const lines = SCENARIOS.map((s, i) => `${s.id} | ${s.label} | v1 ${old[i].score} (${old[i].confidence}) | v2 ${now[i].score} (${now[i].confidence}) | ${s.expect}`);
      console.log(["id | scenario | v1 | v2 | expected", ...lines].join("\n"));
    }
  });
});
