import { pool } from "@/lib/db";
import { log } from "@/lib/log";

// Add a resource: create app/api/<resource>/route.ts exporting GET/POST/etc. handlers.
export async function GET() {
  if (!pool) {
    log.warn("health.db_not_configured");
    return Response.json({ status: "ok", db: "not_configured" });
  }
  try {
    await pool.query("select 1");
    log.debug("health.ok");
    return Response.json({ status: "ok", db: "ok" });
  } catch (err) {
    // Only the error code: driver messages can name the database host and role.
    const code = (err as NodeJS.ErrnoException).code ?? "unknown";
    log.error("health.db_unreachable", { code, status: 503 });
    return Response.json({ status: "error", db: "unreachable", error: code }, { status: 503 });
  }
}
