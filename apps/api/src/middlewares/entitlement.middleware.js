import { getActivePlanFeaturesForUser } from "../services/billing.service.js";

const createPaymentRequiredError = () => {
  const error = new Error("Recurso disponivel apenas no plano Pro.");
  error.status = 402;
  return error;
};

/**
 * Middleware factory for boolean feature gates.
 * Returns 402 if the authenticated user's active plan has featureName === false.
 *
 * Usage:
 *   router.post("/import/dry-run", requireFeature("csv_import"), handler)
 */
export const requireFeature = (featureName) => async (req, res, next) => {
  try {
    const features = await getActivePlanFeaturesForUser(req.user.id);

    if (features[featureName] === false) {
      return next(createPaymentRequiredError());
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * Middleware that attaches the user's full plan features to req.entitlements.
 * Used for numeric caps (e.g. analytics_months_max) where the route needs the value.
 *
 * Usage:
 *   router.get("/trend", attachEntitlements, handler)
 *   // then in handler: req.entitlements.analytics_months_max
 */
export const attachEntitlements = async (req, res, next) => {
  try {
    req.entitlements = await getActivePlanFeaturesForUser(req.user.id);
    return next();
  } catch (error) {
    return next(error);
  }
};
