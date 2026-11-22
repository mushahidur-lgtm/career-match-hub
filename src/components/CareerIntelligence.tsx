"use client";

import { useMemo, useState } from "react";
import { SEEN_MAX } from "@/lib/history";
import { computeIntelligence, RELEVANT_MIN, SUITABLE_MIN, type RoleRow } from "@/lib/intelligence";
import type { Application, IntelStore } from "@/types/job";
import type { Tab } from "./AppShell";
import { BarList, ChartFrame, ColumnChart, LineChart, Stat } from "./charts";
import { inputClass, Notice, primaryButton } from "./ui";

interface Props {
  intel: IntelStore;
  applications: Application[];
  /** Skills on the active resume. */
  skills: string[];
  roles: string[];
  hasResume: boolean;
  onGo: (tab: Tab) => void;
}

const OBSERVED = "Observed: counted from jobs your searches returned.";
const ESTIMATE = "Estimate: match scores are calculated by this app (and reviewed by Claude when it is set up), not stated by employers. Each job keeps the score from the resume that was active when it was last searched.";

const money = (n: number | null) => (n === null ? "None stated" : `$${Math.round(n / 1000)}k`);
const dateLabel = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "");

export function CareerIntelligence({ intel, applications, skills, roles, hasResume, onGo }: Props) {
  const [includeDemo, setIncludeDemo] = useState(false);
  const [a, setA] = useState<string>("");
  const [b, setB] = useState<string>("");
  const data = useMemo(
    () => computeIntelligence({ history: intel.history, seen: intel.seen, applications, profileSkills: skills, roles, includeDemo }),
    [intel, applications, skills, roles, includeDemo],
  );
  const f = data.funnel;
  const ranked = useMemo(() => [...data.roles].filter((r) => r.jobs > 0).sort((x, y) => y.suitable - x.suitable || y.jobs - x.jobs || x.role.localeCompare(y.role)), [data.roles]);
  const unseen = data.roles.filter((r) => r.jobs === 0);
  const pick = (name: string) => data.roles.find((r) => r.role === name);
  const left = pick(a) ?? ranked[0];
  const right = pick(b) ?? ranked[1];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Career intelligence</h1>
        <p className="mt-1 max-w-prose text-sm text-muted">What your searches have shown you about the market for your roles, and how your applications are going.</p>
      </div>

      <Notice tone="info">
        These figures come only from {data.searches} {data.searches === 1 ? "search" : "searches"} you ran
        {data.firstSeen ? ` since ${dateLabel(data.firstSeen)}` : ""} and the {applications.length} {applications.length === 1 ? "application" : "applications"} you track. They describe what you have seen, not the whole job market, and a search that
        returns few jobs will show few. Nothing here is estimated or filled in. The one exception, match scores, is labelled as an estimate.
      </Notice>

      {intel.seen.length >= SEEN_MAX - 10 && (
        <Notice tone="warn">
          Your history holds its maximum of {SEEN_MAX.toLocaleString()} jobs, so the oldest are being dropped to make room. Counts for earlier days can be lower than they were, and a job that was dropped and found again counts as new.
        </Notice>
      )}

      {data.demoObserved > 0 && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeDemo} onChange={(e) => setIncludeDemo(e.target.checked)} className="size-4" />
          Include {data.demoObserved} sample {data.demoObserved === 1 ? "job" : "jobs"} from demo mode (made-up data, left out by default)
        </label>
      )}

      {data.jobs === 0 && applications.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-6 py-12">
          <h2 className="font-display text-lg font-semibold">Nothing to analyse yet</h2>
          <p className="mt-2 max-w-prose text-sm text-muted">
            Every search you run is remembered here, and the charts fill in as you search over days and weeks. Run a search in Discover jobs to start. Searches with no job source connected add nothing.
          </p>
          <button type="button" className={`${primaryButton} mt-4`} onClick={() => onGo("discover")}>
            Discover jobs
          </button>
        </div>
      ) : (
        <>
          <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Jobs seen" value={data.jobs} note={`Across ${data.searches} ${data.searches === 1 ? "search" : "searches"}`} />
            <Stat label="Average match" value={data.averageScore === null ? "None" : data.averageScore} note={data.averageScore === null ? (hasResume ? "No scored jobs yet" : "Add a resume to score jobs") : "Estimate"} />
            <Stat label={`Jobs scoring ${RELEVANT_MIN}+`} value={data.relevantJobs} note="Estimate" />
            <Stat label="Pay stated" value={`${data.salaryStated} of ${data.jobs}`} note="Jobs that state a yearly CAD figure" />
          </section>

          {data.jobs > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartFrame
                title="New jobs found per day"
                subtitle={`${OBSERVED} Counts the day each job first appeared in one of your searches, so the first search shows everything it returned.`}
                table={{ head: ["Day", "New jobs"], rows: data.discoveredByDay.map((d) => [d.day, d.value]) }}
              >
                <ColumnChart days={data.discoveredByDay} label="New jobs found per day" unit="new jobs" />
              </ChartFrame>

              {data.hasScores ? (
                <ChartFrame
                  title="Average match score per day"
                  subtitle={`${ESTIMATE} Days without a scored search have no point.`}
                  table={{ head: ["Day", "Average score"], rows: data.scoreByDay.map((d) => [d.day, d.value ?? "No search"]) }}
                >
                  <LineChart days={data.scoreByDay} label="Average match score per day" unit="" />
                </ChartFrame>
              ) : (
                <ChartFrame title="Average match score per day" subtitle={ESTIMATE} table={{ head: ["Day", "Average score"], rows: [] }}>
                  <p className="py-4 text-sm text-muted">No scored searches yet. Add a resume and search again to see how well the market fits you.</p>
                </ChartFrame>
              )}

              <ChartFrame
                title="Where the jobs are"
                subtitle={`${OBSERVED} Nearby towns are grouped, for example the Greater Toronto Area.`}
                table={{ head: ["Place", "Jobs"], rows: data.locations.map((l) => [l.label, l.value]) }}
              >
                <BarList rows={data.locations} />
              </ChartFrame>

              <ChartFrame
                title="Stated yearly pay"
                subtitle={`${OBSERVED} Only pay the employer stated in CAD (hourly pay is converted at 2,080 hours). ${data.jobs - data.salaryStated} of ${data.jobs} jobs state none, estimated pay is not counted, and nothing is guessed.`}
                table={{ head: ["Band", "Jobs"], rows: data.salaryBands.map((l) => [l.label, l.value]) }}
              >
                {data.salaryStated === 0 ? <p className="py-4 text-sm text-muted">None of the jobs seen state their pay.</p> : <BarList rows={data.salaryBands} />}
              </ChartFrame>

              <ChartFrame title="Work arrangement" subtitle={`${OBSERVED} "Not stated" means the posting did not say.`} table={{ head: ["Arrangement", "Jobs"], rows: data.arrangement.map((l) => [l.label, l.value]) }}>
                <BarList rows={data.arrangement} />
              </ChartFrame>

              <ChartFrame title="Employment type" subtitle={OBSERVED} table={{ head: ["Type", "Jobs"], rows: data.employment.map((l) => [l.label, l.value]) }}>
                <BarList rows={data.employment} />
              </ChartFrame>

              <ChartFrame
                title="Skills asked for most"
                subtitle={`${OBSERVED} Solid bars are skills you do not have on your active resume; hatched bars are ones you do.${data.truncatedShare >= 25 ? ` ${data.truncatedShare}% of these postings were cut short by the job source, so counts are a minimum.` : ""}`}
                table={{ head: ["Skill", "Jobs asking", "Share of jobs", "On your resume"], rows: data.skills.map((s) => [s.skill, s.jobs, `${s.share}%`, s.have ? "Yes" : "No"]) }}
              >
                <BarList rows={data.skills.map((s) => ({ label: s.skill, value: s.jobs, note: `${s.share}%`, muted: s.have }))} empty="No skills could be read from the postings seen." />
              </ChartFrame>

              <ChartFrame
                title="Skill gaps"
                subtitle={`${OBSERVED} Skills that postings list as required and your active resume does not show.${hasResume ? "" : " Add a resume to see this."}`}
                table={{ head: ["Skill", "Jobs requiring it", "Share of jobs"], rows: data.gaps.map((s) => [s.skill, s.jobs, `${s.share}%`]) }}
              >
                {hasResume ? <BarList rows={data.gaps.map((s) => ({ label: s.skill, value: s.jobs, note: `${s.share}%` }))} empty="No required skill is missing from your resume in the jobs seen." /> : <p className="py-4 text-sm text-muted">Add a resume to compare against.</p>}
              </ChartFrame>

              <ChartFrame
                title="Companies hiring for your target roles"
                subtitle={`${OBSERVED} Postings whose title fits one of your target roles. Needs no resume. Companies are not counted when the posting does not name one.`}
                table={{ head: ["Company", "Postings"], rows: data.roleCompanies.map((c) => [c.label, c.value]) }}
              >
                <BarList rows={data.roleCompanies} empty="No posting seen so far has a title that fits your target roles." />
              </ChartFrame>

              <ChartFrame
                title="Companies with strong matches"
                subtitle={`Counts are observed; "strong" is an estimate: jobs with a match score of ${RELEVANT_MIN} or more.`}
                table={{ head: ["Company", "Relevant jobs", "Best match"], rows: data.companies.map((c) => [c.company, c.jobs, c.best]) }}
              >
                <BarList rows={data.companies.map((c) => ({ label: c.company, value: c.jobs, note: `best ${c.best}` }))} empty="No scored job reached the relevance line yet." />
              </ChartFrame>
            </div>
          )}

          <section aria-label="Applications" className="space-y-3">
            <h2 className="font-display text-lg font-semibold">Your applications</h2>
            {applications.length === 0 ? (
              <p className="text-sm text-muted">No applications tracked yet.</p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <ChartFrame title="Applications by status" subtitle="Observed: your own tracker." table={{ head: ["Status", "Applications"], rows: data.applicationsByStatus.map((s) => [s.label, s.value]) }}>
                  <BarList rows={data.applicationsByStatus.filter((s) => s.value > 0)} />
                </ChartFrame>
                <ChartFrame
                  title="Applications to interviews"
                  subtitle="Observed: your own tracker. Counts applications you sent, not jobs saved."
                  table={{ head: ["Step", "Applications"], rows: [["Sent", f.sent], ["Reached an interview", f.interviewed], ["Reached an offer", f.offers]] }}
                >
                  <BarList
                    rows={[
                      { label: "Sent", value: f.sent },
                      { label: "Reached an interview", value: f.interviewed },
                      { label: "Reached an offer", value: f.offers },
                    ]}
                    max={Math.max(1, f.sent)}
                  />
                  <p className="mt-3 text-sm">
                    {f.enough ? (
                      <>
                        <strong>{f.rate}%</strong> of applications sent reached an interview.
                      </>
                    ) : (
                      <span className="text-muted">No rate is shown until you have sent at least 5 applications. With fewer, one result swings it too much to mean anything.</span>
                    )}
                  </p>
                </ChartFrame>
              </div>
            )}
          </section>

          <section aria-label="Role comparison" className="space-y-3">
            <div>
              <h2 className="font-display text-lg font-semibold">Role comparison</h2>
              <p className="mt-1 max-w-prose text-sm text-muted">
                For each role you target, the jobs seen with a matching title. A role named with a level, such as Senior Data Analyst, counts only postings at that level; one without a level counts every level. A job can count under more than one role (an Azure Data Engineer is also a Data Engineer). &quot;Suitable&quot; means a match score of {SUITABLE_MIN} or more, which is an estimate; the other figures are observed.
              </p>
            </div>
            {data.roles.length === 0 ? (
              <p className="text-sm text-muted">Set your target roles in Settings to compare them.</p>
            ) : ranked.length === 0 ? (
              <p className="text-sm text-muted">None of the jobs seen so far have a title that matches your target roles.</p>
            ) : (
              <>
                <ChartFrame
                  title="Which roles have the most suitable jobs"
                  subtitle={`${OBSERVED} Suitable jobs are an estimate (score ${SUITABLE_MIN}+). Roles with no jobs seen are listed below.`}
                  table={{
                    head: ["Role", "Jobs seen", "Suitable", "Average score", "Median stated pay", "Remote or hybrid", "Skill most often missing"],
                    rows: ranked.map((r) => [r.role, r.jobs, r.scored > 0 ? r.suitable : "Not scored", r.avgScore ?? "Not scored", money(r.medianPay), r.flexibleShare === null ? "Not stated" : `${r.flexibleShare}%`, r.topMissing ?? "None"]),
                  }}
                >
                  <BarList rows={ranked.map((r) => ({ label: r.role, value: r.suitable, note: `of ${r.jobs} seen` }))} />
                  {unseen.length > 0 && <p className="mt-3 text-xs text-muted">No jobs seen for: {unseen.map((r) => r.role).join(", ")}.</p>}
                </ChartFrame>

                {ranked.length > 1 && (
                  <div className="rounded-xl border border-line bg-surface p-4 sm:p-5">
                    <h3 className="font-display text-base font-semibold">Compare two roles</h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <RolePicker id="cmp-a" label="First role" value={left?.role ?? ""} options={ranked} onChange={setA} />
                      <RolePicker id="cmp-b" label="Second role" value={right?.role ?? ""} options={ranked} onChange={setB} />
                    </div>
                    {left && right && <Compare left={left} right={right} />}
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function RolePicker({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: RoleRow[]; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5 text-sm font-medium">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        {options.map((r) => (
          <option key={r.role} value={r.role}>
            {r.role}
          </option>
        ))}
      </select>
    </div>
  );
}

function Compare({ left, right }: { left: RoleRow; right: RoleRow }) {
  const scored = (r: RoleRow) => r.scored > 0;
  const rows: [string, (r: RoleRow) => string][] = [
    ["Jobs seen", (r) => String(r.jobs)],
    [`Suitable (score ${SUITABLE_MIN}+, estimate)`, (r) => (scored(r) ? `${r.suitable} of ${r.scored} scored` : "Not scored")],
    ["Average score (estimate)", (r) => (r.avgScore === null ? "Not scored" : String(r.avgScore))],
    ["Median stated pay", (r) => (r.medianPay === null ? "None stated" : `${money(r.medianPay)} (${r.payStated} ${r.payStated === 1 ? "job" : "jobs"})`)],
    ["Remote or hybrid", (r) => (r.flexibleShare === null ? "Not stated" : `${r.flexibleShare}% of jobs that say`)],
    ["Required skill you most often lack", (r) => r.topMissing ?? "None"],
  ];
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">
          {left.role} compared with {right.role}
        </caption>
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            <th scope="col" className="py-1.5 pr-4 font-semibold">
              Measure
            </th>
            <th scope="col" className="py-1.5 pr-4 font-semibold">
              {left.role}
            </th>
            <th scope="col" className="py-1.5 font-semibold">
              {right.role}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, get]) => (
            <tr key={name} className="border-b border-line/60 last:border-0">
              <th scope="row" className="py-1.5 pr-4 font-medium">
                {name}
              </th>
              <td className="py-1.5 pr-4 tabular-nums">{get(left)}</td>
              <td className="py-1.5 tabular-nums">{get(right)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(left.jobs < 5 || right.jobs < 5) && <p className="mt-2 text-xs text-muted">One of these roles has fewer than 5 jobs seen, so the comparison is thin. Search for it a few more times, on different days, before relying on it.</p>}
    </div>
  );
}
