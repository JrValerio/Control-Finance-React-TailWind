import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { getSubscriptionSummaryForUser } from "../services/billing.service.js";

const router = Router();

router.use(authMiddleware);

router.get("/subscription", async (req, res, next) => {
  try {
    const summary = await getSubscriptionSummaryForUser(req.user.id);
    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
});

export default router;
