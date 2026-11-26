"use client";

import { useState, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { assessmentKey, loadAssessment, saveAssessment } from "@/lib/assessment/cache";
import { RECOMMENDATION_LABEL, type Assessment, type RuleSection } from "@/lib/assessment/model";
import type { ApiError, EligibilityCheck, Job, ResumeVersion, SearchPreferences } from "@/types/job";
import { ELIGIBILITY_LABEL } from "./match-v2";
import { Badge, Notice, Spinner, primaryButton, secondaryButton } from "./ui";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="font-display text-base font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Items({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="text-sm font-semibold">{title}</h4>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

function Quoted({ title, items }: { title: string; items: { point: string; evidence: string }[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="text-sm font-semibold">{title}</h4>
      <ul className="mt-1 space-y-2">
        {items.map((i) => (
          <li key={i.point + i.evidence} className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
            {i.point}
            <p className="mt-1 text-xs text-muted">Your resume: “{i.evidence}”</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Conditions({ title, checks }: { title: string; checks: EligibilityCheck[] }) {
  if (!checks.length) return null;
  return (
    <div>
      <h4 className="text-sm font-semibold">{title}</h4>
      <ul className="mt-1 space-y-2">
        {checks.map((c) => (
          <li key={c.gate + c.postingEvidence + c.note} className="rounded-lg border border-line p-3 text-sm">
            <p>
              <span className="font-semibold">{ELIGIBILITY_LABEL[c.status][0]}.</span> {c.note}
            </p>
            <p className="mt-1 text-xs text-muted">Posting: “{c.postingEvidence}”</p>
            {c.candidateEvidence && <p className="text-xs text-muted">{c.candidateEvidence}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

const none = "None found.";

function Skills({ r }: { r: RuleSection }) {
  return (
    <Section title="Technical skills">
      <Items title="Required skills matched" items={r.requiredMatched.length ? [r.requiredMatched.join(", ")] : [none]} />
      <Items title="Required skills missing" items={r.requiredMissing.length ? [r.requiredMissing.join(", ")] : [none]} />
      <Items title="Preferred skills matched" items={r.preferredMatched.length ? [r.preferredMatched.join(", ")] : []} />
      <Items title="Transferable, not the same skill" items={r.transferable.map((t) => `${t.skill}, through ${t.via}. ${t.why}`)} />
      <Items title="Shown only by study, projects or a list" items={r.weaklyShown.map((s) => `${s.skill}: ${s.level === "listed" ? "only listed" : s.level}`)} />
    </Section>
  );
}

interface Props {
  job: Job;
  resume: ResumeVersion | null;
  preferences?: SearchPreferences;
}

export function DeepAssessment({ job, resume, preferences }: Props) {
  const key = resume ? assessmentKey(job.id, resume.id, resume.text.length, job.description.length) : null;
  const [data, setData] = useState<Assessment | null>(() => (key ? loadAssessment(key) : null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!resume) return <p className="text-sm text-muted">Add your resume to assess this job against it.</p>;

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/job-assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job: { title: job.title, company: job.company, location: job.location, workMode: job.workMode, description: job.description.slice(0, 30_000), descriptionTruncated: job.descriptionTruncated, postingStatus: job.postingStatus },
          resumeText: resume!.text,
          profile: resume!.profile,
          preferences,
        }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as Partial<ApiError> | null)?.error || "The assessment could not be created.");
      const next = (await res.json()) as Assessment;
      saveAssessment(key!, next);
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The assessment could not be created.");
    } finally {
      setLoading(false);
    }
  }

  const ai = data?.ai;
  const r = data?.rules;
  return (
    <div className="space-y-6" aria-busy={loading}>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={data ? secondaryButton : primaryButton} onClick={() => void run()} disabled={loading}>
          {loading ? <Spinner /> : <Sparkles className="size-4" aria-hidden />}
          {loading ? "Assessing, this can take a minute" : data ? (data.status === "complete" ? "Assess again" : "Try again") : "Assess this job"}
        </button>
        {!data && !loading && <p className="text-sm text-muted">Sends your resume and this posting to the server for a detailed review. Nothing runs until you ask.</p>}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {data?.notes.map((n) => (
        <Notice key={n} tone={data.status === "complete" ? "info" : "warn"}>
          {n}
        </Notice>
      ))}
      {job.descriptionTruncated && <Notice tone="warn">Only part of this posting is available, so this assessment is incomplete. Check the posting first.</Notice>}

      {data && r && (
        <>
          <Section title="Overall fit">
            <div className="flex flex-wrap gap-2">
              <Badge tone="brand">{RECOMMENDATION_LABEL[ai?.recommendation ?? r.recommendation]}</Badge>
              <Badge>Rule score {r.score}/100</Badge>
              <Badge>Confidence: {ai?.confidence ?? r.confidence}</Badge>
              {r.postingClosed && <Badge tone="warn">Posting closed</Badge>}
            </div>
            {ai && <p className="max-w-prose text-sm leading-relaxed">{ai.summary}</p>}
            {ai && <Items title="Why" items={ai.reasons} />}
            {ai && <Items title="Caveats" items={ai.caveats} />}
          </Section>
          <Skills r={r} />
          {ai && (
            <>
              <Section title="Experience">
                <Quoted title="Professional experience" items={ai.professionalExperience} />
                <Quoted title="Project experience" items={ai.projectExperience} />
                <Items title="Gaps" items={ai.experienceGaps} />
                {ai.seniority && <p className="text-sm">{ai.seniority}</p>}
              </Section>
              {ai.responsibilities.length > 0 && (
                <Section title="Responsibilities">
                  <ul className="space-y-2">
                    {ai.responsibilities.map((x) => (
                      <li key={x.duty} className="rounded-lg border border-line p-3 text-sm">
                        <Badge tone={x.alignment === "demonstrated" ? "good" : x.alignment === "partial" ? "info" : "warn"}>{x.alignment === "not_shown" ? "Not shown" : x.alignment === "partial" ? "Partly shown" : "Demonstrated"}</Badge>
                        <p className="mt-1">{x.duty}</p>
                        {x.evidence && <p className="mt-1 text-xs text-muted">Your resume: “{x.evidence}”</p>}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </>
          )}
          <Section title="Qualifications and eligibility">
            {!r.qualifications.length && !r.otherConditions.length && <p className="text-sm text-muted">No degree, certificate or eligibility condition was read in the posting. That is not confirmation that none applies.</p>}
            <Conditions title="Education and certifications" checks={r.qualifications} />
            <Conditions title="Other conditions" checks={r.otherConditions} />
          </Section>
          {ai && (
            <Section title="Interview preparation">
              <Items title="Likely technical topics" items={ai.interview.technicalTopics} />
              <Items title="Experience questions" items={ai.interview.experienceQuestions} />
              <Items title="Skills to revise" items={ai.interview.skillsToRevise} />
              <Quoted title="Examples from your work history" items={ai.interview.examples} />
            </Section>
          )}
        </>
      )}
    </div>
  );
}
