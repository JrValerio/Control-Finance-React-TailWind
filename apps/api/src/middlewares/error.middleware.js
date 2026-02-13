export const notFoundHandler = (_req, res) => {
  res.status(404).json({ message: "Route not found" });
};

export const errorHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const status = error.status || 500;
  const message = error.message || "Internal server error";

  return res.status(status).json({ message });
};
