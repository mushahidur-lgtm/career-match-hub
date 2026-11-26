import { z } from "zod";
import { stripHtml, stripTags } from "@/lib/providers/common";
import { guardPosting } from "./sanitize";

/**
 * Reads the schema.org JobPosting block many career sites publish for search engines. It lives in a script
 * tag, so it is taken out before any HTML is stripped. Everything in it is untrusted: validated, cleaned and
 * never executed.
 */
export interface StructuredPosting {
  title: string;
  description: string;
  validThrough: string | null;
  employer: string | null;
}

const Posting = z.object({
  title: z.string().max(500).optional(),
  description: z.string().max(200_000),
  validThrough: z.string().max(60).optional(),
  hiringOrganization: z.object({ name: z.string().max(300).optional() }).optional().catch(undefined),
});

const MAX_BLOCKS = 10;

export function cleanText(html: string): string {
  let text = stripHtml(html);
  // Some sites escape the HTML inside the JSON, which leaves tags behind. Only the tags are removed on the
  // second pass: decoding again would turn escaped text back into markup.
  if (/<\/?(?:p|br|ul|li|div|strong|h\d|script)\b/i.test(text)) text = stripTags(text);
  return guardPosting(text).clean.trim().slice(0, 20_000);
}

function* postings(node: unknown, depth = 0): Generator<unknown> {
  if (depth > 4 || !node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node.slice(0, 50)) yield* postings(item, depth + 1);
    return;
  }
  const record = node as Record<string, unknown>;
  if (([] as unknown[]).concat(record["@type"] ?? []).includes("JobPosting")) yield record;
  if (record["@graph"]) yield* postings(record["@graph"], depth + 1);
}

export function readJobPostings(html: string): StructuredPosting[] {
  const out: StructuredPosting[] = [];
  const blocks = html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script[^>]*>/gi);
  let seen = 0;
  for (const [, body] of blocks) {
    if (++seen > MAX_BLOCKS) break;
    let json: unknown;
    try {
      json = JSON.parse(body.trim());
    } catch {
      continue;
    }
    for (const node of postings(json)) {
      const parsed = Posting.safeParse(node);
      if (!parsed.success) continue;
      const description = cleanText(parsed.data.description);
      if (!description) continue;
      out.push({
        title: stripHtml(parsed.data.title ?? ""),
        description,
        validThrough: parsed.data.validThrough ?? null,
        employer: parsed.data.hiringOrganization?.name?.trim() || null,
      });
    }
  }
  return out;
}

/** The text of the page's main content, or null when the page does not mark one. */
export function mainText(html: string): string | null {
  const block = html.match(/<(main|article)\b[^>]*>([\s\S]*?)<\/\1[^>]*>/i)?.[2];
  return block ? cleanText(block) : null;
}
