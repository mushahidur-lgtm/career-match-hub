"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Quote, Sparkles, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { PREP_DISCLAIMER, buildPracticeSet, type AiPrep } from "@/lib/interview-prep";
import { LIMITS } from "@/lib/limits";
import {
  INTERVIEW_FORMATS,
  INTERVIEW_STAGES,
  INTERVIEW_STATUSES,
  type ApiError,
  type Application,
  type Interview,
  type InterviewFormat,
  type InterviewStage,
  type InterviewStatus,
  type ResumeVersion,
} from "@/types/job";
import { Badge, Notice, Spinner, inputClass, primaryButton, secondaryButton } from "./ui";

interface Props {
  app: Application;
  interview: Interview;
  /** The resume version used for this application, or the active one. */
  resume: ResumeVersion | null;
  aiAvailable: boolean;
  onChange: (patch: Partial<Interview>) => void;
  onRemove: () => void;
}

/** One item per line. Keeps what you are typing as it is, and saves it when you pause or leave the box. */
function LinesField({ id, label, help, value, onCommit, maxItems, maxLength, rows = 4 }: { id: string; label: string; help?: string; value: string[]; onCommit: (v: string[]) => void; maxItems: number; maxLength: number; rows?: number }) {
  const joined = value.join("\n");
  const [draft, setDraft] = useState(joined);
  useEffect(() => {
    // Follow outside changes, such as adding the suggested topics.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(joined);
  }, [joined]);
  const commit = (text: string) => {
    const lines = text.split("\n").map((l) => l.trim().slice(0, maxLength)).filter(Boolean).slice(0, maxItems);
    if (lines.join("\n") !== joined) onCommit(lines);
  };
  useEffect(() => {
    const t = setTimeout(() => commit(draft), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  return (
    <div className="flex flex-col gap-1.5 text-sm font-medium">
      <label htmlFor={id}>{label}</label>
      {help && <span className="text-xs font-normal text-muted">{help}</span>}
      <textarea id={id} value={draft} rows={rows} onChange={(e) => setDraft(e.target.value)} onBlur={() => commit(draft)} className={`${inputClass} resize-y font-normal`} />
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 text-sm font-medium">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

export function InterviewEditor({ app, interview: iv, resume, aiAvailable, onChange, onRemove }: Props) {
  const [prepOpen, setPrepOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const base = `iv-${iv.id}`;
  const practice = prepOpen ? buildPracticeSet(app.job, resume?.profile ?? null, resume?.text ?? null, iv.stage) : null;

  const [ai, setAi] = useState<AiPrep | null>(null);
  const [aiState, setAiState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });

  async function tailor() {
    if (!resume) return;
    setAiState({ loading: true, error: null });
    try {
      const res = await apiFetch("/api/interview-prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job: { title: app.job.title, company: app.job.company, location: app.job.location, workMode: app.job.workMode, description: app.job.description.slice(0, 20_000) },
          resumeText: resume.text,
          profile: resume.profile,
          stage: iv.stage,
          format: iv.format,
        }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as Partial<ApiError> | null)?.error || "Practice questions could not be created.");
      setAi(((await res.json()) as { prep: AiPrep }).prep);
      setAiState({ loading: false, error: null });
    } catch (err) {
      setAiState({ loading: false, error: err instanceof Error ? err.message : "Practice questions could not be created." });
    }
  }

  const addTo = (key: "topicsToReview" | "questionsToAsk", items: string[]) => onChange({ [key]: [...new Set([...iv[key], ...items])] } as Partial<Interview>);

  return (
    <div className="space-y-4 rounded-xl border border-line p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Date and time" id={`${base}-at`}>
          <input id={`${base}-at`} type="datetime-local" value={iv.at ?? ""} onChange={(e) => onChange({ at: e.target.value || null })} className={inputClass} />
        </Field>
        <Field label="Status" id={`${base}-status`}>
          <select id={`${base}-status`} value={iv.status} onChange={(e) => onChange({ status: e.target.value as InterviewStatus })} className={inputClass}>
            {INTERVIEW_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Stage" id={`${base}-stage`}>
          <select id={`${base}-stage`} value={iv.stage} onChange={(e) => onChange({ stage: e.target.value as InterviewStage })} className={inputClass}>
            {INTERVIEW_STAGES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Format" id={`${base}-format`}>
          <select id={`${base}-format`} value={iv.format} onChange={(e) => onChange({ format: e.target.value as InterviewFormat })} className={inputClass}>
            {INTERVIEW_FORMATS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Interviewers" id={`${base}-who`}>
        <input id={`${base}-who`} value={iv.interviewers} maxLength={500} onChange={(e) => onChange({ interviewers: e.target.value })} placeholder="Names and titles" className={inputClass} />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <LinesField id={`${base}-topics`} label="Technical topics to review" help={`One per line, up to ${LIMITS.topicsMax}.`} value={iv.topicsToReview} maxItems={LIMITS.topicsMax} maxLength={LIMITS.topic} onCommit={(v) => onChange({ topicsToReview: v })} />
        <LinesField id={`${base}-asks`} label="Questions to ask" help={`One per line, up to ${LIMITS.questionsMax}.`} value={iv.questionsToAsk} maxItems={LIMITS.questionsMax} maxLength={LIMITS.question} onCommit={(v) => onChange({ questionsToAsk: v })} />
      </div>
      <Field label="Preparation notes" id={`${base}-prep`}>
        <textarea id={`${base}-prep`} value={iv.prepNotes} rows={3} maxLength={10_000} onChange={(e) => onChange({ prepNotes: e.target.value })} className={`${inputClass} resize-y`} />
      </Field>
      <Field label="Feedback after the interview" id={`${base}-feedback`}>
        <textarea id={`${base}-feedback`} value={iv.feedback} rows={3} maxLength={10_000} onChange={(e) => onChange({ feedback: e.target.value })} placeholder="How it went, what they asked, what to follow up on" className={`${inputClass} resize-y`} />
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" className={secondaryButton} onClick={() => setPrepOpen((o) => !o)} aria-expanded={prepOpen}>
          <Sparkles className="size-4" aria-hidden /> {prepOpen ? "Hide practice prompts" : "Practice prompts"}
        </button>
        {confirmRemove ? (
          <span className="inline-flex items-center gap-2 text-sm">
            Remove this interview?
            <button type="button" className="font-semibold text-danger underline" onClick={onRemove}>
              Remove
            </button>
            <button type="button" className="text-muted underline" onClick={() => setConfirmRemove(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button type="button" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-danger-bg hover:text-danger" onClick={() => setConfirmRemove(true)}>
            <Trash2 className="size-4" aria-hidden /> Remove
          </button>
        )}
      </div>

      {practice && (
        <div className="space-y-5 rounded-lg bg-surface-2 p-4">
          <p className="text-sm text-muted">{PREP_DISCLAIMER}</p>
          <PromptList title="Technical" items={practice.technical} />
          <PromptList title="Role-specific" items={practice.roleSpecific} />
          <PromptList title="Behavioural" items={practice.behavioural} />
          {practice.stories.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold">Lines from your resume to build answers on</h4>
              <ul className="mt-2 space-y-2">
                {practice.stories.map((s) => (
                  <li key={s.line} className="flex gap-2 rounded-lg bg-surface px-3 py-2 text-sm">
                    <Quote className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                    <span>{s.line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h4 className="text-sm font-semibold">Ways to structure an answer</h4>
            <ul className="mt-2 space-y-3">
              {practice.structures.map((s) => (
                <li key={s.name}>
                  <p className="text-sm font-medium">{s.name}</p>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-muted">
                    {s.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryButton} onClick={() => addTo("topicsToReview", practice.topicsToReview)}>
              Add suggested topics
            </button>
            <button type="button" className={secondaryButton} onClick={() => addTo("questionsToAsk", practice.questionsToAsk)}>
              Add suggested questions to ask
            </button>
          </div>

          {aiAvailable && resume && (
            <div className="space-y-3 border-t border-line pt-4">
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className={primaryButton} onClick={() => void tailor()} disabled={aiState.loading}>
                  {aiState.loading ? <Spinner /> : <Sparkles className="size-4" aria-hidden />} {ai ? "Tailor again with Claude" : "Tailor with Claude"}
                </button>
                <span className="text-xs text-muted">Sends the posting and your resume text to Anthropic.</span>
              </div>
              {aiState.error && <Notice tone="error">{aiState.error}</Notice>}
              {ai && (
                <div className="space-y-5">
                  <PromptList title="Claude: technical" items={ai.technical} />
                  <PromptList title="Claude: about the role" items={ai.roleSpecific} />
                  <PromptList title="Claude: behavioural" items={ai.behavioural} />
                  {ai.answerOutlines.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold">Answer outlines</h4>
                      <ul className="mt-2 space-y-4">
                        {ai.answerOutlines.map((o) => (
                          <li key={o.question}>
                            <p className="text-sm font-medium">{o.question}</p>
                            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-muted">
                              {o.outline.map((s) => (
                                <li key={s}>{s}</li>
                              ))}
                            </ol>
                            {o.evidence && (
                              <p className="mt-2 flex gap-2 rounded-lg bg-surface px-3 py-2 text-sm">
                                <Quote className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                                <span>{o.evidence}</span>
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs text-muted">Each quoted line is from your resume. Lines that were not were removed.</p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={secondaryButton} onClick={() => addTo("topicsToReview", ai.topicsToReview)}>
                      Add Claude&apos;s topics
                    </button>
                    <button type="button" className={secondaryButton} onClick={() => addTo("questionsToAsk", ai.questionsToAsk)}>
                      Add Claude&apos;s questions to ask
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PromptList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="text-sm font-semibold">{title}</h4>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {items.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ul>
    </div>
  );
}

export const interviewBadge = (i: Interview) => <Badge tone={i.status === "Completed" ? "good" : i.status === "Cancelled" ? "neutral" : "info"}>{i.status}</Badge>;
