"use client";

import { useState, type DragEvent, type FormEvent } from "react";
import { Check, FileText, Pencil, Plus, RotateCw, Search, Sparkles, Trash2, Upload, X } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { heuristicProfile } from "@/lib/heuristics";
import { readResumeFile } from "@/lib/resume-file";
import { yearsFromHistory } from "@/lib/resume-sections";
import { dedupe } from "@/lib/skills";
import {
  SENIORITY_LEVELS,
  SKILL_CATEGORIES,
  SKILL_CATEGORY_LABELS,
  type AnalyzeResumeResponse,
  type ApiError,
  type CandidateProfile,
  type EducationEntry,
  type ResumeVersion,
  type Seniority,
  type SkillCategory,
  type WorkEntry,
} from "@/types/job";
import { Badge, Notice, Spinner, inputClass, primaryButton, secondaryButton } from "./ui";

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_RESUME_CHARS = 60_000;
export const MAX_RESUME_VERSIONS = 20;

interface Props {
  versions: ResumeVersion[];
  active: ResumeVersion | null;
  onAdd: (text: string, fileName: string | null, profile: CandidateProfile) => void;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onProfileChange: (profile: CandidateProfile) => void;
  /** Replaces the profile of a version with a fresh reading of its resume text. */
  onReread: (id: string, profile: CandidateProfile) => void;
  onPickRole: (role: string) => void;
  /** True when the server has Claude switched on and this person may use it. */
  useAi: boolean;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    return ((await res.json()) as Partial<ApiError>).error || fallback;
  } catch {
    return fallback;
  }
}

/** The resume is sent to the server only when Claude is switched on there. Otherwise it is read here, in the browser. */
async function analyzeText(text: string, useAi: boolean): Promise<AnalyzeResumeResponse> {
  if (!useAi) return { profile: heuristicProfile(text.slice(0, MAX_RESUME_CHARS)), warning: null };
  const res = await apiFetch("/api/analyze-resume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(await readError(res, "The resume could not be analyzed."));
  return (await res.json()) as AnalyzeResumeResponse;
}

export function ResumeManager(props: Props) {
  const { versions, active } = props;
  const [adding, setAdding] = useState(versions.length === 0);
  const showAdd = adding || versions.length === 0;

  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
      <h1 className="sr-only">Resume and profile</h1>
      <section aria-labelledby="resume-heading" className="space-y-4">
        <div>
          <h2 id="resume-heading" className="font-display text-xl font-semibold">
            Resume versions
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Keep a version for each kind of role. Matching uses the one marked In use. Resumes are read on the server; only the text is kept, in this browser.
          </p>
        </div>

        {versions.length > 0 && <VersionList {...props} />}

        {showAdd ? (
          <AddResume useAi={props.useAi}
            disabled={versions.length >= MAX_RESUME_VERSIONS}
            onDone={(text, fileName, profile) => {
              props.onAdd(text, fileName, profile);
              setAdding(false);
            }}
            onCancel={versions.length ? () => setAdding(false) : undefined}
          />
        ) : (
          <button type="button" className={secondaryButton} onClick={() => setAdding(true)} disabled={versions.length >= MAX_RESUME_VERSIONS}>
            <Plus className="size-4" aria-hidden /> Add another version
          </button>
        )}
        {versions.length >= MAX_RESUME_VERSIONS && <Notice tone="warn">You have reached {MAX_RESUME_VERSIONS} versions. Delete one to add another.</Notice>}
      </section>

      <section aria-labelledby="profile-heading" className="min-w-0">
        {active ? (
          <ProfilePanel key={active.id} version={active} onChange={props.onProfileChange} onPickRole={props.onPickRole} onReread={props.onReread} useAi={props.useAi} />
        ) : (
          <div className="flex h-full min-h-56 flex-col justify-center rounded-xl border border-dashed border-line px-6 py-10">
            <h2 id="profile-heading" className="font-display text-xl font-semibold">
              Your profile will appear here
            </h2>
            <p className="mt-2 max-w-prose text-sm text-muted">
              After you add a resume you can correct anything we read wrongly, then pick a recommended job title to start searching.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------- version list ---------- */

function VersionList({ versions, active, onSelect, onRename, onDelete }: Props) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <ul className="space-y-2" aria-label="Resume versions">
      {versions.map((v) => {
        const isActive = v.id === active?.id;
        return (
          <li key={v.id} className={`rounded-xl border p-3 ${isActive ? "border-brand bg-surface" : "border-line bg-surface"}`}>
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
              <div className="min-w-0 flex-1">
                {renaming === v.id ? (
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (draft.trim()) onRename(v.id, draft.trim().slice(0, 80));
                      setRenaming(null);
                    }}
                  >
                    <label htmlFor={`rename-${v.id}`} className="sr-only">
                      Version name
                    </label>
                    <input id={`rename-${v.id}`} autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={80} className={inputClass} />
                    <button type="submit" className={secondaryButton} aria-label="Save name">
                      <Check className="size-4" aria-hidden />
                    </button>
                  </form>
                ) : (
                  <p className="truncate text-sm font-semibold">{v.name}</p>
                )}
                <p className="mt-0.5 text-xs text-muted">
                  {v.fileName ?? "Pasted text"} · {v.text.length.toLocaleString()} characters · {v.uploadedAt.slice(0, 10)}
                </p>
              </div>
              {isActive && <Badge tone="brand">In use</Badge>}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!isActive && (
                <button type="button" className={secondaryButton} onClick={() => onSelect(v.id)}>
                  Use this version
                </button>
              )}
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-ink"
                onClick={() => {
                  setRenaming(v.id);
                  setDraft(v.name);
                }}
              >
                <Pencil className="size-4" aria-hidden /> Rename
              </button>
              {confirming === v.id ? (
                <span className="inline-flex items-center gap-2 text-sm">
                  Delete this version?
                  <button type="button" className="font-semibold text-danger underline" onClick={() => (onDelete(v.id), setConfirming(null))}>
                    Delete
                  </button>
                  <button type="button" className="text-muted underline" onClick={() => setConfirming(null)}>
                    Keep
                  </button>
                </span>
              ) : (
                <button type="button" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-danger-bg hover:text-danger" onClick={() => setConfirming(v.id)}>
                  <Trash2 className="size-4" aria-hidden /> Delete
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- adding a resume ---------- */

function AddResume({ disabled, onDone, onCancel, useAi }: { useAi: boolean; disabled: boolean; onDone: (text: string, fileName: string | null, profile: CandidateProfile) => void; onCancel?: () => void }) {
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState<null | "reading" | "analyzing">(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  async function analyze(text: string, fileName: string | null, carried: string | null) {
    setBusy("analyzing");
    try {
      const data = await analyzeText(text, useAi);
      const note = [carried, data.warning].filter(Boolean).join(" ") || null;
      setWarning(note);
      onDone(text, fileName, data.profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The resume could not be analyzed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleFile(file: File) {
    setError(null);
    setWarning(null);
    if (file.size > MAX_BYTES) return setError("That file is over 4 MB. Export a smaller copy or paste the text instead.");
    setBusy("reading");
    try {
      const data = await readResumeFile(file);
      await analyze(data.text, data.fileName, data.warning);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The file could not be read.");
      setBusy(null);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && !disabled) void handleFile(file);
  }

  function onPaste(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setWarning(null);
    void analyze(pasted.trim(), null, null);
  }

  const working = busy !== null;

  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div role="tablist" aria-label="How to add your resume" className="inline-flex rounded-lg border border-line bg-surface-2 p-1">
          {(["upload", "paste"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === m ? "bg-brand text-on-brand" : "text-muted hover:text-ink"}`}
            >
              {m === "upload" ? "Upload file" : "Paste text"}
            </button>
          ))}
        </div>
        {onCancel && (
          <button type="button" className="text-sm text-muted hover:text-ink" onClick={onCancel} disabled={working}>
            Cancel
          </button>
        )}
      </div>

      {mode === "upload" ? (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition focus-within:outline-2 focus-within:outline-brand ${dragging ? "border-brand bg-info-bg" : "border-line hover:border-brand"}`}
        >
          {working ? <Spinner className="size-7 text-brand" /> : <Upload className="size-7 text-brand" aria-hidden />}
          <span className="font-medium">{busy === "reading" ? "Reading your file" : busy === "analyzing" ? "Reading your experience" : "Drop your resume here"}</span>
          <span className="text-sm text-muted">{working ? "This takes a few seconds." : "or click to choose a PDF, DOCX, TXT or MD file up to 4 MB"}</span>
          <input
            type="file"
            accept=".pdf,.docx,.txt,.md,.markdown"
            className="sr-only"
            disabled={working || disabled}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
        </label>
      ) : (
        <form onSubmit={onPaste} className="space-y-3">
          <label htmlFor="paste-resume" className="sr-only">
            Resume text
          </label>
          <textarea
            id="paste-resume"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={10}
            placeholder="Paste the full text of your resume here"
            className={`${inputClass} resize-y font-mono text-[13px] leading-relaxed`}
          />
          <button type="submit" className={primaryButton} disabled={working || disabled || pasted.trim().length < 50}>
            {working ? <Spinner /> : <Sparkles className="size-4" aria-hidden />}
            {working ? "Analyzing" : "Analyze resume"}
          </button>
          {pasted.trim().length > 0 && pasted.trim().length < 50 && <p className="text-xs text-muted">Paste a little more text to continue.</p>}
        </form>
      )}

      {error && <Notice tone="error">{error}</Notice>}
      {warning && <Notice tone="warn">{warning}</Notice>}
    </div>
  );
}

/* ---------- profile editor ---------- */

function ProfilePanel({
  version,
  onChange,
  onPickRole,
  onReread,
  useAi,
}: {
  useAi: boolean;
  version: ResumeVersion;
  onChange: (p: CandidateProfile) => void;
  onPickRole: (role: string) => void;
  onReread: (id: string, profile: CandidateProfile) => void;
}) {
  const profile = version.profile;
  const [confirmReread, setConfirmReread] = useState(false);
  const [rereading, setRereading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<CandidateProfile>) => onChange({ ...profile, ...patch });
  const setSkills = (category: SkillCategory, next: string[]) => set({ skills: { ...profile.skills, [category]: next } });
  const total = SKILL_CATEGORIES.reduce((n, c) => n + profile.skills[c].length, 0);
  const history = profile.workHistory ?? [];
  const computedYears = yearsFromHistory(history);

  async function reread() {
    setRereading(true);
    setError(null);
    try {
      const data = await analyzeText(version.text, useAi);
      onReread(version.id, data.profile);
      setConfirmReread(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The resume could not be analyzed.");
    } finally {
      setRereading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="profile-heading" className="font-display text-xl font-semibold">
            Profile from {version.name}
          </h2>
          <Badge tone={profile.source === "ai" ? "info" : "neutral"}>{profile.source === "ai" ? "Read by Claude" : "Keyword reading"}</Badge>
        </div>
        <p className="mt-3 max-w-prose text-sm leading-relaxed">{profile.summary}</p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5 text-sm font-medium">
            <label htmlFor="years">Years of experience</label>
            <input
              id="years"
              type="number"
              min={0}
              max={60}
              value={profile.yearsOfExperience ?? ""}
              onChange={(e) => set({ yearsOfExperience: e.target.value === "" ? null : Math.min(60, Math.max(0, Math.round(Number(e.target.value)))) })}
              placeholder="Unknown"
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5 text-sm font-medium">
            <label htmlFor="level">Level</label>
            <select id="level" value={profile.seniority} onChange={(e) => set({ seniority: e.target.value as Seniority })} className={inputClass}>
              {SENIORITY_LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>
          <div className="text-sm">
            <p className="font-medium">Skills</p>
            <p className="mt-2 font-semibold">{total}</p>
          </div>
        </div>
        {computedYears !== null && computedYears !== profile.yearsOfExperience && (
          <p className="mt-3 text-sm text-muted">
            Your dated work history adds up to {computedYears} years.{" "}
            <button type="button" className="font-medium text-brand underline" onClick={() => set({ yearsOfExperience: computedYears })}>
              Use {computedYears}
            </button>
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          {confirmReread ? (
            <>
              <span className="text-sm">Reading it again replaces everything you edited here.</span>
              <button type="button" className={primaryButton} onClick={() => void reread()} disabled={rereading}>
                {rereading ? <Spinner /> : <RotateCw className="size-4" aria-hidden />} Read again
              </button>
              <button type="button" className="text-sm text-muted underline" onClick={() => setConfirmReread(false)} disabled={rereading}>
                Keep my edits
              </button>
            </>
          ) : (
            <button type="button" className={secondaryButton} onClick={() => setConfirmReread(true)}>
              <RotateCw className="size-4" aria-hidden /> Read this resume again
            </button>
          )}
        </div>
        {error && (
          <div className="mt-3">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-line bg-surface p-5">
        <h3 className="font-display text-base font-semibold">Jobs to search for</h3>
        <p className="mt-1 text-sm text-muted">Pick a title to fill the search box.</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {profile.recommendedRoles.map((role) => (
            <li key={role}>
              <button
                type="button"
                onClick={() => onPickRole(role)}
                className="inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-surface-2 px-3.5 py-1.5 text-sm font-medium hover:border-brand hover:bg-info-bg"
              >
                <Search className="size-3.5 text-brand" aria-hidden />
                {role}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <WorkHistoryEditor history={history} onChange={(next) => set({ workHistory: next })} />
      <EducationEditor items={profile.education ?? []} onChange={(next) => set({ education: next })} />

      <div className="rounded-xl border border-line bg-surface p-5">
        <TagEditor label="Certifications" help="Only list certifications you hold." items={profile.certifications ?? []} onChange={(next) => set({ certifications: next })} placeholder="Add a certification" />
      </div>

      <div className="rounded-xl border border-line bg-surface p-5">
        <h3 className="font-display text-base font-semibold">Skills</h3>
        <p className="mt-1 text-sm text-muted">Remove anything that is wrong and add what is missing. Matching uses exactly this list.</p>
        <div className="mt-4 space-y-5">
          {SKILL_CATEGORIES.map((category) => (
            <TagEditor key={category} label={SKILL_CATEGORY_LABELS[category]} items={profile.skills[category]} onChange={(next) => setSkills(category, next)} placeholder="Add a skill" />
          ))}
        </div>
      </div>
    </div>
  );
}

const monthValue = (d: string | null) => (d ? (d.length === 4 ? `${d}-01` : d) : "");

function WorkHistoryEditor({ history, onChange }: { history: WorkEntry[]; onChange: (next: WorkEntry[]) => void }) {
  const update = (i: number, patch: Partial<WorkEntry>) => onChange(history.map((h, idx) => (idx === i ? { ...h, ...patch } : h)));

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <h3 className="font-display text-base font-semibold">Work history</h3>
      <p className="mt-1 text-sm text-muted">Read from your resume. Fix anything wrong; years of experience can be recalculated from these dates.</p>
      {history.length === 0 && <p className="mt-3 text-sm text-muted">No dated jobs were found. Add them here if you want them counted.</p>}
      <ul className="mt-4 space-y-4">
        {history.map((h, i) => (
          <li key={i} className="rounded-lg border border-line p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Job title" id={`wh-title-${i}`}>
                <input id={`wh-title-${i}`} value={h.title} maxLength={200} onChange={(e) => update(i, { title: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Employer" id={`wh-co-${i}`}>
                <input id={`wh-co-${i}`} value={h.company} maxLength={200} onChange={(e) => update(i, { company: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Start" id={`wh-start-${i}`}>
                <input id={`wh-start-${i}`} type="month" value={monthValue(h.start)} onChange={(e) => update(i, { start: e.target.value || null })} className={inputClass} />
              </Field>
              <Field label="End" id={`wh-end-${i}`}>
                <input id={`wh-end-${i}`} type="month" value={h.current ? "" : monthValue(h.end)} disabled={h.current} onChange={(e) => update(i, { end: e.target.value || null })} className={`${inputClass} disabled:opacity-50`} />
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={h.current} onChange={(e) => update(i, { current: e.target.checked, end: e.target.checked ? null : h.end })} className="size-4 accent-[var(--brand)]" />
                I work here now
              </label>
              <button type="button" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-danger-bg hover:text-danger" onClick={() => onChange(history.filter((_, idx) => idx !== i))}>
                <Trash2 className="size-4" aria-hidden /> Remove job
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button type="button" className={`${secondaryButton} mt-4`} onClick={() => onChange([...history, { title: "", company: "", start: null, end: null, current: false }].slice(0, 40))}>
        <Plus className="size-4" aria-hidden /> Add a job
      </button>
    </div>
  );
}

function EducationEditor({ items, onChange }: { items: EducationEntry[]; onChange: (next: EducationEntry[]) => void }) {
  const update = (i: number, patch: Partial<EducationEntry>) => onChange(items.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <h3 className="font-display text-base font-semibold">Education</h3>
      {items.length === 0 && <p className="mt-2 text-sm text-muted">No degrees or diplomas were found.</p>}
      <ul className="mt-3 space-y-3">
        {items.map((e, i) => (
          <li key={i} className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-[1fr_1fr_6rem_auto] sm:items-end">
            <Field label="Degree or diploma" id={`ed-cred-${i}`}>
              <input id={`ed-cred-${i}`} value={e.credential} maxLength={200} onChange={(ev) => update(i, { credential: ev.target.value })} className={inputClass} />
            </Field>
            <Field label="School" id={`ed-inst-${i}`}>
              <input id={`ed-inst-${i}`} value={e.institution} maxLength={200} onChange={(ev) => update(i, { institution: ev.target.value })} className={inputClass} />
            </Field>
            <Field label="Year" id={`ed-year-${i}`}>
              <input id={`ed-year-${i}`} inputMode="numeric" value={e.year ?? ""} maxLength={4} onChange={(ev) => update(i, { year: ev.target.value.replace(/\D/g, "").slice(0, 4) || null })} className={inputClass} />
            </Field>
            <button type="button" aria-label={`Remove education ${i + 1}`} className="rounded-lg p-2 text-muted hover:bg-danger-bg hover:text-danger" onClick={() => onChange(items.filter((_, idx) => idx !== i))}>
              <Trash2 className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className={`${secondaryButton} mt-4`} onClick={() => onChange([...items, { credential: "", institution: "", year: null }].slice(0, 15))}>
        <Plus className="size-4" aria-hidden /> Add education
      </button>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 text-sm font-medium">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

function TagEditor({ label, help, items, onChange, placeholder }: { label: string; help?: string; items: string[]; onChange: (next: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const id = `add-${label.replace(/\W+/g, "-").toLowerCase()}`;

  function add(e: FormEvent) {
    e.preventDefault();
    const incoming = draft.split(",").map((s) => s.trim()).filter(Boolean);
    if (incoming.length) onChange(dedupe([...items, ...incoming]).slice(0, 60));
    setDraft("");
  }

  return (
    <div>
      <h4 className="text-sm font-semibold">{label}</h4>
      {help && <p className="text-xs text-muted">{help}</p>}
      <ul className="mt-2 flex flex-wrap gap-2">
        {items.length === 0 && <li className="text-sm text-muted">None found</li>}
        {items.map((item) => (
          <li key={item} className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 py-1 pl-2.5 pr-1 text-sm">
            {item}
            <button type="button" onClick={() => onChange(items.filter((s) => s !== item))} aria-label={`Remove ${item}`} className="rounded p-0.5 text-muted hover:bg-danger-bg hover:text-danger">
              <X className="size-3.5" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-2 flex max-w-sm gap-2">
        <label htmlFor={id} className="sr-only">
          Add to {label}
        </label>
        <input id={id} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} maxLength={120} className={inputClass} />
        <button type="submit" className={secondaryButton} disabled={!draft.trim()}>
          <Plus className="size-4" aria-hidden />
          <span className="sr-only sm:not-sr-only">Add</span>
        </button>
      </form>
    </div>
  );
}
