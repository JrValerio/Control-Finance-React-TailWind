import { Router } from "express";
import {
  resolveApiBuildTimestamp,
  resolveApiCommit,
  resolveApiVersion,
} from "../config/version.js";
import { checkDatabaseHealth } from "../db/index.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const db = await checkDatabaseHealth();
    const responsePayload = {
      ok: db.status === "ok",
      version: resolveApiVersion(),
      commit: resolveApiCommit(),
      buildTimestamp: resolveApiBuildTimestamp(),
      uptimeSeconds: Math.floor(process.uptime()),
      db,
      requestId: req.requestId || null,
    };

    return res.status(responsePayload.ok ? 200 : 503).json(responsePayload);
  } catch (error) {
    return next(error);
  }
});

export default router;
