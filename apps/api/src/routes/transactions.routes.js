import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
  res.status(501).json({
    message: "Transactions list not implemented yet. Planned for PR 3.",
  });
});

router.post("/", (_req, res) => {
  res.status(501).json({
    message: "Transactions create not implemented yet. Planned for PR 3.",
  });
});

router.delete("/:id", (_req, res) => {
  res.status(501).json({
    message: "Transactions delete not implemented yet. Planned for PR 3.",
  });
});

export default router;
