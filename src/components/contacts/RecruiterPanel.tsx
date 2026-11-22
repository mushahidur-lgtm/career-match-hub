"use client";

import { Search, UserCheck, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { contactsFromPosting } from "@/lib/contacts/extract";
import { searchLinks } from "@/lib/contacts/links";
import { contactsForJob, findFor, mergeFindings, sameContact } from "@/lib/contacts/model";
import { newId } from "@/lib/ids";
import { jobKey } from "@/lib/backup";
import type { FindRecruiterResponse } from "@/app/api/find-recruiter/route";
import type { Contact } from "@/types/contacts";
import type { Job } from "@/types/job";
import { Notice, Spinner, primaryButton, secondaryButton } from "../ui";
import { useContacts } from "./context";
import { Cautions, ContactLinks, Evidence, StatusBadge, confidenceText } from "./parts";

/** Finds, shows and saves the people publicly tied to hiring for one job. */
export function RecruiterPanel({ job }: { job: Job }) {
  const api = useContacts();
  const key = jobKey(job);
  const find = findFor(api.store, key);
  const saved = contactsForJob(api.store, key);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSample = job.source === "demo";
  const companyKnown = !/^company not listed$/i.test(job.company.trim());

  // Names the posting itself states cost nothing to read, so this runs once, on first opening.
  useEffect(() => {
    if (find || isSample) return;
    api.recordFind({ id: newId(), jobKey: key, jobTitle: job.title, company: job.company, location: job.location, at: new Date().toISOString(), searched: { posting: true, web: false }, candidates: contactsFromPosting(job), note: null });
    // Only when the job changes: the lookup is cached by job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  async function searchWeb() {
    setLoading(true);
    setError(null);
    try {
      const token = await api.getToken();
      const res = await fetch("/api/find-recruiter", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ jobKey: key, title: job.title, company: job.company, location: job.location, applyUrl: job.applyUrl, source: job.source }),
      });
      const body = (await res.json().catch(() => null)) as (Partial<FindRecruiterResponse> & { error?: string }) | null;
      if (!res.ok || !body || body.error) throw new Error(body?.error || "The search failed. Nothing was saved. Try again.");
      // Combine with what the posting itself gave, one entry per person.
      const merged: Contact[] = [...contactsFromPosting(job)];
      for (const c of body.candidates ?? []) {
        const i = merged.findIndex((m) => sameContact(m, c));
        if (i >= 0) merged[i] = mergeFindings(merged[i], c);
        else merged.push(c);
      }
      api.recordFind({
        id: newId(),
        jobKey: key,
        jobTitle: job.title,
        company: job.company,
        location: job.location,
        at: new Date().toISOString(),
        searched: { posting: true, web: true },
        candidates: merged.slice(0, 8),
        note: body.note ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The search failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const isSaved = (c: Contact) => api.store.contacts.find((s) => sameContact(s, c));
  const open = find ? find.candidates : [];
  const webDone = Boolean(find?.searched.web);
  const nothing = find !== null && !open.length && !saved.length;

  return (
    <div className="space-y-5">
      <Notice tone="info">
        Only publicly available professional information is used, and every person shown comes with the source that names them. Nothing is guessed, and nothing is sent: you review and send any message yourself.
      </Notice>

      {isSample && <Notice tone="warn">This is a sample job, so it has no real contacts. Search for real jobs to find recruiters.</Notice>}
      {!companyKnown && !isSample && <Notice tone="warn">The posting does not name the employer, so there is no company to look up.</Notice>}

      {!isSample && companyKnown && (
        <div className="space-y-2 rounded-xl border border-line p-4">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={primaryButton} onClick={() => void searchWeb()} disabled={loading || !api.aiAvailable}>
              {loading ? <Spinner /> : <Search className="size-4" aria-hidden />}
              {webDone ? "Search the web again" : "Search the web for contacts"}
            </button>
            {find && <span className="text-xs text-muted">{webDone ? `Web search last run ${new Date(find.at).toLocaleDateString()}.` : "So far, only names the posting itself states."}</span>}
          </div>
          <p className="text-xs text-muted">
            {api.aiAvailable
              ? "Uses Anthropic web search with this site's API key. Each lookup runs up to 4 searches and may cost a small fee per search (see Anthropic's pricing). Results are kept so this job is not searched again unless you ask."
              : "Web search needs an Anthropic API key on this site (ANTHROPIC_API_KEY). Without it, only names stated in the posting are shown."}
          </p>
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      )}

      {find?.note && !error && <Notice tone="info">{find.note}</Notice>}

      {(open.length > 0 || saved.length > 0) && (
        <ul className="space-y-4">
          {[...saved, ...open.filter((c) => !isSaved(c))].map((c) => {
            const mine = isSaved(c);
            const contact = mine ?? c;
            return (
              <li key={contact.id} className="space-y-3 rounded-xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-base font-semibold">{contact.name}</p>
                    <p className="text-sm text-muted">
                      {contact.title || "Title not confirmed"} · {contact.company}
                      {contact.department ? ` · ${contact.department}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={contact.status} />
                    <span className="text-xs text-muted">{confidenceText(contact)}</span>
                  </div>
                </div>
                <Cautions contact={contact} />
                <ContactLinks contact={contact} />
                <Evidence contact={contact} />
                <p className="text-xs text-muted">Last checked {contact.lastVerifiedAt}. {contact.jobs.find((j) => j.jobKey === key) ? `Relevance to this job ${contact.jobs.find((j) => j.jobKey === key)!.relevance} of 100.` : ""}</p>
                <div className="flex flex-wrap gap-2">
                  {mine ? (
                    <button type="button" className={secondaryButton} onClick={() => api.openContact(mine.id)}>
                      <UserCheck className="size-4" aria-hidden /> Saved. Open
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={primaryButton}
                      onClick={() => {
                        const r = api.saveCandidate(contact);
                        if (!r.saved) setError("You have reached the limit of saved contacts. Delete some first.");
                        else if (r.possibleDuplicates.length) setError(`Saved. Note: ${r.possibleDuplicates[0].name} is already saved and may be the same person. Compare them in the HR & Recruiter Finder.`);
                      }}
                    >
                      <UserPlus className="size-4" aria-hidden /> Save contact
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {nothing && (
        <div className="space-y-3 rounded-xl border border-dashed border-line p-5">
          <h3 className="font-display text-base font-semibold">No reliable contact found</h3>
          <p className="max-w-prose text-sm text-muted">
            Nobody was found whom a source ties to this job. Nothing was guessed. You can look yourself, using these searches in your own browser (they open LinkedIn and Google, where you stay signed in to your own account), then add anyone you find under HR &amp; Recruiter Finder.
          </p>
          <ul className="space-y-1 text-sm">
            {searchLinks(job.company, job.title).map((l) => (
              <li key={l.href}>
                <a href={l.href} target="_blank" rel="noopener noreferrer" className="text-brand underline-offset-2 hover:underline">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
