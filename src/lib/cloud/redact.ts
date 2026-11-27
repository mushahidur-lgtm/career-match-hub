import type { AppData } from "@/lib/backup";

/**
 * Contact details are not needed to match jobs, so they are left out of everything in the cloud copy that comes from a
 * resume. The copy on this device is not changed. Names and street addresses are not recognised.
 *
 * What comes from a resume: each version's name, file name, text and profile; the match results on saved jobs, which
 * quote resume lines; and the resume name kept on applications, in their activity history and in search history. A new field that copies resume
 * text must be added to `withoutResumeContactDetails`. What you typed yourself (notes, cover letters, saved contacts) is
 * left as it is.
 */

const PATTERNS = [
  /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){1,8}/g,
  /linkedin\.com\/in\/[A-Za-z0-9_%-]{1,100}/gi,
  /(?<!\w)(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?!\w)/g,
  /\+\d{1,3}(?:[\s.-]?\d{2,4}){3,4}(?!\w)/g,
];

/** Never longer than what it replaces, so a value cannot outgrow the length the app accepts when reading it back. */
export const withoutContactDetails = (text: string): string => PATTERNS.reduce((out, pattern) => out.replace(pattern, (found) => "[removed]".slice(0, found.length)), text);

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** The same value with every string in it, however deep, put through `withoutContactDetails`. */
function scrub<T>(value: T): T {
  if (typeof value === "string") return withoutContactDetails(value) as T;
  if (Array.isArray(value)) return value.map(scrub) as T;
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, scrub(v)])) as T;
  return value;
}

export function withoutResumeContactDetails(data: AppData): AppData {
  return {
    ...data,
    resumes: data.resumes.map((r) => ({ ...r, name: scrub(r.name), fileName: scrub(r.fileName), text: scrub(r.text), profile: scrub(r.profile) })),
    saved: data.saved.map((s) => ({
      ...s,
      ...(s.resumeName ? { resumeName: scrub(s.resumeName) } : {}),
      // The app writes the resume's name into the activity history. Entries you typed are left alone.
      ...(s.history ? { history: s.history.map((h) => (h.text.startsWith("Resume used: ") ? { ...h, text: scrub(h.text) } : h)) } : {}),
      job: s.job.match ? { ...s.job, match: scrub(s.job.match) } : s.job,
    })),
    ...(data.intel ? { intel: { ...data.intel, history: data.intel.history.map((h) => ({ ...h, resumeName: scrub(h.resumeName) })) } } : {}),
  };
}

const fingerprint = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) => (isObject(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v)) ?? "";

/** Takes the cloud value, but keeps this device's wording wherever the two differ only by what was removed. */
function restore(local: unknown, cloud: unknown): unknown {
  if (typeof cloud === "string") return typeof local === "string" && withoutContactDetails(local) === cloud ? local : cloud;
  if (Array.isArray(cloud)) {
    if (!Array.isArray(local)) return cloud;
    // By content first, because another device may have added or removed entries.
    const mine = new Map(local.map((v) => [fingerprint(scrub(v)), v]));
    return cloud.map((v, i) => mine.get(fingerprint(v)) ?? restore(local[i], v));
  }
  if (isObject(cloud)) {
    const mine = isObject(local) ? local : {};
    return Object.fromEntries(Object.entries(cloud).map(([key, v]) => [key, restore(mine[key], v)]));
  }
  return cloud;
}

/** Restores entry by entry, matched by identity rather than position. */
function restoreById<T>(local: T[], cloud: T[], id: (item: T) => string): T[] {
  const mine = new Map(local.map((item) => [id(item), item]));
  return cloud.map((item) => restore(mine.get(id(item)), item) as T);
}

export function restoreContactDetails(local: AppData, cloud: AppData): AppData {
  return {
    ...cloud,
    resumes: restoreById(local.resumes, cloud.resumes, (r) => r.id),
    saved: restoreById(local.saved, cloud.saved, (s) => s.job.id),
    ...(cloud.intel ? { intel: { ...cloud.intel, history: restoreById(local.intel?.history ?? [], cloud.intel.history, (h) => h.id) } } : {}),
  };
}
