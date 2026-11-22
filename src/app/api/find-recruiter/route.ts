import { NextResponse } from "next/server";
import { z } from "zod";
import { isAiConfigured } from "@/lib/anthropic";
import { requireSignedIn } from "@/lib/cloud/auth";
import { describeToolError, searchWeb } from "@/lib/contacts/web-search";
import { verifyCandidates } from "@/lib/contacts/verify";
import { badRequest, rateLimit } from "@/lib/rate-limit";
import type { Contact } from "@/types/contacts";

export const runtime = "nodejs";
export const maxDuration = 90;
export const dynamic = "force-dynamic";

const Body = z.object({
  jobKey: z.string().max(500),
  title: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  location: z.string().max(200),
  applyUrl: z.string().max(2000).nullable(),
  source: z.enum(["adzuna", "jsearch", "demo", "manual"]),
});

/** A ceiling on lookups per server instance per hour, on top of the per-visitor limit, because each lookup bills web searches. */
const HOURLY_MAX = Math.min(200, Math.max(1, Number(process.env.FIND_RECRUITER_MAX_PER_HOUR) || 20));
const recent: number[] = [];

export interface FindRecruiterResponse {
  candidates: Contact[];
  /** Why nothing was found or searched, in plain words. */
  note: string | null;
  searches: number;
}

export async function POST(req: Request) {
  const limited = rateLimit(req, "find-recruiter", 3, 60_000) ?? rateLimit(req, "find-recruiter-hour", 12, 3_600_000);
  if (limited) return limited;

  const auth = await requireSignedIn(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

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
  if (!isAiConfigured()) {
    return NextResponse.json<FindRecruiterResponse>({ candidates: [], note: "Web search needs an Anthropic API key (ANTHROPIC_API_KEY) on this site. Names the posting itself states are still shown.", searches: 0 });
  }

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

  const result = await searchWeb({ company: job.company, jobTitle: job.title, location: job.location, applyHost: host });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 502 });

  const { parsed: found } = result;
  if (found.toolErrors.length && !found.evidence.results.length) {
    return NextResponse.json({ error: describeToolError(found.toolErrors[0]) }, { status: 502 });
  }

  const { contacts, dropped } = verifyCandidates(found.raw, found.evidence, { jobKey: job.jobKey, jobTitle: job.title, company: job.company, applyUrl: job.applyUrl });
  const note = contacts.length
    ? dropped.length
      ? `${dropped.length} possible ${dropped.length === 1 ? "contact was" : "contacts were"} left out because no source backed ${dropped.length === 1 ? "it" : "them"} up.`
      : null
    : found.raw.length
      ? "The search suggested some names, but no page backed them up, so none are shown."
      : "No reliable contact was found for this job.";
  return NextResponse.json<FindRecruiterResponse>({ candidates: contacts, note, searches: found.searches });
}
