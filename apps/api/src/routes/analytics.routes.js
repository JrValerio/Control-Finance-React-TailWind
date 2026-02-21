import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { getMonthlyTrendForUser } from "../services/analytics.service.js";

const router = Router();

router.use(authMiddleware);

router.get("/trend", async (req, res, next) => {
  try {
    const trend = await getMonthlyTrendForUser(req.user.id, req.query?.months);
    res.status(200).json(trend);
  } catch (error) {
    next(error);
  }
});

export default router;
