export const notFoundHandler = (_req, res) => {
  res.status(404).json({ message: "Route not found" });
};

export const errorHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const status =
    Number.isInteger(error?.status) && error.status >= 400 && error.status < 600
      ? error.status
      : 500;
  const message =
    typeof error?.message === "string" && error.message.trim()
      ? error.message
      : "Internal server error";

  return res.status(status).json({ message });
};
