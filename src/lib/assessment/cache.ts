import { z } from "zod";
import { EligibilitySchema } from "@/lib/schemas";
import { AiSectionSchema, RECOMMENDATIONS, type Assessment } from "./model";

/** Assessments kept in this browser, so reopening a job does not pay for it again. */
const KEY = "cmh:assessments";
const MAX_ENTRIES = 15;
const str = (n: number) => z.string().max(n);
const checks = EligibilitySchema.shape.checks;

export const AssessmentSchema = z.object({
  status: z.enum(["complete", "unavailable", "failed"]),
  rules: z.object({
    score: z.number(),
    confidence: z.enum(["high", "medium", "low"]),
    eligibility: EligibilitySchema.shape.status,
    postingClosed: z.boolean(),
    requiredMatched: z.array(str(120)),
    requiredMissing: z.array(str(120)),
    preferredMatched: z.array(str(120)),
    transferable: z.array(z.object({ skill: str(120), via: str(120), why: str(400) })),
    weaklyShown: z.array(z.object({ skill: str(120), level: str(20) })),
    qualifications: checks,
    otherConditions: checks,
    recommendation: z.enum(RECOMMENDATIONS),
  }),
  ai: AiSectionSchema.nullable(),
  notes: z.array(str(400)),
  at: str(40),
  model: str(100).nullable(),
});

const Store = z.record(z.string(), AssessmentSchema);

/** Tied to one job, one resume and one version of each. */
export const assessmentKey = (jobId: string, resumeId: string, resumeLength: number, descriptionLength: number) => `${jobId}|${resumeId}|${resumeLength}|${descriptionLength}`;

function read(): Record<string, Assessment> {
  try {
    const parsed = Store.safeParse(JSON.parse(window.localStorage.getItem(KEY) ?? "{}"));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export const loadAssessment = (key: string): Assessment | null => read()[key] ?? null;

/** Only a finished assessment is kept: a failure should be tried again. */
export function saveAssessment(key: string, value: Assessment): void {
  if (value.status !== "complete") return;
  try {
    const store = { ...read(), [key]: value };
    const newest = Object.entries(store).sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, MAX_ENTRIES);
    window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(newest)));
  } catch {
    /* storage full or blocked: it still shows this time */
  }
}
