import { adminClient, supabaseStore } from "@/lib/cloud/admin";
import { handleDaily } from "@/lib/cloud/daily-handler";
import { runDaily } from "@/lib/cloud/daily-run";

export const runtime = "nodejs";
/** Vercel's Hobby plan allows up to 300 seconds. The run stops starting new searches well before that. */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const MAX_QUERIES = Math.min(30, Math.max(1, Number(process.env.DAILY_MAX_SEARCHES) || 12));

export async function POST(req: Request) {
  const sb = adminClient();
  return handleDaily(req, {
    secret: process.env.CRON_SECRET,
    emails: (process.env.DAILY_RUN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean),
    store: sb ? supabaseStore(sb) : null,
    run: runDaily,
    now: () => new Date(),
    maxQueries: MAX_QUERIES,
    budgetMs: 200_000,
  });
}
