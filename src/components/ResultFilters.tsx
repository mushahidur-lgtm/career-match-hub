"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown, ListFilter } from "lucide-react";
import { LEVEL_BUCKETS } from "@/lib/job-meta";
import { DEFAULT_REFINE, activeFilterCount, type RefineFilters } from "@/lib/refine";
import { APPLICATION_STATUSES, EMPLOYMENT_FILTERS, JOB_CATEGORIES, WORK_MODES } from "@/types/job";
import { Badge, inputClass, secondaryButton } from "./ui";

interface Props {
  value: RefineFilters;
  onChange: (next: RefineFilters) => void;
  /** Jobs found by the search, and jobs left after these filters. */
  total: number;
  shown: number;
  /** How many of the jobs found look likely to be closed, for the one-click toggle. */
  closedCount?: number;
}

/** A text box that updates the filters 250ms after you stop typing, so the list does not jump on every key. */
function DebouncedInput({ id, value, onCommit, ...rest }: { id: string; value: string; onCommit: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "id">) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(value);
  }, [value]);
  useEffect(() => {
    if (draft === value) return;
    const t = setTimeout(() => onCommit(draft), 250);
    return () => clearTimeout(t);
  }, [draft, value, onCommit]);
  return <input id={id} value={draft} onChange={(e) => setDraft(e.target.value)} className={inputClass} {...rest} />;
}

export function ResultFilters({ value, onChange, total, shown, closedCount = 0 }: Props) {
  const uid = useId();
  const active = activeFilterCount(value);
  const [open, setOpen] = useState(active > 0);
  const set = <K extends keyof RefineFilters>(key: K, v: RefineFilters[K]) => onChange({ ...value, [key]: v });
  const numberOrNull = (s: string) => (s === "" ? null : Math.max(0, Number(s) || 0));

  const field = (label: string, id: string, control: ReactNode) => (
    <div className="flex flex-col gap-1.5 text-sm font-medium">
      <label htmlFor={id}>{label}</label>
      {control}
    </div>
  );
  const select = (id: string, v: string, onSel: (v: string) => void, options: { value: string; label: string }[]) => (
    <select id={id} value={v} onChange={(e) => onSel(e.target.value)} className={inputClass}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );

  return (
    <section aria-label="Refine results" className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={`${uid}-panel`} className="inline-flex items-center gap-2 text-sm font-semibold">
          <ListFilter className="size-4 text-brand" aria-hidden />
          Refine results
          {active > 0 && <Badge tone="brand">{active} on</Badge>}
          <ChevronDown className={`size-4 text-muted transition ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
        <div className="flex items-center gap-3 text-sm" aria-live="polite">
          <span className="text-muted">
            Showing {shown} of {total}
          </span>
          {(closedCount > 0 || value.hideStale) && (
            <button type="button" aria-pressed={value.hideStale} className={secondaryButton} onClick={() => set("hideStale", !value.hideStale)}>
              {value.hideStale ? `Show likely closed again` : `Hide ${closedCount} likely closed`}
            </button>
          )}
          {active > 0 && (
            <button type="button" className={secondaryButton} onClick={() => onChange(DEFAULT_REFINE)}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {open && (
        <div id={`${uid}-panel`} className="space-y-4 border-t border-line p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {field(
              "Minimum match",
              `${uid}-score`,
              select(`${uid}-score`, String(value.minScore), (v) => set("minScore", Number(v)), [
                { value: "0", label: "Any score" },
                { value: "50", label: "50 and up" },
                { value: "70", label: "70 and up (strong)" },
                { value: "90", label: "90 and up (excellent)" },
              ]),
            )}
            {field(
              "Posted",
              `${uid}-posted`,
              select(`${uid}-posted`, String(value.postedWithinDays), (v) => set("postedWithinDays", Number(v) as RefineFilters["postedWithinDays"]), [
                { value: "0", label: "Any time" },
                { value: "1", label: "Last 24 hours" },
                { value: "3", label: "Last 3 days" },
                { value: "7", label: "Last 7 days" },
                { value: "30", label: "Last 30 days" },
              ]),
            )}
            {field(
              "Application status",
              `${uid}-status`,
              select(`${uid}-status`, value.status, (v) => set("status", v as RefineFilters["status"]), [
                { value: "All", label: "All" },
                { value: "Not tracked", label: "Not tracked" },
                ...APPLICATION_STATUSES.map((s) => ({ value: s, label: s })),
              ]),
            )}
            {field(
              "Seniority",
              `${uid}-level`,
              select(`${uid}-level`, value.seniority, (v) => set("seniority", v as RefineFilters["seniority"]), [{ value: "All", label: "Any level" }, ...LEVEL_BUCKETS.map((l) => ({ value: l, label: l }))]),
            )}
            {field(
              "Work arrangement",
              `${uid}-mode`,
              select(`${uid}-mode`, value.workMode, (v) => set("workMode", v as RefineFilters["workMode"]), [{ value: "All", label: "Any" }, ...WORK_MODES.map((m) => ({ value: m, label: m }))]),
            )}
            {field(
              "Employment type",
              `${uid}-type`,
              select(`${uid}-type`, value.employmentType, (v) => set("employmentType", v as RefineFilters["employmentType"]), EMPLOYMENT_FILTERS.map((t) => ({ value: t, label: t }))),
            )}
            {field(
              "Category",
              `${uid}-cat`,
              select(`${uid}-cat`, value.category, (v) => set("category", v as RefineFilters["category"]), [{ value: "All", label: "All categories" }, ...JOB_CATEGORIES.map((c) => ({ value: c, label: c }))]),
            )}
            {field("Location contains", `${uid}-loc`, <DebouncedInput id={`${uid}-loc`} value={value.location} onCommit={(v) => set("location", v)} maxLength={100} placeholder="Kanata" />)}
            {field("Company contains", `${uid}-co`, <DebouncedInput id={`${uid}-co`} value={value.company} onCommit={(v) => set("company", v)} maxLength={100} placeholder="Bank" />)}
            {field("Title contains", `${uid}-ti`, <DebouncedInput id={`${uid}-ti`} value={value.title} onCommit={(v) => set("title", v)} maxLength={100} placeholder="Analytics" />)}
            {field(
              "Salary from (per year)",
              `${uid}-smin`,
              <DebouncedInput id={`${uid}-smin`} type="number" inputMode="numeric" min={0} step={5000} value={value.salaryMin === null ? "" : String(value.salaryMin)} onCommit={(v) => set("salaryMin", numberOrNull(v))} placeholder="100000" />,
            )}
            {field(
              "Salary up to (per year)",
              `${uid}-smax`,
              <DebouncedInput id={`${uid}-smax`} type="number" inputMode="numeric" min={0} step={5000} value={value.salaryMax === null ? "" : String(value.salaryMax)} onCommit={(v) => set("salaryMax", numberOrNull(v))} placeholder="160000" />,
            )}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={value.includeUnknownSalary} onChange={(e) => set("includeUnknownSalary", e.target.checked)} className="size-4 accent-[var(--brand)]" />
              Keep jobs with no stated salary
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={value.hideStale} onChange={(e) => set("hideStale", e.target.checked)} className="size-4 accent-[var(--brand)]" />
              Hide jobs that are likely closed (older than 30 days, or the posting says it is closed)
            </label>
          </div>
          <p className="text-xs text-muted">Jobs with no posting date are hidden when you pick a posted window, because their age is unknown. A salary only estimated by the job board counts as no stated salary.</p>
        </div>
      )}
    </section>
  );
}
