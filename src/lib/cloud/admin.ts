import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { parseBackup } from "@/lib/backup";
import type { DailyPayload } from "./daily-payload";
import type { DailyStore } from "./daily-handler";

/**
 * The server's connection to Supabase, using the service key, which bypasses row-level security. It exists
 * only for the morning run. The key is read from a server-only variable, and this file can never be bundled
 * into the browser (it imports "server-only").
 */
export function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const RowSchema = z.object({ data: z.unknown() });

export function supabaseStore(sb: SupabaseClient): DailyStore {
  return {
    async findUsers(emails) {
      const wanted = new Set(emails.map((e) => e.toLowerCase()));
      const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (error) throw new Error(error.message);
      return data.users.filter((u) => u.email && wanted.has(u.email.toLowerCase())).map((u) => ({ id: u.id }));
    },
    async hasRun(userId, date) {
      const { data, error } = await sb.from("daily_runs").select("id").eq("user_id", userId).eq("run_date", date).maybeSingle();
      if (error) throw new Error(error.message);
      return Boolean(data);
    },
    async loadData(userId) {
      const { data, error } = await sb.from("user_data").select("data").eq("user_id", userId).maybeSingle();
      if (error) throw new Error(error.message);
      const row = RowSchema.safeParse(data);
      if (!row.success || data === null) return { ok: false, reason: "missing" };
      const parsed = parseBackup(JSON.stringify(row.data.data));
      return parsed.ok ? { ok: true, data: parsed.data } : { ok: false, reason: "unreadable" };
    },
    async saveRun(userId, date, payload: DailyPayload) {
      // A forced re-run replaces the day's run with a new row, so browsers that already added the old one add this too.
      const del = await sb.from("daily_runs").delete().eq("user_id", userId).eq("run_date", date);
      if (del.error) throw new Error(del.error.message);
      const { error } = await sb.from("daily_runs").insert({ user_id: userId, run_date: date, ran_at: new Date().toISOString(), payload });
      // 23505: another call stored today's run a moment ago. The unique (user, date) means there is still just one.
      if (error && error.code !== "23505") throw new Error(error.message);
    },
    async pruneBefore(userId, date) {
      const { error } = await sb.from("daily_runs").delete().eq("user_id", userId).lt("run_date", date);
      if (error) throw new Error(error.message);
    },
  };
}
