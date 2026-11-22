import "server-only";
import { adminClient } from "./admin";

export type AuthResult = { ok: true } | { ok: false; status: 401 | 403; error: string };

/**
 * Protects routes that cost money (web search). With no database configured the site is browser-only and these routes are
 * limited only by rate limits. With one configured, the caller must be signed in, and if DAILY_RUN_EMAILS is set, be one of those accounts:
 * otherwise a stranger could spend your Anthropic credit.
 */
export async function requireSignedIn(req: Request): Promise<AuthResult> {
  const sb = adminClient();
  if (!sb) return { ok: true };
  const token = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!token) return { ok: false, status: 401, error: "Sign in under Settings, Cloud sync to use this." };
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return { ok: false, status: 401, error: "Your sign-in has expired. Sign in again under Settings, Cloud sync." };
  const allowed = (process.env.DAILY_RUN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes((data.user.email ?? "").toLowerCase())) return { ok: false, status: 403, error: "This account is not allowed to use this feature." };
  return { ok: true };
}
