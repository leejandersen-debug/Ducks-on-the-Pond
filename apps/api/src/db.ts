import pg from "pg";

// One pool per function instance. On Vercel, point DATABASE_URL at a pooled
// connection string (e.g. Neon's "-pooler" host) so instances don't exhaust Postgres.
export const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
  : null;
