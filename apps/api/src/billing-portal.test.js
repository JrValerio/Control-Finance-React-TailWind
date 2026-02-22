import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import app from "./app.js";
import { clearDbClientForTests, dbQuery } from "./db/index.js";
import { resetLoginProtectionState } from "./middlewares/login-protection.middleware.js";
import {
  resetImportRateLimiterState,
  resetWriteRateLimiterState,
} from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";
import { makeProUser, registerAndLogin, setupTestDb } from "./test-helpers.js";

const { mockPortalCreate } = vi.hoisted(() => ({
  mockPortalCreate: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    billingPortal: { sessions: { create: mockPortalCreate } },
  })),
}));

describe("billing portal", () => {
  beforeAll(async () => {
    await setupTestDb();
    process.env.STRIPE_SECRET_KEY = "sk_test_mock_controlfinance";
    process.env.STRIPE_PORTAL_RETURN_URL = "https://app.test/billing";
  });

  afterAll(async () => {
    await clearDbClientForTests();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_PORTAL_RETURN_URL;
  });

  beforeEach(async () => {
    resetLoginProtectionState();
    resetImportRateLimiterState();
    resetWriteRateLimiterState();
    resetHttpMetricsForTests();
    await dbQuery("DELETE FROM subscriptions");
    await dbQuery("DELETE FROM transactions");
    await dbQuery("DELETE FROM users");
    mockPortalCreate.mockReset();
    mockPortalCreate.mockResolvedValue({ url: "https://billing.stripe.com/portal/test-session-001" });
  });

  it("retorna 401 sem token", async () => {
    const response = await request(app).post("/billing/portal");
    expect(response.status).toBe(401);
  });

  it("retorna 422 quando usuario nao possui stripe_customer_id", async () => {
    const email = "portal-no-customer@controlfinance.dev";
    const token = await registerAndLogin(email);
    // subscription sem stripe_customer_id
    await makeProUser(email);

    const response = await request(app)
      .post("/billing/portal")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(422);
    expect(response.body.message).toBe("Nenhuma assinatura encontrada para este usuario.");
    expect(mockPortalCreate).not.toHaveBeenCalled();
  });

  it("retorna 422 quando usuario nao possui assinatura", async () => {
    const token = await registerAndLogin("portal-free@controlfinance.dev");

    const response = await request(app)
      .post("/billing/portal")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(422);
    expect(response.body.message).toBe("Nenhuma assinatura encontrada para este usuario.");
    expect(mockPortalCreate).not.toHaveBeenCalled();
  });

  it("retorna 200 com url para usuario com stripe_customer_id", async () => {
    const email = "portal-ok@controlfinance.dev";
    const token = await registerAndLogin(email);
    await makeProUser(email);
    const userResult = await dbQuery(`SELECT id FROM users WHERE email = $1`, [email]);
    const userId = userResult.rows[0].id;
    await dbQuery(
      `UPDATE subscriptions SET stripe_customer_id = 'cus_test_abc123' WHERE user_id = $1`,
      [userId],
    );

    const response = await request(app)
      .post("/billing/portal")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.url).toBe("https://billing.stripe.com/portal/test-session-001");
  });

  it("passa customer e return_url corretos para Stripe", async () => {
    const email = "portal-args@controlfinance.dev";
    const token = await registerAndLogin(email);
    await makeProUser(email);
    const userResult = await dbQuery(`SELECT id FROM users WHERE email = $1`, [email]);
    const userId = userResult.rows[0].id;
    await dbQuery(
      `UPDATE subscriptions SET stripe_customer_id = 'cus_test_xyz789' WHERE user_id = $1`,
      [userId],
    );

    await request(app)
      .post("/billing/portal")
      .set("Authorization", `Bearer ${token}`);

    expect(mockPortalCreate).toHaveBeenCalledOnce();
    const args = mockPortalCreate.mock.calls[0][0];
    expect(args.customer).toBe("cus_test_xyz789");
    expect(args.return_url).toBe("https://app.test/billing");
  });

  it("retorna 500 se STRIPE_SECRET_KEY nao configurado", async () => {
    const saved = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    try {
      const token = await registerAndLogin("portal-no-key@controlfinance.dev");
      const response = await request(app)
        .post("/billing/portal")
        .set("Authorization", `Bearer ${token}`);
      expect(response.status).toBe(500);
      expect(mockPortalCreate).not.toHaveBeenCalled();
    } finally {
      process.env.STRIPE_SECRET_KEY = saved;
    }
  });

  it("retorna 500 se STRIPE_PORTAL_RETURN_URL nao configurado", async () => {
    const saved = process.env.STRIPE_PORTAL_RETURN_URL;
    delete process.env.STRIPE_PORTAL_RETURN_URL;
    try {
      const token = await registerAndLogin("portal-no-url@controlfinance.dev");
      const response = await request(app)
        .post("/billing/portal")
        .set("Authorization", `Bearer ${token}`);
      expect(response.status).toBe(500);
      expect(mockPortalCreate).not.toHaveBeenCalled();
    } finally {
      process.env.STRIPE_PORTAL_RETURN_URL = saved;
    }
  });
});
