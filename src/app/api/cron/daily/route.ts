import { adminClient, ownerStore, supabaseStore } from "@/lib/cloud/admin";
import { authConfig } from "@/lib/cloud/auth";
import { handleDaily } from "@/lib/cloud/daily-handler";
import { runDaily } from "@/lib/cloud/daily-run";

export const runtime = "nodejs";
/** Vercel's Hobby plan allows up to 300 seconds. The run stops starting new searches well before that. */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const MAX_QUERIES = Math.min(30, Math.max(1, Number(process.env.DAILY_MAX_SEARCHES) || 12));

/** Stop starting new searches after this long. Lower DAILY_BUDGET_SECONDS if your function time limit is shorter than 300 seconds. */
const BUDGET_MS = Math.min(280, Math.max(5, Number(process.env.DAILY_BUDGET_SECONDS) || 200)) * 1000;

export async function POST(req: Request) {
  const sb = adminClient();
  const owner = authConfig()?.ownerId;
  return handleDaily(req, {
    secret: process.env.CRON_SECRET,
    emails: (process.env.DAILY_RUN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean),
    // Without a named owner there is nobody it may run for.
    store: sb && owner ? ownerStore(supabaseStore(sb), owner) : null,
    run: runDaily,
    now: () => new Date(),
    maxQueries: MAX_QUERIES,
    budgetMs: BUDGET_MS,
  });
}
