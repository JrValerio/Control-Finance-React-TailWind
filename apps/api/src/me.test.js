import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
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

describe("GET /me", () => {
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
    await dbQuery("DELETE FROM user_profiles");
    await dbQuery("DELETE FROM transactions");
    await dbQuery("DELETE FROM user_identities");
    await dbQuery("DELETE FROM users");
  });

  it("retorna 401 sem token", async () => {
    const response = await request(app).get("/me");
    expect(response.status).toBe(401);
  });

  it("retorna id, name, email, hasPassword, linkedProviders e profile null para usuario sem perfil", async () => {
    const token = await registerAndLogin("me-no-profile@test.dev");

    const response = await request(app)
      .get("/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(typeof response.body.id).toBe("number");
    expect(response.body.email).toBe("me-no-profile@test.dev");
    expect(response.body.hasPassword).toBe(true);
    expect(response.body.linkedProviders).toEqual([]);
    expect(response.body.profile).toBeNull();
  });

  it("retorna hasPassword false para usuario Google-only (sem password_hash)", async () => {
    const email = "me-google-only@test.dev";
    const userResult = await dbQuery(
      `INSERT INTO users (name, email) VALUES ('Google User', $1) RETURNING id`,
      [email],
    );
    const userId = userResult.rows[0].id;
    await dbQuery(
      `INSERT INTO user_identities (user_id, provider, provider_id, email)
       VALUES ($1, 'google', 'google-sub-me-test', $2)`,
      [userId, email],
    );
    // Get token by logging via the profile directly (no password, use the google-only route manually)
    // We test by directly checking the service behavior via GET /me using a valid JWT
    const jwt = await import("jsonwebtoken");
    const token = jwt.default.sign(
      { sub: String(userId), email },
      process.env.JWT_SECRET || "control-finance-dev-secret",
      { expiresIn: "1h" },
    );

    const response = await request(app)
      .get("/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.hasPassword).toBe(false);
    expect(response.body.linkedProviders).toEqual(["google"]);
  });

  it("retorna profile preenchido quando usuario tem perfil", async () => {
    const token = await registerAndLogin("me-with-profile@test.dev");
    const userResult = await dbQuery(
      `SELECT id FROM users WHERE email = $1`,
      ["me-with-profile@test.dev"],
    );
    const userId = userResult.rows[0].id;

    await dbQuery(
      `INSERT INTO user_profiles (user_id, display_name, salary_monthly, payday, avatar_url)
       VALUES ($1, 'Joao Silva', 5000.00, 5, 'https://example.com/avatar.jpg')`,
      [userId],
    );

    const response = await request(app)
      .get("/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.profile).toMatchObject({
      displayName: "Joao Silva",
      salaryMonthly: 5000,
      payday: 5,
      avatarUrl: "https://example.com/avatar.jpg",
    });
  });
});

describe("PATCH /me/profile", () => {
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
    await dbQuery("DELETE FROM user_profiles");
    await dbQuery("DELETE FROM transactions");
    await dbQuery("DELETE FROM user_identities");
    await dbQuery("DELETE FROM users");
  });

  it("retorna 401 sem token", async () => {
    const response = await request(app)
      .patch("/me/profile")
      .send({ display_name: "Teste" });
    expect(response.status).toBe(401);
  });

  it("cria perfil com todos os campos", async () => {
    const token = await registerAndLogin("patch-all@test.dev");

    const response = await request(app)
      .patch("/me/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({
        display_name: "Maria Santos",
        salary_monthly: 7500,
        payday: 10,
        avatar_url: "https://example.com/maria.jpg",
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      displayName: "Maria Santos",
      salaryMonthly: 7500,
      payday: 10,
      avatarUrl: "https://example.com/maria.jpg",
    });
  });

  it("atualiza parcialmente — so o campo enviado muda", async () => {
    const token = await registerAndLogin("patch-partial@test.dev");

    // Create initial profile
    await request(app)
      .patch("/me/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ display_name: "Original", salary_monthly: 3000, payday: 1 });

    // Update only display_name
    const response = await request(app)
      .patch("/me/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ display_name: "Atualizado" });

    expect(response.status).toBe(200);
    expect(response.body.displayName).toBe("Atualizado");
    expect(response.body.salaryMonthly).toBe(3000);
    expect(response.body.payday).toBe(1);
  });

  it("aceita display_name vazio como null", async () => {
    const token = await registerAndLogin("patch-empty-name@test.dev");

    await request(app)
      .patch("/me/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ display_name: "  " });

    const getResponse = await request(app)
      .get("/me")
      .set("Authorization", `Bearer ${token}`);

    expect(getResponse.body.profile.displayName).toBeNull();
  });

  it("retorna 400 para payday invalido (zero)", async () => {
    const token = await registerAndLogin("patch-payday-zero@test.dev");

    const response = await request(app)
      .patch("/me/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ payday: 0 });

    expectErrorResponseWithRequestId(response, 400, "payday deve ser um inteiro entre 1 e 31.");
  });

  it("retorna 400 para payday invalido (32)", async () => {
    const token = await registerAndLogin("patch-payday-32@test.dev");

    const response = await request(app)
      .patch("/me/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ payday: 32 });

    expectErrorResponseWithRequestId(response, 400, "payday deve ser um inteiro entre 1 e 31.");
  });

  it("retorna 400 para salary_monthly negativo", async () => {
    const token = await registerAndLogin("patch-salary-neg@test.dev");

    const response = await request(app)
      .patch("/me/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ salary_monthly: -100 });

    expectErrorResponseWithRequestId(response, 400, "salary_monthly nao pode ser negativo.");
  });

  it("retorna 400 para avatar_url sem https://", async () => {
    const token = await registerAndLogin("patch-avatar-http@test.dev");

    const response = await request(app)
      .patch("/me/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ avatar_url: "http://example.com/img.jpg" });

    expectErrorResponseWithRequestId(response, 400, "avatar_url deve comecar com https://.");
  });

  it("retorna 400 quando nenhum campo valido enviado", async () => {
    const token = await registerAndLogin("patch-empty@test.dev");

    const response = await request(app)
      .patch("/me/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expectErrorResponseWithRequestId(
      response,
      400,
      "Nenhum campo valido enviado para atualizacao.",
    );
  });

  it("aceita avatar_url null para limpar o campo", async () => {
    const token = await registerAndLogin("patch-avatar-null@test.dev");

    await request(app)
      .patch("/me/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ avatar_url: "https://example.com/old.jpg" });

    const response = await request(app)
      .patch("/me/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ avatar_url: null });

    expect(response.status).toBe(200);
    expect(response.body.avatarUrl).toBeNull();
  });
});
