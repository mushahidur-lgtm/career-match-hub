import "server-only";
import { safeFetch, type Transport } from "./safe-fetch";

/** Whether a site's robots.txt allows one path. A missing file allows; one that cannot be read does not. */

const AGENT = "careermatchhub";

export function robotsAllows(text: string, path: string): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let open = false;
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.replace(/#.*/, "").match(/^\s*([A-Za-z-]+)\s*:\s*(.*?)\s*$/);
    if (!m) continue;
    const [field, value] = [m[1].toLowerCase(), m[2]];
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
  const matches = (rule: string) => {
    const pattern = rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*+/g, ".*").replace(/\\\$$/, "$");
    return new RegExp(`^${pattern}`).test(path);
  };
  // The most specific rule wins; Allow wins a tie.
  const best = rules.filter((r) => matches(r.path)).sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow))[0];
  return best ? best.allow : true;
}

export async function allowedByRobots(url: URL, transport?: Transport): Promise<boolean> {
  try {
    const page = await safeFetch(`${url.origin}/robots.txt`, { transport, maxBytes: 200_000, timeoutMs: 4_000 });
    if (page.status === 404 || page.status === 410) return true;
    if (page.status !== 200) return false;
    return robotsAllows(page.body, url.pathname + url.search);
  } catch {
    return false;
  }
}
