import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import categoriesRoutes from "./routes/categories.routes.js";
import budgetsRoutes from "./routes/budgets.routes.js";
import transactionsRoutes from "./routes/transactions.routes.js";
import { notFoundHandler, errorHandler } from "./middlewares/error.middleware.js";
import { requestIdMiddleware } from "./middlewares/request-id.middleware.js";

dotenv.config();

const app = express();

const resolveTrustProxyValue = () => {
  const rawValue = (process.env.TRUST_PROXY || "").trim().toLowerCase();

  if (!rawValue) {
    return process.env.NODE_ENV === "production" ? 1 : false;
  }

  if (rawValue === "true") {
    return true;
  }

  if (rawValue === "false") {
    return false;
  }

  const parsedValue = Number(rawValue);

  if (Number.isInteger(parsedValue) && parsedValue >= 0) {
    return parsedValue;
  }

  return rawValue;
};

app.set("trust proxy", resolveTrustProxyValue());
app.use(requestIdMiddleware);

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      const corsError = new Error("CORS origin not allowed.");
      corsError.status = 403;
      return callback(corsError);
    },
    credentials: true,
  }),
);

app.use(express.json());
app.use("/health", healthRoutes);
app.use("/auth", authRoutes);
app.use("/categories", categoriesRoutes);
app.use("/budgets", budgetsRoutes);
app.use("/transactions", transactionsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
