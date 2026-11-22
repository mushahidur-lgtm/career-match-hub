import { z } from "zod";
import {
  APPLICATION_STATUSES,
  EMPLOYMENT_FILTERS,
  EMPLOYMENT_TYPES,
  JOB_CATEGORIES,
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

export const ProfileSchema = z.object({
  summary: str(4000),
  yearsOfExperience: z.number().nullable(),
  seniority: z.enum(SENIORITY_LEVELS),
  skills: SkillSetSchema,
  detectedRoles: strList(50),
  recommendedRoles: strList(50),
  source: z.enum(["ai", "heuristic"]),
  model: str(100).optional(),
});

export const ResumeSchema = z.object({
  text: str(200_000),
  fileName: str(300).nullable(),
  uploadedAt: iso,
});

export const FiltersSchema = z.object({
  query: str(200),
  location: str(200),
  category: z.enum(["All", ...JOB_CATEGORIES]),
  workMode: z.enum(["All", ...WORK_MODES]),
  employmentType: z.enum(EMPLOYMENT_FILTERS),
  minSalary: z.number().min(0).max(10_000_000).nullable(),
});

export const PreferencesSchema = z.object({
  minSalary: z.number().min(0).max(10_000_000),
  locations: strList(30),
  primaryRoles: strList(60),
  secondaryRoles: strList(60),
});

export const MatchSchema = z.object({
  score: z.number(),
  matchingSkills: strList(),
  missingSkills: strList(),
  matchReason: str(2000),
  source: z.enum(["ai", "heuristic"]),
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
