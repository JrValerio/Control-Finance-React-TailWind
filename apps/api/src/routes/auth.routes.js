import { Router } from "express";
import { loginUser, registerUser, loginOrRegisterWithGoogle } from "../services/auth.service.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
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

router.post("/google", async (req, res, next) => {
  try {
    const authResult = await loginOrRegisterWithGoogle(req.body || {});
    res.status(200).json(authResult);
  } catch (error) {
    next(error);
  }
});

router.get("/me", authMiddleware, (req, res) => {
  res.status(200).json({ id: req.user.id, email: req.user.email });
});

export default router;
