import { NextResponse } from "next/server";
import { activeModel, isAiConfigured } from "@/lib/anthropic";
import { authenticate } from "@/lib/cloud/guard";
import { webSearchEnabled } from "@/lib/contacts/web-search";
import { configuredProvider } from "@/lib/providers";
import type { AppStatus } from "@/types/job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tells the signed-in owner which features are live. Never returns key values. */
export async function GET(req: Request) {
  const owner = await authenticate(req);
  if (owner instanceof NextResponse) return owner;
  const ai = isAiConfigured();
  const body: AppStatus = { ai, model: ai ? activeModel() : null, jobProvider: configuredProvider(), recruiterWebSearch: webSearchEnabled() };
  return NextResponse.json(body);
}
