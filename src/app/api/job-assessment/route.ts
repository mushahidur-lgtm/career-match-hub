import { NextResponse } from "next/server";
import { z } from "zod";
import { assessJob } from "@/lib/ai/deep-assessment";
import { badRequest, rateLimit } from "@/lib/rate-limit";
import { PreferencesSchema, ProfileSchema } from "@/lib/schemas";
import { toMatchInput } from "@/lib/search/match-input";
import { POSTING_STATUSES, WORK_MODES } from "@/types/job";

export const runtime = "nodejs";
export const maxDuration = 120;

const str = (n: number) => z.string().max(n);

const RequestSchema = z.object({
  job: z.object({
    title: str(500),
    company: str(300),
    location: str(300),
    workMode: z.enum([...WORK_MODES, "Not stated"]),
    description: str(30_000),
    descriptionTruncated: z.boolean(),
    postingStatus: z.enum(POSTING_STATUSES).optional(),
  }),
  resumeText: str(60_000),
  profile: ProfileSchema,
  preferences: PreferencesSchema.optional(),
});

/** Runs only when someone asks for it on one job. The server recomputes the rule findings itself. */
export async function POST(req: Request) {
  const limited = rateLimit(req, "job-assessment", 6);
  if (limited) return limited;

  let parsed;
  try {
    parsed = RequestSchema.safeParse(await req.json());
  } catch {
    return badRequest("Send JSON with a job, resumeText and profile.");
  }
  if (!parsed.success) return badRequest("The job or resume details were not valid.");
  const { job, resumeText, profile, preferences } = parsed.data;
  if (resumeText.trim().length < 50) return badRequest("Add your resume text first.");

  const input = toMatchInput(profile, resumeText, preferences);
  return NextResponse.json(await assessJob({ ...job, salary: null }, input));
}
