import { Router } from "express";
import { healthRouter } from "./health.js";

// Add a resource: create routes/<resource>.ts exporting a Router, then mount it here.
export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
