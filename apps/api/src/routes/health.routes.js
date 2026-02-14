import { Router } from "express";
import { API_VERSION } from "../config/version.js";

const router = Router();

router.get("/", (_req, res) => {
  res.status(200).json({ ok: true, version: API_VERSION });
});

export default router;
