"use client";

import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ExternalLink, Plus, Trash2, X } from "lucide-react";
import { addInterview, addNote, logContact, newInterview, removeHistoryEntry, removeInterview, updateApplication, updateInterview } from "@/lib/applications";
import { formatSalary } from "@/lib/format";
import { LIMITS } from "@/lib/limits";
import {
  APPLICATION_STATUSES,
  type Application,
  type ApplicationStatus,
  type Interview,
  type OfferDetails,
  type Recruiter,
} from "@/types/job";
import { InterviewEditor, interviewBadge } from "./InterviewEditor";
import { LinkedContacts } from "./contacts/LinkedContacts";
import { DetailContext } from "./JobDetailDialog";
import { safeUrl } from "./job-parts";
import { Badge, ScoreBadge, inputClass, primaryButton, secondaryButton } from "./ui";

export type ApplicationTab = "details" | "interviews" | "activity";

export interface ApplicationActions {
  /** Changes one application. Pass `app.job.id`. */
  onUpdate: (id: string, change: (a: Application) => Application) => void;
  onMove: (id: string, status: ApplicationStatus, opts?: { rejectionReason?: string }) => void;
  onRemove: (id: string) => void;
}

interface Props extends ApplicationActions {
  app: Application;
  initialTab?: ApplicationTab;
  onClose: () => void;
}

const EMPTY_OFFER: OfferDetails = { salary: "", bonus: "", benefits: "", startDate: null, decideBy: null, notes: "" };
const EMPTY_RECRUITER: Recruiter = { name: "", email: "", phone: "" };

function Field({ label, id, children, hint }: { label: string; id: string; children: ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5 text-sm font-medium">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
    </div>
  );
}

function Section({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h3 className="font-display text-base font-semibold">{title}</h3>
      {help && <p className="mt-0.5 text-xs text-muted">{help}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function ApplicationDialog({ app, initialTab = "details", onUpdate, onMove, onRemove, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<ApplicationTab>(initialTab);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { resumes } = useContext(DetailContext);
  const titleId = `app-${app.job.id}-title`;
  const id = app.job.id;
  const link = safeUrl(app.job.applyUrl);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  const change = (fn: (a: Application) => Application) => onUpdate(id, fn);
  const update = (patch: Partial<Application>) => change((a) => updateApplication(a, patch));
  const interviews = app.interviews ?? [];
  const history = app.history ?? [];

  const tabs: { id: ApplicationTab; label: string }[] = [
    { id: "details", label: "Details" },
    { id: "interviews", label: `Interviews${interviews.length ? ` (${interviews.length})` : ""}` },
    { id: "activity", label: `Activity${history.length ? ` (${history.length})` : ""}` },
  ];

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
      className="m-auto w-[min(52rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-ink"
    >
      <header className="sticky top-0 z-10 border-b border-line bg-surface">
        <div className="flex items-start justify-between gap-4 p-5 pb-3">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-xl font-semibold leading-snug">
              {app.job.title}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {app.job.company} · {app.job.location}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label htmlFor={`${id}-status`} className="sr-only">
                Stage
              </label>
              <select id={`${id}-status`} value={app.status} onChange={(e) => onMove(id, e.target.value as ApplicationStatus)} className={`${inputClass} w-auto py-1.5 font-medium`}>
                {APPLICATION_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              {link && (
                <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline">
                  Open job posting <ExternalLink className="size-4" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2">
            {app.job.match && <ScoreBadge score={app.job.match.score} source={app.job.match.source} />}
            <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink">
              <X className="size-5" aria-hidden />
            </button>
          </div>
        </div>
        <div role="tablist" aria-label="Application sections" className="flex gap-1 px-3">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold ${tab === t.id ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div role="tabpanel" className="p-5">
        {tab === "details" && (
          <div className="space-y-8">
            <Section title="Contacts" help="Recruiters and hiring contacts for this job. Save them from Find recruiter, and record your networking with them.">
              <LinkedContacts app={app} />
            </Section>
            <Section title="Dates" help="These drive your reminders. Applying sets the date and a follow-up a week later, and you can change both.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Applied on" id={`${id}-applied`}>
                  <input id={`${id}-applied`} type="date" value={app.appliedAt ?? ""} onChange={(e) => update({ appliedAt: e.target.value || null })} className={inputClass} />
                </Field>
                <Field label="Follow up on" id={`${id}-follow`}>
                  <input id={`${id}-follow`} type="date" value={app.followUpDate ?? ""} onChange={(e) => update({ followUpDate: e.target.value || null })} className={inputClass} />
                </Field>
                <Field label="Apply by" id={`${id}-deadline`} hint="Shown as a reminder until you apply.">
                  <input id={`${id}-deadline`} type="date" value={app.deadline ?? ""} onChange={(e) => update({ deadline: e.target.value || null })} className={inputClass} />
                </Field>
                <Field label="Expect a reply by" id={`${id}-response`} hint="Shown as a reminder once you have applied.">
                  <input id={`${id}-response`} type="date" value={app.responseDue ?? ""} onChange={(e) => update({ responseDue: e.target.value || null })} className={inputClass} />
                </Field>
              </div>
            </Section>

            <Section title="Resume and cover letter">
              <div className="space-y-4">
                <Field label="Resume version used" id={`${id}-resume`}>
                  <select
                    id={`${id}-resume`}
                    value={app.resumeVersionId ?? ""}
                    onChange={(e) => {
                      const v = resumes.find((r) => r.id === e.target.value);
                      update({ resumeVersionId: v?.id ?? null, resumeName: v?.name ?? null });
                    }}
                    className={inputClass}
                  >
                    <option value="">Not recorded</option>
                    {resumes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                    {app.resumeVersionId && !resumes.some((r) => r.id === app.resumeVersionId) && <option value={app.resumeVersionId}>{app.resumeName ?? "Deleted version"} (no longer saved)</option>}
                  </select>
                </Field>
                <Field label="Cover letter" id={`${id}-cover`}>
                  <textarea id={`${id}-cover`} value={app.coverLetter ?? ""} rows={7} maxLength={20_000} onChange={(e) => update({ coverLetter: e.target.value })} className={`${inputClass} resize-y`} />
                </Field>
              </div>
            </Section>

            <Section title="Recruiter" help="Who you are dealing with.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {(["name", "email", "phone"] as const).map((k) => (
                  <Field key={k} label={k === "name" ? "Name" : k === "email" ? "Email" : "Phone"} id={`${id}-rec-${k}`}>
                    <input
                      id={`${id}-rec-${k}`}
                      type={k === "email" ? "email" : k === "phone" ? "tel" : "text"}
                      value={(app.recruiter ?? EMPTY_RECRUITER)[k]}
                      maxLength={k === "phone" ? LIMITS.phone : LIMITS.name}
                      onChange={(e) => update({ recruiter: { ...(app.recruiter ?? EMPTY_RECRUITER), [k]: e.target.value } })}
                      className={inputClass}
                    />
                  </Field>
                ))}
              </div>
            </Section>

            <Section title="Pay">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Posted salary" id={`${id}-posted-pay`}>
                  <input id={`${id}-posted-pay`} value={formatSalary(app.job.salary)} readOnly className={`${inputClass} text-muted`} />
                </Field>
                <Field label="Your salary expectation" id={`${id}-expect`}>
                  <input id={`${id}-expect`} value={app.salaryExpectation ?? ""} maxLength={200} onChange={(e) => update({ salaryExpectation: e.target.value })} placeholder="$125,000 to $140,000" className={inputClass} />
                </Field>
              </div>
            </Section>

            {(app.status === "Offer" || app.offer) && (
              <Section title="Offer" help="Record what you were offered and when you must answer.">
                {app.offer ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {(["salary", "bonus"] as const).map((k) => (
                      <Field key={k} label={k === "salary" ? "Salary offered" : "Bonus"} id={`${id}-offer-${k}`}>
                        <input id={`${id}-offer-${k}`} value={app.offer![k]} maxLength={200} onChange={(e) => update({ offer: { ...app.offer!, [k]: e.target.value } })} className={inputClass} />
                      </Field>
                    ))}
                    <Field label="Start date" id={`${id}-offer-start`}>
                      <input id={`${id}-offer-start`} type="date" value={app.offer.startDate ?? ""} onChange={(e) => update({ offer: { ...app.offer!, startDate: e.target.value || null } })} className={inputClass} />
                    </Field>
                    <Field label="Decide by" id={`${id}-offer-decide`} hint="Shown as a reminder.">
                      <input id={`${id}-offer-decide`} type="date" value={app.offer.decideBy ?? ""} onChange={(e) => update({ offer: { ...app.offer!, decideBy: e.target.value || null } })} className={inputClass} />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="Benefits" id={`${id}-offer-benefits`}>
                        <textarea id={`${id}-offer-benefits`} value={app.offer.benefits} rows={2} maxLength={2000} onChange={(e) => update({ offer: { ...app.offer!, benefits: e.target.value } })} className={`${inputClass} resize-y`} />
                      </Field>
                    </div>
                    <div className="sm:col-span-2">
                      <Field label="Offer notes" id={`${id}-offer-notes`}>
                        <textarea id={`${id}-offer-notes`} value={app.offer.notes} rows={2} maxLength={5000} onChange={(e) => update({ offer: { ...app.offer!, notes: e.target.value } })} className={`${inputClass} resize-y`} />
                      </Field>
                    </div>
                  </div>
                ) : (
                  <button type="button" className={secondaryButton} onClick={() => update({ offer: EMPTY_OFFER })}>
                    <Plus className="size-4" aria-hidden /> Add offer details
                  </button>
                )}
              </Section>
            )}

            {(app.status === "Rejected" || app.rejectionReason) && (
              <Section title="Rejection">
                <Field label="Reason given" id={`${id}-reject`} hint="If they told you. Leave blank if not.">
                  <textarea id={`${id}-reject`} value={app.rejectionReason ?? ""} rows={2} maxLength={2000} onChange={(e) => update({ rejectionReason: e.target.value })} className={`${inputClass} resize-y`} />
                </Field>
              </Section>
            )}

            <Section title="Notes">
              <label htmlFor={`${id}-notes`} className="sr-only">
                Notes
              </label>
              <textarea id={`${id}-notes`} value={app.notes} rows={4} maxLength={10_000} onChange={(e) => update({ notes: e.target.value })} className={`${inputClass} resize-y`} />
            </Section>
          </div>
        )}

        {tab === "interviews" && (
          <div className="space-y-5">
            {interviews.length === 0 && <p className="text-sm text-muted">No interviews yet. Add one when you have a date, or to start preparing.</p>}
            <InterviewList app={app} onChange={change} />
            <button type="button" className={primaryButton} onClick={() => change((a) => addInterview(a, newInterview()))}>
              <Plus className="size-4" aria-hidden /> Add an interview
            </button>
          </div>
        )}

        {tab === "activity" && <ActivityTab app={app} onChange={change} />}
      </div>

      <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface p-4">
        {confirmRemove ? (
          <span className="inline-flex items-center gap-3 text-sm">
            Stop tracking this job and delete its history?
            <button type="button" className="font-semibold text-danger underline" onClick={() => onRemove(id)}>
              Delete
            </button>
            <button type="button" className="text-muted underline" onClick={() => setConfirmRemove(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button type="button" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-danger-bg hover:text-danger" onClick={() => setConfirmRemove(true)}>
            <Trash2 className="size-4" aria-hidden /> Remove application
          </button>
        )}
        <button type="button" className={secondaryButton} onClick={() => dialog.current?.close()}>
          Done
        </button>
      </footer>
    </dialog>
  );
}

function InterviewList({ app, onChange }: { app: Application; onChange: (fn: (a: Application) => Application) => void }) {
  const { resumes, resume: active, aiAvailable } = useContext(DetailContext);
  const used = resumes.find((r) => r.id === app.resumeVersionId) ?? active;
  const sorted = [...(app.interviews ?? [])].sort((a, b) => (a.at ?? "9999").localeCompare(b.at ?? "9999"));
  return (
    <ul className="space-y-4">
      {sorted.map((iv: Interview) => (
        <li key={iv.id}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-display text-base font-semibold">{iv.stage}</span>
            {interviewBadge(iv)}
            <span className="text-sm text-muted">{iv.at ? iv.at.replace("T", " at ") : "Time not set"}</span>
          </div>
          <InterviewEditor
            app={app}
            interview={iv}
            resume={used}
            aiAvailable={aiAvailable}
            onChange={(patch) => onChange((a) => updateInterview(a, iv.id, patch))}
            onRemove={() => onChange((a) => removeInterview(a, iv.id))}
          />
        </li>
      ))}
    </ul>
  );
}

const KIND_LABEL = { created: "Added", status: "Stage", note: "Note", contact: "Contact", interview: "Interview", edit: "Change" } as const;
const KIND_TONE = { created: "neutral", status: "brand", note: "info", contact: "good", interview: "warn", edit: "neutral" } as const;

function ActivityTab({ app, onChange }: { app: Application; onChange: (fn: (a: Application) => Application) => void }) {
  const [text, setText] = useState("");
  const [newestFirst, setNewestFirst] = useState(false);
  const entries = [...(app.history ?? [])];
  if (newestFirst) entries.reverse();

  return (
    <div className="space-y-6">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <label htmlFor={`${app.job.id}-log`} className="text-sm font-medium">
          Add to the history
        </label>
        <textarea id={`${app.job.id}-log`} value={text} rows={3} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="A call with the recruiter, an email you sent, something you noticed" className={`${inputClass} resize-y`} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primaryButton} disabled={!text.trim()} onClick={() => (onChange((a) => addNote(a, text)), setText(""))}>
            Add note
          </button>
          <button type="button" className={secondaryButton} disabled={!text.trim()} onClick={() => (onChange((a) => logContact(a, text)), setText(""))}>
            Log a contact
          </button>
        </div>
      </form>

      <div>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-base font-semibold">History</h3>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={newestFirst} onChange={(e) => setNewestFirst(e.target.checked)} className="size-4 accent-[var(--brand)]" />
            Newest first
          </label>
        </div>
        {entries.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing recorded yet.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {entries.map((h) => (
              <li key={h.id} className="flex gap-3 text-sm">
                <div className="w-36 shrink-0 text-xs text-muted">
                  <time dateTime={h.at}>{new Date(h.at).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}</time>
                </div>
                <div className="min-w-0 flex-1">
                  <Badge tone={KIND_TONE[h.kind]}>{KIND_LABEL[h.kind]}</Badge>
                  <p className="mt-1 whitespace-pre-line">{h.text}</p>
                </div>
                {(h.kind === "note" || h.kind === "contact") && (
                  <button type="button" aria-label="Delete this entry" className="self-start rounded p-1 text-muted hover:bg-danger-bg hover:text-danger" onClick={() => onChange((a) => removeHistoryEntry(a, h.id))}>
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
