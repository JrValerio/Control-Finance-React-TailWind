import rateLimit from "express-rate-limit";

const DEFAULT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 20;
const DEFAULT_BRUTE_FORCE_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_BRUTE_FORCE_MAX_ATTEMPTS = 5;
const DEFAULT_BRUTE_FORCE_LOCK_MS = 15 * 60 * 1000;

export const LOGIN_THROTTLE_MESSAGE =
  "Muitas tentativas de login. Tente novamente em alguns minutos.";

const loginAttemptStore = new Map();

const parsePositiveInteger = (value, fallbackValue) => {
  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue > 0
    ? parsedValue
    : fallbackValue;
};

const getRateLimitWindowMs = () =>
  parsePositiveInteger(
    process.env.AUTH_RATE_LIMIT_WINDOW_MS,
    DEFAULT_RATE_LIMIT_WINDOW_MS,
  );

const getRateLimitMaxRequests = () =>
  parsePositiveInteger(
    process.env.AUTH_RATE_LIMIT_MAX_REQUESTS,
    DEFAULT_RATE_LIMIT_MAX_REQUESTS,
  );

const getBruteForceWindowMs = () =>
  parsePositiveInteger(
    process.env.AUTH_BRUTE_FORCE_WINDOW_MS,
    DEFAULT_BRUTE_FORCE_WINDOW_MS,
  );

const getBruteForceMaxAttempts = () =>
  parsePositiveInteger(
    process.env.AUTH_BRUTE_FORCE_MAX_ATTEMPTS,
    DEFAULT_BRUTE_FORCE_MAX_ATTEMPTS,
  );

const getBruteForceLockMs = () =>
  parsePositiveInteger(
    process.env.AUTH_BRUTE_FORCE_LOCK_MS,
    DEFAULT_BRUTE_FORCE_LOCK_MS,
  );

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const getRequestIp = (request) =>
  request.ip || request.socket?.remoteAddress || "unknown";

const normalizeEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

const getLoginAttemptKey = (request) => {
  const email = normalizeEmail(request.body?.email);

  if (!email) {
    return null;
  }

  return `${getRequestIp(request)}:${email}`;
};

const shouldResetAttemptState = (entry, now) => {
  if (!entry) {
    return true;
  }

  if (entry.lockUntil && entry.lockUntil <= now) {
    return true;
  }

  return now - entry.firstFailedAt >= getBruteForceWindowMs();
};

export const loginRateLimiter = rateLimit({
  windowMs: getRateLimitWindowMs(),
  max: getRateLimitMaxRequests(),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (request) => getRequestIp(request),
  handler: (_request, _response, next) => {
    next(createError(429, LOGIN_THROTTLE_MESSAGE));
  },
});

export const bruteForceLoginGuard = (request, _response, next) => {
  const attemptKey = getLoginAttemptKey(request);
  request.loginAttemptKey = attemptKey;

  if (!attemptKey) {
    next();
    return;
  }

  const entry = loginAttemptStore.get(attemptKey);
  const now = Date.now();

  if (!entry) {
    next();
    return;
  }

  if (shouldResetAttemptState(entry, now)) {
    loginAttemptStore.delete(attemptKey);
    next();
    return;
  }

  if (entry.lockUntil && entry.lockUntil > now) {
    next(createError(429, LOGIN_THROTTLE_MESSAGE));
    return;
  }

  next();
};

export const registerLoginFailure = (request) => {
  const attemptKey = request.loginAttemptKey || getLoginAttemptKey(request);

  if (!attemptKey) {
    return;
  }

  const now = Date.now();
  const maxAttempts = getBruteForceMaxAttempts();
  const lockMs = getBruteForceLockMs();
  const currentEntry = loginAttemptStore.get(attemptKey);

  if (shouldResetAttemptState(currentEntry, now)) {
    const shouldLockImmediately = maxAttempts <= 1;
    loginAttemptStore.set(attemptKey, {
      failedCount: 1,
      firstFailedAt: now,
      lockUntil: shouldLockImmediately ? now + lockMs : 0,
    });
    return;
  }

  const failedCount = currentEntry.failedCount + 1;
  const lockUntil = failedCount >= maxAttempts ? now + lockMs : 0;

  loginAttemptStore.set(attemptKey, {
    failedCount,
    firstFailedAt: currentEntry.firstFailedAt,
    lockUntil,
  });
};

export const clearLoginFailures = (request) => {
  const attemptKey = request.loginAttemptKey || getLoginAttemptKey(request);

  if (!attemptKey) {
    return;
  }

  loginAttemptStore.delete(attemptKey);
};

export const resetLoginProtectionState = () => {
  loginAttemptStore.clear();

  if (loginRateLimiter?.store?.resetAll) {
    loginRateLimiter.store.resetAll();
  }
};
