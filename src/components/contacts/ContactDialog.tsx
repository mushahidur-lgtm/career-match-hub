"use client";

import { Check, Copy, Mail, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { todayLocal } from "@/lib/applications";
import { jobKey } from "@/lib/backup";
import { DRAFT_LABELS, buildDraft, suggestApproach, type Draft, type DraftKind } from "@/lib/contacts/drafts";
import { mailtoLink } from "@/lib/contacts/links";
import { defaultFollowUp, isLinkedInProfile, isSeniorHr, newActivity, possibleDuplicates, priorContact, relevanceFor } from "@/lib/contacts/model";
import {
  ACTIVITY_TYPES,
  CONTACT_LIMITS as L,
  CONTACT_TYPES,
  NETWORK_STAGES,
  type ActivityType,
  type Contact,
  type ContactType,
  type NetworkStage,
} from "@/types/contacts";
import { Notice, inputClass, primaryButton, secondaryButton } from "../ui";
import { useContacts } from "./context";
import { Cautions, ContactLinks, Evidence, StatusBadge, confidenceText } from "./parts";
import { Modal } from "./RecruiterDialog";

const SEND_ACTIVITY: Record<DraftKind, ActivityType> = { connection: "Connection request sent", intro: "Message sent", "follow-up": "Follow-up sent", email: "Email sent" };

function Field({ id, label, children, hint }: { id: string; label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5 text-sm font-medium">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
    </div>
  );
}

export function ContactDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const api = useContacts();
  const c = api.store.contacts.find((x) => x.id === id);
  const [linkedinDraft, setLinkedinDraft] = useState<string | null>(null);
  const [linkedinError, setLinkedinError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!c) return null;

  const dupes = possibleDuplicates(api.store.contacts, c);
  const linkedApps = api.applications.filter((a) => c.applicationJobIds.includes(a.job.id));
  const linkable = api.applications.filter((a) => !c.applicationJobIds.includes(a.job.id));
  const set = (patch: Partial<Contact>) => api.update(c.id, patch);

  return (
    <Modal titleId={`contact-${c.id}`} title={c.name} subtitle={`${c.title || "Title not confirmed"} · ${c.company}`} onClose={onClose}>
      <div className="space-y-8">
        <section aria-label="Verification" className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={c.status} />
            <span className="text-sm text-muted">{c.origin === "manual" ? "Added by you." : confidenceText(c)} Last checked {c.lastVerifiedAt}.</span>
            {c.status !== "Verified" && (
              <button type="button" className={secondaryButton} onClick={() => api.verify(c.id)}>
                <Check className="size-4" aria-hidden /> I checked this myself
              </button>
            )}
          </div>
          <Cautions contact={c} />
          <ContactLinks contact={c} />
          {dupes.length > 0 && (
            <Notice tone="warn">
              This may be the same person as{" "}
              {dupes.map((d, i) => (
                <span key={d.id}>
                  {i > 0 && ", "}
                  <button type="button" className="font-semibold underline" onClick={() => api.openContact(d.id)}>
                    {d.name}
                  </button>
                </span>
              ))}
              . They were not merged, because two people at one employer can share a name.
            </Notice>
          )}
        </section>

        <section aria-label="Where this comes from" className="space-y-2">
          <h3 className="font-display text-base font-semibold">Sources</h3>
          <Evidence contact={c} />
          {c.sources.length === 0 && <p className="text-sm text-muted">No source is recorded for this contact.</p>}
        </section>

        <section aria-label="Details" className="space-y-3">
          <h3 className="font-display text-base font-semibold">Details</h3>
          <p className="text-xs text-muted">You can correct anything here. Edits are yours; the sources above stay as they were found.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field id="c-name" label="Name">
              <input id="c-name" className={inputClass} maxLength={L.name} value={c.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field id="c-title" label="Current title">
              <input id="c-title" className={inputClass} maxLength={L.title} value={c.title} onChange={(e) => set({ title: e.target.value })} />
            </Field>
            <Field id="c-company" label="Company">
              <input id="c-company" className={inputClass} maxLength={L.company} value={c.company} onChange={(e) => set({ company: e.target.value })} />
            </Field>
            <Field id="c-dept" label="Department">
              <input id="c-dept" className={inputClass} maxLength={L.department} value={c.department} onChange={(e) => set({ department: e.target.value })} />
            </Field>
            <Field id="c-type" label="Kind of contact">
              <select id="c-type" className={inputClass} value={c.type} onChange={(e) => set({ type: e.target.value as ContactType })}>
                {CONTACT_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field id="c-li" label="Public LinkedIn profile address" hint={linkedinError ?? "Only a public profile address, for example https://www.linkedin.com/in/name."}>
              <input
                id="c-li"
                className={inputClass}
                maxLength={L.url}
                value={linkedinDraft ?? c.linkedinUrl ?? ""}
                onChange={(e) => setLinkedinDraft(e.target.value)}
                onBlur={() => {
                  if (linkedinDraft === null) return;
                  const v = linkedinDraft.trim();
                  if (!v) set({ linkedinUrl: null });
                  else if (isLinkedInProfile(v)) set({ linkedinUrl: v });
                  else {
                    setLinkedinError("That is not a public LinkedIn profile address, so it was not saved.");
                    setLinkedinDraft(null);
                    return;
                  }
                  setLinkedinError(null);
                  setLinkedinDraft(null);
                }}
              />
            </Field>
            <Field id="c-email" label="Business email" hint="Only an address that is publicly listed for them.">
              <input id="c-email" type="email" className={inputClass} maxLength={L.email} value={c.businessEmail ?? ""} onChange={(e) => set({ businessEmail: e.target.value.trim() || null })} />
            </Field>
            <Field id="c-phone" label="Business phone">
              <input id="c-phone" className={inputClass} maxLength={L.phone} value={c.businessPhone ?? ""} onChange={(e) => set({ businessPhone: e.target.value.trim() || null })} />
            </Field>
          </div>
        </section>

        <section aria-label="Jobs and applications" className="space-y-3">
          <h3 className="font-display text-base font-semibold">Jobs and applications</h3>
          {c.jobs.length === 0 ? (
            <p className="text-sm text-muted">Not linked to a job yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {c.jobs.map((j) => (
                <li key={j.jobKey}>
                  <span className="font-medium">{j.jobTitle}</span> at {j.company}
                  {j.location ? `, ${j.location}` : ""} <span className="text-muted">· {j.relationship}, relevance {j.relevance} of 100</span>
                </li>
              ))}
            </ul>
          )}
          {linkedApps.length > 0 && (
            <ul className="space-y-1 text-sm">
              {linkedApps.map((a) => (
                <li key={a.job.id} className="flex flex-wrap items-center gap-2">
                  <span>
                    Linked application: <span className="font-medium">{a.job.title}</span> ({a.status})
                  </span>
                  <button type="button" className="text-xs font-semibold underline" onClick={() => api.unlinkApp(c.id, a.job.id)}>
                    Unlink
                  </button>
                </li>
              ))}
            </ul>
          )}
          {linkable.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label htmlFor="c-link">Link to an application</label>
              <select
                id="c-link"
                className={`${inputClass} w-auto`}
                value=""
                onChange={(e) => {
                  const app = linkable.find((a) => a.job.id === e.target.value);
                  if (!app) return;
                  api.linkApp(c.id, app.job.id, {
                    jobKey: jobKey(app.job),
                    jobTitle: app.job.title,
                    company: app.job.company,
                    location: app.job.location,
                    relationship: c.type,
                    relevance: relevanceFor({ type: c.type, title: c.title, department: c.department, jobTitle: app.job.title, jobSpecific: false, senior: isSeniorHr(c.title) }),
                  });
                }}
              >
                <option value="">Choose…</option>
                {linkable.map((a) => (
                  <option key={a.job.id} value={a.job.id}>
                    {a.job.title} at {a.job.company}
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>

        <section aria-label="Networking" className="space-y-4">
          <h3 className="font-display text-base font-semibold">Networking</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field id="c-stage" label="Stage">
              <select id="c-stage" className={inputClass} value={c.stage} onChange={(e) => set({ stage: e.target.value as NetworkStage })}>
                {NETWORK_STAGES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field id="c-follow" label="Next follow-up">
              <input id="c-follow" type="date" className={inputClass} value={c.nextFollowUp ?? ""} onChange={(e) => set({ nextFollowUp: e.target.value || null })} />
            </Field>
          </div>
          <Field id="c-notes" label="Notes">
            <textarea id="c-notes" rows={3} className={`${inputClass} resize-y`} maxLength={L.notes} value={c.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
          <ActivityLog contact={c} />
          <Assistant contact={c} />
        </section>

        <section aria-label="Remove" className="border-t border-line pt-4">
          {!confirmDelete ? (
            <button type="button" className={secondaryButton} onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" aria-hidden /> Delete this contact
            </button>
          ) : (
            <span role="alert" className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">Delete {c.name} and everything recorded about them? This cannot be undone, and it stays deleted if you sync other devices.</span>
              <button
                type="button"
                className={primaryButton}
                onClick={() => {
                  api.remove(c.id);
                  onClose();
                }}
              >
                Yes, delete
              </button>
              <button type="button" className={secondaryButton} onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
            </span>
          )}
        </section>
      </div>
    </Modal>
  );
}

function ActivityLog({ contact: c }: { contact: Contact }) {
  const api = useContacts();
  const [type, setType] = useState<ActivityType>("Connection request sent");
  const [date, setDate] = useState(todayLocal());
  const [notes, setNotes] = useState("");
  const [follow, setFollow] = useState("");
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold">Record what happened</h4>
      <p className="text-xs text-muted">Only what you record here counts as having happened. Drafts and reminders rely on it.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Field id="a-type" label="What">
          <select id="a-type" className={inputClass} value={type} onChange={(e) => setType(e.target.value as ActivityType)}>
            {ACTIVITY_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field id="a-date" label="Date">
          <input id="a-date" type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field id="a-follow" label="Follow up on (optional)">
          <input id="a-follow" type="date" className={inputClass} value={follow} onChange={(e) => setFollow(e.target.value)} />
        </Field>
        <Field id="a-notes" label="Notes">
          <input id="a-notes" className={inputClass} maxLength={L.activityNotes} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={primaryButton}
          onClick={() => {
            api.log(c.id, newActivity({ type, date, notes, nextFollowUp: follow || null, jobKey: c.jobs[0]?.jobKey ?? null }));
            setNotes("");
            setFollow("");
          }}
        >
          Record
        </button>
        <button type="button" className="text-sm underline" onClick={() => setFollow(defaultFollowUp())}>
          Set follow-up for a week from today
        </button>
      </div>
      {c.activities.length > 0 && (
        <ul className="divide-y divide-line text-sm">
          {[...c.activities].reverse().map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-medium">{a.type}</span> · {a.date}
                {a.nextFollowUp ? ` · follow up ${a.nextFollowUp}` : ""}
                {a.notes ? <span className="text-muted"> · {a.notes}</span> : null}
              </span>
              <button type="button" className="text-xs font-semibold underline" onClick={() => api.removeActivity(c.id, a.id)} aria-label={`Remove: ${a.type} on ${a.date}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Assistant({ contact: c }: { contact: Contact }) {
  const api = useContacts();
  const [kind, setKind] = useState<DraftKind>("connection");
  const [jobIdx, setJobIdx] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = c.jobs[jobIdx] ?? null;
  const app = useMemo(() => (link ? api.applications.find((a) => jobKey(a.job) === link.jobKey) : undefined), [api.applications, link]);
  const djob = { title: link?.jobTitle ?? "", company: link?.company ?? c.company, description: app?.job.description || (link ? api.descriptionFor(link.jobKey) : "") };
  const appliedAt = app?.appliedAt ?? null;
  const prior = priorContact(c);

  const show = (d: Draft) => {
    setDraft(d);
    setText(d.body);
    setSubject(d.subject ?? "");
  };
  const write = () => {
    setNote(null);
    show(buildDraft({ kind, contact: c, job: djob, profile: api.profile, appliedAt }));
  };

  async function writeWithAi() {
    setBusy(true);
    setNote(null);
    try {
      const token = await api.getToken();
      const res = await fetch("/api/networking-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ kind, contact: { name: c.name, title: c.title, company: c.company, activities: c.activities }, job: djob, profile: api.profile, resumeText: api.resumeText, appliedAt }),
      });
      const body = (await res.json().catch(() => null)) as { draft?: { kind: DraftKind; subject: string | null; body: string; ai: boolean } | null; note?: string; error?: string } | null;
      if (!res.ok || !body) throw new Error(body?.error || "The draft could not be written.");
      if (body.draft) show({ ...body.draft, notes: ["Written by AI from your resume and this job. Read it carefully: it is checked against what is recorded, but you are responsible for what you send."], ai: true });
      else {
        write();
        setNote(body.note ?? "The AI draft could not be used, so the built-in draft is shown.");
      }
    } catch (err) {
      write();
      setNote(`${err instanceof Error ? err.message : "The AI draft failed."} The built-in draft is shown instead.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-line p-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="size-4 text-brand" aria-hidden /> Networking assistant
      </h4>
      <p className="text-xs text-muted">
        This app never sends anything. It writes a draft for you to read, change, copy and send yourself. It states only what is true: {prior.requested || prior.messaged ? "contact you have recorded" : "no contact with this person is recorded, so drafts will not claim any"}.
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {suggestApproach(c).map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field id="d-kind" label="Write a">
          <select id="d-kind" className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as DraftKind)}>
            {(Object.keys(DRAFT_LABELS) as DraftKind[]).map((k) => (
              <option key={k} value={k}>
                {DRAFT_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        {c.jobs.length > 0 && (
          <Field id="d-job" label="About the job">
            <select id="d-job" className={inputClass} value={jobIdx} onChange={(e) => setJobIdx(Number(e.target.value))}>
              {c.jobs.map((j, i) => (
                <option key={j.jobKey} value={i}>
                  {j.jobTitle} at {j.company}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      {c.jobs.length === 0 && <Notice tone="info">This contact is not linked to a job, so the draft cannot mention one. Link a job or application above for a better draft.</Notice>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primaryButton} onClick={write} disabled={c.jobs.length === 0}>
          Write draft
        </button>
        {api.aiAvailable && (
          <button type="button" className={secondaryButton} onClick={() => void writeWithAi()} disabled={busy || c.jobs.length === 0}>
            {busy ? "Writing…" : "Write with AI"}
          </button>
        )}
      </div>
      {note && <Notice tone="warn">{note}</Notice>}
      {draft && (
        <div className="space-y-3">
          {draft.ai && <p className="text-xs font-semibold text-muted">AI-written. Review before sending.</p>}
          {draft.notes.map((n) => (
            <p key={n} className="text-xs text-muted">
              {n}
            </p>
          ))}
          {draft.subject !== null && (
            <Field id="d-subject" label="Subject">
              <input id="d-subject" className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} />
            </Field>
          )}
          <Field id="d-body" label="Message" hint={kind === "connection" ? `${text.length} characters` : undefined}>
            <textarea id="d-body" rows={9} className={`${inputClass} resize-y`} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                void navigator.clipboard?.writeText(subject ? `Subject: ${subject}\n\n${text}` : text).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
            >
              <Copy className="size-4" aria-hidden /> {copied ? "Copied" : "Copy"}
            </button>
            {c.businessEmail && kind !== "connection" && (
              <a href={mailtoLink(c.businessEmail, subject, text)} className={secondaryButton}>
                <Mail className="size-4" aria-hidden /> Open in my email app
              </a>
            )}
            <button
              type="button"
              className={secondaryButton}
              onClick={() => api.log(c.id, newActivity({ type: SEND_ACTIVITY[kind], jobKey: link?.jobKey ?? null, nextFollowUp: defaultFollowUp(), notes: "Sent by me" }))}
            >
              I sent this
            </button>
          </div>
          <p className="text-xs text-muted">&ldquo;I sent this&rdquo; records it, moves the stage forward and sets a follow-up for a week from today. Press it only after you have really sent the message.</p>
        </div>
      )}
    </div>
  );
}
