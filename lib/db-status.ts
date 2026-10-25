import { cache } from "react";
import { withUser } from "@/lib/db";
import { log } from "@/lib/log";

// Why the pages can't use the database here, or null if they can. Checked once per request
// (React cache), so the layout can explain and pages can skip their queries instead of
// throwing, e.g. in production before the schema is applied there.
export const dbProblem = cache(async (): Promise<string | null> => {
  try {
    await withUser(null, (db) => db.query("select 1 from profiles limit 1"));
    return null;
  } catch (err) {
    // Code only: driver messages can name the database host and role.
    log.error("db_unavailable", { code: (err as { code?: string }).code ?? "unknown" });
    // 42P01: tables missing. 22023: "set role app_rw" failed because the migration that creates it hasn't run.
    return ["42P01", "22023"].includes((err as { code?: string }).code ?? "")
      ? "The database schema hasn't been applied in this environment yet."
      : "The database isn't reachable from this environment.";
  }
});
