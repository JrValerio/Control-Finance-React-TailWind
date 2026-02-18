import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const DEFAULT_IMPORT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_IMPORT_RATE_LIMIT_MAX_REQUESTS = 10;

const parsePositiveInteger = (value, fallbackValue) => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return fallbackValue;
  }

  return parsedValue;
};

const getImportRateLimitWindowMs = () =>
  parsePositiveInteger(
    process.env.IMPORT_RATE_LIMIT_WINDOW_MS,
    DEFAULT_IMPORT_RATE_LIMIT_WINDOW_MS,
  );

const getImportRateLimitMaxRequests = () =>
  parsePositiveInteger(
    process.env.IMPORT_RATE_LIMIT_MAX,
    DEFAULT_IMPORT_RATE_LIMIT_MAX_REQUESTS,
  );

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

export const importRateLimiter = rateLimit({
  windowMs: getImportRateLimitWindowMs(),
  max: getImportRateLimitMaxRequests(),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (request) => String(request.user?.id || ipKeyGenerator(request.ip || "")),
  handler: (_request, _response, next) => {
    next(createError(429, "Muitas requisicoes. Tente novamente em instantes."));
  },
});

export const resetImportRateLimiterState = () => {
  if (importRateLimiter?.store?.resetAll) {
    importRateLimiter.store.resetAll();
  }
};
