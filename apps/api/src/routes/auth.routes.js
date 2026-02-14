import { Router } from "express";
import { loginUser, registerUser } from "../services/auth.service.js";

const router = Router();

router.post("/register", async (req, res, next) => {
  try {
    const user = await registerUser(req.body || {});

    res.status(201).json({ user });
  } catch (error) {
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const authResult = await loginUser(req.body || {});

    res.status(200).json(authResult);
  } catch (error) {
    next(error);
  }
});

export default router;
