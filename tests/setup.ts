import { vi } from "vitest";

// Feature tests exercise the routes as the signed-in owner. The tests of sign-in and limits themselves
// (security.test.ts) use the real modules.
vi.mock("@/lib/cloud/auth", async (original) => ({
  ...(await original<typeof import("@/lib/cloud/auth")>()),
  requireSignedIn: vi.fn(async () => ({ ok: true, userId: "00000000-0000-4000-8000-000000000001", token: "a.b.c" })),
}));
vi.mock("@/lib/cloud/shared-limit", () => ({ takeShared: vi.fn(async () => "ok") }));

// Paid AI is off by default in the app; the tests of the AI features switch it on with a fake key.
process.env.AI_ENABLED = "1";
