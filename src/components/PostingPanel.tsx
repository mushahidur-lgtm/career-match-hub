"use client";

import { useState } from "react";
import { applyCheck, DESCRIPTION_LABEL, VERIFICATION_LABEL } from "@/lib/jobs/apply-check";
import type { JobCheck } from "@/lib/jobs/check";
import type { MatchInput } from "@/lib/matching/engine";
import type { ApiError, Job } from "@/types/job";
import { useContacts } from "./contacts/context";
import { safeUrl } from "./job-parts";
import { Badge, Notice, Spinner, secondaryButton } from "./ui";

const SOURCE = { provider: "the job board", provider_detail: "the job board's full posting", json_ld: "the employer's page (structured data)", employer_page: "the employer's page" } as const;
const when = (iso: string) => new Date(iso).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });

interface Props {
  job: Job;
  input: MatchInput | null;
  aiAvailable: boolean;
  onChecked: (job: Job) => void;
}

/** Whether the job still looks open and how much of it we have. Kept apart from the match score. */
export function PostingPanel({ job, input, aiAvailable, onChecked }: Props) {
  const [state, setState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });
  const { getToken } = useContacts();
  const v = job.verification;
  const e = job.enrichment;
  const apply = safeUrl(job.applyUrl);
  const link = safeUrl(v?.finalUrl ?? null);

  async function check() {
    setState({ loading: true, error: null });
    try {
      // Sites with sign-in configured require it for this check.
      const token = await getToken();
      const res = await fetch("/api/job-check", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          job: { id: job.id, title: job.title, company: job.company, source: job.source, applyUrl: job.applyUrl, description: job.description.slice(0, 60_000), descriptionTruncated: job.descriptionTruncated, postedAt: job.postedAt },
        }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as Partial<ApiError> | null)?.error || "The posting could not be checked.");
      onChecked(applyCheck(job, (await res.json()) as JobCheck, input, aiAvailable));
      setState({ loading: false, error: null });
    } catch (err) {
      setState({ loading: false, error: err instanceof Error ? err.message : "The posting could not be checked." });
    }
  }

  return (
    <section aria-label="Posting check" className="space-y-3 rounded-lg border border-line p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Is it still open?</h3>
        <button type="button" className={secondaryButton} onClick={() => void check()} disabled={state.loading}>
          {state.loading ? <Spinner /> : null}
          {state.loading ? "Checking" : v ? "Check again" : "Check this posting"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge tone={v ? VERIFICATION_LABEL[v.state][1] : "neutral"}>{v ? VERIFICATION_LABEL[v.state][0] : "Not checked yet"}</Badge>
        <Badge>{e ? DESCRIPTION_LABEL[e.status] : job.descriptionTruncated ? "Partial description" : "Description from the job board"}</Badge>
      </div>
      {v && <p className="text-muted">Last checked {when(v.checkedAt)}. {v.notes.join(" ")}</p>}
      {e && (
        <p className="text-muted">
          Description: {e.enrichedLength.toLocaleString("en-CA")} characters from {SOURCE[e.source]}
          {e.enrichedLength !== e.originalLength ? ` (the job board gave ${e.originalLength.toLocaleString("en-CA")})` : ""}.{e.error ? ` ${e.error}` : ""}
        </p>
      )}
      <p className="text-muted">
        {apply ? (
          <a href={apply} target="_blank" rel="noopener noreferrer" className="font-medium underline">
            Open the application page
          </a>
        ) : (
          "No apply link was provided."
        )}
        {link && link !== apply && (
          <>
            {" "}
            It now leads to{" "}
            <a href={link} target="_blank" rel="noopener noreferrer" className="underline">
              this address
            </a>
            .
          </>
        )}
      </p>
      {state.error && <Notice tone="error">{state.error}</Notice>}
    </section>
  );
}
