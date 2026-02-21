import { createHmac, timingSafeEqual } from "node:crypto";
import express, { Router } from "express";
import { processStripeEvent } from "../services/stripe-webhook.service.js";

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const verifyStripeSignature = (rawBody, signatureHeader, secret) => {
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((el) => {
      const idx = el.indexOf("=");
      return [el.slice(0, idx), el.slice(idx + 1)];
    }),
  );

  if (!parts.t || !parts.v1) {
    throw createError(400, "Stripe signature malformed.");
  }

  const expected = createHmac("sha256", secret)
    .update(`${parts.t}.${rawBody}`)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  const receivedBuf = Buffer.from(parts.v1, "utf8");

  if (
    expectedBuf.length !== receivedBuf.length ||
    !timingSafeEqual(expectedBuf, receivedBuf)
  ) {
    throw createError(400, "Stripe signature invalid.");
  }

  const TOLERANCE_SECONDS = 300;
  const age = Math.abs(Math.floor(Date.now() / 1000) - parseInt(parts.t, 10));
  if (age > TOLERANCE_SECONDS) {
    throw createError(400, "Stripe webhook timestamp expired.");
  }
};

const router = Router();

router.post("/stripe", express.raw({ type: "application/json" }), async (req, res, next) => {
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return next(createError(500, "Webhook secret not configured."));

    const sig = req.headers["stripe-signature"];
    if (!sig) return next(createError(400, "Missing Stripe-Signature header."));

    const rawBody = req.body.toString("utf8");
    verifyStripeSignature(rawBody, sig, secret);

    const event = JSON.parse(rawBody);
    await processStripeEvent(event);

    res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
});

export default router;
