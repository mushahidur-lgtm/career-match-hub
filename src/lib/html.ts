/**
 * Reads untrusted HTML in one pass. Written as scanners rather than regular expressions because the text can
 * come from a page anyone published: a pattern that retries from every "<" takes minutes on a hostile page and
 * stalls the server. Every function here is linear in the length of its input.
 */

/** Lower-cases ASCII only, so positions in the result match positions in the original. */
const asciiLower = (s: string) => s.replace(/[A-Z]+/g, (m) => m.toLowerCase());

const TAG_START = /^[a-zA-Z!/?]$/;
const NAME = /^(\/?)([a-zA-Z0-9]{1,20})/;
/** Their contents are never shown to a reader. */
const HIDDEN = new Set(["script", "style", "noscript", "template"]);

export interface Element {
  attributes: string;
  body: string;
}

/** Each closed element of one kind, in order. An element that is never closed ends the search. */
export function* elements(html: string, name: string): Generator<Element> {
  const lower = asciiLower(html);
  const open = `<${name}`;
  let at = 0;
  for (;;) {
    const start = lower.indexOf(open, at);
    if (start < 0) return;
    const after = lower[start + open.length] ?? "";
    if (after !== ">" && after !== "/" && after.trim() !== "") {
      at = start + open.length;
      continue;
    }
    const end = lower.indexOf(">", start);
    if (end < 0) return;
    const close = lower.indexOf(`</${name}`, end + 1);
    if (close < 0) return;
    yield { attributes: html.slice(start + open.length, end), body: html.slice(end + 1, close) };
    at = close + name.length + 2;
  }
}

/** Removes any "<" that would start a tag, including one that only does so after others are dropped. */
function disarm(text: string): string {
  const kept: string[] = [];
  let next = "";
  let end = text.length;
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === "<" && TAG_START.test(next)) {
      kept.push(text.slice(i + 1, end));
      end = i;
    } else next = text[i];
  }
  kept.push(text.slice(0, end));
  return kept.reverse().join("");
}

/** Removes markup without touching entities. A "<" in ordinary text, as in "< 5", stays. */
export function stripTags(html: string): string {
  const lower = asciiLower(html);
  const out: string[] = [];
  /** Hidden elements already known to have no closing tag further on, so they are not searched for again. */
  const unclosed = new Set<string>();
  let noMoreTagEnds = false;
  let at = 0;

  while (at < html.length) {
    const start = html.indexOf("<", at);
    if (start < 0) {
      out.push(html.slice(at));
      break;
    }
    out.push(html.slice(at, start));
    if (html.startsWith("<!--", start)) {
      const close = html.indexOf("-->", start + 4);
      at = close < 0 ? html.length : close + 3;
      continue;
    }
    if (!TAG_START.test(html[start + 1] ?? "")) {
      out.push("<");
      at = start + 1;
      continue;
    }
    const end = noMoreTagEnds ? -1 : html.indexOf(">", start + 1);
    if (end < 0) {
      // A tag that is never closed loses its angle bracket.
      noMoreTagEnds = true;
      at = start + 1;
      continue;
    }
    at = end + 1;
    const [, slash = "", name = ""] = lower.slice(start + 1, Math.min(end, start + 23)).match(NAME) ?? [];
    if (!slash && HIDDEN.has(name) && !unclosed.has(name)) {
      const close = lower.indexOf(`</${name}`, end + 1);
      if (close < 0) unclosed.add(name);
      else {
        const closeEnd = html.indexOf(">", close);
        at = closeEnd < 0 ? html.length : closeEnd + 1;
        continue;
      }
    }
    if (name === "br" || (slash && /^(?:p|li|div|h\d)$/.test(name))) out.push("\n");
    else if (name === "li") out.push("• ");
  }

  return disarm(out.join(""))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
