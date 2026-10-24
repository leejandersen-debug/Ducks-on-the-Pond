import express from "express";
import { apiRouter } from "./routes/index.js";

const app = express();

app.use(express.json());
// Vercel forwards the full path (/api/...), so routes are mounted under /api in both places.
app.use("/api", apiRouter);

export default app;
