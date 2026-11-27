// Run after `npm run build`: fails if a server secret reached the files the browser downloads.
// CI builds with made-up values for each secret, so a leak shows up as that value appearing.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SECRETS = ["SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY", "ADZUNA_APP_ID", "ADZUNA_APP_KEY", "RAPIDAPI_KEY", "CRON_SECRET", "OWNER_USER_ID"];
const ROOT = join(".next", "static");

const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));
const values = SECRETS.map((name) => [name, process.env[name]?.trim() ?? ""]).filter(([, v]) => v.length >= 8);
if (process.argv.includes("--require-values") && values.length !== SECRETS.length) {
  console.error(`Set all of ${SECRETS.join(", ")} to the values the build used.`);
  process.exit(1);
}

const isServiceToken = (jwt) => {
  try {
    return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).role === "service_role";
  } catch {
    return false;
  }
};

const found = [];
const all = files(ROOT);
for (const file of all) {
  const text = readFileSync(file, "latin1");
  for (const [name, value] of values) if (text.includes(value)) found.push(`${file}: the value of ${name}`);
  if (/sk-ant-[A-Za-z0-9_-]{20,}/.test(text)) found.push(`${file}: an Anthropic key`);
  if (/sb_secret_[A-Za-z0-9_-]{20,}/.test(text)) found.push(`${file}: a Supabase secret key`);
  for (const jwt of text.match(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) ?? []) {
    if (isServiceToken(jwt)) found.push(`${file}: a Supabase service-role token`);
  }
}

if (found.length) {
  console.error(`Secrets in browser files:\n${found.join("\n")}`);
  process.exit(1);
}
console.log(`Checked ${all.length} browser files against ${values.length} secret values and the key patterns: none found.`);
