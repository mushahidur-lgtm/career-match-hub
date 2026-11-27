import "server-only";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import type { ApiError } from "@/types/job";
import { requireSignedIn, type Owner } from "./auth";
import { takeShared, type LimitRule } from "./shared-limit";

const refuse = (error: string, status: number, headers?: Record<string, string>) => NextResponse.json<ApiError>({ error }, { status, headers });

/** The owner, or the response to send instead. */
export async function authenticate(req: Request): Promise<Owner | NextResponse<ApiError>> {
  const auth = await requireSignedIn(req);
  return auth.ok ? auth : refuse(auth.error, auth.status);
}

/** Counts this call against the limits: first this instance's memory, then the total shared by all instances. */
export async function takeLimit(req: Request, owner: Owner, rule: LimitRule): Promise<NextResponse<ApiError> | null> {
  const local = rateLimit(req, rule.name, rule.max, rule.windowSeconds * 1000);
  if (local) return local;
  const shared = await takeShared(owner, rule);
  if (shared === "ok") return null;
  return shared === "over"
    ? refuse("Too many requests. Try again shortly.", 429, { "Retry-After": String(rule.windowSeconds) })
    : refuse("The request limit could not be checked, so nothing was run. Check that the database migrations have been applied.", 503);
}

/**
 * The first line of every private route: nothing is read, parsed or called until the owner is known and under the limit.
 * Returns null when the request may go on.
 */
export async function guard(req: Request, name: string, max: number, windowSeconds = 60): Promise<NextResponse<ApiError> | null> {
  const owner = await authenticate(req);
  if (owner instanceof NextResponse) return owner;
  return takeLimit(req, owner, { name, max, windowSeconds });
}
