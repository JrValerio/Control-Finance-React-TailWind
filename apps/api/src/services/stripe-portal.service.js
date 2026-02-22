import Stripe from "stripe";
import { dbQuery } from "../db/index.js";

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

export const createPortalSession = async ({ userId }) => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw createError(500, "Stripe secret key not configured.");

  const returnUrl = process.env.STRIPE_PORTAL_RETURN_URL;
  if (!returnUrl) throw createError(500, "Portal return URL not configured.");

  const result = await dbQuery(
    `SELECT stripe_customer_id FROM subscriptions
      WHERE user_id = $1 AND stripe_customer_id IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId],
  );

  if (result.rows.length === 0) {
    throw createError(422, "Nenhuma assinatura encontrada para este usuario.");
  }

  const stripeCustomerId = result.rows[0].stripe_customer_id;

  const stripe = new Stripe(secretKey, { apiVersion: "2026-01-28.clover" });

  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });

  return { url: session.url };
};
