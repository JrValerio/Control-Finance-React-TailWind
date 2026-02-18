import { Router } from "express";
import path from "node:path";
import multer from "multer";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { importRateLimiter } from "../middlewares/rate-limit.middleware.js";
import {
  createTransactionForUser,
  deleteTransactionForUser,
  exportTransactionsCsvByUser,
  getMonthlySummaryForUser,
  listTransactionsByUser,
  restoreTransactionForUser,
  updateTransactionForUser,
} from "../services/transactions.service.js";
import {
  commitTransactionsImportForUser,
  dryRunTransactionsImportForUser,
} from "../services/transactions-import.service.js";

const router = Router();
const CSV_MAX_FILE_SIZE_BYTES = Number(process.env.IMPORT_CSV_MAX_FILE_SIZE_BYTES || 2 * 1024 * 1024);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize:
      Number.isInteger(CSV_MAX_FILE_SIZE_BYTES) && CSV_MAX_FILE_SIZE_BYTES > 0
        ? CSV_MAX_FILE_SIZE_BYTES
        : 2 * 1024 * 1024,
  },
});

router.use(authMiddleware);

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const ensureValidCsvFile = (file) => {
  if (!file) {
    throw createError(400, "Arquivo CSV (file) e obrigatorio.");
  }

  const originalName = String(file.originalname || "");
  const extension = path.extname(originalName).toLowerCase();
  const mimeType = String(file.mimetype || "").toLowerCase();
  const hasCsvExtension = extension === ".csv";
  const hasCsvMimeType = ["text/csv", "application/csv", "application/vnd.ms-excel"].includes(
    mimeType,
  );

  if ((!hasCsvExtension && !hasCsvMimeType) || !file.buffer || file.buffer.length === 0) {
    throw createError(400, "Arquivo invalido. Envie um CSV.");
  }
};

const getListFiltersFromQuery = (query = {}, options = {}) => {
  const includePagination = options.includePagination !== false;
  const filters = {
    includeDeleted: String(query.includeDeleted || "").toLowerCase() === "true",
    type: query.type,
    from: query.from,
    to: query.to,
    q: query.q,
    categoryId: query.categoryId,
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

router.get("/summary", async (req, res, next) => {
  try {
    const summary = await getMonthlySummaryForUser(req.user.id, req.query.month);
    res.status(200).json(summary);
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

router.post("/import/dry-run", importRateLimiter, (req, res, next) => {
  upload.single("file")(req, res, async (error) => {
    if (error) {
      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        return next(createError(413, "Arquivo muito grande."));
      }

      return next(error);
    }

    try {
      ensureValidCsvFile(req.file);
      const dryRunResult = await dryRunTransactionsImportForUser(req.user.id, req.file.buffer);
      return res.status(200).json(dryRunResult);
    } catch (serviceError) {
      return next(serviceError);
    }
  });
});

router.post("/import/commit", importRateLimiter, async (req, res, next) => {
  try {
    const commitResult = await commitTransactionsImportForUser(
      req.user.id,
      req.body?.importId,
    );
    res.status(200).json(commitResult);
  } catch (error) {
    next(error);
  }
});

export default router;
