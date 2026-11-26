/**
 * What this server instance has seen from each job source. It never calls a source to find out, so checking
 * health costs no quota, and a fresh instance honestly says "unknown".
 */
export type ProviderId = "adzuna" | "jsearch";
export type ProviderFailure = "timeout" | "unreachable" | "auth" | "rate_limit" | "server" | "bad_response";

export interface ProviderHealth {
  id: ProviderId;
  configured: boolean;
  state: "ok" | "failing" | "unknown" | "not_configured";
  lastFailure?: ProviderFailure;
  checkedAt?: string;
}

const seen = new Map<ProviderId, { ok: boolean; failure?: ProviderFailure; at: string }>();

export function recordProvider(id: ProviderId, failure?: ProviderFailure, now = new Date()): void {
  seen.set(id, { ok: !failure, ...(failure ? { failure } : {}), at: now.toISOString() });
}

export function providerHealth(configured: Record<ProviderId, boolean>): ProviderHealth[] {
  return (Object.keys(configured) as ProviderId[]).map((id) => {
    const last = seen.get(id);
    if (!configured[id]) return { id, configured: false, state: "not_configured" };
    if (!last) return { id, configured: true, state: "unknown" };
    return { id, configured: true, state: last.ok ? "ok" : "failing", ...(last.failure ? { lastFailure: last.failure } : {}), checkedAt: last.at };
  });
}

export const resetProviderHealth = () => seen.clear();
