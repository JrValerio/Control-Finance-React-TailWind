const LOG_LEVELS = {
  info: "info",
  warn: "warn",
  error: "error",
};

const normalizeTextValue = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const toLogSafeValue = (value) => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map(toLogSafeValue);
  }

  if (typeof value === "object") {
    return Object.entries(value).reduce((accumulator, [key, entryValue]) => {
      const normalizedValue = toLogSafeValue(entryValue);
      if (typeof normalizedValue !== "undefined") {
        accumulator[key] = normalizedValue;
      }
      return accumulator;
    }, {});
  }

  return value;
};

const shouldEmitStructuredLogs = () => {
  const isVitestRuntime = normalizeTextValue(process.env.VITEST).toLowerCase() === "true";
  const isTestEnvironment = process.env.NODE_ENV === "test" || isVitestRuntime;

  if (!isTestEnvironment) {
    return true;
  }

  return normalizeTextValue(process.env.LOG_API_EVENTS_IN_TEST).toLowerCase() === "true";
};

const resolveLogLevel = (level) => {
  const normalizedLevel = normalizeTextValue(level).toLowerCase();

  if (normalizedLevel === LOG_LEVELS.warn) {
    return LOG_LEVELS.warn;
  }

  if (normalizedLevel === LOG_LEVELS.error) {
    return LOG_LEVELS.error;
  }

  return LOG_LEVELS.info;
};

export const logStructuredEvent = (level, payload = {}) => {
  if (!shouldEmitStructuredLogs()) {
    return;
  }

  const normalizedLevel = resolveLogLevel(level);
  const normalizedPayload = toLogSafeValue(payload);
  const logPayload = {
    level: normalizedLevel,
    timestamp: new Date().toISOString(),
    ...(typeof normalizedPayload === "object" && normalizedPayload ? normalizedPayload : {}),
  };

  const serializedPayload = JSON.stringify(logPayload);

  if (normalizedLevel === LOG_LEVELS.error) {
    console.error(serializedPayload);
    return;
  }

  console.log(serializedPayload);
};

export const logInfo = (payload) => {
  logStructuredEvent(LOG_LEVELS.info, payload);
};

export const logWarn = (payload) => {
  logStructuredEvent(LOG_LEVELS.warn, payload);
};

export const logError = (payload) => {
  logStructuredEvent(LOG_LEVELS.error, payload);
};
