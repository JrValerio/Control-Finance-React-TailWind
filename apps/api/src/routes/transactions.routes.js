import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authMiddleware);

router.get("/", (req, res) => {
  res.status(501).json({
    message: "Transactions list not implemented yet. Planned for PR 3.",
    userId: req.user.id,
  });
});

router.post("/", (req, res) => {
  res.status(501).json({
    message: "Transactions create not implemented yet. Planned for PR 3.",
    userId: req.user.id,
  });
});

router.delete("/:id", (req, res) => {
  res.status(501).json({
    message: "Transactions delete not implemented yet. Planned for PR 3.",
    userId: req.user.id,
  });
});

export default router;
