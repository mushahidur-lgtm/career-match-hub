import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSignedIn, signInEnforced } from "@/lib/cloud/auth";
import { describeToolError, searchWeb, webSearchEnabled } from "@/lib/contacts/web-search";
import { verifyCandidates } from "@/lib/contacts/verify";
import { badRequest, rateLimit } from "@/lib/rate-limit";
import type { Contact } from "@/types/contacts";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const Body = z.object({
  jobKey: z.string().max(500),
  title: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  location: z.string().max(200),
  applyUrl: z.string().max(2000).nullable(),
  source: z.enum(["adzuna", "jsearch", "demo", "manual"]),
  category: z.string().max(80).default("Other"),
  /** The start of the posting, used to work out which team hires for the job. */
  description: z.string().max(3000).default(""),
  /** People already found, so "search more" looks for different ones. */
  exclude: z.array(z.string().max(120)).max(20).default([]),
  pass: z.number().int().min(1).max(5).default(1),
});

/** A ceiling on lookups per server instance per hour, on top of the per-visitor limit, because each lookup bills web searches. */
const HOURLY_MAX = Math.min(200, Math.max(1, Number(process.env.FIND_RECRUITER_MAX_PER_HOUR) || 20));
const recent: number[] = [];

export interface FindRecruiterResponse {
  candidates: Contact[];
  /** Why nothing was found or searched, in plain words. */
  note: string | null;
  searches: number;
  fetches?: number;
  /** The searches that were run and the sites that were read. */
  queries?: string[];
  readHosts?: string[];
  usage?: { searches: number; fetches: number; inputTokens: number; outputTokens: number };
  /** Names the search suggested that no page backed up. */
  unsupported?: number;
  /** Why those were left out, without repeating. */
  reasons?: string[];
  latencyMs?: number;
  /** True when the search hit its time limit or was stopped, so fewer people may have been found. */
  stoppedEarly?: boolean;
}

export type StreamLine = { type: "progress"; message: string } | { type: "result"; result: FindRecruiterResponse } | { type: "error"; error: string };

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Send the job title, company and location.");
  const job = parsed.data;

  // Invented sample jobs have no real people. Searching their made-up companies could surface unrelated real ones.
  if (job.source === "demo") {
    return NextResponse.json<FindRecruiterResponse>({ candidates: [], note: "This is a sample job, so there are no real contacts for it.", searches: 0 });
  }
  if (/^company not listed$/i.test(job.company.trim())) {
    return NextResponse.json<FindRecruiterResponse>({ candidates: [], note: "The posting does not name the employer, so there is no company to search for.", searches: 0 });
  }
  if (!webSearchEnabled(signInEnforced())) {
    return NextResponse.json<FindRecruiterResponse>({
      candidates: [],
      note: "Web lookups are switched off on this site, because each one costs money. The site owner can enable them (see the README). Names the posting itself states are still shown.",
      searches: 0,
    });
  }

  // Only a real lookup counts against the limits, so sample-job clicks and refusals do not use them up.
  const limited = rateLimit(req, "find-recruiter", 3, 60_000) ?? rateLimit(req, "find-recruiter-hour", 12, 3_600_000);
  if (limited) return limited;
  const auth = await requireSignedIn(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const now = Date.now();
  while (recent.length && now - recent[0] > 3_600_000) recent.shift();
  if (recent.length >= HOURLY_MAX) return badRequest("This site has reached its hourly limit for recruiter searches. Try again later.", 429);
  recent.push(now);

  let host: string | null = null;
  try {
    host = job.applyUrl ? new URL(job.applyUrl).hostname : null;
  } catch {
    host = null;
  }

  // The answer is streamed as one JSON object per line, so the page can show what is being searched while it runs.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // A page that closed or stopped the search must not make the server throw: the lookup still finishes and is billed.
      const send = (line: StreamLine) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        } catch {
          /* the reader has gone */
        }
      };
      const started = Date.now();
      try {
        const result = await searchWeb(
          { company: job.company, jobTitle: job.title, category: job.category, description: job.description, location: job.location, applyHost: host, exclude: job.exclude, pass: job.pass },
          (message) => send({ type: "progress", message }),
          req.signal,
        );
        if (!result.ok) {
          send({ type: "error", error: result.message });
          return;
        }
        const { parsed: found, usage } = result;
        if (found.toolErrors.length && !found.evidence.results.length && !(found.evidence.pages ?? []).length) {
          send({ type: "error", error: describeToolError(found.toolErrors[0]) });
          return;
        }
        send({ type: "progress", message: "Checking each name against what the pages say" });
        const { contacts, dropped } = verifyCandidates(found.raw, found.evidence, { jobKey: job.jobKey, jobTitle: job.title, company: job.company, applyUrl: job.applyUrl, location: job.location }, new Date());
        const reasons = [...new Set(dropped.map((d) => d.reason))].slice(0, 4);
        const early = found.stoppedEarly ? " The search hit its time limit and stopped early, so fewer people may have been found." : "";
        const base = contacts.length
          ? dropped.length
            ? `${dropped.length} suggested ${dropped.length === 1 ? "name was" : "names were"} left out because no source backed ${dropped.length === 1 ? "it" : "them"} up.`
            : null
          : found.raw.length
            ? "The search suggested some names, but no page backed them up, so none are shown."
            : found.searches === 0
              ? "No search could be run."
              : "No page that was found names a recruiter or HR contact for this job.";
        const note = base || early ? `${base ?? ""}${early}`.trim() : null;
        send({
          type: "result",
          result: { candidates: contacts, note, searches: found.searches, fetches: found.fetches, queries: found.queries.slice(0, 12), readHosts: found.readHosts, usage, unsupported: dropped.length, reasons, latencyMs: Date.now() - started, stoppedEarly: found.stoppedEarly },
        });
      } catch (err) {
        console.error("find-recruiter stream failed:", err instanceof Error ? err.message : err);
        send({ type: "error", error: "The search failed. Nothing was saved. Try again." });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
