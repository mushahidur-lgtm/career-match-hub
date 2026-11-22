"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bookmark, BriefcaseBusiness, FileUser, Radar, Settings } from "lucide-react";
import type { z } from "zod";
import { JobCard } from "@/components/JobCard";
import { ResumeUploader } from "@/components/ResumeUploader";
import { SavedJobsBoard } from "@/components/SavedJobsBoard";
import { SearchFilters } from "@/components/SearchFilters";
import { SettingsPanel } from "@/components/SettingsPanel";
import { StatusBanner } from "@/components/StatusBanner";
import { Notice, inputClass } from "@/components/ui";
import { jobKey, mergeSavedJobs, type AppData } from "@/lib/backup";
import { sortJobs } from "@/lib/format";
import { FiltersSchema, PreferencesSchema, ProfileSchema, ResumeSchema, SavedJobsSchema } from "@/lib/schemas";
import { profileSkills } from "@/lib/heuristics";
import { usePersistentState } from "@/lib/use-persistent-state";
import {
  DEFAULT_FILTERS,
  DEFAULT_PREFERENCES,
  type SearchPreferences,
  type ApiError,
  type AppStatus,
  type ApplicationStatus,
  type CandidateProfile,
  type Job,
  type SavedJob,
  type SearchFilters as Filters,
  type SearchResponse,
  type SortKey,
  type StoredResults,
  type StoredResume,
} from "@/types/job";

type Tab = "resume" | "search" | "saved" | "settings";

/** Adapts a schema for usePersistentState: undefined marks stored data that does not fit. */
const check =
  <S extends z.ZodType>(schema: S) =>
  (value: unknown): z.infer<S> | undefined => {
    const r = schema.safeParse(value);
    return r.success ? r.data : undefined;
  };

const profileKeyOf = (p: CandidateProfile | null) => (p ? JSON.stringify([p.seniority, ...profileSkills(p.skills).sort()]) : "");

export default function Home() {
  const [tab, setTab, hydrated] = usePersistentState<Tab>("cmh:tab", "resume", (v) => (v === "resume" || v === "search" || v === "saved" || v === "settings" ? v : undefined));
  const [resume, setResume, , , resumeLost] = usePersistentState<StoredResume | null>("cmh:resume", null, check(ResumeSchema.nullable()));
  const [profile, setProfile, , , profileLost] = usePersistentState<CandidateProfile | null>("cmh:profile", null, check(ProfileSchema.nullable()));
  const [filters, setFilters] = usePersistentState<Filters>("cmh:filters", DEFAULT_FILTERS, check(FiltersSchema));
  const [preferences, setPreferences] = usePersistentState<SearchPreferences>("cmh:preferences", DEFAULT_PREFERENCES, check(PreferencesSchema));
  const [results, setResults] = usePersistentState<StoredResults | null>("cmh:results", null);
  const [saved, setSaved, , , savedLost] = usePersistentState<SavedJob[]>("cmh:saved", [], check(SavedJobsSchema));
  const recovered = resumeLost || profileLost || savedLost;
  const [sort, setSort] = usePersistentState<SortKey>("cmh:sort", "score");

  const [status, setStatus] = useState<AppStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

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

  const savedById = useMemo(() => new Map(saved.map((s) => [s.job.id, s])), [saved]);
  const sorted = useMemo(() => (results ? sortJobs(results.jobs, sort) : []), [results, sort]);
  const stale = Boolean(results && profile && results.profileKey !== profileKeyOf(profile));

  const search = useCallback(
    async (next?: Filters) => {
      const f = next ?? filters;
      setLoading(true);
      setSearchError(null);
      try {
        const res = await fetch("/api/search-jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filters: f, profile }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as Partial<ApiError> | null;
          throw new Error(body?.error || "The search failed. Try again.");
        }
        const data = (await res.json()) as SearchResponse;
        setResults({ ...data, filters: f, searchedAt: new Date().toISOString(), profileKey: profileKeyOf(profile) });
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : "The search failed. Try again.");
      } finally {
        setLoading(false);
      }
    },
    [filters, profile, setResults],
  );

  const saveJob = (job: Job, st: ApplicationStatus) => {
    const now = new Date().toISOString();
    setSaved((list) => (list.some((s) => s.job.id === job.id || jobKey(s.job) === jobKey(job)) ? list : [{ job, status: st, notes: "", savedAt: now, updatedAt: now }, ...list]));
  };
  const setJobStatus = (id: string, st: ApplicationStatus) =>
    setSaved((list) => list.map((s) => (s.job.id === id ? { ...s, status: st, updatedAt: new Date().toISOString() } : s)));
  const setJobNotes = (id: string, notes: string) =>
    setSaved((list) => list.map((s) => (s.job.id === id ? { ...s, notes, updatedAt: new Date().toISOString() } : s)));
  const removeJob = (id: string) => setSaved((list) => list.filter((s) => s.job.id !== id));

  const appData: AppData = { resume, profile, filters, preferences, saved };
  const importData = (d: AppData, mode: "merge" | "replace") => {
    if (mode === "merge") {
      setSaved((list) => mergeSavedJobs(list, d.saved));
      return;
    }
    setResume(d.resume);
    setProfile(d.profile);
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
    setTab("search");
  };

  const tabs: { id: Tab; label: string; icon: typeof FileUser; count?: number }[] = [
    { id: "resume", label: "Resume", icon: FileUser },
    { id: "search", label: "Job search", icon: Radar },
    { id: "saved", label: "Saved jobs", icon: Bookmark, count: saved.length },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:py-10">
      <header className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-brand text-on-brand">
            <BriefcaseBusiness className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold leading-none tracking-tight">Career Match Hub</h1>
            <p className="mt-1 text-sm text-muted">Find jobs that fit your resume, then track every application.</p>
          </div>
        </div>
        <StatusBanner status={status} results={results} />
      </header>

      <nav aria-label="Sections" className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1">
        {tabs.map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-current={tab === id ? "page" : undefined}
            className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold ${
              tab === id ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <Icon className="size-4" aria-hidden />
            {label}
            {count ? <span className="rounded-full bg-surface-2 px-2 text-xs tabular-nums text-muted">{count}</span> : null}
          </button>
        ))}
      </nav>

      {recovered && (
        <Notice tone="warn">
          Some saved data could not be read, so it was set aside instead of deleted.{" "}
          <button type="button" className="font-semibold underline" onClick={() => setTab("settings")}>
            Open Settings
          </button>
        </Notice>
      )}

      <main className="flex-1" aria-busy={!hydrated}>
        {!hydrated ? null : tab === "resume" ? (
          <ResumeUploader
            resume={resume}
            profile={profile}
            onAnalyzed={(r, p) => {
              setResume(r);
              setProfile(p);
            }}
            onProfileChange={setProfile}
            onPickRole={pickRole}
            onClear={() => {
              setResume(null);
              setProfile(null);
            }}
          />
        ) : tab === "search" ? (
          <div className="space-y-5">
            {!profile && (
              <Notice tone="info">
                No resume yet, so jobs will not get match scores.{" "}
                <button type="button" className="font-semibold underline" onClick={() => setTab("resume")}>
                  Add your resume
                </button>
              </Notice>
            )}
            <SearchFilters filters={filters} onChange={setFilters} onSearch={() => void search()} loading={loading} suggestions={[...new Set([...(profile?.recommendedRoles ?? []), ...preferences.primaryRoles, ...preferences.secondaryRoles])]} locations={preferences.locations} />
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
                      {results.scoring === "ai" || results.scoring === "mixed" ? ". Top matches scored by Claude." : results.scoring === "heuristic" ? ". Scored by keyword matching." : ""}
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
                    </select>
                  </div>
                </div>
                {results.warnings.map((w) => (
                  <Notice key={w} tone="warn">
                    {w}
                  </Notice>
                ))}
                {stale && <Notice tone="info">Your skills changed after this search, so the scores are out of date. Search again to refresh them.</Notice>}
                {sorted.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-line px-6 py-12">
                    {results.mode === "unconfigured" ? (
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
                  <ul className="space-y-4">
                    {sorted.map((job) => (
                      <li key={job.id}>
                        <JobCard job={job} saved={savedById.get(job.id)} onSave={saveJob} onStatus={setJobStatus} onRemove={removeJob} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
        ) : tab === "settings" ? (
          <SettingsPanel data={appData} recovered={recovered} onSavePreferences={savePreferences} onImport={importData} />
        ) : (
          <SavedJobsBoard items={saved} onStatus={setJobStatus} onNotes={setJobNotes} onRemove={removeJob} onGoSearch={() => setTab("search")} />
        )}
      </main>

      <footer className="border-t border-line pt-4 text-xs text-muted">
        Your resume, profile and saved jobs stay in this browser. Match scores are guidance, not a prediction of hiring decisions.
      </footer>
    </div>
  );
}
