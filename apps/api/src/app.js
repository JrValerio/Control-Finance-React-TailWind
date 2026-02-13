import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import transactionsRoutes from "./routes/transactions.routes.js";
import { notFoundHandler, errorHandler } from "./middlewares/error.middleware.js";

dotenv.config();

const app = express();

const allowedOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";

app.use(
  cors({
    origin: allowedOrigin,
    credentials: true,
  }),
);

app.use(express.json());
app.use("/health", healthRoutes);
app.use("/auth", authRoutes);
app.use("/transactions", transactionsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
