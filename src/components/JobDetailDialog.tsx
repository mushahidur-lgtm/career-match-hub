"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ExternalLink, Quote, Sparkles, X } from "lucide-react";
import { isBeforeApplied } from "@/lib/applications";
import { formatSalary } from "@/lib/format";
import type { JobInsights } from "@/lib/insights";
import { loadInsights, insightsKey, saveInsights } from "@/lib/insights-cache";
import { freshness, levelBucket } from "@/lib/job-meta";
import { parseRequirements } from "@/lib/matching/requirements";
import { adviseResume, buildPrepSummary, type ResumeAdvice } from "@/lib/resume-help";
import type { ApiError, Job, ResumeVersion, SavedJob } from "@/types/job";
import { MatchBreakdown } from "./MatchBreakdown";
import { useContacts } from "./contacts/context";
import { ConfidenceBadge, FreshnessBadge, SaveControl, modeTone, safeUrl, typeLabel, typeTone, type JobActions } from "./job-parts";
import { Badge, Notice, ScoreBadge, Spinner, inputClass, primaryButton, secondaryButton } from "./ui";

export type DetailTab = "overview" | "description" | "match" | "resume" | "application";

const TABS: { id: DetailTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "description", label: "Job description" },
  { id: "match", label: "Match analysis" },
  { id: "resume", label: "Resume recommendations" },
  { id: "application", label: "Application" },
];

/** What the dialog needs from the rest of the app. */
export interface DetailContextValue {
  /** The resume version used for matching. */
  resume: ResumeVersion | null;
  /** Every saved resume version. */
  resumes: ResumeVersion[];
  /** True when an Anthropic key is configured, so tailored suggestions can be requested. */
  aiAvailable: boolean;
  onNotes: (jobId: string, notes: string) => void;
}

export const DetailContext = createContext<DetailContextValue>({ resume: null, resumes: [], aiAvailable: false, onNotes: () => undefined });

interface Props extends JobActions {
  job: Job;
  saved: SavedJob | undefined;
  initialTab?: DetailTab;
  onClose: () => void;
}

/* ---------- tailored suggestions from Claude, on request ---------- */

type InsightState = { status: "idle" | "loading" | "error" | "done"; data: JobInsights | null; error: string | null; at: string | null };

function useInsights(job: Job, resume: ResumeVersion | null) {
  const key = resume ? insightsKey(job.id, resume.id, resume.text.length) : null;
  // The dialog only exists in the browser, so reading the cache here is safe.
  const [state, setState] = useState<InsightState>(() => {
    const cached = key ? loadInsights(key) : null;
    return cached ? { status: "done", data: cached.data, error: null, at: cached.at } : { status: "idle", data: null, error: null, at: null };
  });

  const run = useCallback(async () => {
    if (!resume || !key) return;
    setState((s) => ({ ...s, status: "loading", error: null }));
    try {
      const res = await fetch("/api/job-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job: { title: job.title, company: job.company, location: job.location, workMode: job.workMode, description: job.description.slice(0, 20_000), match: job.match },
          resumeText: resume.text,
          profile: resume.profile,
        }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as Partial<ApiError> | null)?.error || "Suggestions could not be created.");
      const { insights } = (await res.json()) as { insights: JobInsights };
      saveInsights(key, insights);
      setState({ status: "done", data: insights, error: null, at: new Date().toISOString() });
    } catch (err) {
      setState((s) => ({ ...s, status: "error", error: err instanceof Error ? err.message : "Suggestions could not be created." }));
    }
  }, [job, resume, key]);

  return { ...state, run };
}

type Insights = ReturnType<typeof useInsights>;

/* ---------- the dialog ---------- */

export function JobDetailDialog({ job, saved, initialTab = "overview", onSave, onStatus, onRemove, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<DetailTab>(initialTab);
  const { resume, aiAvailable } = useContext(DetailContext);
  const contacts = useContacts();
  const insights = useInsights(job, resume);
  const titleId = `job-${job.id}-title`;
  const apply = safeUrl(job.applyUrl);

  const advice = useMemo(
    () => (resume ? adviseResume(job, resume.profile, resume.text, job.match?.detail) : null),
    [job, resume],
  );

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  function onTabKey(e: KeyboardEvent, i: number) {
    const next = e.key === "ArrowRight" ? (i + 1) % TABS.length : e.key === "ArrowLeft" ? (i - 1 + TABS.length) % TABS.length : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    setTab(TABS[next].id);
    document.getElementById(`${titleId}-tab-${TABS[next].id}`)?.focus();
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
      className="m-auto w-[min(56rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-ink"
    >
      <header className="sticky top-0 z-10 border-b border-line bg-surface">
        <div className="flex items-start justify-between gap-4 p-5 pb-3">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-xl font-semibold leading-snug">
              {job.title}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {job.company} · {job.location}
            </p>
          </div>
          <div className="flex items-start gap-2">
            {job.match && <ScoreBadge score={job.match.score} source={job.match.source} large />}
            <button type="button" className={secondaryButton} onClick={() => contacts.openFinder(job)} aria-haspopup="dialog">
              Find recruiter
            </button>
            <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink">
              <X className="size-5" aria-hidden />
            </button>
          </div>
        </div>
        <div role="tablist" aria-label="Job details" className="flex gap-1 overflow-x-auto px-3">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              id={`${titleId}-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`${titleId}-panel`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold ${tab === t.id ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div id={`${titleId}-panel`} role="tabpanel" aria-labelledby={`${titleId}-tab-${tab}`} className="p-5">
        {tab === "overview" && <OverviewTab job={job} />}
        {tab === "description" && <DescriptionTab job={job} />}
        {tab === "match" && <MatchTab job={job} hasResume={Boolean(resume)} />}
        {tab === "resume" && <ResumeTab resume={resume} advice={advice} insights={insights} aiAvailable={aiAvailable} />}
        {tab === "application" && (
          <ApplicationTab job={job} saved={saved} resume={resume} advice={advice} insights={insights} aiAvailable={aiAvailable} onSave={onSave} onStatus={onStatus} onRemove={onRemove} />
        )}
      </div>

      <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface p-4">
        <SaveControl job={job} saved={saved} onSave={onSave} onStatus={onStatus} onRemove={onRemove} />
        {apply ? (
          <a href={apply} target="_blank" rel="noopener noreferrer" className={primaryButton}>
            Apply <ExternalLink className="size-4" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : (
          <span className="text-sm text-muted">{job.source === "demo" ? "Sample listing, no apply link" : "No apply link provided"}</span>
        )}
      </footer>
    </dialog>
  );
}

/* ---------- tabs ---------- */

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{children}</dd>
    </div>
  );
}

function OverviewTab({ job }: { job: Job }) {
  const fr = freshness(job.postedAt);
  const d = job.match?.detail;
  const others = (job.otherApplyUrls ?? []).map(safeUrl).filter((u): u is string => !!u);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={modeTone[job.workMode]}>{job.workMode}</Badge>
        <Badge tone={typeTone[job.employmentType]}>{typeLabel(job.employmentType)}</Badge>
        <Badge>{job.category}</Badge>
        <FreshnessBadge postedAt={job.postedAt} />
        {d && <ConfidenceBadge confidence={d.confidence} />}
      </div>

      {fr.note && <Notice tone="warn">{fr.note}</Notice>}

      {job.match && <p className="max-w-prose text-sm leading-relaxed">{job.match.matchReason}</p>}

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Fact label="Company">{job.company}</Fact>
        <Fact label="Location">{job.location}</Fact>
        <Fact label="Work arrangement">{job.workMode}</Fact>
        <Fact label="Employment type">{typeLabel(job.employmentType)}</Fact>
        <Fact label="Salary">{formatSalary(job.salary)}</Fact>
        <Fact label="Level asked">{levelBucket(job)}</Fact>
        <Fact label="Posted">{fr.label}</Fact>
        <Fact label="Source">{job.source === "adzuna" ? "Adzuna" : job.source === "jsearch" ? "JSearch" : job.source === "manual" ? "Added by you" : "Sample data"}</Fact>
      </dl>

      {d && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { title: "Seniority", text: d.seniority.note },
            { title: "Location", text: d.location.note },
            { title: "Salary", text: d.salary.note },
          ].map((x) => (
            <div key={x.title} className="rounded-lg border border-line p-3">
              <h3 className="text-xs font-medium text-muted">{x.title}</h3>
              <p className="mt-1 text-sm">{x.text}</p>
            </div>
          ))}
        </div>
      )}

      {job.duplicateCount ? (
        <div className="rounded-lg border border-line p-3 text-sm">
          <p className="font-medium">
            This posting was found {job.duplicateCount + 1} times and merged into one listing.
          </p>
          {others.length > 0 && (
            <ul className="mt-2 space-y-1">
              {others.map((u, i) => (
                <li key={u}>
                  <a href={u} target="_blank" rel="noopener noreferrer" className="text-brand underline">
                    Other listing {i + 1}
                  </a>
                  <span className="sr-only"> (opens in a new tab)</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function DescriptionTab({ job }: { job: Job }) {
  const req = useMemo(() => parseRequirements(job.title, job.description), [job]);
  return (
    <div className="space-y-6">
      <section aria-label="What the posting asks for" className="space-y-3">
        <h3 className="font-display text-base font-semibold">What the posting asks for</h3>
        <p className="text-sm text-muted">
          Read from the text below by rules.{" "}
          {req.structured ? "The posting separates what is required from what is preferred." : "The posting has no requirements section, so every skill counts as required."}
        </p>
        {req.requiredYears && <p className="text-sm">Experience asked: {req.requiredYears}+ years.</p>}
        <SkillChips title="Required" skills={req.required} tone="warn" />
        <SkillChips title="Preferred" skills={req.preferred} tone="neutral" />
        {!req.required.length && !req.preferred.length && <p className="text-sm text-muted">No technical skills could be read from this posting.</p>}
      </section>

      <section aria-label="Description">
        <h3 className="font-display text-base font-semibold">Description</h3>
        <div className="mt-2 max-w-prose whitespace-pre-line text-sm leading-relaxed">{job.description || "No description was provided."}</div>
        {job.descriptionTruncated && <p className="mt-3 text-xs text-muted">The job board shares only the start of this posting. Open the full posting to read the rest.</p>}
      </section>
    </div>
  );
}

function SkillChips({ title, skills, tone }: { title: string; skills: string[]; tone: "warn" | "neutral" }) {
  if (!skills.length) return null;
  return (
    <div>
      <h4 className="text-sm font-semibold">{title}</h4>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {skills.map((s) => (
          <li key={s}>
            <Badge tone={tone}>{s}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MatchTab({ job, hasResume }: { job: Job; hasResume: boolean }) {
  if (!job.match) return <p className="text-sm text-muted">{hasResume ? "Search again to score this job." : "Add a resume to see how well this job matches."}</p>;
  if (!job.match.detail) return <p className="max-w-prose text-sm">{job.match.matchReason}</p>;
  return <MatchBreakdown match={job.match} />;
}

/* ---------- resume recommendations ---------- */

function ResumeTab({ resume, advice, insights, aiAvailable }: { resume: ResumeVersion | null; advice: ResumeAdvice | null; insights: Insights; aiAvailable: boolean }) {
  if (!resume || !advice) {
    return <p className="max-w-prose text-sm text-muted">Add your resume on the Resume and profile page to get suggestions drawn from your own lines.</p>;
  }
  const ai = insights.data;
  return (
    <div className="space-y-8">
      <p className="max-w-prose text-sm text-muted">
        Suggestions for <span className="font-medium text-ink">{resume.name}</span>. They only reword or reorder what your resume already says. Nothing here adds experience you do not have.
      </p>
      {advice.notes.map((n) => (
        <Notice key={n} tone="info">
          {n}
        </Notice>
      ))}

      <Section title="Lead with these lines" help="Lines from your resume that speak most directly to this job.">
        {advice.leadWith.length ? (
          <ul className="space-y-3">
            {advice.leadWith.map((l) => (
              <li key={l.line}>
                <Evidence line={l.line} />
                <p className="mt-1 text-xs text-muted">{l.why}</p>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No line on your resume speaks directly to this job.</Empty>
        )}
      </Section>

      <Section title="Keywords worth naming" help="Skills this job asks for that are on your profile, but that your resume text never mentions.">
        {advice.keywordsToAdd.length ? (
          <ul className="space-y-2">
            {advice.keywordsToAdd.map((k) => (
              <li key={k.keyword} className="text-sm">
                <Badge tone="info">{k.keyword}</Badge> <span className="text-muted">{k.note}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Every skill this job names that you have is already written on your resume.</Empty>
        )}
      </Section>

      {advice.weakBullets.length > 0 && (
        <Section title="Lines that would be stronger with a result" help="Relevant lines that state no number, scale or outcome.">
          <ul className="space-y-3">
            {advice.weakBullets.map((w) => (
              <li key={w.line}>
                <Evidence line={w.line} />
                <p className="mt-1 text-xs text-muted">{w.note}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(advice.projects.length > 0 || (ai?.projects.length ?? 0) > 0) && (
        <Section title="Projects to put forward" help="Existing resume entries that fit this job.">
          <ul className="space-y-3">
            {[...advice.projects.map((p) => ({ line: p, why: "" })), ...(ai?.projects ?? []).filter((p) => !advice.projects.includes(p.line))].map((p) => (
              <li key={p.line}>
                <Evidence line={p.line} />
                {p.why && <p className="mt-1 text-xs text-muted">{p.why}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Gaps, stated honestly" help="What the job needs that your resume does not show.">
        {advice.gaps.length ? (
          <ul className="space-y-2">
            {advice.gaps.map((g) => (
              <li key={`${g.kind}-${g.skill}`} className="text-sm">
                <Badge tone={g.kind === "missing" ? "warn" : "info"}>{g.skill}</Badge> <span className="text-muted">{g.note}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No gaps in the required skills this posting names.</Empty>
        )}
      </Section>

      <Section title="Tailored suggestions from Claude" help="Reworded lines for this job, on request.">
        {!aiAvailable ? (
          <p className="max-w-prose text-sm text-muted">Connect an Anthropic key (ANTHROPIC_API_KEY) to get reworded lines and a tailored application summary. Everything above works without one.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={secondaryButton} onClick={() => void insights.run()} disabled={insights.status === "loading"}>
                {insights.status === "loading" ? <Spinner /> : <Sparkles className="size-4" aria-hidden />}
                {insights.status === "loading" ? "Working" : ai ? "Get fresh suggestions" : "Get tailored suggestions"}
              </button>
              <span className="text-xs text-muted">Sends this posting and your resume text to Anthropic.</span>
            </div>
            {insights.error && <Notice tone="error">{insights.error}</Notice>}
            {ai && (
              <div className="space-y-4">
                {ai.rewrites.length === 0 ? (
                  <Empty>Claude found no line worth rewording that it could reword without adding anything new.</Empty>
                ) : (
                  <ul className="space-y-4">
                    {ai.rewrites.map((r) => (
                      <li key={r.original} className="rounded-lg border border-line p-3">
                        <p className="text-xs font-medium text-muted">Your line</p>
                        <p className="text-sm">{r.original}</p>
                        <p className="mt-3 text-xs font-medium text-muted">Suggested wording</p>
                        <p className="text-sm font-medium">{r.suggestion}</p>
                        {r.why && <p className="mt-2 text-xs text-muted">{r.why}</p>}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-muted">Suggestions that added a skill you have not listed, or a number that was not in your line, were removed before this list was shown. Replace any bracketed text with your real figure.</p>
              </div>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h3 className="font-display text-base font-semibold">{title}</h3>
      {help && <p className="mt-0.5 text-xs text-muted">{help}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Evidence({ line }: { line: string }) {
  return (
    <div className="flex gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
      <Quote className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
      <span>{line}</span>
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-muted">{children}</p>;

/* ---------- application ---------- */

function ApplicationTab({
  job,
  saved,
  resume,
  advice,
  insights,
  aiAvailable,
  onSave,
  onStatus,
  onRemove,
}: { job: Job; saved: SavedJob | undefined; resume: ResumeVersion | null; advice: ResumeAdvice | null; insights: Insights; aiAvailable: boolean } & JobActions) {
  const { onNotes } = useContext(DetailContext);
  const apply = safeUrl(job.applyUrl);
  const prep = advice ? buildPrepSummary(job, advice) : null;
  const ai = insights.data;

  return (
    <div className="space-y-8">
      <Section title="Where this application stands">
        <div className="flex flex-wrap items-center gap-3">
          <SaveControl job={job} saved={saved} onSave={onSave} onStatus={onStatus} onRemove={onRemove} />
          {(!saved || isBeforeApplied(saved.status)) && (
            <button type="button" className={secondaryButton} onClick={() => (saved ? onStatus(saved.job.id, "Applied") : onSave(job, "Applied"))}>
              Mark as applied
            </button>
          )}
        </div>
        <p className="mt-3 text-sm text-muted">
          {resume ? (
            <>
              Resume in use: <span className="font-medium text-ink">{resume.name}</span>
            </>
          ) : (
            "No resume is in use yet."
          )}
          {apply ? " Apply on the employer's page, then mark the job as applied here." : " This listing has no apply link."}
        </p>
      </Section>

      <Section title="Notes" help="Contacts, deadlines, what you sent.">
        {saved ? (
          <>
            <label htmlFor={`notes-${job.id}`} className="sr-only">
              Notes for {job.title}
            </label>
            <textarea id={`notes-${job.id}`} value={saved.notes} onChange={(e) => onNotes(saved.job.id, e.target.value)} rows={4} maxLength={2000} className={`${inputClass} resize-y`} placeholder="Recruiter name, follow-up date, what you sent" />
          </>
        ) : (
          <Empty>Save this job to keep notes on it.</Empty>
        )}
      </Section>

      <Section title="Application preparation" help="Built from your match and your own resume lines.">
        {prep ? (
          <div className="space-y-5">
            <p className="max-w-prose text-sm leading-relaxed">{prep.whyApply}</p>
            {prep.leadWith.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold">Lead with</h4>
                <ul className="mt-2 space-y-2">
                  {prep.leadWith.map((l) => (
                    <li key={l}>
                      <Evidence line={l} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <BulletList title="Be ready to address" items={prep.beReadyFor} />
            <BulletList title="Confirm before you apply" items={prep.confirmFirst} />
            <BulletList title="Checklist" items={prep.checklist} />
          </div>
        ) : (
          <Empty>Add a resume to get a preparation summary.</Empty>
        )}
      </Section>

      {aiAvailable && resume && (
        <Section title="Tailored summary from Claude" help="An optional second opinion, grounded in your resume.">
          {!ai ? (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={secondaryButton} onClick={() => void insights.run()} disabled={insights.status === "loading"}>
                {insights.status === "loading" ? <Spinner /> : <Sparkles className="size-4" aria-hidden />}
                {insights.status === "loading" ? "Working" : "Get tailored summary"}
              </button>
              <span className="text-xs text-muted">Sends this posting and your resume text to Anthropic.</span>
              {insights.error && <Notice tone="error">{insights.error}</Notice>}
            </div>
          ) : (
            <div className="space-y-5">
              {ai.summary.fit && <p className="max-w-prose text-sm leading-relaxed">{ai.summary.fit}</p>}
              {ai.summary.talkingPoints.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold">Points to emphasise</h4>
                  <ul className="mt-2 space-y-3">
                    {ai.summary.talkingPoints.map((t) => (
                      <li key={t.point}>
                        <p className="text-sm">{t.point}</p>
                        <div className="mt-1">
                          <Evidence line={t.evidence} />
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted">Each point rests on a line copied from your resume. Points without a real line were removed.</p>
                </div>
              )}
              <BulletList title="Addressing gaps honestly" items={ai.summary.honestFraming} />
              <BulletList title="Questions to ask the employer" items={ai.summary.questionsToAsk} />
              <BulletList title="Claude's checklist" items={ai.summary.checklist} />
              <button type="button" className={secondaryButton} onClick={() => void insights.run()} disabled={insights.status === "loading"}>
                {insights.status === "loading" ? <Spinner /> : <Sparkles className="size-4" aria-hidden />} Get fresh summary
              </button>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

function BulletList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="text-sm font-semibold">{title}</h4>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}
