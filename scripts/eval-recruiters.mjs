#!/usr/bin/env node
// Measures recruiter discovery on real postings you choose, against a running copy of the site.
//
//   node scripts/eval-recruiters.mjs --jobs my-jobs.json [--site http://localhost:3000] [--token <access token>]
//                                    [--delay 21] [--price-in 3 --price-out 15] [--out report.json]
//
// Each job is searched for real: it runs Anthropic web searches (about $0.01 each, plus model tokens) and looks for
// people at the company on the public web. Use postings you are actually interested in. The site must have
// ANTHROPIC_API_KEY and RECRUITER_WEB_SEARCH=1 set. The route allows 3 lookups a minute per visitor, so the script waits
// between jobs (--delay seconds, default 21).
import { readFileSync, writeFileSync } from "node:fs";
import { parseLookup, summarize, validateJobs } from "./eval-lib.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "true"]] : acc), []),
);
if (!args.jobs) {
  console.error("Usage: node scripts/eval-recruiters.mjs --jobs jobs.json [--site URL] [--token T] [--delay S] [--price-in N --price-out N] [--out file]");
  process.exit(2);
}
const site = (args.site ?? "http://localhost:3000").replace(/\/$/, "");
const delay = Number(args.delay ?? 21) * 1000;
const jobs = JSON.parse(readFileSync(args.jobs, "utf8"));
const problems = validateJobs(jobs);
if (problems.length) {
  console.error(`Not running, because:\n- ${problems.join("\n- ")}`);
  process.exit(2);
}
console.log(`${jobs.length} jobs, ${new Set(jobs.map((j) => j.industry ?? "Unlabelled")).size} industries. Each is a real, billed lookup.`);
if (jobs.length < 10) console.log("Note: fewer than 10 jobs, so the figures are rough.");

const results = [];
for (const [i, job] of jobs.entries()) {
  const started = Date.now();
  process.stdout.write(`[${i + 1}/${jobs.length}] ${job.company} - ${job.title} ... `);
  let out;
  try {
    const res = await fetch(`${site}/api/find-recruiter`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(args.token ? { Authorization: `Bearer ${args.token}` } : {}) },
      body: JSON.stringify({
        jobKey: `${job.title}|${job.company}|${job.location ?? ""}`.toLowerCase(),
        title: job.title,
        company: job.company,
        location: job.location ?? "",
        applyUrl: job.applyUrl ?? null,
        source: "manual",
        category: job.category ?? "Other",
        description: (job.description ?? "").slice(0, 3000),
        exclude: [],
        pass: 1,
      }),
    });
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("ndjson")) out = parseLookup(await res.text());
    else {
      const body = await res.json().catch(() => ({}));
      out = body.error ? { ok: false, error: body.error } : { ok: false, error: body.note ?? `HTTP ${res.status}` };
    }
  } catch (err) {
    out = { ok: false, error: String(err?.message ?? err) };
  }
  const wall = Date.now() - started;
  results.push({ industry: job.industry, company: job.company, title: job.title, latencyMs: out.latencyMs ?? wall, ...out });
  console.log(out.ok ? `${out.candidates.length} contacts (${wall} ms)` : `FAILED: ${out.error}`);
  if (i < jobs.length - 1) await new Promise((r) => setTimeout(r, delay));
}

const report = summarize(results, { inPerMTok: args["price-in"] ? Number(args["price-in"]) : undefined, outPerMTok: args["price-out"] ? Number(args["price-out"]) : undefined });
console.log("\n" + JSON.stringify(report, null, 2));
if (args.out) {
  writeFileSync(args.out, JSON.stringify({ report, results }, null, 2));
  console.log(`\nSaved to ${args.out}. The file contains names of people found, so keep it private.`);
}
