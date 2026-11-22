"use client";

import { useId, type FormEvent } from "react";
import { Search } from "lucide-react";
import {
  EMPLOYMENT_FILTERS,
  JOB_CATEGORIES,
  LOCATION_PRESETS,
  WORK_MODES,
  type EmploymentTypeFilter,
  type JobCategoryFilter,
  type SearchFilters as Filters,
  type WorkModeFilter,
} from "@/types/job";
import { Spinner, inputClass, primaryButton } from "./ui";

const CUSTOM = "__custom__";

interface Props {
  filters: Filters;
  onChange: (next: Filters) => void;
  onSearch: () => void;
  loading: boolean;
  suggestions: string[];
  /** Preferred cities, listed first in the City menu. */
  locations: string[];
}

export function SearchFilters({ filters, onChange, onSearch, loading, suggestions, locations }: Props) {
  const uid = useId();
  const cities = [...new Set([...locations, ...LOCATION_PRESETS])];
  const preset = cities.includes(filters.location) ? filters.location : CUSTOM;
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => onChange({ ...filters, [key]: value });

  function submit(e: FormEvent) {
    e.preventDefault();
    onSearch();
  }

  const field = "flex flex-col gap-1.5 text-sm font-medium";

  return (
    <form onSubmit={submit} className="rounded-xl border border-line bg-surface p-4 sm:p-5" aria-label="Job search">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.6fr_1fr_1fr]">
        <div className={field}>
          <label htmlFor={`${uid}-query`}>Job title or keywords</label>
          <input
            id={`${uid}-query`}
            list={`${uid}-roles`}
            value={filters.query}
            onChange={(e) => set("query", e.target.value)}
            placeholder="Data Engineer, Senior Software Developer, BI Developer"
            maxLength={120}
            className={inputClass}
          />
          <datalist id={`${uid}-roles`}>
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>

        <div className={field}>
          <label htmlFor={`${uid}-city`}>City</label>
          <select id={`${uid}-city`} value={preset} onChange={(e) => set("location", e.target.value === CUSTOM ? "" : e.target.value)} className={inputClass}>
            {cities.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
            <option value={CUSTOM}>Another city</option>
          </select>
        </div>

        <div className={field}>
          <label htmlFor={`${uid}-custom`} className={preset === CUSTOM ? "" : "text-muted"}>
            Other city
          </label>
          <input
            id={`${uid}-custom`}
            value={preset === CUSTOM ? filters.location : ""}
            onChange={(e) => set("location", e.target.value)}
            disabled={preset !== CUSTOM}
            placeholder={preset === CUSTOM ? "Calgary, AB" : "Choose Another city first"}
            maxLength={120}
            className={`${inputClass} disabled:opacity-60`}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className={field}>
          <label htmlFor={`${uid}-category`}>Job category</label>
          <select id={`${uid}-category`} value={filters.category} onChange={(e) => set("category", e.target.value as JobCategoryFilter)} className={inputClass}>
            <option value="All">All categories</option>
            {JOB_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className={field}>
          <label htmlFor={`${uid}-mode`}>Work mode</label>
          <select id={`${uid}-mode`} value={filters.workMode} onChange={(e) => set("workMode", e.target.value as WorkModeFilter)} className={inputClass}>
            <option value="All">All</option>
            {WORK_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className={field}>
          <label htmlFor={`${uid}-type`}>Employment type</label>
          <select id={`${uid}-type`} value={filters.employmentType} onChange={(e) => set("employmentType", e.target.value as EmploymentTypeFilter)} className={inputClass}>
            {EMPLOYMENT_FILTERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className={field}>
          <label htmlFor={`${uid}-salary`}>Minimum salary (per year)</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted" aria-hidden>
              $
            </span>
            <input
              id={`${uid}-salary`}
              type="number"
              inputMode="numeric"
              min={0}
              max={1000000}
              step={5000}
              value={filters.minSalary ?? ""}
              onChange={(e) => set("minSalary", e.target.value === "" ? null : Math.max(0, Number(e.target.value)))}
              placeholder="100000"
              className={`${inputClass} pl-6`}
            />
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="submit" className={primaryButton} disabled={loading || !filters.location.trim()}>
          {loading ? <Spinner /> : <Search className="size-4" aria-hidden />}
          {loading ? "Searching" : "Search jobs"}
        </button>
        <p className="text-xs text-muted">Jobs that do not state a work mode count as On-site. Jobs with no stated salary stay in the list, marked Salary unknown.</p>
      </div>
    </form>
  );
}
