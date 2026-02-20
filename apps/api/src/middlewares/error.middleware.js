import { logError } from "../observability/logger.js";

const createNotFoundError = () => {
  const error = new Error("Route not found");
  error.status = 404;
  return error;
};

const resolveStatusCode = (error) =>
  Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 ? error.status : 500;

const resolveErrorMessage = (error, statusCode) => {
  if (statusCode >= 500) {
    return "Unexpected error.";
  }

  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message.trim();
  }

  return "Unexpected error.";
};

export const notFoundHandler = (_req, _res, next) => {
  next(createNotFoundError());
};

export const errorHandler = (error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const requestId = req.requestId || null;
  const status = resolveStatusCode(error);
  const message = resolveErrorMessage(error, status);
  const parsedUserId = Number(req?.user?.id);
  const userId = Number.isInteger(parsedUserId) && parsedUserId > 0 ? parsedUserId : null;
  const startedAt = Number(req?.requestStartedAt);
  const latencyMs = Number.isFinite(startedAt) ? Math.max(0, Date.now() - startedAt) : null;
  const errorLogPayload = {
    event: "http.request.error",
    requestId,
    method: req.method,
    route: (req.originalUrl || req.url || "/").split("?")[0] || "/",
    status,
    latencyMs,
    userId,
    message,
  };

  if (typeof error?.stack === "string" && error.stack.trim()) {
    errorLogPayload.stack = error.stack;
  }

  logError(errorLogPayload);

  return res.status(status).json({ message, requestId });
};
