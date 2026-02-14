import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
  createTransactionForUser,
  deleteTransactionForUser,
  listTransactionsByUser,
} from "../services/transactions.service.js";

const router = Router();

router.use(authMiddleware);

router.get("/", async (req, res, next) => {
  try {
    const transactions = await listTransactionsByUser(req.user.id);
    res.status(200).json(transactions);
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const transaction = await createTransactionForUser(req.user.id, req.body || {});
    res.status(201).json(transaction);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const removedTransaction = await deleteTransactionForUser(req.user.id, req.params.id);
    res.status(200).json({
      id: removedTransaction.id,
      success: true,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
