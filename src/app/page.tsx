"use client";

import { Download } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { AppShell, normalizeTab, type Tab } from "@/components/AppShell";
import { JobCard } from "@/components/JobCard";
import { DetailContext, JobDetailDialog } from "@/components/JobDetailDialog";
import { Overview } from "@/components/Overview";
import { ResultFilters } from "@/components/ResultFilters";
import { ResumeManager } from "@/components/ResumeManager";
import { SavedJobsBoard } from "@/components/SavedJobsBoard";
import { SearchFilters } from "@/components/SearchFilters";
import { SettingsPanel } from "@/components/SettingsPanel";
import { StatusBanner } from "@/components/StatusBanner";
import { Notice, inputClass, secondaryButton } from "@/components/ui";
import { jobKey, mergeResumes, mergeSavedJobs, type AppData } from "@/lib/backup";
import { jobsToCsv } from "@/lib/export";
import { sortJobs } from "@/lib/format";
import { profileSkills } from "@/lib/heuristics";
import { newId, uniqueName } from "@/lib/ids";
import { computeOverview } from "@/lib/overview";
import { addSavedJob, findSaved, removeSavedJob, setSavedNotes, setSavedStatus } from "@/lib/saved";
import { DEFAULT_REFINE, RefineSchema, refineJobs, type RefineFilters } from "@/lib/refine";
import { FiltersSchema, PreferencesSchema, ResumeVersionsSchema, SavedJobsSchema } from "@/lib/schemas";
import { fillStructure, lacksStructure } from "@/lib/resume-sections";
import { nameFromFile } from "@/lib/storage";
import { usePersistentState } from "@/lib/use-persistent-state";
import {
  DEFAULT_FILTERS,
  DEFAULT_PREFERENCES,
  type ApiError,
  type AppStatus,
  type ApplicationStatus,
  type CandidateProfile,
  type Job,
  type ResumeVersion,
  type SavedJob,
  type SearchFilters as Filters,
  type SearchPreferences,
  type SearchResponse,
  type SortKey,
  type StoredResults,
} from "@/types/job";

/** Adapts a schema for usePersistentState: undefined marks stored data that does not fit. */
const check =
  <S extends z.ZodType>(schema: S) =>
  (value: unknown): z.infer<S> | undefined => {
    const r = schema.safeParse(value);
    return r.success ? r.data : undefined;
  };

/** Anything that changes a score. When it differs from the last search, the scores on screen are out of date. */
const scoreKeyOf = (v: ResumeVersion | null, prefs: SearchPreferences) => {
  if (!v) return "";
  const p = v.profile;
  return JSON.stringify([v.id, v.text.length, p.seniority, p.yearsOfExperience, ...profileSkills(p.skills).sort(), prefs.locations, prefs.minSalary, prefs.primaryRoles, prefs.secondaryRoles, prefs.weights ?? null]);
};

export default function Home() {
  const [tab, setTab, hydrated] = usePersistentState<Tab>("cmh:tab", "overview", normalizeTab);
  const [resumes, setResumes, , , resumesLost] = usePersistentState<ResumeVersion[]>("cmh:resumes", [], check(ResumeVersionsSchema));
  const [activeId, setActiveId] = usePersistentState<string | null>("cmh:activeResume", null, check(z.string().max(80).nullable()));
  const [filters, setFilters] = usePersistentState<Filters>("cmh:filters", DEFAULT_FILTERS, check(FiltersSchema));
  const [preferences, setPreferences] = usePersistentState<SearchPreferences>("cmh:preferences", DEFAULT_PREFERENCES, check(PreferencesSchema));
  const [results, setResults] = usePersistentState<StoredResults | null>("cmh:results", null);
  const [saved, setSaved, , , savedLost] = usePersistentState<SavedJob[]>("cmh:saved", [], check(SavedJobsSchema));
  const [sort, setSort] = usePersistentState<SortKey>("cmh:sort", "score");
  const [refine, setRefine] = usePersistentState<RefineFilters>("cmh:refine", DEFAULT_REFINE, check(RefineSchema));
  const recovered = resumesLost || savedLost;

  const [status, setStatus] = useState<AppStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [detailJob, setDetailJob] = useState<Job | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/status")
      .then((r) => (r.ok ? (r.json() as Promise<AppStatus>) : null))
      .then((s) => live && setStatus(s))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  // Profiles saved before work history existed get it read from their stored resume text. Nothing else changes.
  useEffect(() => {
    if (!hydrated || !resumes.some((r) => lacksStructure(r.profile))) return;
    setResumes((list) => list.map((r) => (lacksStructure(r.profile) ? { ...r, profile: fillStructure(r.profile, r.text) } : r)));
  }, [hydrated, resumes, setResumes]);

  // A new page starts at the top, not wherever the last one was scrolled to.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab]);

  const active = useMemo(() => resumes.find((r) => r.id === activeId) ?? resumes[0] ?? null, [resumes, activeId]);
  const profile: CandidateProfile | null = active?.profile ?? null;

  const savedByKey = useMemo(() => new Map(saved.map((s) => [jobKey(s.job), s])), [saved]);
  const statusOf = useCallback((job: Job) => savedByKey.get(jobKey(job))?.status ?? null, [savedByKey]);
  const refined = useMemo(() => (results ? refineJobs(results.jobs, refine, { statusOf }) : []), [results, refine, statusOf]);
  const sorted = useMemo(() => sortJobs(refined, sort), [refined, sort]);

  // Pagination. The page size resets whenever the search, the filters or the sort change.
  const PAGE_SIZE = 15;
  const pageKey = JSON.stringify([results?.searchedAt, refine, sort]);
  const [pager, setPager] = useState({ key: pageKey, count: PAGE_SIZE });
  const shownCount = pager.key === pageKey ? pager.count : PAGE_SIZE;
  const showMore = () => setPager({ key: pageKey, count: shownCount + PAGE_SIZE });

  const exportResults = () => {
    const blob = new Blob([jobsToCsv(sorted, statusOf)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `career-match-hub-results-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const stats = useMemo(() => computeOverview(results, saved), [results, saved]);
  const stale = Boolean(results && active && results.profileKey !== scoreKeyOf(active, preferences));

  const search = useCallback(
    async (next?: Filters) => {
      const f = next ?? filters;
      setLoading(true);
      setSearchError(null);
      try {
        const res = await fetch("/api/search-jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filters: f, profile: active?.profile ?? null, resumeText: active?.text ?? null, preferences }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as Partial<ApiError> | null;
          throw new Error(body?.error || "The search failed. Try again.");
        }
        const data = (await res.json()) as SearchResponse;
        setResults({ ...data, filters: f, searchedAt: new Date().toISOString(), profileKey: scoreKeyOf(active, preferences) });
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : "The search failed. Try again.");
      } finally {
        setLoading(false);
      }
    },
    [filters, active, preferences, setResults],
  );

  /* ----- saved jobs ----- */
  // `id` below is the tracked entry's own id. The cards and dialogs pass `saved.job.id`.
  const saveJob = (job: Job, st: ApplicationStatus) => setSaved((list) => addSavedJob(list, job, st));
  const setJobStatus = (id: string, st: ApplicationStatus) => setSaved((list) => setSavedStatus(list, id, st));
  const setJobNotes = (id: string, notes: string) => setSaved((list) => setSavedNotes(list, id, notes));
  const removeJob = (id: string) => setSaved((list) => removeSavedJob(list, id));

  /* ----- resume versions ----- */
  const addResume = (text: string, fileName: string | null, p: CandidateProfile) => {
    const id = newId();
    setResumes((list) => {
      const name = uniqueName(nameFromFile(fileName, `Resume ${list.length + 1}`), list.map((r) => r.name));
      return [...list, { id, name, text, fileName, uploadedAt: new Date().toISOString(), profile: p }].slice(0, 20);
    });
    setActiveId(id);
  };
  const renameResume = (id: string, name: string) => setResumes((list) => list.map((r) => (r.id === id ? { ...r, name: uniqueName(name, list.filter((x) => x.id !== id).map((x) => x.name)) } : r)));
  const deleteResume = (id: string) => {
    setResumes((list) => list.filter((r) => r.id !== id));
    if (active?.id === id) setActiveId(resumes.find((r) => r.id !== id)?.id ?? null);
  };
  const editProfile = (p: CandidateProfile) => active && setResumes((list) => list.map((r) => (r.id === active.id ? { ...r, profile: p } : r)));
  const rereadProfile = (id: string, p: CandidateProfile) => setResumes((list) => list.map((r) => (r.id === id ? { ...r, profile: p } : r)));

  /* ----- backup ----- */
  const appData: AppData = { resumes, activeResumeId: active?.id ?? null, filters, preferences, saved };
  const importData = (d: AppData, mode: "merge" | "replace") => {
    if (mode === "merge") {
      setSaved((list) => mergeSavedJobs(list, d.saved));
      setResumes((list) => mergeResumes(list, d.resumes));
      if (!active && d.resumes[0]) setActiveId(d.activeResumeId ?? d.resumes[0].id);
      return;
    }
    setResumes(d.resumes);
    setActiveId(d.activeResumeId ?? d.resumes[0]?.id ?? null);
    setFilters(d.filters);
    setPreferences(d.preferences);
    setSaved(mergeSavedJobs([], d.saved));
    setResults(null);
  };
  const savePreferences = (p: SearchPreferences) => {
    setPreferences(p);
    setFilters((f) => ({ ...f, minSalary: p.minSalary }));
  };

  const pickRole = (role: string) => {
    setFilters((f) => ({ ...f, query: role }));
    setTab("discover");
  };

  const provider = results ? results.provider : status?.jobProvider;

  const detailContext = { resume: active, aiAvailable: status?.ai ?? false, onNotes: setJobNotes };

  return (
    <DetailContext.Provider value={detailContext}>
    <AppShell tab={tab} onTab={setTab} counts={{ applications: saved.length }} status={<StatusBanner status={status} results={results} />}>
      {recovered && (
        <Notice tone="warn">
          Some saved data could not be read, so it was set aside instead of deleted.{" "}
          <button type="button" className="font-semibold underline" onClick={() => setTab("settings")}>
            Open Settings
          </button>
        </Notice>
      )}

      <main className="flex-1" aria-busy={!hydrated}>
        {!hydrated ? null : tab === "overview" ? (
          <Overview stats={stats} resumeName={active?.name ?? null} provider={provider} hasSearched={Boolean(results)} onOpenJob={setDetailJob} onGo={setTab} />
        ) : tab === "profile" ? (
          <ResumeManager
            versions={resumes}
            active={active}
            onAdd={addResume}
            onSelect={setActiveId}
            onRename={renameResume}
            onDelete={deleteResume}
            onProfileChange={editProfile}
            onReread={rereadProfile}
            onPickRole={pickRole}
          />
        ) : tab === "discover" ? (
          <div className="space-y-5">
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight">Discover jobs</h1>
              {resumes.length > 1 && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <label htmlFor="match-resume" className="font-medium">
                    Match against
                  </label>
                  <select id="match-resume" value={active?.id ?? ""} onChange={(e) => setActiveId(e.target.value)} className={`${inputClass} w-auto py-1.5`}>
                    {resumes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {!profile && (
              <Notice tone="info">
                No resume yet, so jobs will not get match scores.{" "}
                <button type="button" className="font-semibold underline" onClick={() => setTab("profile")}>
                  Add your resume
                </button>
              </Notice>
            )}
            <SearchFilters
              filters={filters}
              onChange={setFilters}
              onSearch={() => void search()}
              loading={loading}
              suggestions={[...new Set([...(profile?.recommendedRoles ?? []), ...preferences.primaryRoles, ...preferences.secondaryRoles])]}
              locations={preferences.locations}
            />
            {searchError && <Notice tone="error">{searchError}</Notice>}
            {results && (
              <section aria-label="Search results" className="space-y-4" aria-busy={loading}>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl font-semibold">
                      {results.jobs.length} {results.jobs.length === 1 ? "job" : "jobs"} found
                    </h2>
                    <p className="text-sm text-muted">
                      {results.filters.query || "All roles"} in {results.filters.location}
                      {results.scoring === "ai" || results.scoring === "mixed" ? ". Top matches reviewed by Claude." : results.scoring === "heuristic" ? ". Scored by the rule-based engine." : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <label htmlFor="sort" className="whitespace-nowrap font-medium">
                      Sort by
                    </label>
                    <select id="sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={`${inputClass} w-auto py-1.5`}>
                      <option value="score">Highest match</option>
                      <option value="newest">Newest</option>
                      <option value="salary">Highest salary</option>
                      <option value="company">Company A to Z</option>
                    </select>
                    <button type="button" className={secondaryButton} onClick={exportResults} disabled={sorted.length === 0}>
                      <Download className="size-4" aria-hidden /> Export CSV
                    </button>
                  </div>
                </div>
                {results.warnings.map((w) => (
                  <Notice key={w} tone="warn">
                    {w}
                  </Notice>
                ))}
                {stale && (
                  <Notice tone="info">
                    Your resume, skills or preferences changed after this search, so these scores are out of date.{" "}
                    <button type="button" className="font-semibold underline" onClick={() => void search(results.filters)} disabled={loading}>
                      {loading ? "Updating" : "Update scores"}
                    </button>
                  </Notice>
                )}
                {results.jobs.length > 0 && <ResultFilters value={refine} onChange={setRefine} total={results.jobs.length} shown={sorted.length} />}
                {sorted.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-line px-6 py-12">
                    {results.jobs.length > 0 ? (
                      <>
                        <h3 className="font-display text-lg font-semibold">No jobs match your filters</h3>
                        <p className="mt-2 max-w-prose text-sm text-muted">
                          {results.jobs.length} {results.jobs.length === 1 ? "job was" : "jobs were"} found, and your filters hide all of them.
                        </p>
                        <button type="button" className={`${secondaryButton} mt-4`} onClick={() => setRefine(DEFAULT_REFINE)}>
                          Clear filters
                        </button>
                      </>
                    ) : results.mode === "unconfigured" ? (
                      <>
                        <h3 className="font-display text-lg font-semibold">No job source is connected</h3>
                        <p className="mt-2 max-w-prose text-sm text-muted">This site does not invent job listings. Add ADZUNA_APP_ID and ADZUNA_APP_KEY, or RAPIDAPI_KEY, in the deployment settings to search real postings.</p>
                      </>
                    ) : (
                      <>
                        <h3 className="font-display text-lg font-semibold">No jobs matched these filters</h3>
                        <p className="mt-2 max-w-prose text-sm text-muted">Try a broader title, set the category to All, or switch the work mode and employment type back to All. Postings that state a salary under your minimum are hidden.</p>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <ul className="space-y-4">
                      {sorted.slice(0, shownCount).map((job) => (
                        <li key={job.id}>
                          <JobCard job={job} saved={findSaved(saved, job)} onSave={saveJob} onStatus={setJobStatus} onRemove={removeJob} />
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-col items-center gap-2 pt-2">
                      <p className="text-sm text-muted" aria-live="polite">
                        Showing {Math.min(shownCount, sorted.length)} of {sorted.length}
                      </p>
                      {shownCount < sorted.length && (
                        <button type="button" className={secondaryButton} onClick={showMore}>
                          Show {Math.min(PAGE_SIZE, sorted.length - shownCount)} more
                        </button>
                      )}
                    </div>
                  </>
                )}
              </section>
            )}
          </div>
        ) : tab === "settings" ? (
          <SettingsPanel data={appData} recovered={recovered} onSavePreferences={savePreferences} onImport={importData} />
        ) : (
          <SavedJobsBoard items={saved} onStatus={setJobStatus} onNotes={setJobNotes} onRemove={removeJob} onGoSearch={() => setTab("discover")} />
        )}
      </main>

      {detailJob && (
        <JobDetailDialog
          job={detailJob}
          saved={findSaved(saved, detailJob)}
          onSave={saveJob}
          onStatus={setJobStatus}
          onRemove={removeJob}
          onClose={() => setDetailJob(null)}
        />
      )}
    </AppShell>
    </DetailContext.Provider>
  );
}
