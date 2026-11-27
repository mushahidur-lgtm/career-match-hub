import { defineConfig, devices } from "@playwright/test";

/**
 * Browser smoke tests. They run against a production build served locally, with every optional key blanked out, and the
 * tests block every request that leaves this machine. Nothing here calls Anthropic, Adzuna, JSearch, LinkedIn or any
 * people-search service. Build first (`npm run build`), then `npm run test:e2e`.
 *
 * Locally, set PW_CHANNEL=chrome (or msedge) to use a browser you already have instead of downloading one.
 */
const PORT = 3100;
const blank = ["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "ADZUNA_APP_ID", "ADZUNA_APP_KEY", "RAPIDAPI_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_URL", "CRON_SECRET", "DAILY_RUN_EMAILS", "RECRUITER_WEB_SEARCH", "CMH_DEMO", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "OWNER_USER_ID", "AI_ENABLED"];

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: process.env.PW_CHANNEL || undefined,
    // A trace can hold page contents, so it is kept only for a failed retry, and only uploaded when a run fails.
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL || undefined } }],
  webServer: {
    command: `npx next start -p ${PORT} -H 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/api/status`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: Object.fromEntries(blank.map((k) => [k, ""])),
  },
});
