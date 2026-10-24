import { cache } from "react";
import { withUser } from "@/lib/db";

// Why the pages can't use the database here, or null if they can. Checked once per request
// (React cache), so the layout can explain and pages can skip their queries instead of
// throwing, e.g. in production before the schema is applied there.
export const dbProblem = cache(async (): Promise<string | null> => {
  try {
    await withUser(null, (db) => db.query("select 1 from profiles limit 1"));
    return null;
  } catch (err) {
    return (err as { code?: string }).code === "42P01"
      ? "The database schema hasn't been applied in this environment yet."
      : "The database isn't reachable from this environment.";
  }
});
