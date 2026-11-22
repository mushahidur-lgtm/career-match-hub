import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { AppData } from "@/lib/backup";
import type { DailyPayload } from "./daily-payload";
import type { RunInput, RunOutcome } from "./daily-run";
import { isDue, torontoParts } from "./schedule";

export interface DailyStore {
  findUsers(emails: string[]): Promise<{ id: string }[]>;
  hasRun(userId: string, date: string): Promise<boolean>;
  loadData(userId: string): Promise<AppData | null>;
  saveRun(userId: string, date: string, payload: DailyPayload): Promise<void>;
  pruneBefore(userId: string, date: string): Promise<void>;
}

export interface DailyDeps {
  secret: string | undefined;
  /** Only these accounts get a morning run, so a stranger who signs up cannot spend your job-board quota. */
  emails: string[];
  store: DailyStore | null;
  run: (input: RunInput) => Promise<RunOutcome>;
  now: () => Date;
  maxQueries: number;
  budgetMs: number;
}

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Constant-time comparison, so the secret cannot be guessed one character at a time. */
export function secretMatches(given: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !given) return false;
  return timingSafeEqual(digest(given), digest(secret));
}

const KEEP_DAYS = 30;

export async function handleDaily(req: Request, deps: DailyDeps): Promise<NextResponse> {
  const bearer = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1] ?? null;
  // Unauthorised, and also when no secret is set at all: an unset secret must never mean "open".
  if (!secretMatches(bearer, deps.secret)) return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  if (!deps.store) return NextResponse.json({ error: "The database is not configured." }, { status: 503 });
  if (!deps.emails.length) return NextResponse.json({ error: "DAILY_RUN_EMAILS is not set, so there is nobody to run for." }, { status: 503 });

  const force = (await req.json().catch(() => null))?.force === true;
  const now = deps.now();
  const { date } = torontoParts(now);
  const results: { status: "ran" | "skipped"; reason?: string; searches?: number; jobs?: number }[] = [];

  try {
    const users = await deps.store.findUsers(deps.emails);
    for (const user of users) {
      const done = await deps.store.hasRun(user.id, date);
      if (!isDue(now, done, force)) {
        results.push({ status: "skipped", reason: done ? "Already ran today." : "Before 8:00 AM in Toronto." });
        continue;
      }
      const data = await deps.store.loadData(user.id);
      if (!data) {
        results.push({ status: "skipped", reason: "No synced data yet. Turn on sync in the app first." });
        continue;
      }
      const resume = data.resumes.find((r) => r.id === data.activeResumeId) ?? data.resumes[0] ?? null;
      const outcome = await deps.run({ resume, preferences: data.preferences, maxQueries: deps.maxQueries, budgetMs: deps.budgetMs });
      if (!outcome.ok) {
        results.push({ status: "skipped", reason: outcome.reason });
        continue;
      }
      await deps.store.saveRun(user.id, date, outcome.payload);
      const cutoff = new Date(now.getTime() - KEEP_DAYS * 86_400_000);
      await deps.store.pruneBefore(user.id, torontoParts(cutoff).date);
      results.push({ status: "ran", searches: outcome.payload.searches.length, jobs: outcome.payload.observations.length });
    }
  } catch (err) {
    console.error("daily run failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "The daily run failed.", results }, { status: 500 });
  }
  if (!results.length) results.push({ status: "skipped", reason: "No account matches DAILY_RUN_EMAILS." });
  return NextResponse.json({ date, results });
}
