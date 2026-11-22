import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/** Everything that talks to the database from the browser. Row-level security limits each call to your own rows. */

export interface CloudRow {
  version: number;
  updatedAt: string;
  /** The backup envelope as stored. Not trusted: it is checked with parseBackup before use. */
  data: unknown;
}

export async function fetchRow(sb: SupabaseClient, userId: string): Promise<CloudRow | null> {
  const { data, error } = await sb.from("user_data").select("data, version, updated_at").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { version: data.version as number, updatedAt: data.updated_at as string, data: data.data } : null;
}

export type PushResult = { ok: true; version: number } | { ok: false; conflict: true };

/**
 * Saves your data only if the cloud is still at the version this browser last saw. A second device that
 * saved in the meantime makes this a conflict, and nothing is overwritten.
 */
export async function pushRow(sb: SupabaseClient, userId: string, envelope: unknown, expected: number): Promise<PushResult> {
  if (expected === 0) {
    const { error } = await sb.from("user_data").insert({ user_id: userId, data: envelope, version: 1 });
    if (!error) return { ok: true, version: 1 };
    // 23505: a row already exists, so another device got there first.
    if (error.code === "23505") return { ok: false, conflict: true };
    throw new Error(error.message);
  }
  const { data, error } = await sb
    .from("user_data")
    .update({ data: envelope, version: expected + 1, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("version", expected)
    .select("version");
  if (error) throw new Error(error.message);
  return data && data.length ? { ok: true, version: data[0].version as number } : { ok: false, conflict: true };
}

/** Removes your synced data and the daily runs stored for you. Your browser's copy is untouched. */
export async function deleteCloud(sb: SupabaseClient, userId: string): Promise<void> {
  const a = await sb.from("daily_runs").delete().eq("user_id", userId);
  if (a.error) throw new Error(a.error.message);
  const b = await sb.from("user_data").delete().eq("user_id", userId);
  if (b.error) throw new Error(b.error.message);
}

const RunRowSchema = z.object({ id: z.string().max(80), run_date: z.string().max(10), ran_at: z.string().max(40), payload: z.unknown() });
export type RunRow = z.infer<typeof RunRowSchema>;

export async function fetchRuns(sb: SupabaseClient, limit = 30): Promise<RunRow[]> {
  const { data, error } = await sb.from("daily_runs").select("id, run_date, ran_at, payload").order("ran_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((r) => {
    const p = RunRowSchema.safeParse(r);
    return p.success ? [p.data] : [];
  });
}

