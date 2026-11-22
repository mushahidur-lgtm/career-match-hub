import { describe, expect, it } from "vitest";
import { buildBackup, jobKey, mergeResumes, mergeSavedJobs, parseBackup, type AppData } from "@/lib/backup";
import { newId, uniqueName } from "@/lib/ids";
import { DEFAULT_FILTERS, DEFAULT_PREFERENCES, type CandidateProfile, type ResumeVersion } from "@/types/job";
import { makeJob, makeSaved } from "./helpers";

const profile: CandidateProfile = {
  summary: "Senior data engineer.",
  yearsOfExperience: 9,
  seniority: "Senior",
  skills: { languages: ["Python"], frameworks: [], cloudData: ["Azure"], tools: [] },
  detectedRoles: ["Data Engineer"],
  recommendedRoles: ["Senior Data Engineer"],
  source: "heuristic",
  workHistory: [{ title: "Data Engineer", company: "Acme", start: "2019-03", end: null, current: true }],
  education: [{ credential: "B.Sc.", institution: "Carleton University", year: "2015" }],
  certifications: ["PMP"],
};

const version = (id: string, text = `resume text for ${id}`.padEnd(60, "x"), over: Partial<ResumeVersion> = {}): ResumeVersion => ({
  id,
  name: `Resume ${id}`,
  text,
  fileName: "cv.pdf",
  uploadedAt: "2026-11-01T00:00:00Z",
  profile,
  ...over,
});

const data = (over: Partial<AppData> = {}): AppData => ({
  resumes: [version("a"), version("b")],
  activeResumeId: "a",
  filters: DEFAULT_FILTERS,
  preferences: DEFAULT_PREFERENCES,
  saved: [makeSaved(makeJob())],
  ...over,
});

describe("backup file", () => {
  it("round-trips multiple resume versions, with structured profiles, without losing anything", () => {
    const original = data();
    const parsed = parseBackup(buildBackup(original));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.data).toEqual(original);
  });

  it("rejects text that is not JSON", () => {
    expect(parseBackup("not json")).toEqual({ ok: false, error: "That file is not valid JSON." });
  });

  it("rejects JSON from some other app", () => {
    expect(parseBackup(JSON.stringify({ hello: "world" })).ok).toBe(false);
  });

  it("rejects a backup whose saved jobs are damaged", () => {
    const bad = JSON.parse(buildBackup(data()));
    bad.data.saved[0].status = "Hired!";
    expect(parseBackup(JSON.stringify(bad)).ok).toBe(false);
  });

  it("rejects a backup whose work history is damaged", () => {
    const bad = JSON.parse(buildBackup(data()));
    bad.data.resumes[0].profile.workHistory[0].current = "yes";
    expect(parseBackup(JSON.stringify(bad)).ok).toBe(false);
  });

  it("rejects a backup from a newer version it does not understand", () => {
    const future = JSON.parse(buildBackup(data()));
    future.version = 99;
    expect(parseBackup(JSON.stringify(future)).ok).toBe(false);
  });
});

describe("backups made before resume versions existed", () => {
  const v1 = {
    app: "career-match-hub",
    version: 1,
    exportedAt: "2026-11-10T00:00:00Z",
    data: {
      resume: { text: "x".repeat(80), fileName: "Jordan_Lee-CV.pdf", uploadedAt: "2026-11-01T00:00:00Z" },
      profile,
      filters: DEFAULT_FILTERS,
      preferences: DEFAULT_PREFERENCES,
      saved: [makeSaved(makeJob())],
    },
  };

  it("turn the single resume into the first version, named from its file", () => {
    const r = parseBackup(JSON.stringify(v1));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.resumes).toHaveLength(1);
    expect(r.data.resumes[0].name).toBe("Jordan Lee CV");
    expect(r.data.resumes[0].profile).toEqual(profile);
    expect(r.data.activeResumeId).toBe(r.data.resumes[0].id);
    expect(r.data.saved).toHaveLength(1);
  });

  it("import with no resume gives no versions and no active one", () => {
    const r = parseBackup(JSON.stringify({ ...v1, data: { ...v1.data, resume: null, profile: null } }));
    expect(r.ok && r.data.resumes).toEqual([]);
    expect(r.ok && r.data.activeResumeId).toBeNull();
  });
});

describe("resume versions", () => {
  it("merge adds versions you do not have and never duplicates by id or identical text", () => {
    const mine = [version("a"), version("b")];
    const incoming = [version("a", "different text".padEnd(60, "y")), version("c", mine[1].text), version("d")];
    expect(mergeResumes(mine, incoming).map((r) => r.id)).toEqual(["a", "b", "d"]);
  });

  it("merge never grows past the limit", () => {
    const many = Array.from({ length: 19 }, (_, i) => version(`m${i}`));
    expect(mergeResumes(many, [version("x"), version("y"), version("z")], 20)).toHaveLength(20);
  });

  it("generates distinct ids", () => {
    expect(new Set(Array.from({ length: 50 }, newId)).size).toBe(50);
  });

  it("makes names unique, ignoring case", () => {
    expect(uniqueName("Data resume", ["Data resume"])).toBe("Data resume 2");
    expect(uniqueName("data resume", ["Data resume", "Data resume 2"])).toBe("data resume 3");
    expect(uniqueName("Other", ["Data resume"])).toBe("Other");
  });
});

describe("duplicate prevention", () => {
  it("merges the same job id once", () => {
    const a = makeSaved(makeJob({ id: "a" }));
    expect(mergeSavedJobs([a], [a])).toHaveLength(1);
  });

  it("treats the same title, company and place under a new id as the same job", () => {
    const a = makeSaved(makeJob({ id: "a" }));
    const b = makeSaved(makeJob({ id: "b" }), { updatedAt: "2026-11-05T00:00:00Z", status: "Applied" });
    const merged = mergeSavedJobs([a], [b]);
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe("Applied");
  });

  it("keeps distinct jobs", () => {
    const a = makeSaved(makeJob({ id: "a", company: "Acme" }));
    const b = makeSaved(makeJob({ id: "b", company: "Globex" }));
    expect(mergeSavedJobs([a], [b])).toHaveLength(2);
  });

  it("keeps the most recently updated copy and never drops your notes", () => {
    const mine = makeSaved(makeJob({ id: "a" }), { notes: "Phone screen Tuesday", updatedAt: "2026-11-10T00:00:00Z" });
    const old = makeSaved(makeJob({ id: "a" }), { notes: "", updatedAt: "2026-11-01T00:00:00Z" });
    expect(mergeSavedJobs([mine], [old])[0].notes).toBe("Phone screen Tuesday");
  });

  it("jobKey ignores case and spacing", () => {
    expect(jobKey({ id: "1", title: "Data  Engineer", company: "ACME", location: "Ottawa, ON" })).toBe(jobKey({ id: "2", title: "data engineer", company: "acme", location: "ottawa, on" }));
  });

  it("jobKey sees through board wording: company suffixes and title tags", () => {
    expect(jobKey({ id: "1", title: "Data Engineer (Hybrid)", company: "Acme Inc.", location: "Ottawa, ON" })).toBe(jobKey({ id: "2", title: "Data Engineer", company: "Acme", location: "Ottawa, ON" }));
  });

  it("jobKey never joins two jobs whose employer is unknown", () => {
    const a = { title: "Data Engineer", company: "Company not listed", location: "Ottawa, ON" };
    expect(jobKey({ id: "1", ...a })).not.toBe(jobKey({ id: "2", ...a }));
    expect(jobKey({ id: "1", ...a })).toBe(jobKey({ id: "1", ...a }));
  });
});
