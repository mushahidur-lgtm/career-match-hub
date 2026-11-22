import { describe, expect, it } from "vitest";
import { AI_LIMIT, normalizeWeights, scoreJob, verifyQuotes, type MatchInput, type MatchableJob } from "@/lib/matching/engine";
import { parseRequirements, requiredYearsIn } from "@/lib/matching/requirements";
import { MatchSchema } from "@/lib/schemas";
import { DEFAULT_MATCH_WEIGHTS, type CandidateProfile } from "@/types/job";

const RESUME = `Jordan Lee
Senior Data Engineer, Rideau Bank (2019 - Present)
- Built ETL data pipelines in Azure Data Factory and Databricks that load a Snowflake warehouse for a retail bank.
- Modelled data warehouse star schemas and delivered Power BI dashboards to finance stakeholders.
- Automated deployments with Azure DevOps and Docker.
Data Analyst, Capital Insurance (2015 - 2019)
- Wrote SQL Server and SSIS reporting for insurance claims.
Skills: Python, SQL, C#, Azure, Snowflake, Databricks, Apache Spark, Power BI, Git`;

const profile: CandidateProfile = {
  summary: "Senior data engineer with 9 years of experience in banking and insurance.",
  yearsOfExperience: 9,
  seniority: "Senior",
  skills: {
    languages: ["Python", "SQL", "C#"],
    frameworks: [],
    cloudData: ["Azure", "Azure Data Factory", "Snowflake", "Databricks", "Apache Spark", "SQL Server", "ETL"],
    tools: ["Power BI", "Git", "Docker", "Azure DevOps"],
  },
  detectedRoles: ["Data Engineer", "Data Analyst"],
  recommendedRoles: ["Senior Data Engineer", "Azure Data Engineer", "BI Developer"],
  source: "ai",
};

const input = (over: Partial<MatchInput> = {}): MatchInput => ({
  profile,
  resumeText: RESUME,
  preferences: { locations: ["Greater Toronto Area, ON", "Ottawa, ON", "Gatineau, QC", "Remote - Canada"], minSalary: 100_000 },
  ...over,
});

const job = (description: string, over: Partial<MatchableJob> = {}): MatchableJob => ({
  title: "Senior Azure Data Engineer",
  description,
  location: "Toronto, ON",
  workMode: "Hybrid",
  salary: null,
  descriptionTruncated: false,
  ...over,
});

const STRONG = `About the role at a retail bank.
Responsibilities:
- Build and maintain ETL data pipelines using Azure Data Factory and Databricks.
- Model data in Snowflake and support Power BI dashboards for finance stakeholders.
Requirements:
- 5+ years of experience in data engineering.
- Strong Python and SQL.
- Experience with Azure.
Nice to have:
- Apache Spark
- Kubernetes`;

describe("requirement parsing", () => {
  it("separates required from preferred using sections", () => {
    const r = parseRequirements("Data Engineer", "Requirements:\n- Python and SQL\n- Azure\nNice to have:\n- Kubernetes\n- Terraform");
    expect(r.required).toEqual(expect.arrayContaining(["Python", "SQL", "Azure"]));
    expect(r.preferred).toEqual(expect.arrayContaining(["Kubernetes", "Terraform"]));
    expect(r.required).not.toContain("Kubernetes");
    expect(r.structured).toBe(true);
  });

  it("reads preference wording inside a sentence", () => {
    const r = parseRequirements("Developer", "You know Python well.\nExperience with Docker is an asset.\nFamiliarity with Terraform would be a plus.");
    expect(r.required).toContain("Python");
    expect(r.preferred).toEqual(expect.arrayContaining(["Docker", "Terraform"]));
  });

  it("treats everything as required, and says it is unsure, when there is no structure", () => {
    const r = parseRequirements("Developer", "We use Python and Kubernetes every day.");
    expect(r.required).toEqual(expect.arrayContaining(["Python", "Kubernetes"]));
    expect(r.structured).toBe(false);
  });

  it("keeps a skill required if it also appears as preferred", () => {
    const r = parseRequirements("Engineer", "Requirements:\n- SQL\nNice to have:\n- SQL and Python");
    expect(r.required).toContain("SQL");
    expect(r.preferred).not.toContain("SQL");
  });

  it("splits a one-paragraph posting into sentences", () => {
    const r = parseRequirements("Analyst", "Join our team. Must know Power BI and SQL. Python is an asset.");
    expect(r.required).toEqual(expect.arrayContaining(["Power BI", "SQL"]));
    expect(r.preferred).toContain("Python");
  });

  it("reads required years from experience lines only", () => {
    expect(requiredYearsIn(["5+ years of experience in data engineering"])).toBe(5);
    // A range is a minimum of its lower end.
    expect(requiredYearsIn(["3 to 5 years experience"])).toBe(3);
    expect(requiredYearsIn(["Founded 12 years ago"])).toBeNull();
  });
});

describe("overall score", () => {
  it("rates a job that matches skills, experience, work and place as excellent", () => {
    const m = scoreJob(job(STRONG), input());
    expect(m.score).toBeGreaterThanOrEqual(85);
    expect(m.detail!.requiredMissing).toEqual([]);
    expect(m.detail!.caps).toEqual([]);
  });

  it("is deterministic", () => {
    expect(scoreJob(job(STRONG), input())).toEqual(scoreJob(job(STRONG), input()));
  });

  it("does not reward keywords when the candidate lacks most required skills", () => {
    const stuffed = job(
      "Requirements:\n- Scala, Kafka, Hadoop, Airflow, Terraform, Kubernetes\n- Python and SQL",
      { title: "Senior Data Engineer" },
    );
    const m = scoreJob(stuffed, input());
    expect(m.detail!.requiredMatched).toEqual(expect.arrayContaining(["Python", "SQL"]));
    expect(m.score).toBeLessThanOrEqual(65);
    expect(m.detail!.caps.join(" ")).toMatch(/fewer than half of the required skills/);
  });

  it("scores a different kind of work low even when a couple of tools overlap", () => {
    const ios = job("Requirements:\n- Swift, Kotlin and Flutter\n- Git", { title: "Senior iOS Developer" });
    expect(scoreJob(ios, input()).score).toBeLessThan(55);
  });

  it("scores a strong fit far above an unrelated job", () => {
    const fit = scoreJob(job(STRONG), input()).score;
    const other = scoreJob(job("Requirements:\n- Swift and Kotlin", { title: "Mobile Developer" }), input()).score;
    expect(fit).toBeGreaterThan(other + 35);
  });
});

describe("detail of the posting limits the score", () => {
  it("a two-line posting cannot be rated excellent, however well it fits", () => {
    const thin = scoreJob(job("Join our data team. You will work with Python and SQL.", { title: "Data Engineer", workMode: "Remote", location: "Remote, Canada" }), input());
    expect(thin.score).toBeLessThanOrEqual(89);
    expect(thin.detail!.caps.join(" ")).toMatch(/too little detail/);
  });
  it("a detailed posting can still reach excellent", () => {
    expect(scoreJob(job(STRONG), input()).score).toBeGreaterThanOrEqual(90);
  });
});

describe("target roles", () => {
  const dotnet = job("Requirements:\n- C#, .NET Core, ASP.NET, Entity Framework\n- SQL Server\n- 7+ years of experience", { title: "Senior .NET Developer", location: "Mississauga, ON", workMode: "On-site" });
  const base = { locations: ["Greater Toronto Area, ON"], minSalary: 100_000 };

  it("holds back a role unlike past titles when it is not a target", () => {
    expect(scoreJob(dotnet, input({ preferences: base })).detail!.caps.join(" ")).toMatch(/outside the work on your resume/);
  });
  it("does not hold back a role the candidate is aiming for", () => {
    const m = scoreJob(dotnet, input({ preferences: { ...base, roles: ["Senior .NET Developer"] } }));
    expect(m.detail!.caps.join(" ")).not.toMatch(/outside the work on your resume/);
  });
  it("still reports the experience gap honestly for a target role", () => {
    const m = scoreJob(dotnet, input({ preferences: { ...base, roles: ["Senior .NET Developer"] } }));
    expect(m.detail!.experienceGaps.join(" ")).toMatch(/outside the roles on your resume/);
  });
});

describe("symbols in technology names", () => {
  it("counts C# and .NET as application development in the resume and the posting", () => {
    const dotnet = job("Requirements:\n- C#, .NET Core and ASP.NET\n- 7+ years of experience", { title: "Senior .NET Developer" });
    const r = scoreJob(dotnet, input()).detail!.components.find((c) => c.key === "responsibilities")!;
    expect(r.score).toBeGreaterThan(0);
  });
});

describe("required, preferred, transferable and missing skills", () => {
  const m = scoreJob(
    job("Requirements:\n- Python, SQL and AWS\n- Scala\nNice to have:\n- Apache Spark\n- Kubernetes\n- Rust"),
    input(),
  ).detail!;

  it("lists direct matches", () => {
    expect(m.requiredMatched).toEqual(expect.arrayContaining(["Python", "SQL"]));
    expect(m.preferredMatched).toContain("Apache Spark");
  });

  it("calls a related skill transferable, not missing and not matched", () => {
    expect(m.transferable).toContainEqual({ skill: "AWS", via: "Azure" });
    expect(m.transferable).toContainEqual({ skill: "Kubernetes", via: "Docker" });
    expect(m.requiredMissing).not.toContain("AWS");
    expect(m.requiredMatched).not.toContain("AWS");
  });

  it("lists only genuinely missing skills as missing", () => {
    expect(m.requiredMissing).toContain("Scala");
    expect(m.preferredMissing).toContain("Rust");
    expect(m.preferredMissing).not.toContain("Kubernetes");
  });

  it("gives related skills partial credit only", () => {
    const direct = scoreJob(job("Requirements:\n- Azure"), input()).detail!.components[0].score!;
    const related = scoreJob(job("Requirements:\n- AWS"), input()).detail!.components[0].score!;
    const missing = scoreJob(job("Requirements:\n- Scala"), input()).detail!.components[0].score!;
    expect(direct).toBe(100);
    expect(related).toBeGreaterThan(missing);
    expect(related).toBeLessThan(direct);
  });

  it("uses only the skills on the profile, so removing one changes the result", () => {
    const without = { ...profile, skills: { ...profile.skills, languages: ["SQL", "C#"] } };
    const d = scoreJob(job("Requirements:\n- Python and SQL", { title: "Data Engineer" }), input({ profile: without })).detail!;
    expect(d.requiredMatched).toEqual(["SQL"]);
    expect(d.requiredMissing).toEqual(["Python"]);
  });
});

describe("seniority", () => {
  const sen = (title: string, p = profile) => scoreJob(job("Requirements:\n- Python", { title }), input({ profile: p })).detail!.seniority.status;
  it("aligned when levels match", () => expect(sen("Senior Data Engineer")).toBe("aligned"));
  it("a stretch when the job is more senior", () => expect(sen("Principal Data Engineer")).toBe("stretch"));
  it("overqualified when the job is well below", () => expect(sen("Junior Data Engineer")).toBe("overqualified"));
  it("unknown when the posting gives no level", () => expect(sen("Data Engineer")).toBe("unknown"));
  it("caps a role three levels above the resume", () => {
    const junior: CandidateProfile = { ...profile, seniority: "Junior", yearsOfExperience: 2 };
    const m = scoreJob(job("Requirements:\n- Python, SQL, Azure", { title: "Principal Data Engineer" }), input({ profile: junior }));
    expect(m.score).toBeLessThanOrEqual(55);
  });
  it("uses the years a posting asks for when the title has no level", () => {
    const d = scoreJob(job("Requirements:\n- 10+ years of experience\n- Python", { title: "Data Engineer" }), input()).detail!;
    expect(d.seniority.status).toBe("stretch");
  });
});

describe("location and work arrangement", () => {
  const loc = (location: string, workMode: MatchableJob["workMode"]) => scoreJob(job("Requirements:\n- Python", { location, workMode }), input()).detail!.location;
  it("fits a Greater Toronto Area suburb", () => expect(loc("Mississauga, ON", "Hybrid").status).toBe("yes"));
  it("fits Gatineau and an Ottawa suburb", () => {
    expect(loc("Gatineau, QC", "On-site").status).toBe("yes");
    expect(loc("Kanata, ON", "Hybrid").status).toBe("yes");
  });
  it("fits a remote job open to Canada", () => expect(loc("Remote, Canada", "Remote").status).toBe("yes"));
  it("flags a remote job that points outside Canada", () => expect(loc("Remote, United States", "Remote").status).toBe("partial"));
  it("rejects an on-site job elsewhere and caps the score", () => {
    expect(loc("Calgary, AB", "On-site").status).toBe("no");
    const m = scoreJob(job(STRONG, { location: "Calgary, AB", workMode: "On-site" }), input());
    expect(m.score).toBeLessThanOrEqual(69);
    expect(m.detail!.caps.join(" ")).toMatch(/outside your preferred cities/);
  });
  it("does not judge location when no preferences are set", () => {
    const d = scoreJob(job("Requirements:\n- Python"), input({ preferences: undefined })).detail!;
    expect(d.location.status).toBe("unknown");
    expect(d.components.find((c) => c.key === "location")!.score).toBeNull();
  });
});

describe("salary", () => {
  const sal = (salary: MatchableJob["salary"]) => scoreJob(job("Requirements:\n- Python", { salary }), input()).detail!.salary.status;
  const base = { currency: "CAD" as const, period: "year" as const, estimated: false };
  it("meets", () => expect(sal({ ...base, min: 100_000, max: 130_000 })).toBe("meets"));
  it("below", () => expect(sal({ ...base, min: 70_000, max: 90_000 })).toBe("below"));
  it("unknown when absent", () => expect(sal(null)).toBe("unknown"));
  it("unknown when only estimated", () => expect(sal({ ...base, min: 60_000, max: 70_000, estimated: true })).toBe("unknown"));
});

describe("weights", () => {
  it("defaults to 30/25/20/10/5/10", () => {
    expect(DEFAULT_MATCH_WEIGHTS).toEqual({ skills: 30, experience: 25, responsibilities: 20, seniority: 10, industry: 5, location: 10 });
  });
  it("normalises to 100 and ignores bad values", () => {
    const w = normalizeWeights({ skills: 3, experience: 1, responsibilities: 0, seniority: -5, industry: Number.NaN, location: 0 });
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(100);
    expect(w.skills).toBeGreaterThan(w.experience);
    expect(normalizeWeights({ skills: 0, experience: 0, responsibilities: 0, seniority: 0, industry: 0, location: 0 })).toEqual(DEFAULT_MATCH_WEIGHTS);
  });
  it("shares the weight of parts that cannot be judged among the rest", () => {
    const d = scoreJob(job("Requirements:\n- Python and SQL"), input({ preferences: undefined })).detail!;
    const total = d.components.reduce((n, c) => n + c.weight, 0);
    expect(total).toBeCloseTo(100, 0);
    expect(d.components.find((c) => c.key === "location")!.weight).toBe(0);
  });
  it("changes the score when the weights change", () => {
    const j = job("Requirements:\n- Python, SQL, Scala, Kafka", { location: "Calgary, AB", workMode: "On-site", title: "Data Engineer" });
    const skillsHeavy = scoreJob(j, input({ weights: { ...DEFAULT_MATCH_WEIGHTS, skills: 90 } })).detail!.components;
    const locationHeavy = scoreJob(j, input({ weights: { ...DEFAULT_MATCH_WEIGHTS, location: 90 } })).detail!.components;
    expect(skillsHeavy.find((c) => c.key === "skills")!.weight).toBeGreaterThan(locationHeavy.find((c) => c.key === "skills")!.weight);
  });
});

describe("confidence", () => {
  it("is high for a full posting compared with a full resume", () => {
    const long = STRONG + "\n" + "We offer a collaborative culture and learning budget. ".repeat(25);
    expect(scoreJob(job(long), input()).detail!.confidence).toBe("high");
  });
  it("is low for a short, truncated posting compared with a profile only", () => {
    const m = scoreJob(job("Join our team.", { descriptionTruncated: true }), input({ resumeText: null, profile: { ...profile, yearsOfExperience: null } }));
    expect(m.detail!.confidence).toBe("low");
    expect(m.detail!.confidenceReasons.join(" ")).toMatch(/first part of the posting/);
  });
});

describe("evidence", () => {
  it("quotes real resume lines for matched skills", () => {
    const e = scoreJob(job(STRONG), input()).detail!.evidence;
    expect(e.length).toBeGreaterThan(0);
    for (const line of e) expect(RESUME).toContain(line);
  });
  it("quotes work done, not skill lists, and drops the bullet mark", () => {
    const e = scoreJob(job(STRONG), input()).detail!.evidence;
    expect(e.some((l) => /^Skills:/i.test(l))).toBe(false);
    expect(e.some((l) => l.startsWith("-"))).toBe(false);
  });
  it("accepts only quotes that appear in the resume", () => {
    expect(verifyQuotes(["Built ETL data pipelines in Azure Data Factory and Databricks"], RESUME)).toHaveLength(1);
    expect(verifyQuotes(["Led a team of 40 engineers at Google"], RESUME)).toEqual([]);
    expect(verifyQuotes(["short"], RESUME)).toEqual([]);
    expect(verifyQuotes(["anything at all here"], null)).toEqual([]);
  });
});

describe("Claude's contribution is bounded", () => {
  const j = job(STRONG);
  const base = scoreJob(j, input());
  const comp = (m: typeof base, k: string) => m.detail!.components.find((c) => c.key === k)!;

  it("cannot move a score more than the limit from the rules", () => {
    const m = scoreJob(j, input(), { experience: 0, responsibilities: 0 });
    expect(comp(m, "experience").score!).toBeGreaterThanOrEqual(comp(base, "experience").score! - AI_LIMIT - 1);
    expect(comp(m, "responsibilities").score!).toBeGreaterThanOrEqual(comp(base, "responsibilities").score! - AI_LIMIT - 1);
    expect(comp(m, "experience").aiAdjusted).toBe(true);
    expect(m.source).toBe("ai");
  });

  it("ignores values that are not numbers", () => {
    const m = scoreJob(j, input(), { experience: Number.NaN, responsibilities: Number.POSITIVE_INFINITY });
    expect(comp(m, "experience").aiAdjusted).toBeUndefined();
    expect(comp(m, "experience").score).toBe(comp(base, "experience").score);
  });

  it("drops invented evidence and keeps real evidence", () => {
    const m = scoreJob(j, input(), {
      evidence: ["Managed a 200 person data organisation at Amazon", "Modelled data warehouse star schemas and delivered Power BI dashboards to finance stakeholders."],
    });
    expect(m.detail!.evidence.join(" ")).not.toMatch(/Amazon/);
    expect(m.detail!.evidence[0]).toMatch(/star schemas/);
  });

  it("cannot lift a capped score past its cap", () => {
    const weak = job("Requirements:\n- Scala, Kafka, Hadoop, Airflow\n- Python", { title: "Senior Data Engineer" });
    const m = scoreJob(weak, input(), { experience: 100, responsibilities: 100 });
    expect(m.score).toBeLessThanOrEqual(65);
  });

  it("limits and cleans the gaps and note it accepts", () => {
    const m = scoreJob(j, input(), { gaps: ["a", "b", "c", "d", "e"], note: "x".repeat(900) });
    expect(m.detail!.experienceGaps.length).toBeLessThanOrEqual(5);
    expect(m.detail!.aiNote!.length).toBeLessThanOrEqual(500);
  });
});

describe("stored results", () => {
  it("the match with its full detail passes the storage schema", () => {
    expect(MatchSchema.safeParse(scoreJob(job(STRONG), input())).success).toBe(true);
  });
  it("an old match without detail still passes", () => {
    expect(MatchSchema.safeParse({ score: 80, matchingSkills: ["Python"], missingSkills: [], matchReason: "ok", source: "heuristic" }).success).toBe(true);
  });
});
