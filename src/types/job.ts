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

export interface CandidateProfile {
  summary: string;
  yearsOfExperience: number | null;
  seniority: Seniority;
  skills: SkillSet;
  detectedRoles: string[];
  recommendedRoles: string[];
  source: AnalysisSource;
  model?: string;
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

export type JobSource = "adzuna" | "jsearch" | "demo";
/** "none" means no job source is configured, so searches return nothing rather than invented jobs. */
export type ProviderStatus = JobSource | "none";
export type SalaryPeriod = "year" | "hour";

export interface Salary {
  min: number | null;
  max: number | null;
  currency: "CAD" | "USD";
  period: SalaryPeriod;
  /** True when the provider predicted the figure rather than the employer stating it. */
  estimated: boolean;
}

export interface MatchResult {
  score: number;
  matchingSkills: string[];
  missingSkills: string[];
  matchReason: string;
  source: AnalysisSource;
}

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

export type SortKey = "score" | "newest" | "salary";

export interface SearchResponse {
  jobs: Job[];
  mode: "live" | "demo" | "unconfigured";
  provider: ProviderStatus;
  scoring: AnalysisSource | "mixed" | "none";
  warnings: string[];
}

export interface StoredResults extends SearchResponse {
  filters: SearchFilters;
  searchedAt: string;
  /** Fingerprint of the profile the scores were computed against. */
  profileKey: string;
}

export const APPLICATION_STATUSES = ["Saved", "Applied", "Interviewing", "Offer", "Rejected"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface SavedJob {
  job: Job;
  status: ApplicationStatus;
  notes: string;
  savedAt: string;
  updatedAt: string;
}

export interface AppStatus {
  ai: boolean;
  model: string | null;
  jobProvider: ProviderStatus;
}

export interface ParseResumeResponse {
  text: string;
  fileName: string;
  warning: string | null;
}

export interface AnalyzeResumeResponse {
  profile: CandidateProfile;
  warning: string | null;
}

export interface ApiError {
  error: string;
}
