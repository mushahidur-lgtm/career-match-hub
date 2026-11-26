import "server-only";
import { safeFetch, type Transport } from "./safe-fetch";

/** Whether a site's robots.txt allows one path. A missing file allows; one that cannot be read does not. */

const AGENT = "careermatchhub";

/**
 * "*" matches anything and a final "$" anchors the end. Matched piece by piece rather than with a regular
 * expression, because the rule comes from a remote file and could be written to make one backtrack for ever.
 */
function pathMatches(rule: string, path: string): boolean {
  const anchored = rule.endsWith("$");
  const parts = (anchored ? rule.slice(0, -1) : rule).split("*");
  if (!path.startsWith(parts[0])) return false;
  let at = parts[0].length;
  if (parts.length === 1) return !anchored || at === path.length;
  const last = parts[parts.length - 1];
  for (const part of parts.slice(1, -1)) {
    const found = path.indexOf(part, at);
    if (found < 0) return false;
    at = found + part.length;
  }
  if (anchored) return path.length - last.length >= at && path.endsWith(last);
  return path.indexOf(last, at) >= 0;
}

export function robotsAllows(text: string, path: string): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let open = false;
  for (const raw of text.split(/\r?\n/)) {
    // Split by hand: the file is remote, and a pattern with repeating space matchers can be made to crawl.
    const line = raw.split("#", 1)[0];
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const [field, value] = [line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim()];
    if (field === "user-agent") {
      if (!open) groups.push({ agents: [], rules: [] });
      groups[groups.length - 1].agents.push(value.toLowerCase());
      open = true;
    } else if ((field === "allow" || field === "disallow") && groups.length) {
      open = false;
      if (value) groups[groups.length - 1].rules.push({ allow: field === "allow", path: value });
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && AGENT.startsWith(a)));
  const rules = (mine.length ? mine : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);
  const matches = (rule: string) => pathMatches(rule, path);
  // The most specific rule wins; Allow wins a tie.
  const best = rules.filter((r) => matches(r.path)).sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow))[0];
  return best ? best.allow : true;
}

export async function allowedByRobots(url: URL, transport?: Transport, allowHop?: (next: URL) => boolean): Promise<boolean> {
  try {
    const page = await safeFetch(`${url.origin}/robots.txt`, { transport, allowHop, maxBytes: 200_000, timeoutMs: 4_000 });
    if (page.status === 404 || page.status === 410) return true;
    if (page.status !== 200) return false;
    return robotsAllows(page.body, url.pathname + url.search);
  } catch {
    return false;
  }
}
