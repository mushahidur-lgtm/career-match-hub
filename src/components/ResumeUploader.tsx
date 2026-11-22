"use client";

import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { FileText, Plus, RotateCcw, Search, Sparkles, Upload, X } from "lucide-react";
import { dedupe } from "@/lib/skills";
import {
  SKILL_CATEGORIES,
  SKILL_CATEGORY_LABELS,
  type AnalyzeResumeResponse,
  type ApiError,
  type CandidateProfile,
  type ParseResumeResponse,
  type SkillCategory,
  type StoredResume,
} from "@/types/job";
import { Badge, Notice, Spinner, inputClass, primaryButton, secondaryButton } from "./ui";

const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPT = ".pdf,.docx,.txt,.md,.markdown";

interface Props {
  resume: StoredResume | null;
  profile: CandidateProfile | null;
  onAnalyzed: (resume: StoredResume, profile: CandidateProfile) => void;
  onProfileChange: (profile: CandidateProfile) => void;
  onPickRole: (role: string) => void;
  onClear: () => void;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as Partial<ApiError>;
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

export function ResumeUploader({ resume, profile, onAnalyzed, onProfileChange, onPickRole, onClear }: Props) {
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState<null | "reading" | "analyzing">(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function analyze(text: string, fileName: string | null) {
    setBusy("analyzing");
    try {
      const res = await fetch("/api/analyze-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(await readError(res, "The resume could not be analyzed."));
      const data = (await res.json()) as AnalyzeResumeResponse;
      setWarning((w) => [w, data.warning].filter(Boolean).join(" ") || null);
      onAnalyzed({ text, fileName, uploadedAt: new Date().toISOString() }, data.profile);
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
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/parse-resume", { method: "POST", body });
      if (!res.ok) throw new Error(await readError(res, "The file could not be read."));
      const data = (await res.json()) as ParseResumeResponse;
      if (data.warning) setWarning(data.warning);
      await analyze(data.text, data.fileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The file could not be read.");
      setBusy(null);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  function onPaste(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setWarning(null);
    void analyze(pasted.trim(), null);
  }

  function reset() {
    setPasted("");
    setError(null);
    setWarning(null);
    onClear();
  }

  const working = busy !== null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <section aria-labelledby="resume-heading" className="space-y-4">
        <div>
          <h2 id="resume-heading" className="font-display text-xl font-semibold">
            Your resume
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Your resume is read on the server to find your skills. Only the text is kept, in this browser.
          </p>
        </div>

        {resume && profile ? (
          <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
            <FileText className="size-5 shrink-0 text-brand" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{resume.fileName ?? "Pasted resume"}</p>
              <p className="text-xs text-muted">{resume.text.length.toLocaleString()} characters</p>
            </div>
            <button type="button" className={secondaryButton} onClick={reset} disabled={working}>
              <RotateCcw className="size-4" aria-hidden /> Start over
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div role="tablist" aria-label="How to add your resume" className="inline-flex rounded-lg border border-line bg-surface p-1">
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

            {mode === "upload" ? (
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition focus-within:outline-2 focus-within:outline-brand ${
                  dragging ? "border-brand bg-info-bg" : "border-line bg-surface hover:border-brand"
                }`}
              >
                {working ? <Spinner className="size-7 text-brand" /> : <Upload className="size-7 text-brand" aria-hidden />}
                <span className="font-medium">
                  {busy === "reading" ? "Reading your file" : busy === "analyzing" ? "Finding your skills" : "Drop your resume here"}
                </span>
                <span className="text-sm text-muted">{working ? "This takes a few seconds." : "or click to choose a PDF, DOCX, TXT or MD file up to 4 MB"}</span>
                <input
                  ref={fileInput}
                  type="file"
                  accept={ACCEPT}
                  className="sr-only"
                  disabled={working}
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
                  rows={12}
                  placeholder="Paste the full text of your resume here"
                  className={`${inputClass} resize-y font-mono text-[13px] leading-relaxed`}
                />
                <button type="submit" className={primaryButton} disabled={working || pasted.trim().length < 50}>
                  {working ? <Spinner /> : <Sparkles className="size-4" aria-hidden />}
                  {working ? "Analyzing" : "Analyze resume"}
                </button>
                {pasted.trim().length > 0 && pasted.trim().length < 50 && <p className="text-xs text-muted">Paste a little more text to continue.</p>}
              </form>
            )}
          </div>
        )}

        {error && <Notice tone="error">{error}</Notice>}
        {warning && <Notice tone="warn">{warning}</Notice>}
      </section>

      <section aria-labelledby="profile-heading" className="min-w-0">
        {profile ? (
          <ProfilePanel profile={profile} onChange={onProfileChange} onPickRole={onPickRole} />
        ) : (
          <div className="flex h-full min-h-56 flex-col justify-center rounded-xl border border-dashed border-line px-6 py-10">
            <h2 id="profile-heading" className="font-display text-xl font-semibold">
              Your profile will appear here
            </h2>
            <p className="mt-2 max-w-prose text-sm text-muted">
              After you add a resume you can fix any skill we got wrong, then pick a recommended job title to start searching.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function ProfilePanel({
  profile,
  onChange,
  onPickRole,
}: {
  profile: CandidateProfile;
  onChange: (p: CandidateProfile) => void;
  onPickRole: (role: string) => void;
}) {
  function setSkills(category: SkillCategory, next: string[]) {
    onChange({ ...profile, skills: { ...profile.skills, [category]: next } });
  }

  const total = SKILL_CATEGORIES.reduce((n, c) => n + profile.skills[c].length, 0);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="profile-heading" className="font-display text-xl font-semibold">
            Your profile
          </h2>
          <Badge tone={profile.source === "ai" ? "info" : "neutral"}>{profile.source === "ai" ? "Analyzed by Claude" : "Keyword analysis"}</Badge>
        </div>
        <p className="mt-3 max-w-prose text-sm leading-relaxed">{profile.summary}</p>
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <div>
            <dt className="text-muted">Experience</dt>
            <dd className="font-semibold">{profile.yearsOfExperience === null ? "Not stated" : `${profile.yearsOfExperience} years`}</dd>
          </div>
          <div>
            <dt className="text-muted">Level</dt>
            <dd className="font-semibold">{profile.seniority}</dd>
          </div>
          <div>
            <dt className="text-muted">Skills</dt>
            <dd className="font-semibold">{total}</dd>
          </div>
        </dl>
        {profile.detectedRoles.length > 0 && (
          <p className="mt-4 text-sm text-muted">
            Past titles: <span className="text-ink">{profile.detectedRoles.join(", ")}</span>
          </p>
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

      <div className="rounded-xl border border-line bg-surface p-5">
        <h3 className="font-display text-base font-semibold">Skills</h3>
        <p className="mt-1 text-sm text-muted">Remove anything that is wrong and add what is missing. Your changes are used for matching.</p>
        <div className="mt-4 space-y-5">
          {SKILL_CATEGORIES.map((category) => (
            <SkillGroup key={category} label={SKILL_CATEGORY_LABELS[category]} skills={profile.skills[category]} onChange={(next) => setSkills(category, next)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SkillGroup({ label, skills, onChange }: { label: string; skills: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const id = `add-${label.replace(/\W+/g, "-").toLowerCase()}`;

  function add(e: FormEvent) {
    e.preventDefault();
    const incoming = draft.split(",").map((s) => s.trim()).filter(Boolean);
    if (incoming.length) onChange(dedupe([...skills, ...incoming]).slice(0, 60));
    setDraft("");
  }

  return (
    <div>
      <h4 className="text-sm font-semibold">{label}</h4>
      <ul className="mt-2 flex flex-wrap gap-2">
        {skills.length === 0 && <li className="text-sm text-muted">None found</li>}
        {skills.map((skill) => (
          <li key={skill} className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 py-1 pl-2.5 pr-1 text-sm">
            {skill}
            <button
              type="button"
              onClick={() => onChange(skills.filter((s) => s !== skill))}
              aria-label={`Remove ${skill}`}
              className="rounded p-0.5 text-muted hover:bg-danger-bg hover:text-danger"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-2 flex max-w-sm gap-2">
        <label htmlFor={id} className="sr-only">
          Add to {label}
        </label>
        <input id={id} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a skill" maxLength={60} className={inputClass} />
        <button type="submit" className={secondaryButton} disabled={!draft.trim()}>
          <Plus className="size-4" aria-hidden />
          <span className="sr-only sm:not-sr-only">Add</span>
        </button>
      </form>
    </div>
  );
}
