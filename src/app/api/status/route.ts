import { NextResponse } from "next/server";
import { activeModel, isAiConfigured } from "@/lib/anthropic";
import { signInEnforced } from "@/lib/cloud/auth";
import { webSearchEnabled } from "@/lib/contacts/web-search";
import { configuredProvider } from "@/lib/providers";
import type { AppStatus } from "@/types/job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tells the UI which features are live. Never returns key values. */
export async function GET() {
  const ai = isAiConfigured();
  const body: AppStatus = { ai, model: ai ? activeModel() : null, jobProvider: configuredProvider(), recruiterWebSearch: webSearchEnabled(signInEnforced()) };
  return NextResponse.json(body);
}
