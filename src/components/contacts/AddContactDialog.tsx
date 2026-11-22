"use client";

import { useState, type FormEvent } from "react";
import { jobKey } from "@/lib/backup";
import { webLink } from "@/lib/contacts/links";
import { classifyType, isLinkedInProfile, isSeniorHr, newContact, newSource, relevanceFor } from "@/lib/contacts/model";
import { CONTACT_LIMITS as L } from "@/types/contacts";
import type { Job } from "@/types/job";
import { Notice, inputClass, primaryButton, secondaryButton } from "../ui";
import { useContacts } from "./context";
import { Modal } from "./RecruiterDialog";

/** For someone you found yourself, for example on LinkedIn or from a referral. Always recorded as added by you. */
export function AddContactDialog({ jobs, initialCompany = "", onDone, onClose }: { jobs: Job[]; initialCompany?: string; onDone: (id: string) => void; onClose: () => void }) {
  const api = useContacts();
  const [f, setF] = useState({ name: "", title: "", company: initialCompany, department: "", linkedin: "", email: "", phone: "", where: "", sourceUrl: "", job: "" });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const name = f.name.trim();
    if (!name || !f.company.trim()) return setError("Enter their name and company.");
    if (name.split(/\s+/).length < 2) return setError("Enter their full name.");
    if (!f.where.trim()) return setError("Say where you found them, so the source is recorded.");
    const li = f.linkedin.trim();
    if (li && !isLinkedInProfile(li)) return setError("The LinkedIn address must be a public profile, like https://www.linkedin.com/in/name.");
    const url = f.sourceUrl.trim();
    if (url && !webLink(url)) return setError("The source link must start with http:// or https://.");
    const job = jobs.find((j) => j.id === f.job);
    const type = classifyType(f.title);
    const c = newContact({
      name,
      title: f.title.trim(),
      company: f.company.trim(),
      department: f.department.trim(),
      linkedinUrl: li || null,
      businessEmail: f.email.trim() || null,
      businessPhone: f.phone.trim() || null,
      type,
      // Their word, not a check: it stays a possible match until you mark it verified yourself.
      status: "Possible match",
      confidence: 0,
      origin: "manual",
      sources: [newSource({ url: webLink(url) ?? "manual", type: "manual", evidence: f.where.trim() })],
      jobs: job ? [{ jobKey: jobKey(job), jobTitle: job.title, company: job.company, location: job.location, relationship: type, relevance: relevanceFor({ type, title: f.title, department: f.department, jobTitle: job.title, jobSpecific: false, senior: isSeniorHr(f.title) }) }] : [],
    });
    const r = api.addManual(c);
    if (!r.saved) return setError("You have reached the limit of saved contacts. Delete some first.");
    onDone(r.contact.id);
  }

  const field = (id: keyof typeof f, label: string, opts: { max: number; required?: boolean; type?: string; hint?: string } ) => (
    <div className="flex flex-col gap-1.5 text-sm font-medium">
      <label htmlFor={`add-${id}`}>{label}</label>
      <input id={`add-${id}`} type={opts.type ?? "text"} className={inputClass} maxLength={opts.max} value={f[id]} onChange={(e) => set(id, e.target.value)} required={opts.required} />
      {opts.hint && <span className="text-xs font-normal text-muted">{opts.hint}</span>}
    </div>
  );

  return (
    <Modal titleId="add-contact" title="Add a contact" subtitle="Someone you found yourself" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Notice tone="info">Use only public professional information. It is saved as added by you and as a possible match until you check it and mark it verified.</Notice>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {field("name", "Full name", { max: L.name, required: true })}
          {field("title", "Current title", { max: L.title })}
          {field("company", "Company", { max: L.company, required: true })}
          {field("department", "Department", { max: L.department })}
          {field("linkedin", "Public LinkedIn profile address", { max: L.url, hint: "Optional." })}
          {field("email", "Business email", { max: L.email, type: "email", hint: "Only if it is publicly listed for them." })}
          {field("phone", "Business phone", { max: L.phone })}
          {field("sourceUrl", "Link to where you found them", { max: L.url, hint: "Optional." })}
        </div>
        <div className="flex flex-col gap-1.5 text-sm font-medium">
          <label htmlFor="add-where">Where did you find them?</label>
          <input id="add-where" className={inputClass} maxLength={L.evidence} value={f.where} onChange={(e) => set("where", e.target.value)} placeholder="For example: listed as the recruiter on the company careers page" required />
        </div>
        {jobs.length > 0 && (
          <div className="flex flex-col gap-1.5 text-sm font-medium">
            <label htmlFor="add-job">Link to a job (optional)</label>
            <select id="add-job" className={inputClass} value={f.job} onChange={(e) => set("job", e.target.value)}>
              <option value="">None</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title} at {j.company}
                </option>
              ))}
            </select>
          </div>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex gap-2">
          <button type="submit" className={primaryButton}>
            Save contact
          </button>
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
