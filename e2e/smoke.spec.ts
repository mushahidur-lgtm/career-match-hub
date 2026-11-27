import { expect, test, type Page } from "@playwright/test";
import { docxParts, zip } from "../tests/fixtures/docx";

/**
 * Smoke tests for the free, no-key configuration. Job search results are supplied by a mock of this app's own
 * /api/search-jobs route, and every request to a host other than the local server is blocked and counted, so a test fails
 * if the app ever tries to reach an outside service. Posting text, names and addresses below are invented.
 */

let outside: string[] = [];
let problems: string[] = [];

test.beforeEach(async ({ page, context }) => {
  outside = [];
  problems = [];
  await context.route("**/*", (route) => {
    const { hostname, protocol } = new URL(route.request().url());
    if (hostname === "127.0.0.1" || hostname === "localhost" || protocol === "data:" || protocol === "blob:") return route.continue();
    outside.push(hostname);
    return route.abort();
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) problems.push(`console: ${m.text()}`);
  });
});

test.afterEach(() => {
  expect(outside, "the app tried to reach an outside host").toEqual([]);
  expect(problems, "the page logged errors").toEqual([]);
});

const today = () => new Date().toISOString();

const RESUME = "Senior Data Engineer with 9 years of experience. Built ETL pipelines in Python and SQL on Azure Data Factory.";

/** A one-page PDF holding that line. */
function resumePdf(): Buffer {
  const content = `BT /F1 10 Tf 20 700 Td (${RESUME}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = objects.map((body, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
const job = (over: Record<string, unknown>) => ({
  id: "job-1",
  title: "Data Engineer",
  company: "Northwind Analytics",
  location: "Ottawa, ON",
  workMode: "Hybrid",
  employmentType: "Full-time",
  category: "Data and analytics",
  salary: null,
  postedAt: today(),
  description: "",
  descriptionTruncated: false,
  applyUrl: "https://careers.northwind.example/jobs/1",
  source: "adzuna",
  match: null,
  ...over,
});

const NAMED = job({
  id: "named",
  title: "Data Engineer",
  description: `Join the data team at Northwind Analytics and build reliable pipelines. Recruiter: Jane Smith, Talent Acquisition Partner, jane.smith@northwind.example. ${"We build pipelines with Python and SQL. ".repeat(12)}`,
});
const UNNAMED = job({
  id: "unnamed",
  title: "BI Developer",
  company: "Contoso Analytics",
  description: `Build dashboards and reports for our finance team. Questions: careers@contoso.example. ${"x".repeat(420)}`,
  descriptionTruncated: true,
  applyUrl: "https://www.adzuna.ca/land/ad/12345",
});

async function openDiscover(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Discover jobs" }).first().click();
}

async function searchWith(page: Page, jobs: unknown[]) {
  await page.route("**/api/search-jobs", (route) => route.fulfill({ json: { jobs, mode: "live", provider: "adzuna", scoring: "none", warnings: [] } }));
  await openDiscover(page);
  await page.getByRole("button", { name: "Search jobs" }).click();
}

const card = (page: Page, title: string) => page.getByRole("article").filter({ hasText: title });

async function openFinder(page: Page, title: string) {
  await card(page, title).getByRole("button", { name: "Find recruiter" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

test("with no sign-in set up, the server refuses and the page says so", async ({ page, request }) => {
  expect((await request.get("/api/status")).status()).toBe(401);
  expect((await request.post("/api/search-jobs", { data: {} })).status()).toBe(401);
  await page.goto("/");
  await expect(page.getByText("This site has no sign-in set up, so searching is off.")).toBeVisible();
  await openDiscover(page);
  await page.getByRole("button", { name: "Search jobs" }).click();
  await expect(page.getByText(/Sign in under Settings/).first()).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
});

test("sends security headers, and the page runs under its content policy", async ({ page }) => {
  const response = await page.goto("/");
  const headers = response!.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-powered-by"]).toBeUndefined();
});

// Reading the file in the browser, including the PDF worker under the content policy, with nothing uploaded.
for (const [name, mimeType, buffer] of [
  ["cv.pdf", "application/pdf", resumePdf()],
  ["cv.txt", "text/plain", Buffer.from(RESUME)],
  ["cv.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", Buffer.from(zip(docxParts(RESUME)))],
] as const) {
  test(`reads ${name} in the browser without sending it anywhere`, async ({ page }) => {
    const sent: string[] = [];
    page.on("request", (r) => {
      if (r.method() !== "GET") sent.push(`${r.method()} ${new URL(r.url()).pathname}`);
    });
    await page.goto("/");
    // The banner is filled in by the running page, so a file chosen after it is not lost to a page still loading.
    await expect(page.getByText("This site has no sign-in set up, so searching is off.")).toBeVisible();
    await page.getByRole("button", { name: /Resume/ }).first().click();
    await page.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer });
    // The PDF reader and its worker are downloaded on first use, so allow for a busy machine.
    await expect.poll(async () => page.evaluate(() => localStorage.getItem("cmh:resumes") ?? ""), { timeout: 20_000 }).toContain("Azure Data Factory");
    expect(sent).toEqual([]);
  });
}

test("shows a clear message, not invented jobs, when no job source is available", async ({ page }) => {
  await page.route("**/api/search-jobs", (route) => route.fulfill({ json: { jobs: [], mode: "unconfigured", provider: "none", scoring: "none", warnings: [] } }));
  await openDiscover(page);
  await page.getByRole("button", { name: "Search jobs" }).click();
  await expect(page.getByRole("heading", { name: "No job source is connected" })).toBeVisible();
  await expect(page.getByText("This site does not invent job listings.")).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
});

test("Find Recruiter with web search disabled runs in free mode", async ({ page }) => {
  await searchWith(page, [UNNAMED]);
  const dialog = await openFinder(page, "BI Developer");
  await expect(dialog.getByText(/Free mode/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Search the web for contacts/ })).toHaveCount(0);
});

test("reads a recruiter that the posting text names, with the source", async ({ page }) => {
  await searchWith(page, [NAMED]);
  const dialog = await openFinder(page, "Data Engineer");
  await expect(dialog.getByText("Jane Smith", { exact: true })).toBeVisible();
  await expect(dialog.getByText("High confidence")).toBeVisible();
  await expect(dialog.getByText("jane.smith@northwind.example").first()).toBeVisible();
  await expect(dialog.getByText(/Recruiter: Jane Smith/)).toBeVisible();
});

test("saves a contact once, however it is added", async ({ page }) => {
  await searchWith(page, [NAMED]);
  const dialog = await openFinder(page, "Data Engineer");
  await dialog.getByRole("button", { name: "Save contact" }).click();
  await expect(dialog.getByRole("button", { name: /Saved\. Open/ })).toBeVisible();

  // The same person added by hand, with different capitalisation, must not become a second contact.
  await dialog.getByRole("button", { name: "Add a contact I found myself" }).click();
  const form = page.getByRole("dialog").last();
  await form.getByLabel("Full name").fill("jane  SMITH");
  await form.getByLabel("Where did you find them?").fill("Team page");
  await form.getByRole("button", { name: "Save contact" }).click();

  await expect
    .poll(async () => page.evaluate(() => (JSON.parse(localStorage.getItem("cmh:contacts") ?? "{}").contacts ?? []).length))
    .toBe(1);
});

test("a different person at the same employer is a separate contact", async ({ page }) => {
  await searchWith(page, [NAMED]);
  const dialog = await openFinder(page, "Data Engineer");
  await dialog.getByRole("button", { name: "Save contact" }).click();
  await expect(dialog.getByRole("button", { name: /Saved\. Open/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Add a contact I found myself" }).click();
  const form = page.getByRole("dialog").last();
  await form.getByLabel("Full name").fill("Dana Lee");
  await form.getByLabel("Where did you find them?").fill("Referral");
  await form.getByRole("button", { name: "Save contact" }).click();
  await expect
    .poll(async () => page.evaluate(() => (JSON.parse(localStorage.getItem("cmh:contacts") ?? "{}").contacts ?? []).length))
    .toBe(2);
});

test("a no-result job explains why and offers only plain search links", async ({ page }) => {
  await searchWith(page, [UNNAMED]);
  const dialog = await openFinder(page, "BI Developer");
  await expect(dialog.getByRole("heading", { name: "No verified contact found" })).toBeVisible();
  await expect(dialog.getByText(/names no recruiter, HR contact or hiring manager/)).toBeVisible();
  await expect(dialog.getByText(/mailbox or switchboard, not a named person/)).toBeVisible();
  await expect(dialog.getByText(/Next:/)).toBeVisible();

  const hrefs = await dialog.locator("a[href]").evaluateAll((as) => as.map((a) => ({ href: (a as HTMLAnchorElement).href, rel: a.getAttribute("rel") ?? "", target: a.getAttribute("target") })));
  const searches = hrefs.filter((l) => /google\.com|bing\.com|linkedin\.com/.test(l.href));
  expect(searches.length).toBeGreaterThanOrEqual(10);
  for (const l of searches) {
    const u = new URL(l.href);
    expect(["www.google.com", "www.bing.com", "www.linkedin.com"]).toContain(u.hostname);
    expect(u.protocol).toBe("https:");
    expect(u.pathname).toMatch(/^\/search(\/results\/people\/)?$/); // a search page, never a profile address
    expect(l.target).toBe("_blank");
    expect(l.rel).toContain("noopener");
  }
  // The links are shown, never followed: the outside-request guard in afterEach proves nothing was fetched.
});
