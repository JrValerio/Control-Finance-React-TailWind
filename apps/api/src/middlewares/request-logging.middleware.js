import { logInfo } from "../observability/logger.js";

const resolveRoutePath = (req) => {
  const fullPath = typeof req?.originalUrl === "string" ? req.originalUrl : req?.url || "/";
  const [pathWithoutQuery] = String(fullPath).split("?");

  return pathWithoutQuery || "/";
};

const resolveLatencyMs = (startedAt) => {
  if (!Number.isFinite(startedAt)) {
    return null;
  }

  return Math.max(0, Date.now() - startedAt);
};

const resolveUserId = (req) => {
  const parsedUserId = Number(req?.user?.id);
  return Number.isInteger(parsedUserId) && parsedUserId > 0 ? parsedUserId : null;
};

export const requestLoggingMiddleware = (req, res, next) => {
  const startedAt = Date.now();

  req.requestStartedAt = startedAt;

  res.on("finish", () => {
    logInfo({
      event: "http.request.completed",
      requestId: req.requestId || null,
      method: req.method,
      route: resolveRoutePath(req),
      status: res.statusCode,
      latencyMs: resolveLatencyMs(startedAt),
      userId: resolveUserId(req),
    });
  });

  next();
};
