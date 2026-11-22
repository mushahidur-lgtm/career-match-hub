"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { todayLocal } from "@/lib/applications";
import { newId } from "@/lib/ids";
import { inferCategory } from "@/lib/providers/common";
import { APPLICATION_STATUSES, type Application, type ApplicationStatus, type Job } from "@/types/job";
import { safeUrl } from "./job-parts";
import { Notice, inputClass, primaryButton, secondaryButton } from "./ui";

const SENT_STAGES: ApplicationStatus[] = ["Applied", "Interview", "Offer", "Rejected"];

interface Props {
  /** Looks for a job you already track, so one posting never becomes two applications. */
  findExisting: (job: Job) => Application | undefined;
  /** `appliedAt` is given only for stages from Applied on; null means the date is not known. */
  onCreate: (job: Job, status: ApplicationStatus, appliedAt?: string | null) => void;
  onOpenExisting: (id: string) => void;
  onClose: () => void;
}

/** For a job you found somewhere other than a search, such as a referral or a company site. */
export function AddApplicationDialog({ findExisting, onCreate, onOpenExisting, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState({ title: "", company: "", location: "", url: "", status: "Interested" as ApplicationStatus, appliedOn: "" });
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<Application | null>(null);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setExisting(null);
    const title = form.title.trim();
    const company = form.company.trim();
    if (!title || !company) return setError("Enter the job title and the company.");
    const url = form.url.trim();
    const link = url ? safeUrl(url) : null;
    if (url && !link) return setError("The link must start with http:// or https://.");

    const job: Job = {
      id: `manual-${newId()}`,
      title,
      company,
      location: form.location.trim() || "Location not listed",
      workMode: "Not stated",
      employmentType: "Not stated",
      category: inferCategory(title),
      salary: null,
      postedAt: null,
      description: "",
      descriptionTruncated: false,
      applyUrl: link,
      source: "manual",
      match: null,
    };
    const dupe = findExisting(job);
    if (dupe) return setExisting(dupe);
    // Only stages from Applied on have an application date. Blank means unknown, never today by default.
    onCreate(job, form.status, SENT_STAGES.includes(form.status) ? form.appliedOn || null : undefined);
    dialog.current?.close();
  }

  const input = (id: string, label: string, key: "title" | "company" | "location" | "url", props: { placeholder?: string; type?: string } = {}) => (
    <div className="flex flex-col gap-1.5 text-sm font-medium">
      <label htmlFor={id}>{label}</label>
      <input id={id} value={form[key]} maxLength={key === "url" ? 2000 : 200} onChange={(e) => set(key, e.target.value)} className={inputClass} {...props} />
    </div>
  );

  return (
    <dialog
      ref={dialog}
      aria-labelledby="add-app-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
      className="m-auto w-[min(34rem,calc(100vw-1.5rem))] rounded-2xl border border-line bg-surface p-0 text-ink"
    >
      <form onSubmit={submit} className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="add-app-title" className="font-display text-xl font-semibold">
              Add an application
            </h2>
            <p className="mt-1 text-sm text-muted">For a job you found outside the search, such as a referral or a company site.</p>
          </div>
          <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {input("add-title", "Job title", "title")}
        {input("add-company", "Company", "company")}
        {input("add-location", "Location (optional)", "location", { placeholder: "Ottawa, ON" })}
        {input("add-url", "Link to the posting (optional)", "url", { placeholder: "https://", type: "url" })}
        <div className="flex flex-col gap-1.5 text-sm font-medium">
          <label htmlFor="add-status">Stage</label>
          <select
            id="add-status"
            value={form.status}
            onChange={(e) => {
              const status = e.target.value as ApplicationStatus;
              setForm((f) => ({ ...f, status, appliedOn: status === "Applied" && !f.appliedOn ? todayLocal() : f.appliedOn }));
            }}
            className={inputClass}
          >
            {APPLICATION_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        {SENT_STAGES.includes(form.status) && (
          <div className="flex flex-col gap-1.5 text-sm font-medium">
            <label htmlFor="add-applied-on">Applied on</label>
            <input id="add-applied-on" type="date" value={form.appliedOn} onChange={(e) => set("appliedOn", e.target.value)} className={inputClass} />
            <span className="text-xs font-normal text-muted">Leave blank if you do not know. It is not filled in for you.</span>
          </div>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        {existing && (
          <Notice tone="warn">
            You already track {existing.job.title} at {existing.job.company}.{" "}
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => {
                onOpenExisting(existing.job.id);
                dialog.current?.close();
              }}
            >
              Open it
            </button>
          </Notice>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButton} onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button type="submit" className={primaryButton}>
            Add application
          </button>
        </div>
      </form>
    </dialog>
  );
}

