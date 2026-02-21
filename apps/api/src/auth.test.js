import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import app from "./app.js";
import { clearDbClientForTests, dbQuery, setDbClientForTests } from "./db/index.js";
import {
  LOGIN_THROTTLE_MESSAGE,
  resetLoginProtectionState,
} from "./middlewares/login-protection.middleware.js";
import {
  resetImportRateLimiterState,
  resetWriteRateLimiterState,
} from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";
import {
  expectErrorResponseWithRequestId,
  setupTestDb,
  snapshotAuthSecurityEnv,
  restoreAuthSecurityEnv,
} from "./test-helpers.js";

describe("auth", () => {
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
    await dbQuery("DELETE FROM users");
  });

  it("POST /auth/register cria usuario", async () => {
    const response = await request(app).post("/auth/register").send({
      name: "Junior",
      email: "jr@controlfinance.dev",
      password: "Senha123",
    });

    expect(response.status).toBe(201);
    expect(typeof response.body.token).toBe("string");
    expect(response.body.token.length).toBeGreaterThan(10);
    expect(response.body.user).toMatchObject({
      name: "Junior",
      email: "jr@controlfinance.dev",
    });
    expect(Number.isInteger(response.body.user.id)).toBe(true);
    expect(response.body.user.id).toBeGreaterThan(0);
    expect(response.body.user.password_hash).toBeUndefined();
  });

  it("POST /auth/register bloqueia email duplicado", async () => {
    await request(app).post("/auth/register").send({
      email: "duplicado@controlfinance.dev",
      password: "Senha123",
    });

    const response = await request(app).post("/auth/register").send({
      email: "duplicado@controlfinance.dev",
      password: "Senha123",
    });

    expectErrorResponseWithRequestId(response, 409, "Usuario ja cadastrado.");
  });

  it("POST /auth/register retorna erro quando email esta vazio", async () => {
    const response = await request(app).post("/auth/register").send({
      email: "",
      password: "Senha123",
    });

    expectErrorResponseWithRequestId(response, 400, "Email e senha sao obrigatorios.");
  });

  it("POST /auth/register retorna erro quando senha esta vazia", async () => {
    const response = await request(app).post("/auth/register").send({
      email: "vazio-register@controlfinance.dev",
      password: "",
    });

    expectErrorResponseWithRequestId(response, 400, "Email e senha sao obrigatorios.");
  });

  it("POST /auth/login retorna token", async () => {
    await request(app).post("/auth/register").send({
      email: "login@controlfinance.dev",
      password: "Senha123",
    });

    const response = await request(app).post("/auth/login").send({
      email: "login@controlfinance.dev",
      password: "Senha123",
    });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe("login@controlfinance.dev");
    expect(typeof response.body.token).toBe("string");
    expect(response.body.token.length).toBeGreaterThan(10);
    expect(response.body.user.password_hash).toBeUndefined();
  });

  it("POST /auth/login retorna erro quando email esta vazio", async () => {
    const response = await request(app).post("/auth/login").send({
      email: "",
      password: "Senha123",
    });

    expectErrorResponseWithRequestId(response, 400, "Email e senha sao obrigatorios.");
  });

  it("POST /auth/login retorna erro quando senha esta vazia", async () => {
    const response = await request(app).post("/auth/login").send({
      email: "vazio-login@controlfinance.dev",
      password: "",
    });

    expectErrorResponseWithRequestId(response, 400, "Email e senha sao obrigatorios.");
  });

  it("aplica bloqueio por brute force e desbloqueia apos janela", async () => {
    const envSnapshot = snapshotAuthSecurityEnv();
    const lockWindowInMs = 1000;
    let now = Date.parse("2026-01-01T00:00:00.000Z");
    const dateNowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);

    process.env.AUTH_BRUTE_FORCE_MAX_ATTEMPTS = "2";
    process.env.AUTH_BRUTE_FORCE_WINDOW_MS = String(lockWindowInMs);
    process.env.AUTH_BRUTE_FORCE_LOCK_MS = String(lockWindowInMs);
    resetLoginProtectionState();

    try {
      await request(app).post("/auth/register").send({
        email: "brute-window@controlfinance.dev",
        password: "Senha123",
      });

      const invalidCredentials = {
        email: "brute-window@controlfinance.dev",
        password: "Senha999",
      };

      const firstFailure = await request(app).post("/auth/login").send(invalidCredentials);
      const secondFailure = await request(app)
        .post("/auth/login")
        .send(invalidCredentials);
      const blockedAttempt = await request(app)
        .post("/auth/login")
        .send(invalidCredentials);

      expect(firstFailure.status).toBe(401);
      expect(secondFailure.status).toBe(401);
      expect(blockedAttempt.status).toBe(429);
      expect(blockedAttempt.body.message).toBe(LOGIN_THROTTLE_MESSAGE);

      now += lockWindowInMs + 1;

      const unlockedAttempt = await request(app)
        .post("/auth/login")
        .send(invalidCredentials);

      expect(unlockedAttempt.status).toBe(401);
    } finally {
      dateNowSpy.mockRestore();
      restoreAuthSecurityEnv(envSnapshot);
      resetLoginProtectionState();
    }
  });

  it("isola bloqueio por combinacao de IP + email", async () => {
    const envSnapshot = snapshotAuthSecurityEnv();
    process.env.AUTH_BRUTE_FORCE_MAX_ATTEMPTS = "2";
    process.env.AUTH_BRUTE_FORCE_WINDOW_MS = "1000";
    process.env.AUTH_BRUTE_FORCE_LOCK_MS = "1000";

    try {
      await request(app).post("/auth/register").send({
        email: "brute-a@controlfinance.dev",
        password: "Senha123",
      });

      await request(app).post("/auth/register").send({
        email: "brute-b@controlfinance.dev",
        password: "Senha123",
      });

      const invalidForUserA = {
        email: "brute-a@controlfinance.dev",
        password: "Senha999",
      };

      await request(app).post("/auth/login").send(invalidForUserA);
      await request(app).post("/auth/login").send(invalidForUserA);

      const blockedUserA = await request(app).post("/auth/login").send(invalidForUserA);
      expect(blockedUserA.status).toBe(429);

      const invalidForUserB = await request(app).post("/auth/login").send({
        email: "brute-b@controlfinance.dev",
        password: "Senha999",
      });

      expect(invalidForUserB.status).toBe(401);
    } finally {
      restoreAuthSecurityEnv(envSnapshot);
      resetLoginProtectionState();
    }
  });

  it.each([
    ["12345678", "somente-numeros"],
    ["abcdefgh", "somente-letras"],
    ["abc123", "menos-8"],
  ])(
    "POST /auth/register bloqueia senha fraca (%s - %s)",
    async (password, label) => {
      const response = await request(app).post("/auth/register").send({
        email: `fraca-${label}@controlfinance.dev`,
        password,
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(
        "Senha fraca: use no minimo 8 caracteres com letras e numeros.",
      );
    },
  );

  it("POST /auth/register aceita senha forte", async () => {
    const response = await request(app).post("/auth/register").send({
      email: "forte@controlfinance.dev",
      password: "abc12345",
    });

    expect(response.status).toBe(201);
  });
});
