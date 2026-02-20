import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { categoriesWriteRateLimiter } from "../middlewares/rate-limit.middleware.js";
import {
  createCategoryForUser,
  deleteCategoryForUser,
  listCategoriesByUser,
  restoreCategoryForUser,
  updateCategoryForUser,
} from "../services/categories.service.js";

const router = Router();

router.use(authMiddleware);

router.get("/", async (req, res, next) => {
  try {
    const categories = await listCategoriesByUser(req.user.id, {
      includeDeleted: req.query?.includeDeleted,
    });
    res.status(200).json(categories);
  } catch (error) {
    next(error);
  }
});

router.post("/", categoriesWriteRateLimiter, async (req, res, next) => {
  try {
    const category = await createCategoryForUser(req.user.id, req.body || {});
    res.status(201).json(category);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", categoriesWriteRateLimiter, async (req, res, next) => {
  try {
    const updatedCategory = await updateCategoryForUser(req.user.id, req.params.id, req.body || {});
    res.status(200).json(updatedCategory);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", categoriesWriteRateLimiter, async (req, res, next) => {
  try {
    const deletedCategory = await deleteCategoryForUser(req.user.id, req.params.id);
    res.status(200).json(deletedCategory);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/restore", categoriesWriteRateLimiter, async (req, res, next) => {
  try {
    const restoredCategory = await restoreCategoryForUser(req.user.id, req.params.id);
    res.status(200).json(restoredCategory);
  } catch (error) {
    next(error);
  }
});

export default router;
