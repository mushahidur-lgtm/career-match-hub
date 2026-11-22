"use client";

import { RefreshCw, Search, UserCheck, UserPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { contactsFromPosting } from "@/lib/contacts/extract";
import { diagnoseNoResult } from "@/lib/contacts/diagnostics";
import { researchLinks, type ResearchGroup } from "@/lib/contacts/links";
import { contactsForJob, findFor, isSeniorHr, mergeFindings, relevanceFor, sameContact } from "@/lib/contacts/model";
import { normalizeCompany } from "@/lib/dedupe";
import { newId } from "@/lib/ids";
import { jobKey } from "@/lib/backup";
import type { FindRecruiterResponse, StreamLine } from "@/app/api/find-recruiter/route";
import type { Contact, FindRecord } from "@/types/contacts";
import type { Job } from "@/types/job";
import { JobQualityPanel } from "../job-parts";
import { Notice, Spinner, primaryButton, secondaryButton } from "../ui";
import { AddContactDialog } from "./AddContactDialog";
import { useContacts } from "./context";
import { Cautions, ConfidenceLabel, ContactLinks, Evidence, confidenceText } from "./parts";

const FEE_PER_SEARCH = 0.01; // Anthropic's documented price: $10 per 1,000 web searches, plus normal token costs.

/** Reads a lookup's answer. A refusal is plain JSON; a real lookup streams one JSON object per line. */
async function readLookup(res: Response, onProgress: (m: string) => void): Promise<FindRecruiterResponse> {
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("ndjson") || !res.body) {
    const body = (await res.json().catch(() => null)) as (FindRecruiterResponse & { error?: string }) | null;
    if (!res.ok || !body || body.error) throw new Error(body?.error || "The search failed. Nothing was saved. Try again.");
    return body;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: FindRecruiterResponse | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = done ? "" : (parts.pop() ?? "");
    for (const line of done ? parts.concat(buffer ? [buffer] : []) : parts) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line) as StreamLine;
      if (msg.type === "progress") onProgress(msg.message);
      else if (msg.type === "error") throw new Error(msg.error);
      else result = msg.result;
    }
    if (done) break;
  }
  if (!result) throw new Error("The search ended without an answer. Nothing was saved. Try again.");
  return result;
}

/** Searches the person opens themselves, in their own browser. Nothing here is opened, read or collected automatically. */
function ResearchLinks({ groups }: { groups: ResearchGroup[] }) {
  if (!groups.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Search for them yourself, in your own browser</p>
      <p className="text-xs text-muted">Each link opens a search on Google, Bing or LinkedIn in a new tab. This app never opens, reads or scrapes those pages. You see the results and decide who to contact.</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {groups.map((g) => (
          <li key={g.id} className="rounded-lg border border-line p-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{g.title}</p>
            <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {g.links.map((l) => (
                <li key={l.href}>
                  <a href={l.href} target="_blank" rel="noopener noreferrer" title={`Searches for: ${l.query}`} className="text-brand underline-offset-2 hover:underline">
                    {g.links.length > 3 ? `${l.engine}: ${l.label.replace(/ on (?:Google|Bing|LinkedIn)$/, "")}` : l.engine}
                    <span className="sr-only"> ({l.label}, opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

const union = <T,>(a: T[] | undefined, b: T[] | undefined, max: number) => [...new Set([...(a ?? []), ...(b ?? [])])].slice(0, max);

/** Finds, shows and saves the people publicly tied to hiring for one job. */
export function RecruiterPanel({ job }: { job: Job }) {
  const api = useContacts();
  const key = jobKey(job);
  const find = findFor(api.store, key);
  const saved = contactsForJob(api.store, key);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const isSample = job.source === "demo";
  const companyKnown = !/^company not listed$/i.test(job.company.trim());

  // Names the posting itself states cost nothing to read, so this runs once, on first opening.
  useEffect(() => {
    if (find || isSample) return;
    api.recordFind({ id: newId(), jobKey: key, jobTitle: job.title, company: job.company, location: job.location, at: new Date().toISOString(), searched: { posting: true, web: false }, candidates: contactsFromPosting(job), note: null });
    // Only when the job changes: the lookup is cached by job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // Closing the window does not cancel a search: it keeps running on the server and is billed either way, so the result is
  // still saved when it arrives. Only the Stop button cancels it.

  /** "first" searches fresh; "more" looks for different people and adds them to what was found. */
  async function run(mode: "first" | "more") {
    setLoading(true);
    setError(null);
    setProgress([]);
    controller.current = new AbortController();
    try {
      const token = await api.getToken();
      const known = [...(find?.candidates ?? []), ...saved].map((c) => c.name);
      const pass = mode === "more" ? (find?.passes ?? 1) + 1 : 1;
      const res = await fetch("/api/find-recruiter", {
        method: "POST",
        signal: controller.current.signal,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          jobKey: key,
          title: job.title,
          company: job.company,
          location: job.location,
          applyUrl: job.applyUrl,
          source: job.source,
          category: job.category,
          description: job.description.slice(0, 3000),
          exclude: mode === "more" ? [...new Set(known)].slice(0, 20) : [],
          pass,
        }),
      });
      const body = await readLookup(res, (m) => setProgress((p) => [...p, m].slice(-8)));

      // Combine with what the posting itself gave, and (for "more") with what was found before, one entry per person.
      const merged: Contact[] = [...contactsFromPosting(job), ...(mode === "more" ? (find?.candidates ?? []) : [])];
      for (const c of body.candidates ?? []) {
        const i = merged.findIndex((m) => sameContact(m, c));
        if (i >= 0) merged[i] = mergeFindings(merged[i], c);
        else merged.push(c);
      }
      const prev = mode === "more" ? find : null;
      const record: FindRecord = {
        id: newId(),
        jobKey: key,
        jobTitle: job.title,
        company: job.company,
        location: job.location,
        at: new Date().toISOString(),
        searched: { posting: true, web: (body.searches ?? 0) > 0 || Boolean(find?.searched.web) },
        candidates: merged.sort((a, b) => (b.jobs[0]?.relevance ?? 0) - (a.jobs[0]?.relevance ?? 0) || b.confidence - a.confidence).slice(0, 8),
        note: body.note ?? null,
        queries: union(prev?.queries, body.queries, 12),
        readHosts: union(prev?.readHosts, body.readHosts, 20),
        passes: pass,
        usage: body.usage && { searches: (prev?.usage?.searches ?? 0) + body.usage.searches, fetches: (prev?.usage?.fetches ?? 0) + body.usage.fetches, inputTokens: (prev?.usage?.inputTokens ?? 0) + body.usage.inputTokens, outputTokens: (prev?.usage?.outputTokens ?? 0) + body.usage.outputTokens },
        unsupported: (prev?.unsupported ?? 0) + (body.unsupported ?? 0),
      };
      api.recordFind(record);
    } catch (err) {
      if ((err as { name?: string }).name !== "AbortError") setError(err instanceof Error ? err.message : "The search failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const isSaved = (c: Contact) => api.store.contacts.find((s) => sameContact(s, c));
  const open = find ? find.candidates : [];
  const shown = [...saved, ...open.filter((c) => !isSaved(c))];
  const webDone = Boolean(find?.searched.web);
  const nothing = find !== null && shown.length === 0;
  const canSearch = !isSample && companyKnown;
  const groups = isSample ? [] : researchLinks(job);
  const diagnosis = diagnoseNoResult(job, { webSearchRan: webDone });
  // People already saved at this employer who are not yet linked to this job can be reused instead of added again.
  const reusable = isSample
    ? []
    : api.store.contacts.filter((c) => !c.jobs.some((j) => j.jobKey === key) && normalizeCompany(c.company) === normalizeCompany(job.company));

  return (
    <div className="space-y-5">
      <Notice tone="info">
        Only publicly available professional information is used, and every person shown comes with the source that names them. Nothing is guessed, LinkedIn and other login-only sites are never read, and nothing is sent: you review and send any message yourself.
      </Notice>

      {isSample && <Notice tone="warn">This is a sample job, so it has no real contacts. Search for real jobs to find recruiters.</Notice>}
      {!companyKnown && !isSample && <Notice tone="warn">The posting does not name the employer, so there is no company to look up.</Notice>}

      {!isSample && <JobQualityPanel job={job} />}

      {canSearch && !api.webSearchAvailable && (
        <Notice tone="info">
          Free mode. This lookup reads the names, emails and phone numbers the posting itself prints, and gives you searches to run yourself. Nothing is guessed or built from a name. An AI web search can be added by the site owner, but it is not needed.
        </Notice>
      )}

      {canSearch && api.webSearchAvailable && (
        <div className="space-y-3 rounded-xl border border-line p-4">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={primaryButton} onClick={() => void run("first")} disabled={loading}>
              {loading ? <Spinner /> : <Search className="size-4" aria-hidden />}
              {webDone ? "Search again" : "Search the web for contacts"}
            </button>
            {webDone && (
              <button type="button" className={secondaryButton} onClick={() => void run("more")} disabled={loading}>
                Search for more contacts
              </button>
            )}
            {loading && (
              <button type="button" className="text-sm underline" onClick={() => controller.current?.abort()}>
                Stop
              </button>
            )}
          </div>
          <p className="text-xs text-muted">
            Runs up to 8 searches and reads up to 5 public pages, such as the company&apos;s careers and team pages. Each search costs about $0.01 in search fees, and reading pages and writing the answer uses model tokens on top, which can cost more than the searches. Results are kept so this job is not searched again unless you ask.
          </p>
          {loading && (
            <div role="status" aria-live="polite" className="space-y-1 rounded-lg bg-surface-2 p-3 text-sm">
              <p className="font-medium">Searching…</p>
              <ul className="space-y-0.5 text-xs text-muted">
                {progress.length === 0 && <li>Starting</li>}
                {progress.map((p, i) => (
                  <li key={`${i}-${p}`}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {error && (
            <Notice tone="error">
              {error}{" "}
              <button type="button" className="font-semibold underline" onClick={() => void run("first")} disabled={loading}>
                <RefreshCw className="mr-1 inline size-3.5" aria-hidden />
                Try again
              </button>
            </Notice>
          )}
        </div>
      )}

      {find?.note && !error && <Notice tone="info">{find.note}</Notice>}

      {shown.length > 0 && (
        <section aria-label="Contacts found" className="space-y-3">
          <h3 className="font-display text-base font-semibold" aria-live="polite">
            {shown.length} {shown.length === 1 ? "contact" : "contacts"} found
            <span className="ml-2 text-sm font-normal text-muted">
              {shown.filter((c) => c.status === "Verified").length} high, {shown.filter((c) => c.status === "Likely match").length} medium, {shown.filter((c) => c.status === "Possible match").length} low confidence
            </span>
          </h3>
          <ul className="space-y-4">
            {shown.map((c) => {
              const mine = isSaved(c);
              const contact = mine ?? c;
              const link = contact.jobs.find((j) => j.jobKey === key);
              return (
                <li key={contact.id} className="space-y-3 rounded-xl border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-base font-semibold">{contact.name}</p>
                      <p className="text-sm text-muted">
                        {contact.title || "Title not confirmed"} · {contact.company}
                        {contact.department ? ` · ${contact.department}` : ""}
                        {contact.location ? ` · ${contact.location}` : ""}
                      </p>
                    </div>
                    <span className="text-xs text-muted">{confidenceText(contact)}</span>
                  </div>
                  <ConfidenceLabel contact={contact} jobKey={key} />
                  <Cautions contact={contact} />
                  <ContactLinks contact={contact} />
                  <Evidence contact={contact} />
                  <p className="text-xs text-muted">
                    Found {contact.sources[0] ? new Date(contact.sources[0].discoveredAt).toLocaleDateString() : "earlier"}. Last checked {contact.lastVerifiedAt}.{link ? ` Relevance to this job ${link.relevance} of 100.` : ""}
                  </p>
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
        </section>
      )}

      {find?.usage && (
        <p className="text-xs text-muted">
          This job&apos;s searches so far: {find.usage.searches} web {find.usage.searches === 1 ? "search" : "searches"} (about ${(find.usage.searches * FEE_PER_SEARCH).toFixed(2)} in search fees), {find.usage.fetches} {find.usage.fetches === 1 ? "page" : "pages"} read, and about {Math.round(find.usage.inputTokens / 1000)}k input and {Math.round(find.usage.outputTokens / 1000)}k output tokens. The token cost is not estimated here: check your model&apos;s price in Anthropic&apos;s pricing.
        </p>
      )}

      {nothing && (
        <div className="space-y-3 rounded-xl border border-dashed border-line p-5">
          <h3 className="font-display text-base font-semibold">No verified contact found</h3>
          <div className="space-y-3 text-sm text-muted">
            <div>
              <p className="font-medium text-ink">What was checked</p>
              <ul className="list-disc pl-5">
                {diagnosis.checked.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              {webDone && find?.queries?.length ? (
                <ul className="mt-1 list-disc pl-5">
                  {find.queries.map((q) => (
                    <li key={q}>Searched: {q}</li>
                  ))}
                </ul>
              ) : null}
              {find?.readHosts?.length ? <p className="mt-1">Pages read on: {find.readHosts.join(", ")}.</p> : null}
            </div>
            <div>
              <p className="font-medium text-ink">Why nothing is shown</p>
              <ul className="list-disc pl-5">
                {diagnosis.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
                {find?.unsupported ? (
                  <li>
                    {find.unsupported} {find.unsupported === 1 ? "name was" : "names were"} suggested by the search but left out, because no page backed {find.unsupported === 1 ? "it" : "them"} up.
                  </li>
                ) : null}
              </ul>
              <p className="mt-1">Nothing was guessed, and no sample or example contacts are ever shown.</p>
            </div>
            <p className="rounded-lg bg-surface-2 p-3 text-ink">
              <span className="font-semibold">Next: </span>
              {diagnosis.next}
            </p>
          </div>
          <ResearchLinks groups={groups} />
          <div className="flex flex-wrap gap-2">
            {canSearch && api.webSearchAvailable && (
              <button type="button" className={secondaryButton} onClick={() => void run("first")} disabled={loading}>
                <RefreshCw className="size-4" aria-hidden /> Search again
              </button>
            )}
            <button type="button" className={secondaryButton} onClick={() => setAdding(true)}>
              Add a contact I found
            </button>
          </div>
        </div>
      )}

      {!nothing && (
        <div className="space-y-3">
          {groups.length > 0 && (
            <details className="rounded-lg border border-line p-3">
              <summary className="cursor-pointer text-sm font-medium">Search for more people yourself</summary>
              <div className="mt-3">
                <ResearchLinks groups={groups} />
              </div>
            </details>
          )}
          <button type="button" className="text-sm font-semibold text-brand underline-offset-2 hover:underline" onClick={() => setAdding(true)}>
            Add a contact I found myself
          </button>
        </div>
      )}

      {reusable.length > 0 && (
        <section aria-label="Contacts you already saved at this employer" className="space-y-2 rounded-xl border border-line p-4">
          <h3 className="text-sm font-semibold">Already saved at {job.company}</h3>
          <p className="text-xs text-muted">Use someone you saved for another job here too. Their notes, status and history stay as they are.</p>
          <ul className="space-y-2">
            {reusable.slice(0, 6).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted"> · {c.title || "Title not confirmed"}</span>
                </span>
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() =>
                    api.linkJob(c.id, {
                      jobKey: key,
                      jobTitle: job.title,
                      company: job.company,
                      location: job.location,
                      relationship: c.type,
                      jobSpecific: false,
                      relevance: relevanceFor({ type: c.type, title: c.title, department: c.department, jobTitle: job.title, jobSpecific: false, senior: isSeniorHr(c.title) }),
                    })
                  }
                >
                  Also use for this job
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {adding && (
        <AddContactDialog
          jobs={[job]}
          initialCompany={job.company}
          onDone={(id) => {
            setAdding(false);
            api.openContact(id);
          }}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}
