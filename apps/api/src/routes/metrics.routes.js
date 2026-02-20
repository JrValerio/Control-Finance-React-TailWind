import { Router } from "express";
import { getMetricsContentType, getMetricsSnapshot } from "../observability/http-metrics.js";

const router = Router();

const resolveMetricsAuthToken = () => {
  const configuredToken = String(process.env.METRICS_AUTH_TOKEN || "").trim();
  return configuredToken;
};

const resolveAuthorizationToken = (authorizationHeader) => {
  if (typeof authorizationHeader !== "string") {
    return "";
  }

  if (!authorizationHeader.startsWith("Bearer ")) {
    return "";
  }

  return authorizationHeader.slice("Bearer ".length).trim();
};

const shouldProtectMetricsEndpoint = () => process.env.NODE_ENV === "production";

router.get("/", async (req, res, next) => {
  try {
    if (shouldProtectMetricsEndpoint()) {
      const expectedToken = resolveMetricsAuthToken();
      const providedToken = resolveAuthorizationToken(req.headers.authorization);

      if (!expectedToken || providedToken !== expectedToken) {
        return res.status(403).json({
          message: "Forbidden.",
          requestId: req.requestId || null,
        });
      }
    }

    const metricsPayload = await getMetricsSnapshot();
    res.setHeader("Content-Type", getMetricsContentType());
    res.setHeader("Cache-Control", "no-store");

    return res.status(200).send(metricsPayload);
  } catch (error) {
    return next(error);
  }
});

export default router;
