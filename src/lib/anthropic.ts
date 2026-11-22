import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

export const DEFAULT_MODEL = "claude-sonnet-4-5";
/** Used once the configured model has been retired. Sonnet 4.5 retires on 2026-11-30. */
export const FALLBACK_MODEL = "claude-sonnet-5-5";

let retiredModel: string | null = null;

const configuredModel = () => process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;

export function activeModel(): string {
  const model = configuredModel();
  return model === retiredModel ? FALLBACK_MODEL : model;
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // Two attempts at 50 seconds each stay inside the routes' 120 second limit.
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY?.trim(), timeout: 50_000, maxRetries: 1 });
  return client;
}

/**
 * A client for calls that bill per web search. It never retries: a retry would run, and charge for, the searches again.
 * The timeout leaves room inside a 120 second route limit.
 */
let searchClient: Anthropic | null = null;
export function getSearchClient(): Anthropic {
  searchClient ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY?.trim(), timeout: 110_000, maxRetries: 0 });
  return searchClient;
}

/** Runs a call on the active model, and once more on the fallback if that model has been retired. */
export async function withModelFallback<T>(call: (model: string) => Promise<T>): Promise<T> {
  const model = activeModel();
  try {
    return await call(model);
  } catch (err) {
    if (err instanceof Anthropic.NotFoundError && model !== FALLBACK_MODEL) {
      retiredModel = model;
      return call(FALLBACK_MODEL);
    }
    throw err;
  }
}

/** The 4.5 generation and older reject the effort setting. */
const supportsEffort = (model: string) => !/(?:sonnet|haiku)-4-5|-4-1|-4-0|-4-20|claude-3/.test(model);

interface StructuredCall<S extends z.ZodType> {
  schema: S;
  system: string;
  user: string;
  maxTokens?: number;
}

export async function callStructured<S extends z.ZodType>(
  call: StructuredCall<S>,
): Promise<{ data: z.infer<S>; model: string }> {
  const model = activeModel();
  try {
    return await run(model, call);
  } catch (err) {
    if (err instanceof Anthropic.NotFoundError && model !== FALLBACK_MODEL) {
      retiredModel = model;
      return run(FALLBACK_MODEL, call);
    }
    throw err;
  }
}

async function run<S extends z.ZodType>(model: string, { schema, system, user, maxTokens = 16000 }: StructuredCall<S>) {
  const message = await getClient().messages.parse({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
    output_config: {
      format: zodOutputFormat(schema),
      ...(supportsEffort(model) ? { effort: "low" as const } : {}),
    },
  });
  if (message.stop_reason === "refusal") throw new Error("Claude declined this request.");
  if (message.stop_reason === "max_tokens") throw new Error("Claude's answer was cut off.");
  if (!message.parsed_output) throw new Error("Claude returned an unreadable answer.");
  return { data: message.parsed_output as z.infer<S>, model: message.model };
}

/** A message that is safe and useful to show in the UI. */
export function describeAiError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.";
  if (err instanceof Anthropic.PermissionDeniedError) return "This Anthropic API key cannot use the configured model.";
  if (err instanceof Anthropic.RateLimitError) return "The Anthropic rate limit was reached. Try again in a minute.";
  if (err instanceof Anthropic.APIConnectionError) return "Claude could not be reached.";
  if (err instanceof Anthropic.BadRequestError && /credit balance/i.test(err.message)) return "The Anthropic account is out of credits.";
  if (err instanceof Anthropic.APIError) return `Claude returned an error${err.status ? ` (${err.status})` : ""}.`;
  return "Claude's answer could not be used.";
}
