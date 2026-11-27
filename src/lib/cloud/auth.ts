import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { rateLimit } from "@/lib/rate-limit";
import { isDatabaseUrl } from "./config";

/**
 * Who may call the private routes: one account, the owner. Everything here fails closed. With the database or the
 * owner's account id missing or malformed, no private route runs.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The shape of a signed token, so junk is refused without asking the database about it. */
const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;
const MAX_HEADER = 8192;

interface AuthConfig {
  url: string;
  anonKey: string;
  ownerId: string;
}

export function authConfig(): AuthConfig | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  const ownerId = (process.env.OWNER_USER_ID ?? "").trim().toLowerCase();
  if (!isDatabaseUrl(url)) return null;
  if (anonKey.length <= 20 || !UUID.test(ownerId)) return null;
  return { url, anonKey, ownerId };
}

/** A database connection that acts as the signed-in person, so row-level security applies to it. */
export function userClient(token: string): SupabaseClient | null {
  const config = authConfig();
  if (!config) return null;
  return createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export interface Owner {
  ok: true;
  userId: string;
  token: string;
}
export type AuthResult = Owner | { ok: false; status: 401 | 403 | 429 | 503; error: string };

const SIGN_IN = "Sign in under Settings, Cloud sync to use this.";
const EXPIRED = "Your sign-in has expired. Sign in again under Settings, Cloud sync.";

export async function requireSignedIn(req: Request): Promise<AuthResult> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.length <= MAX_HEADER ? BEARER.exec(header)?.[1] : undefined;
  if (!token) return { ok: false, status: 401, error: SIGN_IN };

  const config = authConfig();
  if (!config) return { ok: false, status: 503, error: "Sign-in is not set up on this site, so private features are off." };

  // Each check asks the database, so an address sending token after token is slowed down first.
  if (rateLimit(req, "auth", 120)) return { ok: false, status: 429, error: "Too many requests. Try again in a minute." };

  try {
    const sb = userClient(token);
    if (!sb) return { ok: false, status: 503, error: "Sign-in is not set up on this site, so private features are off." };
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return { ok: false, status: 401, error: EXPIRED };
    if (data.user.is_anonymous || data.user.id.toLowerCase() !== config.ownerId) {
      return { ok: false, status: 403, error: "This account is not allowed to use this site." };
    }
    return { ok: true, userId: data.user.id, token };
  } catch {
    return { ok: false, status: 503, error: "Your sign-in could not be checked. Try again in a minute." };
  }
}
