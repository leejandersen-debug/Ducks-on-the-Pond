import { Pool, types, type PoolClient } from "pg";
import { attachDatabasePool } from "@vercel/functions";

// pg already treats sslmode=require/prefer/verify-ca as verify-full, but warns about it on every
// cold start. Saying verify-full explicitly keeps the same behavior and silences the warning.
// A malformed string is passed through untouched: URL's parse error carries the full input,
// password included, and would end up in the logs.
function withVerifyFull(connectionString: string) {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return connectionString;
  }
  if (["require", "prefer", "verify-ca"].includes(url.searchParams.get("sslmode") ?? "")) {
    url.searchParams.set("sslmode", "verify-full");
  }
  return url.toString();
}

// Return Postgres "date" columns as "YYYY-MM-DD" strings. The default turns them into a JS Date
// at local midnight, which can shift the day depending on the server's time zone.
types.setTypeParser(types.builtins.DATE, (v) => v);

// One pool per function instance. DATABASE_URL is Neon's pooled ("-pooler") connection string.
// attachDatabasePool lets Vercel close idle clients before an instance is suspended.
export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: withVerifyFull(process.env.DATABASE_URL), max: 5 })
  : null;

if (pool) attachDatabasePool(pool);

// Runs fn in one transaction as the given user, with row-level security applied:
// "set local role app_rw" drops the owner's RLS bypass, and app.user_id is what the policies
// read through app_user(). Both reset when the transaction ends, so pooled connections stay clean.
export async function withUser<T>(userId: string | null, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!pool) throw new Error("DATABASE_URL is not set");
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role app_rw");
    await client.query("select set_config('app.user_id', $1, true)", [userId ?? ""]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
