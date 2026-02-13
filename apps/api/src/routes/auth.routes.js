import { Router } from "express";

const router = Router();

router.post("/register", (_req, res) => {
  res.status(501).json({
    message: "Auth register not implemented yet. Planned for PR 2.",
  });
});

router.post("/login", (_req, res) => {
  res.status(501).json({
    message: "Auth login not implemented yet. Planned for PR 2.",
  });
});

export default router;
