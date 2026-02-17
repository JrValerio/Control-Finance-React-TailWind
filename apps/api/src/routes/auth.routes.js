import { Router } from "express";
import { loginUser, registerUser } from "../services/auth.service.js";
import {
  bruteForceLoginGuard,
  clearLoginFailures,
  loginRateLimiter,
  registerLoginFailure,
} from "../middlewares/login-protection.middleware.js";

const router = Router();

router.post("/register", async (req, res, next) => {
  try {
    const authResult = await registerUser(req.body || {});

    res.status(201).json(authResult);
  } catch (error) {
    next(error);
  }
});

router.post("/login", loginRateLimiter, bruteForceLoginGuard, async (req, res, next) => {
  try {
    const authResult = await loginUser(req.body || {});
    clearLoginFailures(req);

    res.status(200).json(authResult);
  } catch (error) {
    if (error.status === 401) {
      registerLoginFailure(req);
    }

    next(error);
  }
});

export default router;
