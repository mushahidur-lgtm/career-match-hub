import "server-only";
import { userClient, type Owner } from "./auth";

export interface LimitRule {
  /** Lower-case letters, digits and hyphens. */
  name: string;
  max: number;
  windowSeconds: number;
}

/**
 * A limit kept in the database, so every server instance counts against the same total
 * (supabase/migrations/0002_owner_only.sql). If it cannot be checked, the call is refused.
 */
export async function takeShared(owner: Owner, rule: LimitRule): Promise<"ok" | "over" | "unavailable"> {
  try {
    const sb = userClient(owner.token);
    if (!sb) return "unavailable";
    const { data, error } = await sb.rpc("take_rate_limit", { p_bucket: rule.name, p_max: rule.max, p_window_seconds: rule.windowSeconds });
    if (error || typeof data !== "boolean") return "unavailable";
    return data ? "ok" : "over";
  } catch {
    return "unavailable";
  }
}
