import "server-only";
import { NextResponse } from "next/server";
import type { ApiError } from "@/types/job";

const hits = new Map<string, number[]>();

/**
 * Best-effort limit per client and route, held in this instance's memory. It stops
 * casual abuse of your API keys. For a hard limit on a public deployment, add a
 * Vercel Firewall rule (see README).
 */
export function rateLimit(req: Request, route: string, max: number, windowMs = 60_000): NextResponse<ApiError> | null {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const key = `${route}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    const retry = Math.ceil((windowMs - (now - recent[0])) / 1000);
    return NextResponse.json(
      { error: `Too many requests. Try again in ${retry} seconds.` },
      { status: 429, headers: { "Retry-After": String(retry) } },
    );
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v[v.length - 1] > windowMs) hits.delete(k);
  return null;
}

export function badRequest(error: string, status = 400): NextResponse<ApiError> {
  return NextResponse.json({ error }, { status });
}
