import { CLOSED_TEXT } from "@/lib/job-quality";
import type { Page } from "@/lib/net/safe-fetch";
import { stripHtml } from "@/lib/providers/common";
import { mainText, readJobPostings, type StructuredPosting } from "./jsonld";

/**
 * What is kept of a fetched page. The body itself is never stored: pages run to 1.5 MB and anyone allowed to
 * check a job can ask for many of them, so caching bodies would fill the server's memory.
 */
export interface PageDigest {
  status: number;
  url: string;
  redirected: boolean;
  postings: StructuredPosting[];
  /** The page's marked main content, if any. */
  main: string | null;
  /** The start of the visible text, lower-cased, for finding the job's title. */
  visible: string;
  saysClosed: boolean;
  humanCheck: boolean;
}

export const MAX_POSTINGS = 5;
export const MAX_VISIBLE = 30_000;
const CHALLENGE = /captcha|are you (?:a )?human|verify you are human|cf-challenge|challenge-platform|<title>\s*just a moment/i;

/** A slice of a long string can keep the whole of it alive, so what is stored is copied. */
const copy = (s: string) => Buffer.from(s, "utf8").toString("utf8");

export function digestPage(page: Page): PageDigest {
  const ok = page.status === 200;
  const visible = ok ? stripHtml(page.body) : "";
  const main = ok ? mainText(page.body) : null;
  return {
    status: page.status,
    url: copy(page.url.slice(0, 2000)),
    redirected: page.redirected,
    postings: ok
      ? readJobPostings(page.body)
          .slice(0, MAX_POSTINGS)
          .map((p) => ({
            title: copy(p.title.slice(0, 500)),
            description: copy(p.description),
            validThrough: p.validThrough === null ? null : copy(p.validThrough),
            employer: p.employer === null ? null : copy(p.employer.slice(0, 300)),
          }))
      : [],
    main: main === null ? null : copy(main),
    visible: copy(visible.toLowerCase().slice(0, MAX_VISIBLE)),
    saysClosed: CLOSED_TEXT.test(visible),
    humanCheck: CHALLENGE.test(page.body),
  };
}
