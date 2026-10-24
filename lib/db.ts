import { Pool } from "pg";
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

// One pool per function instance. DATABASE_URL is Neon's pooled ("-pooler") connection string.
// attachDatabasePool lets Vercel close idle clients before an instance is suspended.
export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: withVerifyFull(process.env.DATABASE_URL), max: 5 })
  : null;

if (pool) attachDatabasePool(pool);
