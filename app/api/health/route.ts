import { pool } from "@/lib/db";

// Add a resource: create app/api/<resource>/route.ts exporting GET/POST/etc. handlers.
export async function GET() {
  if (!pool) {
    return Response.json({ status: "ok", db: "not_configured" });
  }
  try {
    await pool.query("select 1");
    return Response.json({ status: "ok", db: "ok" });
  } catch (err) {
    return Response.json(
      { status: "error", db: "unreachable", error: (err as NodeJS.ErrnoException).code ?? (err as Error).message },
      { status: 503 },
    );
  }
}
