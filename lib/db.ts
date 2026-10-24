import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";

// One pool per function instance. DATABASE_URL is Neon's pooled ("-pooler") connection string.
// attachDatabasePool lets Vercel close idle clients before an instance is suspended.
export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
  : null;

if (pool) attachDatabasePool(pool);
