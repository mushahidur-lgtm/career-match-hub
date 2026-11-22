import { z } from "zod";
import {
  APPLICATION_STATUSES,
  EMPLOYMENT_FILTERS,
  EMPLOYMENT_TYPES,
  JOB_CATEGORIES,
  MATCH_COMPONENTS,
  SENIORITY_LEVELS,
  WORK_MODES,
} from "@/types/job";

/**
 * Runtime checks for everything we read back from storage or an imported file.
 * Data from localStorage or a file is untrusted: it may be old, edited by hand or damaged.
 */
const str = (max: number) => z.string().max(max);
const strList = (max = 200) => z.array(str(120)).max(max);
const iso = str(40);

export const SkillSetSchema = z.object({
  languages: strList(),
  frameworks: strList(),
  cloudData: strList(),
  tools: strList(),
});

export const WorkEntrySchema = z.object({
  title: str(200),
  company: str(200),
  start: str(10).nullable(),
  end: str(10).nullable(),
  current: z.boolean(),
});

export const EducationSchema = z.object({
  credential: str(200),
  institution: str(200),
  year: str(10).nullable(),
});

export const ProfileSchema = z.object({
  summary: str(4000),
  yearsOfExperience: z.number().nullable(),
  seniority: z.enum(SENIORITY_LEVELS),
  skills: SkillSetSchema,
  detectedRoles: strList(50),
  recommendedRoles: strList(50),
  source: z.enum(["ai", "heuristic"]),
  model: str(100).optional(),
  workHistory: z.array(WorkEntrySchema).max(60).optional(),
  education: z.array(EducationSchema).max(30).optional(),
  certifications: z.array(str(200)).max(60).optional(),
});

export const ResumeSchema = z.object({
  text: str(200_000),
  fileName: str(300).nullable(),
  uploadedAt: iso,
});

export const ResumeVersionSchema = z.object({
  id: str(80),
  name: str(120),
  text: str(200_000),
  fileName: str(300).nullable(),
  uploadedAt: iso,
  profile: ProfileSchema,
});

export const ResumeVersionsSchema = z.array(ResumeVersionSchema).max(20);

export const FiltersSchema = z.object({
  query: str(200),
  location: str(200),
  category: z.enum(["All", ...JOB_CATEGORIES]),
  workMode: z.enum(["All", ...WORK_MODES]),
  employmentType: z.enum(EMPLOYMENT_FILTERS),
  minSalary: z.number().min(0).max(10_000_000).nullable(),
});

export const WeightsSchema = z.object({
  skills: z.number().min(0).max(1000),
  experience: z.number().min(0).max(1000),
  responsibilities: z.number().min(0).max(1000),
  seniority: z.number().min(0).max(1000),
  industry: z.number().min(0).max(1000),
  location: z.number().min(0).max(1000),
});

export const PreferencesSchema = z.object({
  minSalary: z.number().min(0).max(10_000_000),
  locations: strList(30),
  primaryRoles: strList(60),
  secondaryRoles: strList(60),
  weights: WeightsSchema.optional(),
});

const noteList = z.array(str(400)).max(40);
export const MatchDetailSchema = z.object({
  confidence: z.enum(["high", "medium", "low"]),
  confidenceReasons: noteList,
  requiredMatched: strList(),
  requiredMissing: strList(),
  preferredMatched: strList(),
  preferredMissing: strList(),
  transferable: z.array(z.object({ skill: str(120), via: str(120) })).max(100),
  evidence: noteList,
  experienceGaps: noteList,
  seniority: z.object({ status: z.enum(["aligned", "stretch", "overqualified", "unknown"]), note: str(400) }),
  location: z.object({ status: z.enum(["yes", "partial", "no", "unknown"]), note: str(400) }),
  salary: z.object({ status: z.enum(["meets", "below", "unknown"]), note: str(400) }),
  components: z
    .array(
      z.object({
        key: z.enum(MATCH_COMPONENTS),
        label: str(100),
        weight: z.number(),
        score: z.number().nullable(),
        note: str(800),
        aiAdjusted: z.boolean().optional(),
      }),
    )
    .max(10),
  caps: noteList,
  explanation: str(3000),
  aiNote: str(1000).optional(),
});

export const MatchSchema = z.object({
  score: z.number(),
  matchingSkills: strList(),
  missingSkills: strList(),
  matchReason: str(3000),
  source: z.enum(["ai", "heuristic"]),
  detail: MatchDetailSchema.optional(),
});

export const JobSchema = z.object({
  id: str(300),
  title: str(500),
  company: str(300),
  location: str(300),
  workMode: z.enum([...WORK_MODES, "Not stated"]),
  employmentType: z.enum([...EMPLOYMENT_TYPES, "Internship", "Not stated"]),
  category: z.enum(JOB_CATEGORIES),
  salary: z
    .object({
      min: z.number().nullable(),
      max: z.number().nullable(),
      currency: z.enum(["CAD", "USD"]),
      period: z.enum(["year", "hour"]),
      estimated: z.boolean(),
    })
    .nullable(),
  postedAt: iso.nullable(),
  description: str(60_000),
  descriptionTruncated: z.boolean(),
  applyUrl: str(2000).nullable(),
  source: z.enum(["adzuna", "jsearch", "demo"]),
  match: MatchSchema.nullable(),
});

export const SavedJobSchema = z.object({
  job: JobSchema,
  status: z.enum(APPLICATION_STATUSES),
  notes: str(10_000),
  savedAt: iso,
  updatedAt: iso,
});

export const SavedJobsSchema = z.array(SavedJobSchema).max(5000);

/** Returns the parsed value, or null when it does not match the schema. */
export function validate<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> | null {
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}
