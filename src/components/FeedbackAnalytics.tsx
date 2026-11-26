"use client";

import { useMemo, useState } from "react";
import { computeAnalytics, type AnalyticsInput, type CountRow } from "@/lib/analytics/feedback-analytics";
import { MIN_FOR_RATE } from "@/lib/intelligence";
import { JOB_CATEGORIES, type JobCategory } from "@/types/job";
import { inputClass } from "./ui";

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-line p-3">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold tabular-nums">{value}</dd>
      {note && <dd className="text-xs text-muted">{note}</dd>}
    </div>
  );
}

function Rows({ title, rows, empty }: { title: string; rows: CountRow[]; empty: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {rows.length ? (
        <ul className="mt-1 space-y-1 text-sm">
          {rows.map((r) => (
            <li key={r.label} className="flex justify-between gap-3">
              <span>{r.label}</span>
              <span className="tabular-nums text-muted">{r.count}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted">{empty}</p>
      )}
    </div>
  );
}

export function FeedbackAnalytics(input: AnalyticsInput) {
  const [days, setDays] = useState<number | null>(null);
  const [category, setCategory] = useState<JobCategory | "All">("All");
  const { events, applications, seen, skills } = input;
  const a = useMemo(() => computeAnalytics({ events, applications, seen, skills }, { days, category }), [events, applications, seen, skills, days, category]);
  const rate = (value: number | null) => (value === null ? "n/a" : `${value}%`);
  const rateNote = a.applied < MIN_FOR_RATE ? `Shown from ${MIN_FOR_RATE} applications` : `of ${a.applied} applications`;

  return (
    <section aria-labelledby="outcomes-heading" className="space-y-4 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="outcomes-heading" className="font-display text-lg font-semibold">
            What happened to the jobs you saw
          </h2>
          <p className="text-sm text-muted">Counted in this browser from jobs you opened, saved and tracked.</p>
        </div>
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="an-days">
            Period
          </label>
          <select id="an-days" className={`${inputClass} w-auto py-1.5`} value={days ?? ""} onChange={(e) => setDays(e.target.value ? Number(e.target.value) : null)}>
            <option value="">All time</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last year</option>
          </select>
          <label className="sr-only" htmlFor="an-category">
            Job category
          </label>
          <select id="an-category" className={`${inputClass} w-auto py-1.5`} value={category} onChange={(e) => setCategory(e.target.value as JobCategory | "All")}>
            <option value="All">All categories</option>
            {JOB_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Jobs reviewed" value={String(a.reviewed)} />
        <Stat label="Saved" value={String(a.saved)} />
        <Stat label="Applied" value={String(a.applied)} />
        <Stat label="Marked not relevant" value={String(a.irrelevant)} />
        <Stat label="Interview rate" value={rate(a.interviewRate)} note={rateNote} />
        <Stat label="Offer rate" value={rate(a.offerRate)} note={rateNote} />
        <Stat label="Average score, applied" value={a.avgScoreApplied.value === null ? "n/a" : String(a.avgScoreApplied.value)} note={`${a.avgScoreApplied.of} scored`} />
        <Stat label="Average score, interview" value={a.avgScoreInterview.value === null ? "n/a" : String(a.avgScoreInterview.value)} note={`${a.avgScoreInterview.of} scored`} />
      </dl>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Rows title="Most often missing, in jobs you saved" rows={a.missingSkills} empty="Nothing yet." />
          {a.missingUnknown > 0 && <p className="mt-1 text-xs text-muted">{a.missingUnknown} jobs have no record of their missing skills.</p>}
        </div>
        <Rows title="Skill matches you corrected" rows={a.correctedSkills} empty="No corrections." />
        <Rows title="Eligibility results you corrected" rows={a.correctedEligibility} empty="No corrections." />
      </div>
      {a.categories.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Outcomes by job category</caption>
            <thead>
              <tr className="text-left text-xs text-muted">
                <th scope="col" className="py-1">Category</th>
                <th scope="col">Reviewed</th>
                <th scope="col">Saved</th>
                <th scope="col">Applied</th>
                <th scope="col">Interviews</th>
              </tr>
            </thead>
            <tbody>
              {a.categories.map((c) => (
                <tr key={c.category} className="border-t border-line">
                  <th scope="row" className="py-1 text-left font-medium">{c.category}</th>
                  <td>{c.reviewed}</td>
                  <td>{c.saved}</td>
                  <td>{c.applied}</td>
                  <td>{c.interviews}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted">{a.review.note}</p>
    </section>
  );
}
