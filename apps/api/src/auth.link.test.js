import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import app from "./app.js";
import { clearDbClientForTests, dbQuery } from "./db/index.js";
import {
  setupTestDb,
  registerAndLogin,
  expectErrorResponseWithRequestId,
} from "./test-helpers.js";
import { resetLoginProtectionState } from "./middlewares/login-protection.middleware.js";
import {
  resetImportRateLimiterState,
  resetWriteRateLimiterState,
} from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";

const GOOGLE_SUB = "google-sub-link-test";
const GOOGLE_EMAIL = "googlelink@test.dev";
const GOOGLE_NAME = "Link Test User";

vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    verifyIdToken: vi.fn().mockResolvedValue({
      getPayload: () => ({
        sub: GOOGLE_SUB,
        email: GOOGLE_EMAIL,
        name: GOOGLE_NAME,
      }),
    }),
  })),
}));

describe("POST /auth/google/link", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await clearDbClientForTests();
  });

  beforeEach(async () => {
    resetLoginProtectionState();
    resetImportRateLimiterState();
    resetWriteRateLimiterState();
    resetHttpMetricsForTests();
    await dbQuery("DELETE FROM transactions");
    await dbQuery("DELETE FROM user_identities");
    await dbQuery("DELETE FROM users");
  });

  it("retorna 401 quando nao autenticado", async () => {
    const response = await request(app)
      .post("/auth/google/link")
      .send({ idToken: "any-token" });

    expect(response.status).toBe(401);
  });

  it("vincula identidade Google a conta com senha existente", async () => {
    const token = await registerAndLogin("user@test.dev", "Senha123");

    const response = await request(app)
      .post("/auth/google/link")
      .set("Authorization", `Bearer ${token}`)
      .send({ idToken: "valid-google-token" });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Conta Google vinculada com sucesso.");

    // Subsequent Google login must resolve to same account
    const googleLogin = await request(app)
      .post("/auth/google")
      .send({ idToken: "valid-google-token" });

    expect(googleLogin.status).toBe(200);
    expect(googleLogin.body.user.email).toBe("user@test.dev");
  });

  it("retorna 200 (idempotente) quando identidade Google ja esta vinculada ao mesmo usuario", async () => {
    const token = await registerAndLogin("user@test.dev", "Senha123");

    // First link
    await request(app)
      .post("/auth/google/link")
      .set("Authorization", `Bearer ${token}`)
      .send({ idToken: "valid-google-token" });

    // Second link — same identity, same user
    const response = await request(app)
      .post("/auth/google/link")
      .set("Authorization", `Bearer ${token}`)
      .send({ idToken: "valid-google-token" });

    expect(response.status).toBe(200);
  });

  it("retorna 409 quando identidade Google ja esta vinculada a outro usuario", async () => {
    // First user claims the Google identity
    const tokenA = await registerAndLogin("usera@test.dev", "Senha123");
    await request(app)
      .post("/auth/google/link")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ idToken: "valid-google-token" });

    // Second user tries to link the same Google identity
    const tokenB = await registerAndLogin("userb@test.dev", "Senha123");
    const response = await request(app)
      .post("/auth/google/link")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ idToken: "valid-google-token" });

    expectErrorResponseWithRequestId(
      response,
      409,
      "Esta conta Google ja esta vinculada a outro usuario.",
    );
  });

  it("retorna 400 quando idToken esta ausente", async () => {
    const token = await registerAndLogin("user@test.dev", "Senha123");

    const response = await request(app)
      .post("/auth/google/link")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expectErrorResponseWithRequestId(response, 400, "Token Google ausente ou invalido.");
  });
});
