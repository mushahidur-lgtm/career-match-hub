import { CLEARANCE_LEVELS, LANGUAGE_LEVELS, WORK_AUTHORIZATIONS, type CandidateFacts, type LanguageLevel } from "@/types/job";
import { inputClass } from "./ui";

export interface FactsDraft {
  workAuthorization: string;
  clearance: string;
  /** One per line: "French: intermediate". */
  languages: string;
  exclusions: string;
  qualificationsComplete: boolean;
}

const AUTH_LABEL = { citizen: "Canadian citizen", permanent_resident: "Permanent resident", work_permit: "Work permit", needs_sponsorship: "I need sponsorship" } as const;
const CLEARANCE_LABEL = { none: "None", reliability: "Reliability status", secret: "Secret", top_secret: "Top Secret" } as const;

export const draftFacts = (f: CandidateFacts | undefined): FactsDraft => ({
  workAuthorization: f?.workAuthorization ?? "",
  clearance: f?.clearance ?? "",
  languages: (f?.languages ?? []).map((l) => `${l.language}: ${l.level}`).join("\n"),
  exclusions: (f?.exclusions ?? []).join("\n"),
  qualificationsComplete: f?.qualificationsComplete ?? false,
});

const rows = (text: string, max: number) => text.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, max);

export function readFacts(d: FactsDraft): CandidateFacts | undefined {
  const languages = rows(d.languages, 20).map((line) => {
    const [name, level = ""] = line.split(":").map((s) => s.trim());
    const found = LANGUAGE_LEVELS.find((l) => l === level.toLowerCase());
    return { language: name.slice(0, 40), level: found ?? ("professional" as LanguageLevel) };
  });
  const exclusions = rows(d.exclusions, 30).map((e) => e.slice(0, 60));
  const workAuthorization = WORK_AUTHORIZATIONS.find((w) => w === d.workAuthorization);
  const clearance = CLEARANCE_LEVELS.find((c) => c === d.clearance);
  const facts: CandidateFacts = {
    ...(workAuthorization ? { workAuthorization } : {}),
    ...(clearance ? { clearance } : {}),
    ...(languages.length ? { languages } : {}),
    ...(exclusions.length ? { exclusions } : {}),
    ...(d.qualificationsComplete ? { qualificationsComplete: true } : {}),
  };
  return Object.keys(facts).length ? facts : undefined;
}

export function EligibilityFields({ value, onChange }: { value: FactsDraft; onChange: (v: FactsDraft) => void }) {
  const set = (patch: Partial<FactsDraft>) => onChange({ ...value, ...patch });
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Eligibility</legend>
      <p className="text-xs text-muted">Used only to check what a posting requires. Nothing is guessed from your resume: leave a field empty and such jobs are marked for you to verify.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Work status in Canada
          <select value={value.workAuthorization} onChange={(e) => set({ workAuthorization: e.target.value })} className={inputClass}>
            <option value="">Not stated</option>
            {WORK_AUTHORIZATIONS.map((w) => (
              <option key={w} value={w}>
                {AUTH_LABEL[w]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Security clearance you hold
          <select value={value.clearance} onChange={(e) => set({ clearance: e.target.value })} className={inputClass}>
            <option value="">Not stated</option>
            {CLEARANCE_LEVELS.map((c) => (
              <option key={c} value={c}>
                {CLEARANCE_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        All the languages you can work in, one per line
        <textarea rows={3} value={value.languages} onChange={(e) => set({ languages: e.target.value })} className={inputClass} placeholder={"English: native\nFrench: intermediate"} />
        <span className="text-xs text-muted">Levels: {LANGUAGE_LEVELS.join(", ")}. A job requiring a language you leave off is ruled out.</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Words that rule a job out, one per line
        <textarea rows={2} value={value.exclusions} onChange={(e) => set({ exclusions: e.target.value })} className={inputClass} />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={value.qualificationsComplete} onChange={(e) => set({ qualificationsComplete: e.target.checked })} className="mt-0.5 size-4 accent-[var(--brand)]" />
        <span>
          The education and certifications on my profile are everything I hold.
          <span className="block text-xs text-muted">Only then can a job that strictly requires one you lack be ruled out. Otherwise it is marked to verify.</span>
        </span>
      </label>
    </fieldset>
  );
}
