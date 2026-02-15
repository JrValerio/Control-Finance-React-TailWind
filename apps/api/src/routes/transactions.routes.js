import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
  createTransactionForUser,
  deleteTransactionForUser,
  exportTransactionsCsvByUser,
  listTransactionsByUser,
  restoreTransactionForUser,
  updateTransactionForUser,
} from "../services/transactions.service.js";

const router = Router();

router.use(authMiddleware);

const getListFiltersFromQuery = (query = {}, options = {}) => {
  const includePagination = options.includePagination !== false;
  const filters = {
    includeDeleted: String(query.includeDeleted || "").toLowerCase() === "true",
    type: query.type,
    from: query.from,
    to: query.to,
    q: query.q,
  };

  if (includePagination) {
    filters.page = query.page;
    filters.limit = query.limit;
  }

  return filters;
};

router.get("/export.csv", async (req, res, next) => {
  try {
    const csvExport = await exportTransactionsCsvByUser(
      req.user.id,
      getListFiltersFromQuery(req.query, { includePagination: false }),
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${csvExport.fileName}"`,
    );

    res.status(200).send(csvExport.content);
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const transactions = await listTransactionsByUser(
      req.user.id,
      getListFiltersFromQuery(req.query),
    );
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

router.patch("/:id", async (req, res, next) => {
  try {
    const updatedTransaction = await updateTransactionForUser(
      req.user.id,
      req.params.id,
      req.body || {},
    );
    res.status(200).json(updatedTransaction);
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

router.post("/:id/restore", async (req, res, next) => {
  try {
    const restoredTransaction = await restoreTransactionForUser(req.user.id, req.params.id);
    res.status(200).json(restoredTransaction);
  } catch (error) {
    next(error);
  }
});

export default router;
