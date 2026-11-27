import type { AppData } from "@/lib/backup";

/**
 * Contact details are not needed to match jobs, so they are left out of the resume text that is copied to the cloud.
 * The copy on this device is not changed. Names and street addresses are not recognised.
 */
export function withoutContactDetails(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){1,8}/g, "[email removed]")
    .replace(/linkedin\.com\/in\/[A-Za-z0-9_%-]{1,100}/gi, "[profile link removed]")
    .replace(/(?<!\w)(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?!\w)/g, "[phone removed]")
    .replace(/\+\d{1,3}(?:[\s.-]?\d{2,4}){3,4}(?!\w)/g, "[phone removed]");
}

/** Puts this device's full text back where the cloud copy differs only by what was removed from it. */
export function restoreContactDetails(local: AppData, cloud: AppData): AppData {
  const mine = new Map(local.resumes.map((r) => [r.id, r.text]));
  return {
    ...cloud,
    resumes: cloud.resumes.map((r) => {
      const text = mine.get(r.id);
      return text !== undefined && withoutContactDetails(text) === r.text ? { ...r, text } : r;
    }),
  };
}
