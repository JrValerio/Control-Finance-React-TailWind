import { randomUUID } from "node:crypto";

const MAX_REQUEST_ID_LENGTH = 128;

const normalizeRequestIdValue = (value) => {
  if (Array.isArray(value)) {
    const firstValue = value.find((item) => typeof item === "string" && item.trim());
    return normalizeRequestIdValue(firstValue || "");
  }

  if (typeof value !== "string") {
    return "";
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return "";
  }

  return normalizedValue.slice(0, MAX_REQUEST_ID_LENGTH);
};

export const requestIdMiddleware = (req, res, next) => {
  const requestIdFromHeader = normalizeRequestIdValue(req.headers["x-request-id"]);
  const requestIdFromCorrelation = normalizeRequestIdValue(req.headers["x-correlation-id"]);
  const requestId = requestIdFromHeader || requestIdFromCorrelation || randomUUID();

  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  next();
};

