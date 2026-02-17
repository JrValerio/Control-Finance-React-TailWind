import { Router } from "express";
import { resolveApiCommit, resolveApiVersion } from "../config/version.js";

const router = Router();

router.get("/", (_req, res) => {
  res.status(200).json({
    ok: true,
    version: resolveApiVersion(),
    commit: resolveApiCommit(),
  });
});

export default router;
