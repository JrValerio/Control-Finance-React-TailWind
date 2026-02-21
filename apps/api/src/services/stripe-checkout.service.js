import Stripe from "stripe";
import { dbQuery } from "../db/index.js";

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const resolvePriceId = async () => {
  const dbResult = await dbQuery(
    `SELECT stripe_price_id FROM plans
      WHERE name = 'pro' AND is_active = true AND stripe_price_id IS NOT NULL
      LIMIT 1`,
  );
  if (dbResult.rows.length > 0) return dbResult.rows[0].stripe_price_id;

  const envPriceId = process.env.STRIPE_PRICE_ID_PRO;
  if (envPriceId) return envPriceId;

  throw createError(500, "Pro plan price not configured.");
};

export const createCheckoutSession = async ({ userId, userEmail }) => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw createError(500, "Stripe secret key not configured.");

  const successUrl = process.env.STRIPE_CHECKOUT_SUCCESS_URL;
  const cancelUrl = process.env.STRIPE_CHECKOUT_CANCEL_URL;
  if (!successUrl || !cancelUrl) throw createError(500, "Checkout URLs not configured.");

  const existing = await dbQuery(
    `SELECT id FROM subscriptions
      WHERE user_id = $1 AND status IN ('active', 'trialing', 'past_due')
      LIMIT 1`,
    [userId],
  );
  if (existing.rows.length > 0) throw createError(409, "Voce ja possui uma assinatura ativa.");

  const priceId = await resolvePriceId();

  const stripe = new Stripe(secretKey, { apiVersion: "2026-01-28.clover" });

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { userId: String(userId) },
    ...(userEmail ? { customer_email: userEmail } : {}),
    allow_promotion_codes: true,
    billing_address_collection: "auto",
  });

  return { url: session.url };
};
