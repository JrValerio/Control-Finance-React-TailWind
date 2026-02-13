import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
  res.status(200).json({ ok: true, version: "1.3.0" });
});

export default router;
