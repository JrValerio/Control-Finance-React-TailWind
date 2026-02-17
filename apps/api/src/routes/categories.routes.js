import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
  createCategoryForUser,
  listCategoriesByUser,
} from "../services/categories.service.js";

const router = Router();

router.use(authMiddleware);

router.get("/", async (req, res, next) => {
  try {
    const categories = await listCategoriesByUser(req.user.id);
    res.status(200).json(categories);
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const category = await createCategoryForUser(req.user.id, req.body || {});
    res.status(201).json(category);
  } catch (error) {
    next(error);
  }
});

export default router;
