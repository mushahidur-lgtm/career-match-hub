import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CLOUD_ANON_KEY, CLOUD_URL, isCloudConfigured } from "./config";

let client: SupabaseClient | null = null;

/**
 * The browser's connection to Supabase, or null when cloud features are off. It holds only the public
 * (anon) key: what a signed-in person can read or change is decided by row-level security in the database.
 */
export function getCloud(): SupabaseClient | null {
  if (!isCloudConfigured() || typeof window === "undefined") return null;
  client ??= createClient(CLOUD_URL, CLOUD_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  return client;
}
