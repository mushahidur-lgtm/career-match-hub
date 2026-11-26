import { NextResponse } from "next/server";
import { z } from "zod";
import { checkJob } from "@/lib/jobs/check";
import { badRequest, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

const str = (n: number) => z.string().max(n);

const RequestSchema = z.object({
  job: z.object({
    id: str(300),
    title: str(500),
    company: str(300),
    source: z.enum(["adzuna", "jsearch", "demo", "manual"]),
    applyUrl: str(2000).nullable(),
    description: str(60_000),
    descriptionTruncated: z.boolean(),
    postedAt: str(40).nullable(),
  }),
});

/** Checks one job the user opened. No resume or profile is sent here. */
export async function POST(req: Request) {
  const limited = rateLimit(req, "job-check", 15);
  if (limited) return limited;

  let parsed;
  try {
    parsed = RequestSchema.safeParse(await req.json());
  } catch {
    return badRequest("Send JSON with a job.");
  }
  if (!parsed.success) return badRequest("The job details were not valid.");

  try {
    return NextResponse.json(await checkJob(parsed.data.job));
  } catch (err) {
    console.error("job-check failed:", err instanceof Error ? err.name : "unknown error");
    return badRequest("The posting could not be checked. Try again later.", 502);
  }
}
