import { Router } from "express";
import { pool } from "../db.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  if (!pool) {
    res.json({ status: "ok", db: "not_configured" });
    return;
  }
  try {
    await pool.query("select 1");
    res.json({ status: "ok", db: "ok" });
  } catch (err) {
    res.status(503).json({ status: "error", db: "unreachable", error: (err as NodeJS.ErrnoException).code ?? (err as Error).message });
  }
});
