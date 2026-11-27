export const SKILL_CATEGORIES = ["languages", "frameworks", "cloudData", "tools"] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];
export type SkillSet = Record<SkillCategory, string[]>;

export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  languages: "Languages",
  frameworks: "Frameworks",
  cloudData: "Cloud and data",
  tools: "Tools",
};

export const SENIORITY_LEVELS = [
  "Entry",
  "Junior",
  "Mid-level",
  "Senior",
  "Lead",
  "Principal",
  "Manager",
  "Executive",
] as const;
export type Seniority = (typeof SENIORITY_LEVELS)[number];

/** Whether a result came from Claude or from the built-in keyword engine. */
export type AnalysisSource = "ai" | "heuristic";

/** One job on the resume. Dates are "YYYY" or "YYYY-MM"; a null end with current set means still there. */
export interface WorkEntry {
  title: string;
  company: string;
  start: string | null;
  end: string | null;
  current: boolean;
}

export interface EducationEntry {
  credential: string;
  institution: string;
  year: string | null;
}

export interface CandidateProfile {
  summary: string;
  yearsOfExperience: number | null;
  seniority: Seniority;
  skills: SkillSet;
  detectedRoles: string[];
  recommendedRoles: string[];
  source: AnalysisSource;
  model?: string;
  /** Read from the resume and editable. Absent on profiles saved before these existed. */
  workHistory?: WorkEntry[];
  education?: EducationEntry[];
  certifications?: string[];
}

/** One saved version of the resume with the profile read from it. Matching uses the active one. */
export interface ResumeVersion {
  id: string;
  name: string;
  text: string;
  fileName: string | null;
  uploadedAt: string;
  profile: CandidateProfile;
}

export interface StoredResume {
  text: string;
  fileName: string | null;
  uploadedAt: string;
}

export const WORK_MODES = ["Remote", "Hybrid", "On-site"] as const;
export type WorkMode = (typeof WORK_MODES)[number] | "Not stated";
export type WorkModeFilter = "All" | (typeof WORK_MODES)[number];

export const EMPLOYMENT_TYPES = ["Full-time", "Contract", "Part-time"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number] | "Internship" | "Not stated";
/** "Permanent full-time" excludes contract, temporary, freelance, part-time and internship postings. */
export const EMPLOYMENT_FILTERS = ["All", "Permanent full-time", "Full-time", "Contract", "Part-time"] as const;
export type EmploymentTypeFilter = (typeof EMPLOYMENT_FILTERS)[number];

export const JOB_CATEGORIES = [
  "Software engineering",
  "Data and analytics",
  "AI and machine learning",
  "Cloud and DevOps",
  "Cybersecurity",
  "QA and testing",
  "Product and projects",
  "Design",
  "IT and support",
  "Business and finance",
  "Other",
] as const;
export type JobCategory = (typeof JOB_CATEGORIES)[number];
export type JobCategoryFilter = "All" | JobCategory;

export type JobSource = "adzuna" | "jsearch" | "demo" | "manual";
/** "none" means no job source is configured, so searches return nothing rather than invented jobs. */
export type ProviderStatus = Exclude<JobSource, "manual"> | "none";
export type SalaryPeriod = "year" | "hour";

export interface Salary {
  min: number | null;
  max: number | null;
  currency: "CAD" | "USD";
  period: SalaryPeriod;
  /** True when the provider predicted the figure rather than the employer stating it. */
  estimated: boolean;
}

/** How much each part of a match counts toward the 0-100 score. Normalised, so only the ratios matter. */
export const MATCH_COMPONENTS = ["skills", "experience", "responsibilities", "career", "seniority", "industry", "location"] as const;
export type MatchComponentKey = (typeof MATCH_COMPONENTS)[number];
export type MatchWeights = Record<MatchComponentKey, number>;

/**
 * The central, configurable weights. `industry` keeps its storage key and is shown as "Domain".
 * `career` (alignment with the roles you said you want) was added in v2; weights saved before it existed read it as the default.
 */
export const DEFAULT_MATCH_WEIGHTS: MatchWeights = {
  skills: 25,
  experience: 25,
  responsibilities: 20,
  career: 10,
  seniority: 10,
  industry: 5,
  location: 5,
};

export const MATCH_COMPONENT_LABELS: Record<MatchComponentKey, string> = {
  skills: "Technical skills",
  experience: "Relevant experience",
  responsibilities: "Responsibilities",
  career: "Career alignment",
  seniority: "Seniority",
  industry: "Domain",
  location: "Location and work arrangement",
};

/* ---------- v2: evidence, eligibility, posting status ---------- */

/** How strongly the resume shows a skill. Only work under an employer is "professional"; a skills list alone is "listed". */
export const EVIDENCE_LEVELS = ["professional", "project", "learning", "listed", "missing"] as const;
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

export const RESUME_SECTIONS = ["experience", "projects", "education", "certifications", "skills", "summary", "other"] as const;
export type ResumeSection = (typeof RESUME_SECTIONS)[number];

export interface EvidenceRef {
  section: ResumeSection;
  /** A line copied from the resume. */
  quote: string;
}

export type RequirementImportance = "required" | "preferred" | "optional";

/** One skill the posting asks for and what the resume shows for it. */
export interface SkillMatchItem {
  skill: string;
  importance: RequirementImportance;
  level: EvidenceLevel;
  /** 0 to 1: share of full credit given. */
  credit: number;
  /** Set when the credit comes from a related skill rather than this one. */
  via?: string;
  relation?: string;
  evidence: EvidenceRef[];
}

export const WORK_AUTHORIZATIONS = ["citizen", "permanent_resident", "work_permit", "needs_sponsorship"] as const;
export type WorkAuthorization = (typeof WORK_AUTHORIZATIONS)[number];
export const LANGUAGE_LEVELS = ["basic", "intermediate", "professional", "fluent", "native"] as const;
export type LanguageLevel = (typeof LANGUAGE_LEVELS)[number];
export const CLEARANCE_LEVELS = ["none", "reliability", "secret", "top_secret"] as const;
export type ClearanceLevel = (typeof CLEARANCE_LEVELS)[number];

/**
 * Facts only the candidate can state. Each is entered by hand in Settings and never inferred from a resume.
 * An absent value means "not stated", which can only ever lead to needs_verification, never to a fail.
 */
export interface CandidateFacts {
  workAuthorization?: WorkAuthorization | null;
  /** When present, this is the complete list of languages you work in. */
  languages?: { language: string; level: LanguageLevel }[];
  clearance?: ClearanceLevel | null;
  /** Words that rule a posting out of your career direction (for example "sales" or "commission"). */
  exclusions?: string[];
}

export type EligibilityStatus = "eligible" | "not_eligible" | "needs_verification" | "not_applicable";
export type EligibilityGate = "citizenship" | "work_authorization" | "sponsorship" | "clearance" | "language";

export interface EligibilityCheck {
  gate: EligibilityGate;
  status: EligibilityStatus;
  /** The posting's own words. */
  postingEvidence: string;
  /** What the candidate stated, or null when they have not said. */
  candidateEvidence: string | null;
  note: string;
}

export interface EligibilityResult {
  status: EligibilityStatus;
  checks: EligibilityCheck[];
  reason: string;
}

/** What we know about the posting itself. Kept apart from how well it matches. */
export const POSTING_STATUSES = ["retrieved", "partial", "expired", "unreachable", "unverified"] as const;
export type PostingStatus = (typeof POSTING_STATUSES)[number];

export const RECOMMENDED_ACTIONS = ["strong_match", "consider", "upskill", "not_recommended", "verify_requirements"] as const;
export type RecommendedAction = (typeof RECOMMENDED_ACTIONS)[number];

export interface EvidencedPoint {
  text: string;
  /** Resume lines (or, for gaps, posting lines) that support the point. */
  evidence: string[];
  source: "rules" | "ai";
}

export type AiReviewStatus = "applied" | "unavailable" | "not_shortlisted" | "failed";

export interface AiReview {
  status: AiReviewStatus;
  model?: string;
  promptVersion?: string;
  at?: string;
  confidence?: Confidence;
  /** Plain-language reason for the adjustment. */
  rationale?: string;
  concerns?: string[];
  dimensions?: { experience: number; responsibilities: number; transferable: number; career: number; domain: number };
}

export interface MatchComponent {
  key: MatchComponentKey;
  label: string;
  /** Share of the final score this part carries, in percent, after skipping parts that do not apply. */
  weight: number;
  /** 0-100, or null when the posting gave nothing to judge this part by. */
  score: number | null;
  note: string;
  /** True when Claude moved this score from the rule-based value (always within a fixed limit). */
  aiAdjusted?: boolean;
}

export type Confidence = "high" | "medium" | "low";

export interface MatchDetail {
  confidence: Confidence;
  confidenceReasons: string[];
  requiredMatched: string[];
  requiredMissing: string[];
  preferredMatched: string[];
  preferredMissing: string[];
  /** A skill the job asks for that you lack, with the related skill you do have and how they relate. */
  transferable: { skill: string; via: string; why?: string; credit?: number }[];
  /** Lines copied word for word from your resume that support the match. */
  evidence: string[];
  experienceGaps: string[];
  seniority: { status: "aligned" | "stretch" | "overqualified" | "unknown"; note: string };
  location: { status: "yes" | "partial" | "no" | "unknown"; note: string };
  salary: { status: "meets" | "below" | "unknown"; note: string };
  components: MatchComponent[];
  /** Reasons the score was held down despite the weighted total. */
  caps: string[];
  explanation: string;
  aiNote?: string;
  /* v2 additions, all optional so results saved before them still load. */
  /** 0-100. How much the engine had to go on. Never part of the score. */
  confidenceScore?: number;
  skillEvidence?: SkillMatchItem[];
  strengths?: EvidencedPoint[];
  gaps?: EvidencedPoint[];
  careerAlignment?: { score: number | null; note: string; role: string | null };
  /** The lowest cap that applied, so a later AI adjustment is held to it. Null when no cap applied. */
  capLimit?: number | null;
  /** Warnings about the analysis itself: low extraction confidence, thin posting, suspicious posting text. */
  flags?: string[];
}

export interface MatchResult {
  score: number;
  /** Required and preferred skills you have. */
  matchingSkills: string[];
  /** Required skills you lack and have no related skill for. */
  missingSkills: string[];
  matchReason: string;
  source: AnalysisSource;
  detail?: MatchDetail;
  /* v2 additions. When present, `score` equals `finalScore`. */
  deterministicScore?: number;
  /** Between -15 and +15. Zero when Claude did not review the job. */
  aiAdjustment?: number;
  finalScore?: number;
  eligibility?: EligibilityResult;
  postingStatus?: PostingStatus;
  recommendedAction?: RecommendedAction;
  ai?: AiReview;
}

/** The v2 name for a match result. Same object, so every existing screen keeps working. */
export type JobMatchResult = MatchResult;

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  workMode: WorkMode;
  employmentType: EmploymentType;
  category: JobCategory;
  salary: Salary | null;
  postedAt: string | null;
  description: string;
  /** Adzuna only returns the first 500 characters of a posting. */
  descriptionTruncated: boolean;
  applyUrl: string | null;
  source: JobSource;
  match: MatchResult | null;
  /** How many other listings of this same posting were merged into this one. */
  duplicateCount?: number;
  /** Apply links from the merged listings, in case this one has expired. */
  otherApplyUrls?: string[];
  /** When the job board returned this listing. */
  retrievedAt?: string;
  postingStatus?: PostingStatus;
  /** Why the posting has that status, in plain words. */
  postingNotes?: string[];
}

export interface SearchFilters {
  query: string;
  location: string;
  category: JobCategoryFilter;
  workMode: WorkModeFilter;
  employmentType: EmploymentTypeFilter;
  minSalary: number | null;
}

/** What the candidate is looking for. Seeds the search filters and the suggested roles. */
export interface SearchPreferences {
  /** Yearly CAD. Jobs that state a salary below this are excluded. */
  minSalary: number;
  locations: string[];
  primaryRoles: string[];
  secondaryRoles: string[];
  /** Match weights. Missing means the defaults; a missing key means that key's default. */
  weights?: Partial<MatchWeights>;
  /** Work authorization, languages, clearance and exclusions, as you state them. */
  facts?: CandidateFacts;
}

export const DEFAULT_PREFERENCES: SearchPreferences = {
  minSalary: 100_000,
  locations: ["Greater Toronto Area, ON", "Toronto, ON", "Ottawa, ON", "Gatineau, QC", "Remote - Canada"],
  primaryRoles: [
    "Data Engineer",
    "Azure Data Engineer",
    "BI Developer",
    "Business Intelligence Analyst",
    "Senior Data Analyst",
    "Analytics Developer",
  ],
  secondaryRoles: [
    "Senior Software Developer",
    "Senior .NET Developer",
    "C# Developer",
    "Azure Developer",
    "Cloud Engineer",
    "Power Platform Developer",
    "Dynamics 365 Developer",
    "AI/GenAI Developer",
    "Application Developer",
    "Integration Developer",
    "DevOps Engineer",
  ],
};

export const DEFAULT_FILTERS: SearchFilters = {
  query: "",
  location: "Ottawa, ON",
  category: "All",
  workMode: "All",
  employmentType: "Permanent full-time",
  minSalary: DEFAULT_PREFERENCES.minSalary,
};

export const LOCATION_PRESETS = [
  "Greater Toronto Area, ON",
  "Ottawa, ON",
  "Toronto, ON",
  "Gatineau, QC",
  "Montreal, QC",
  "Vancouver, BC",
  "Remote - Canada",
  "Remote - Anywhere",
] as const;

export type SortKey = "score" | "newest" | "salary" | "company";

export interface SearchResponse {
  jobs: Job[];
  mode: "live" | "demo" | "unconfigured";
  provider: ProviderStatus;
  scoring: AnalysisSource | "mixed" | "none";
  warnings: string[];
  /** Jobs ruled out by a confirmed eligibility mismatch, kept with the reason. Not recommendations. */
  excluded?: Job[];
  /** What the AI stage did on this search. */
  ai?: { status: "applied" | "partial" | "unavailable" | "failed" | "skipped"; shortlisted: number; reviewed: number; calls: number; cached: number; model: string | null };
}

export interface StoredResults extends SearchResponse {
  filters: SearchFilters;
  searchedAt: string;
  /** Fingerprint of the profile the scores were computed against. */
  profileKey: string;
}

/** The path an application takes, in order. */
export const APPLICATION_STAGES = ["New", "Interested", "Preparing Application", "Applied", "Interview", "Offer"] as const;
/** How an application can end without an offer being accepted. */
export const APPLICATION_OUTCOMES = ["Rejected", "Withdrawn", "Closed"] as const;
export const APPLICATION_STATUSES = [...APPLICATION_STAGES, ...APPLICATION_OUTCOMES] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Names used before the pipeline had these stages. Data saved with them is read as the new names. */
export function legacyStatus(value: unknown): unknown {
  if (value === "Saved") return "Interested";
  if (value === "Interviewing") return "Interview";
  return value;
}

export interface Recruiter {
  name: string;
  email: string;
  phone: string;
}

export interface OfferDetails {
  salary: string;
  bonus: string;
  benefits: string;
  startDate: string | null;
  /** The date you must answer by. */
  decideBy: string | null;
  notes: string;
}

export const INTERVIEW_STAGES = ["Recruiter screen", "Hiring manager", "Technical", "Behavioural", "Panel", "Final", "Other"] as const;
export type InterviewStage = (typeof INTERVIEW_STAGES)[number];
export const INTERVIEW_FORMATS = ["Phone", "Video", "On-site", "Take-home", "Other"] as const;
export type InterviewFormat = (typeof INTERVIEW_FORMATS)[number];
export const INTERVIEW_STATUSES = ["Scheduled", "Completed", "Cancelled"] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export interface Interview {
  id: string;
  /** Local date and time as "YYYY-MM-DDTHH:mm", or null while the time is not set. */
  at: string | null;
  stage: InterviewStage;
  format: InterviewFormat;
  status: InterviewStatus;
  interviewers: string;
  prepNotes: string;
  questionsToAsk: string[];
  topicsToReview: string[];
  feedback: string;
}

export type ActivityKind = "created" | "status" | "note" | "contact" | "interview" | "edit";

export interface ActivityEntry {
  id: string;
  at: string;
  kind: ActivityKind;
  text: string;
}

/** A job you are tracking, with everything about pursuing it. Dates are "YYYY-MM-DD" unless noted. */
export interface Application {
  job: Job;
  status: ApplicationStatus;
  notes: string;
  savedAt: string;
  updatedAt: string;
  appliedAt?: string | null;
  /** The resume version you applied with, and its name at the time. */
  resumeVersionId?: string | null;
  resumeName?: string | null;
  coverLetter?: string;
  recruiter?: Recruiter;
  followUpDate?: string | null;
  /** The last day to apply. */
  deadline?: string | null;
  /** When you expect to hear back by. */
  responseDue?: string | null;
  salaryExpectation?: string;
  offer?: OfferDetails;
  rejectionReason?: string;
  interviews?: Interview[];
  /** Oldest first. */
  history?: ActivityEntry[];
}

/** Older code and stored data call a tracked job a SavedJob. */
export type SavedJob = Application;

export interface AppStatus {
  ai: boolean;
  model: string | null;
  jobProvider: ProviderStatus;
  /** True when paid web lookups for recruiters are switched on. */
  recruiterWebSearch?: boolean;
}

export interface AnalyzeResumeResponse {
  profile: CandidateProfile;
  warning: string | null;
}

export interface ApiError {
  error: string;
}

/* ---------- search history and what your searches have shown you ---------- */

/** A posting your searches returned, kept in compact form (no description) so trends can be counted. */
export interface SeenJob {
  /** `jobKey` of the posting, so the same job found twice is one entry. */
  key: string;
  firstSeenAt: string;
  lastSeenAt: string;
  /** How many searches returned it. */
  seenCount: number;
  title: string;
  company: string;
  location: string;
  workMode: WorkMode;
  employmentType: EmploymentType;
  category: JobCategory;
  /** Pay the employer stated, as yearly CAD. Null when none was stated, or only an estimate or another currency was given. */
  pay: { lo: number; hi: number } | null;
  postedAt: string | null;
  source: JobSource;
  /** Latest match score, and how sure the engine was. Null when the search ran without a resume. */
  score: number | null;
  confidence: Confidence | null;
  /** Skills the posting asks for, read from the posting text when it was seen. */
  required: string[];
  preferred: string[];
  /** True when the provider only gave part of the posting, so its skills are undercounted. */
  truncated: boolean;
}

/** One search you ran. */
export interface SearchRecord {
  id: string;
  at: string;
  filters: SearchFilters;
  provider: ProviderStatus;
  scoring: SearchResponse["scoring"];
  resumeName: string | null;
  resultCount: number;
  /** How many of the results had not been seen in an earlier search. */
  newCount: number;
  /** Mean match score of the scored results, or null when nothing was scored. */
  avgScore: number | null;
  scoredCount: number;
}

export interface IntelStore {
  history: SearchRecord[];
  seen: SeenJob[];
}
