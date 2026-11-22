"use client";

import { useRef, useState, type FormEvent } from "react";
import { Download, HardDriveDownload, Save, Upload } from "lucide-react";
import { buildBackup, parseBackup, type AppData } from "@/lib/backup";
import { normalizeWeights } from "@/lib/matching/engine";
import {
  DEFAULT_MATCH_WEIGHTS,
  DEFAULT_PREFERENCES,
  MATCH_COMPONENTS,
  MATCH_COMPONENT_LABELS,
  type MatchComponentKey,
  type SearchPreferences,
} from "@/types/job";
import { Notice, inputClass, primaryButton, secondaryButton } from "./ui";

interface Props {
  data: AppData;
  recovered: boolean;
  onSavePreferences: (p: SearchPreferences) => void;
  onImport: (data: AppData, mode: "merge" | "replace") => void;
}

const lines = (s: string) => [...new Set(s.split("\n").map((l) => l.trim()).filter(Boolean))].slice(0, 60);

export function SettingsPanel({ data, recovered, onSavePreferences, onImport }: Props) {
  const p = data.preferences;
  const [minSalary, setMinSalary] = useState(String(p.minSalary));
  const [locations, setLocations] = useState(p.locations.join("\n"));
  const [primary, setPrimary] = useState(p.primaryRoles.join("\n"));
  const [secondary, setSecondary] = useState(p.secondaryRoles.join("\n"));
  const initialWeights = p.weights ?? DEFAULT_MATCH_WEIGHTS;
  const [weights, setWeights] = useState<Record<MatchComponentKey, string>>(
    () => Object.fromEntries(MATCH_COMPONENTS.map((k) => [k, String(Math.round(initialWeights[k]))])) as Record<MatchComponentKey, string>,
  );
  const weightTotal = MATCH_COMPONENTS.reduce((n, k) => n + (Number(weights[k]) || 0), 0);
  const [savedMsg, setSavedMsg] = useState(false);
  const [pending, setPending] = useState<{ data: AppData; exportedAt: string } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function save(e: FormEvent) {
    e.preventDefault();
    const salary = Math.max(0, Math.round(Number(minSalary) || 0));
    const scaled = normalizeWeights(Object.fromEntries(MATCH_COMPONENTS.map((k) => [k, Number(weights[k]) || 0])));
    const rounded = Object.fromEntries(MATCH_COMPONENTS.map((k) => [k, Math.round(scaled[k] * 10) / 10])) as Record<MatchComponentKey, number>;
    setWeights(Object.fromEntries(MATCH_COMPONENTS.map((k) => [k, String(Math.round(rounded[k]))])) as Record<MatchComponentKey, string>);
    onSavePreferences({ minSalary: salary, locations: lines(locations), primaryRoles: lines(primary), secondaryRoles: lines(secondary), weights: rounded });
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2500);
  }

  function exportJson() {
    const blob = new Blob([buildBackup(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `career-match-hub-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function chooseFile(file: File) {
    setImportError(null);
    setDone(null);
    setPending(null);
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) return setImportError(parsed.error);
    setPending({ data: parsed.data, exportedAt: parsed.exportedAt });
  }

  function confirm(mode: "merge" | "replace") {
    if (!pending) return;
    onImport(pending.data, mode);
    setDone(mode === "merge" ? "Saved jobs were merged into your list." : "Your data was replaced with the backup.");
    setPending(null);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form onSubmit={save} className="space-y-4" aria-labelledby="prefs-heading">
        <div>
          <h2 id="prefs-heading" className="font-display text-xl font-semibold">
            Search preferences
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            These fill in your search. Only permanent full-time roles are searched by default, so contract, temporary, freelance, part-time and internship postings are left out.
          </p>
        </div>
        <div className="flex flex-col gap-1.5 text-sm font-medium">
          <label htmlFor="pref-salary">Minimum salary (CAD per year)</label>
          <input id="pref-salary" type="number" min={0} step={5000} value={minSalary} onChange={(e) => setMinSalary(e.target.value)} className={`${inputClass} max-w-xs`} />
          <span className="text-xs font-normal text-muted">Jobs that state a lower salary are hidden. Jobs with no stated salary stay, marked Salary unknown.</span>
        </div>
        <TextList id="pref-locations" label="Cities, one per line" value={locations} onChange={setLocations} rows={5} />
        <TextList id="pref-primary" label="Primary roles, one per line" value={primary} onChange={setPrimary} rows={6} />
        <TextList id="pref-secondary" label="Secondary roles, one per line" value={secondary} onChange={setSecondary} rows={8} />
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">How much each part of a match counts</legend>
          <p className="text-xs text-muted">Set any numbers you like. They are scaled to 100% when you save. A part the posting gives no information about is skipped and the rest share its weight.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {MATCH_COMPONENTS.map((k) => (
              <div key={k} className="flex flex-col gap-1 text-sm">
                <label htmlFor={`w-${k}`}>{MATCH_COMPONENT_LABELS[k]}</label>
                <input id={`w-${k}`} type="number" min={0} max={100} value={weights[k]} onChange={(e) => setWeights((w) => ({ ...w, [k]: e.target.value }))} className={inputClass} />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted" aria-live="polite">Total entered: {weightTotal}</p>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={primaryButton}>
            <Save className="size-4" aria-hidden /> Save preferences
          </button>
          <button
            type="button"
            className={secondaryButton}
            onClick={() => {
              setMinSalary(String(DEFAULT_PREFERENCES.minSalary));
              setLocations(DEFAULT_PREFERENCES.locations.join("\n"));
              setPrimary(DEFAULT_PREFERENCES.primaryRoles.join("\n"));
              setSecondary(DEFAULT_PREFERENCES.secondaryRoles.join("\n"));
              setWeights(Object.fromEntries(MATCH_COMPONENTS.map((k) => [k, String(DEFAULT_MATCH_WEIGHTS[k])])) as Record<MatchComponentKey, string>);
            }}
          >
            Reset to defaults
          </button>
          {savedMsg && <span role="status" className="text-sm font-medium text-good">Saved</span>}
        </div>
      </form>

      <section aria-labelledby="data-heading" className="space-y-4">
        <div>
          <h2 id="data-heading" className="font-display text-xl font-semibold">
            Your data
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Everything is stored in this browser. Export a backup now and then, and before clearing site data or switching browsers.
          </p>
        </div>
        {recovered && (
          <Notice tone="warn">
            Some saved data could not be read, so it was set aside instead of deleted. Importing a backup restores it.
          </Notice>
        )}
        <div className="flex flex-wrap gap-3">
          <button type="button" className={primaryButton} onClick={exportJson}>
            <Download className="size-4" aria-hidden /> Export backup (JSON)
          </button>
          <button type="button" className={secondaryButton} onClick={() => fileInput.current?.click()}>
            <Upload className="size-4" aria-hidden /> Import backup
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Choose a backup file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void chooseFile(f);
              e.target.value = "";
            }}
          />
        </div>
        <p className="text-sm text-muted">
          {data.saved.length} saved {data.saved.length === 1 ? "job" : "jobs"}
          {data.resume ? ", 1 resume" : ", no resume"}
        </p>
        {importError && <Notice tone="error">{importError}</Notice>}
        {done && <Notice tone="info">{done}</Notice>}
        {pending && (
          <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
            <h3 className="flex items-center gap-2 font-display text-base font-semibold">
              <HardDriveDownload className="size-4 text-brand" aria-hidden /> Backup from {pending.exportedAt.slice(0, 10)}
            </h3>
            <p className="text-sm text-muted">
              Contains {pending.data.saved.length} saved {pending.data.saved.length === 1 ? "job" : "jobs"}
              {pending.data.resume ? " and a resume" : ""}. Merging keeps everything you have now and adds saved jobs you do not already track. Replacing overwrites your resume, profile, preferences and saved jobs.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={primaryButton} onClick={() => confirm("merge")}>
                Merge saved jobs
              </button>
              <button type="button" className={secondaryButton} onClick={() => confirm("replace")}>
                Replace everything
              </button>
              <button type="button" className="px-2 text-sm text-muted hover:text-ink" onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function TextList({ id, label, value, onChange, rows }: { id: string; label: string; value: string; onChange: (v: string) => void; rows: number }) {
  return (
    <div className="flex flex-col gap-1.5 text-sm font-medium">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className={`${inputClass} resize-y`} />
    </div>
  );
}
