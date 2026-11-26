import { z } from "zod";
import { LIMITS } from "./limits";
import {
  APPLICATION_STATUSES,
  EMPLOYMENT_FILTERS,
  INTERVIEW_FORMATS,
  INTERVIEW_STAGES,
  INTERVIEW_STATUSES,
  legacyStatus,
  EMPLOYMENT_TYPES,
  JOB_CATEGORIES,
  MATCH_COMPONENTS,
  SENIORITY_LEVELS,
  WORK_MODES,
  CLEARANCE_LEVELS,
  DESCRIPTION_SOURCES,
  DESCRIPTION_STATUSES,
  VERIFICATION_STATES,
  EVIDENCE_LEVELS,
  LANGUAGE_LEVELS,
  POSTING_STATUSES,
  RECOMMENDED_ACTIONS,
  ROLE_RELATIONS,
  RESUME_SECTIONS,
  WORK_AUTHORIZATIONS,
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
  field: str(120).optional(),
});

export const CertificationDetailSchema = z.object({
  name: str(200),
  issuer: str(120).optional(),
  expires: str(10).optional(),
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
  certificationDetails: z.array(CertificationDetailSchema).max(60).optional(),
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
  career: z.number().min(0).max(1000).optional(),
  seniority: z.number().min(0).max(1000),
  industry: z.number().min(0).max(1000),
  location: z.number().min(0).max(1000),
});

export const FactsSchema = z.object({
  workAuthorization: z.enum(WORK_AUTHORIZATIONS).nullable().optional(),
  languages: z.array(z.object({ language: str(40), level: z.enum(LANGUAGE_LEVELS) })).max(20).optional(),
  clearance: z.enum(CLEARANCE_LEVELS).nullable().optional(),
  exclusions: z.array(str(60)).max(30).optional(),
  qualificationsComplete: z.boolean().optional(),
});

export const PreferencesSchema = z.object({
  minSalary: z.number().min(0).max(10_000_000),
  locations: strList(30),
  primaryRoles: strList(60),
  secondaryRoles: strList(60),
  weights: WeightsSchema.optional(),
  facts: FactsSchema.optional(),
  transitionRoles: strList(60).optional(),
  excludedRoles: strList(60).optional(),
});

const noteList = z.array(str(400)).max(40);
const PointSchema = z.object({ text: str(600), evidence: z.array(str(400)).max(5), source: z.enum(["rules", "ai"]) });

export const EligibilitySchema = z.object({
  status: z.enum(["eligible", "not_eligible", "needs_verification", "not_applicable"]),
  checks: z
    .array(
      z.object({
        gate: z.enum(["citizenship", "work_authorization", "sponsorship", "clearance", "language", "education", "certification"]),
        status: z.enum(["eligible", "not_eligible", "needs_verification", "not_applicable", "preferred_missing"]),
        advisory: z.boolean().optional(),
        postingEvidence: str(400),
        candidateEvidence: str(400).nullable(),
        note: str(400),
      }),
    )
    .max(30),
  reason: str(3000),
});

const AiReviewSchema = z.object({
  status: z.enum(["applied", "unavailable", "not_shortlisted", "failed"]),
  model: str(100).optional(),
  promptVersion: str(40).optional(),
  at: iso.optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  rationale: str(600).optional(),
  concerns: z.array(str(300)).max(5).optional(),
  dimensions: z.object({ experience: z.number(), responsibilities: z.number(), transferable: z.number(), career: z.number(), domain: z.number() }).optional(),
});

export const MatchDetailSchema = z.object({
  confidence: z.enum(["high", "medium", "low"]),
  confidenceReasons: noteList,
  requiredMatched: strList(),
  requiredMissing: strList(),
  preferredMatched: strList(),
  preferredMissing: strList(),
  transferable: z.array(z.object({ skill: str(120), via: str(120), why: str(400).optional(), credit: z.number().optional() })).max(100),
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
  confidenceScore: z.number().min(0).max(100).optional(),
  skillEvidence: z
    .array(
      z.object({
        skill: str(120),
        importance: z.enum(["required", "preferred", "optional"]),
        level: z.enum(EVIDENCE_LEVELS),
        credit: z.number().min(0).max(1),
        via: str(120).optional(),
        relation: str(400).optional(),
        evidence: z.array(z.object({ section: z.enum(RESUME_SECTIONS), quote: str(300) })).max(4),
      }),
    )
    .max(200)
    .optional(),
  strengths: z.array(PointSchema).max(20).optional(),
  gaps: z.array(PointSchema).max(30).optional(),
  careerAlignment: z.object({ score: z.number().nullable(), note: str(600), role: str(200).nullable(), relation: z.enum(ROLE_RELATIONS).nullable().optional() }).optional(),
  capLimit: z.number().nullable().optional(),
  flags: noteList.optional(),
});

export const MatchSchema = z.object({
  score: z.number(),
  matchingSkills: strList(),
  missingSkills: strList(),
  matchReason: str(3000),
  source: z.enum(["ai", "heuristic"]),
  detail: MatchDetailSchema.optional(),
  deterministicScore: z.number().min(0).max(100).optional(),
  aiAdjustment: z.number().min(-15).max(15).optional(),
  finalScore: z.number().min(0).max(100).optional(),
  eligibility: EligibilitySchema.optional(),
  postingStatus: z.enum(POSTING_STATUSES).optional(),
  recommendedAction: z.enum(RECOMMENDED_ACTIONS).optional(),
  ai: AiReviewSchema.optional(),
});

export const EnrichmentSchema = z.object({
  status: z.enum(DESCRIPTION_STATUSES),
  originalLength: z.number().int().min(0),
  enrichedLength: z.number().int().min(0),
  source: z.enum(DESCRIPTION_SOURCES),
  retrievedAt: iso,
  truncated: z.boolean(),
  error: str(200).optional(),
});

export const VerificationSchema = z.object({
  state: z.enum(VERIFICATION_STATES),
  checkedAt: iso,
  notes: z.array(str(300)).max(10),
  finalUrl: str(2000).optional(),
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
  source: z.enum(["adzuna", "jsearch", "demo", "manual"]),
  match: MatchSchema.nullable(),
  duplicateCount: z.number().int().min(0).max(1000).optional(),
  otherApplyUrls: z.array(str(2000)).max(5).optional(),
  retrievedAt: iso.optional(),
  postingStatus: z.enum(POSTING_STATUSES).optional(),
  postingNotes: z.array(str(200)).max(10).optional(),
  enrichment: EnrichmentSchema.optional(),
  verification: VerificationSchema.optional(),
});

/** Accepts the statuses used before the pipeline grew (Saved, Interviewing) and reads them as the current ones. */
export const StatusSchema = z.preprocess(legacyStatus, z.enum(APPLICATION_STATUSES));

const day = str(10).nullable().optional();

export const InterviewSchema = z.object({
  id: str(80),
  at: str(16).nullable(),
  stage: z.enum(INTERVIEW_STAGES),
  format: z.enum(INTERVIEW_FORMATS),
  status: z.enum(INTERVIEW_STATUSES),
  interviewers: str(LIMITS.interviewers),
  prepNotes: str(LIMITS.prepNotes),
  questionsToAsk: z.array(str(LIMITS.question)).max(LIMITS.questionsMax),
  topicsToReview: z.array(str(LIMITS.topic)).max(LIMITS.topicsMax),
  feedback: str(LIMITS.feedback),
});

export const ActivitySchema = z.object({
  id: str(80),
  at: iso,
  kind: z.enum(["created", "status", "note", "contact", "interview", "edit"]),
  text: str(LIMITS.historyText),
});

export const SavedJobSchema = z.object({
  job: JobSchema,
  status: StatusSchema,
  notes: str(LIMITS.notes),
  savedAt: iso,
  updatedAt: iso,
  appliedAt: day,
  resumeVersionId: str(80).nullable().optional(),
  resumeName: str(LIMITS.resumeName).nullable().optional(),
  coverLetter: str(LIMITS.coverLetter).optional(),
  recruiter: z.object({ name: str(LIMITS.name), email: str(LIMITS.email), phone: str(LIMITS.phone) }).optional(),
  followUpDate: day,
  deadline: day,
  responseDue: day,
  salaryExpectation: str(LIMITS.salaryExpectation).optional(),
  offer: z
    .object({
      salary: str(LIMITS.offerShort),
      bonus: str(LIMITS.offerShort),
      benefits: str(LIMITS.offerBenefits),
      startDate: str(10).nullable().default(null),
      decideBy: str(10).nullable().default(null),
      notes: str(LIMITS.offerNotes),
    })
    .optional(),
  rejectionReason: str(LIMITS.rejectionReason).optional(),
  interviews: z.array(InterviewSchema).max(LIMITS.interviewsMax).optional(),
  history: z.array(ActivitySchema).max(LIMITS.historyMax).optional(),
});

export const SavedJobsSchema = z.array(SavedJobSchema).max(5000);

/** Returns the parsed value, or null when it does not match the schema. */
export function validate<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> | null {
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}

/* ---------- search history ---------- */

export const SeenJobSchema = z.object({
  key: str(500),
  firstSeenAt: iso,
  lastSeenAt: iso,
  seenCount: z.number().int().min(1).max(100_000),
  title: str(200),
  company: str(200),
  location: str(200),
  workMode: z.enum([...WORK_MODES, "Not stated"]),
  employmentType: z.enum([...EMPLOYMENT_TYPES, "Internship", "Not stated"]),
  category: z.enum(JOB_CATEGORIES),
  pay: z.object({ lo: z.number().min(0).max(10_000_000), hi: z.number().min(0).max(10_000_000) }).nullable(),
  postedAt: iso.nullable(),
  source: z.enum(["adzuna", "jsearch", "demo", "manual"]),
  score: z.number().min(0).max(100).nullable(),
  confidence: z.enum(["high", "medium", "low"]).nullable(),
  required: z.array(str(120)).max(60),
  preferred: z.array(str(120)).max(60),
  truncated: z.boolean(),
});

export const SearchRecordSchema = z.object({
  id: str(80),
  at: iso,
  filters: FiltersSchema,
  provider: z.enum(["adzuna", "jsearch", "demo", "none"]),
  scoring: z.enum(["ai", "heuristic", "mixed", "none"]),
  resumeName: str(120).nullable(),
  resultCount: z.number().int().min(0).max(10_000),
  newCount: z.number().int().min(0).max(10_000),
  avgScore: z.number().min(0).max(100).nullable(),
  scoredCount: z.number().int().min(0).max(10_000),
});
