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
  const errorLogPayload = {
    event: "request.error",
    requestId,
    method: req.method,
    path: req.originalUrl || req.url,
    statusCode: status,
    message,
  };

  if (typeof error?.stack === "string" && error.stack.trim()) {
    errorLogPayload.stack = error.stack;
  }

  if (process.env.NODE_ENV !== "test") {
    console.error(JSON.stringify(errorLogPayload));
  }

  return res.status(status).json({ message, requestId });
};
