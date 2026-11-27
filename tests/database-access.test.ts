import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Runs the real migrations in an in-process Postgres and checks who can do what. Supabase's roles, auth schema and
 * default grants are imitated below; this is not a test of a live Supabase project (see supabase/tests/verify_access.sql).
 */

const OWNER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";

const SUPABASE_LIKE = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`;

const migration = (name: string) => readFileSync(fileURLToPath(new URL(`../supabase/migrations/${name}`, import.meta.url)), "utf8");

let db: PGlite;

/** Runs one statement as a role and signed-in account, the way a request through the Supabase API would. */
async function as(role: "anon" | "authenticated", who: string | null, sql: string) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [who ?? ""]);
    return tx.query<Record<string, unknown>>(sql);
  });
}
const owner = (sql: string) => as("authenticated", OWNER, sql);
const stranger = (sql: string) => as("authenticated", STRANGER, sql);
const visitor = (sql: string) => as("anon", null, sql);
const take = (name: string, max: number, seconds = 3600) => `select public.take_rate_limit('${name}', ${max}, ${seconds}) as ok`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_LIKE);
  await db.exec(migration("0001_init.sql"));
  await db.exec(migration("0002_owner_only.sql"));
  // Both are documented as safe to run again, in any order a person might do it.
  await db.exec(migration("0002_owner_only.sql"));
  await db.exec(migration("0001_init.sql"));
  await db.exec(`insert into auth.users values ('${OWNER}', 'owner@example.com'), ('${STRANGER}', 'other@example.com')`);
  await db.exec(`insert into public.user_data (user_id, data) values ('${STRANGER}', '{"x":1}')`);
}, 60_000);
afterAll(() => db.close());

describe("before an owner is named", () => {
  it("nobody can read or write", async () => {
    await expect(owner(`insert into public.user_data (user_id, data) values ('${OWNER}', '{}')`)).rejects.toThrow(/row-level security/);
    expect((await stranger("select * from public.user_data")).rows).toEqual([]);
  });
});

describe("with the owner named", () => {
  beforeAll(async () => {
    await db.exec(`insert into private.app_owner (user_id) select id from auth.users where email = 'owner@example.com'`);
    await owner(`insert into public.user_data (user_id, data) values ('${OWNER}', '{"resume":"private"}')`);
    await db.exec(`insert into public.daily_runs (user_id, run_date, payload) values ('${OWNER}', '2026-11-26', '{}')`);
  });

  it("only one account can be the owner", async () => {
    await expect(db.exec(`insert into private.app_owner (user_id) values ('${STRANGER}')`)).rejects.toThrow(/unique/);
  });

  it("the owner reads and changes their own rows only", async () => {
    expect((await owner("select user_id from public.user_data")).rows).toEqual([{ user_id: OWNER }]);
    expect((await owner("update public.user_data set version = version + 1 returning version")).rows).toEqual([{ version: 2 }]);
    expect((await owner("select 1 from public.daily_runs")).rows).toHaveLength(1);
  });

  it("another account sees, changes and adds nothing, not even under its own id", async () => {
    expect((await stranger("select * from public.user_data")).rows).toEqual([]);
    expect((await stranger("select * from public.daily_runs")).rows).toEqual([]);
    expect((await stranger("update public.user_data set data = '{}' returning user_id")).rows).toEqual([]);
    expect((await stranger("delete from public.user_data returning user_id")).rows).toEqual([]);
    expect((await stranger("delete from public.daily_runs returning id")).rows).toEqual([]);
    await expect(stranger(`insert into public.daily_runs (user_id, run_date, payload) values ('${STRANGER}', '2026-11-26', '{}')`)).rejects.toThrow(/permission denied/);
    await expect(stranger(`insert into public.user_data (user_id, data) values ('${OWNER}', '{}')`)).rejects.toThrow(/row-level security/);
    expect((await db.query("select data from public.user_data where user_id = $1", [OWNER])).rows).toEqual([{ data: { resume: "private" } }]);
  });

  it("a visitor has no privileges at all", async () => {
    for (const sql of ["select * from public.user_data", "select * from public.daily_runs", "delete from public.user_data", take("search-jobs", 5)]) {
      await expect(visitor(sql), sql).rejects.toThrow(/permission denied/);
    }
  });

  it("a signed-in session holds only the verbs the app uses", async () => {
    await expect(owner("truncate public.user_data")).rejects.toThrow(/permission denied/);
    await expect(owner("update public.daily_runs set payload = '{}'")).rejects.toThrow(/permission denied/);
    for (const sql of ["select * from private.app_owner", "select * from private.rate_limits", "delete from private.rate_limits", `update private.app_owner set user_id = '${STRANGER}'`]) {
      await expect(owner(sql), sql).rejects.toThrow(/permission denied/);
    }
  });

  it("counts calls in the database until the limit, and a different window cannot reset it", async () => {
    const results = [];
    for (let i = 0; i < 5; i++) results.push((await owner(take("search-jobs", 3))).rows[0].ok);
    expect(results).toEqual([true, true, true, false, false]);
    await owner(take("search-jobs", 3, 1));
    expect((await owner(take("search-jobs", 3))).rows[0].ok).toBe(false);
    expect((await owner(take("job-insights", 3))).rows[0].ok).toBe(true);
  });

  it("refuses the limit to other accounts and refuses nonsense", async () => {
    await expect(stranger(take("search-jobs", 3))).rejects.toThrow(/not allowed/);
    for (const sql of [take("Bad Name", 3), take("x", 0), take("x", 100_000), take("x", 3, 0)]) {
      await expect(owner(sql), sql).rejects.toThrow(/invalid limit/);
    }
  });
});
