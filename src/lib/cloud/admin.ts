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
      if (!row.success) return null;
      const parsed = parseBackup(JSON.stringify(row.data.data));
      return parsed.ok ? parsed.data : null;
    },
    async saveRun(userId, date, payload: DailyPayload) {
      // Upsert on the unique (user, date), so a forced re-run replaces the day's run and a race cannot make two.
      const { error } = await sb.from("daily_runs").upsert({ user_id: userId, run_date: date, ran_at: new Date().toISOString(), payload }, { onConflict: "user_id,run_date" });
      if (error) throw new Error(error.message);
    },
    async pruneBefore(userId, date) {
      const { error } = await sb.from("daily_runs").delete().eq("user_id", userId).lt("run_date", date);
      if (error) throw new Error(error.message);
    },
  };
}
