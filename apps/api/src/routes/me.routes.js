import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { getMyProfile, updateMyProfile } from "../services/profile.service.js";

const router = Router();

router.use(authMiddleware);

router.get("/", async (req, res, next) => {
  try {
    const result = await getMyProfile(req.user.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.patch("/profile", async (req, res, next) => {
  try {
    const profile = await updateMyProfile(req.user.id, req.body ?? {});
    res.status(200).json(profile);
  } catch (error) {
    next(error);
  }
});

export default router;
