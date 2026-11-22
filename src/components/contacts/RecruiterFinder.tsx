"use client";

import { LayoutGrid, Plus, Rows3, Search, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { jobKey } from "@/lib/backup";
import { NO_FILTER, byRecent, filterContacts, type ContactFilter } from "@/lib/contacts/filter";
import { contactReminders, sameContact } from "@/lib/contacts/model";
import { CONTACT_TYPES, NETWORK_STAGES, type Contact } from "@/types/contacts";
import type { Job } from "@/types/job";
import { Badge, Notice, inputClass, primaryButton, secondaryButton } from "../ui";
import { AddContactDialog } from "./AddContactDialog";
import { useContacts } from "./context";
import { StatusBadge } from "./parts";

const STATUS_FILTERS = ["Verified", "Likely match", "Possible match"] as const;

/** All contacts in one place: find people for a job, search and filter what is saved, and see who needs a follow-up. */
export function RecruiterFinder({ jobs }: { jobs: Job[] }) {
  const api = useContacts();
  const [filter, setFilter] = useState<ContactFilter>(NO_FILTER);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [pick, setPick] = useState("");
  const [adding, setAdding] = useState(false);
  const { contacts, finds } = api.store;

  const filtered = useMemo(() => filterContacts(contacts, filter).sort(byRecent), [contacts, filter]);
  const reminders = useMemo(() => contactReminders(contacts), [contacts]);
  // Findings from lookups that have not been saved yet.
  const recent = useMemo(
    () =>
      finds
        .flatMap((f) => f.candidates.map((c) => ({ c, at: f.at, jobTitle: f.jobTitle })))
        .filter(({ c }) => !contacts.some((s) => sameContact(s, c)))
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 8),
    [finds, contacts],
  );
  const jobOptions = useMemo(() => {
    const seen = new Set<string>();
    return jobs.filter((j) => (seen.has(jobKey(j)) ? false : (seen.add(jobKey(j)), true)));
  }, [jobs]);
  const filtering = filter.query || filter.type !== "All" || filter.status !== "All" || filter.stage !== "All";
  const set = <K extends keyof ContactFilter>(k: K, v: ContactFilter[K]) => setFilter((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">HR &amp; Recruiter Finder</h1>
        <p className="mt-1 max-w-prose text-sm text-muted">Find the people publicly tied to hiring for a job, keep the ones that matter, and track your networking with them.</p>
      </div>

      <Notice tone="info">
        Every contact shown comes with the source that names them, and anything the app could not confirm is labelled. It never guesses names, emails or profile links, and it never sends a message for you.
      </Notice>

      <section aria-label="Find contacts for a job" className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <h2 className="font-display text-lg font-semibold">Find contacts for a job</h2>
        {jobOptions.length === 0 ? (
          <p className="text-sm text-muted">Search for jobs, or track one in My applications, and it will appear here. You can also open Find recruiter on any job card.</p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-medium">
              <label htmlFor="finder-job">Job</label>
              <select id="finder-job" className={inputClass} value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Choose a job…</option>
                {jobOptions.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title} at {j.company}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className={primaryButton} disabled={!pick} onClick={() => api.openFinder(jobOptions.find((j) => j.id === pick)!)}>
              <Search className="size-4" aria-hidden /> Find recruiter
            </button>
          </div>
        )}
        <button type="button" className={secondaryButton} onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden /> Add a contact I found myself
        </button>
      </section>

      {reminders.length > 0 && (
        <section aria-label="Follow-ups" className="space-y-2">
          <h2 className="font-display text-lg font-semibold">Follow-ups</h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {reminders.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <button type="button" className="text-left font-medium hover:underline" onClick={() => api.openContact(r.contactId)}>
                  {r.label}
                </button>
                <Badge tone={r.overdue ? "warn" : "neutral"}>{r.when}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Saved contacts" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">
            Saved contacts <span className="text-sm font-normal text-muted">({filtering ? `${filtered.length} of ${contacts.length}` : contacts.length})</span>
          </h2>
          <div role="group" aria-label="View" className="inline-flex overflow-hidden rounded-lg border border-line text-sm">
            {(["cards", "table"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 font-medium ${view === v ? "bg-brand text-on-brand" : "bg-surface hover:bg-surface-2"}`}>
                {v === "cards" ? <LayoutGrid className="size-4" aria-hidden /> : <Rows3 className="size-4" aria-hidden />} {v === "cards" ? "Cards" : "Table"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5 text-sm font-medium lg:col-span-2">
            <label htmlFor="f-q">Search by name, company, job title or location</label>
            <input id="f-q" className={inputClass} value={filter.query} onChange={(e) => set("query", e.target.value)} placeholder="For example: ottawa recruiter" />
          </div>
          <div className="flex flex-col gap-1.5 text-sm font-medium">
            <label htmlFor="f-type">Kind of contact</label>
            <select id="f-type" className={inputClass} value={filter.type} onChange={(e) => set("type", e.target.value as ContactFilter["type"])}>
              <option>All</option>
              {CONTACT_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5 text-sm font-medium">
            <label htmlFor="f-status">Verification</label>
            <select id="f-status" className={inputClass} value={filter.status} onChange={(e) => set("status", e.target.value as ContactFilter["status"])}>
              <option>All</option>
              {STATUS_FILTERS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2 lg:col-span-1">
            <label htmlFor="f-stage">Networking stage</label>
            <select id="f-stage" className={inputClass} value={filter.stage} onChange={(e) => set("stage", e.target.value as ContactFilter["stage"])}>
              <option>All</option>
              {NETWORK_STAGES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          {filtering && (
            <button type="button" className={`${secondaryButton} self-end`} onClick={() => setFilter(NO_FILTER)}>
              Clear filters
            </button>
          )}
        </div>

        {contacts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line px-6 py-10">
            <h3 className="font-display text-base font-semibold">No saved contacts yet</h3>
            <p className="mt-2 max-w-prose text-sm text-muted">Use Find recruiter on a job, or add someone you found yourself. Nothing is shown here until you save it.</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-6 py-8 text-sm text-muted">No saved contact matches these filters.</p>
        ) : view === "cards" ? (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {filtered.map((c) => (
              <li key={c.id}>
                <ContactCard contact={c} onOpen={() => api.openContact(c.id)} />
              </li>
            ))}
          </ul>
        ) : (
          <ContactTable list={filtered} onOpen={(id) => api.openContact(id)} />
        )}
      </section>

      {recent.length > 0 && (
        <section aria-label="Recently discovered" className="space-y-2">
          <h2 className="font-display text-lg font-semibold">Recently discovered, not saved</h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {recent.map(({ c, at, jobTitle }) => (
              <li key={`${c.id}-${at}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{c.name}</span> <span className="text-muted">· {c.title || "title not confirmed"} · {c.company} · for {jobTitle}</span>
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge status={c.status} />
                  <button type="button" className={secondaryButton} onClick={() => api.saveCandidate(c)}>
                    <UserPlus className="size-4" aria-hidden /> Save
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {adding && <AddContactDialog jobs={jobOptions} onDone={(id) => { setAdding(false); api.openContact(id); }} onClose={() => setAdding(false)} />}
    </div>
  );
}

function ContactCard({ contact: c, onOpen }: { contact: Contact; onOpen: () => void }) {
  return (
    <article className="h-full space-y-2 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-display text-base font-semibold">{c.name}</h3>
          <p className="truncate text-sm text-muted">
            {c.title || "Title not confirmed"} · {c.company}
          </p>
        </div>
        <StatusBadge status={c.status} />
      </div>
      <p className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone="brand">{c.stage}</Badge>
        <span className="text-muted">{c.type}</span>
        {c.nextFollowUp && <span className="text-muted">follow up {c.nextFollowUp}</span>}
      </p>
      {c.jobs.length > 0 && (
        <p className="truncate text-xs text-muted">
          For {c.jobs[0].jobTitle}
          {c.jobs.length > 1 ? ` and ${c.jobs.length - 1} more` : ""}
        </p>
      )}
      <button type="button" className={secondaryButton} onClick={onOpen}>
        Open
      </button>
    </article>
  );
}

function ContactTable({ list, onOpen }: { list: Contact[]; onOpen: (id: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            {["Name", "Title", "Company", "Verification", "Stage", "Jobs", "Follow-up", "Checked"].map((h) => (
              <th key={h} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.map((c) => (
            <tr key={c.id} className="border-b border-line/60 last:border-0">
              <th scope="row" className="px-3 py-2 font-medium">
                <button type="button" className="text-left hover:underline" onClick={() => onOpen(c.id)}>
                  {c.name}
                </button>
              </th>
              <td className="px-3 py-2">{c.title || "Not confirmed"}</td>
              <td className="px-3 py-2">{c.company}</td>
              <td className="px-3 py-2">
                <StatusBadge status={c.status} />
              </td>
              <td className="whitespace-nowrap px-3 py-2">{c.stage}</td>
              <td className="px-3 py-2">{c.jobs.length}</td>
              <td className="whitespace-nowrap px-3 py-2">{c.nextFollowUp ?? "None"}</td>
              <td className="whitespace-nowrap px-3 py-2">{c.lastVerifiedAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
