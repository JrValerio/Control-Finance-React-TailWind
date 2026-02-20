import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { newDb } from "pg-mem";
import app from "./app.js";
import { clearDbClientForTests, dbQuery, setDbClientForTests } from "./db/index.js";
import { runMigrations } from "./db/migrate.js";
import {
  LOGIN_THROTTLE_MESSAGE,
  resetLoginProtectionState,
} from "./middlewares/login-protection.middleware.js";
import { resetImportRateLimiterState } from "./middlewares/rate-limit.middleware.js";

const registerAndLogin = async (email, password = "Senha123") => {
  await request(app).post("/auth/register").send({
    email,
    password,
  });

  const loginResponse = await request(app).post("/auth/login").send({
    email,
    password,
  });

  return loginResponse.body.token;
};

const getUserIdByEmail = async (email) => {
  const result = await dbQuery(
    `
      SELECT id
      FROM users
      WHERE email = $1
      LIMIT 1
    `,
    [email],
  );

  return Number(result.rows[0]?.id);
};

const expectErrorResponseWithRequestId = (response, expectedStatus, expectedMessage) => {
  expect(response.status).toBe(expectedStatus);
  expect(response.body).toMatchObject({ message: expectedMessage });
  expect(typeof response.body.requestId).toBe("string");
  expect(response.body.requestId.length).toBeGreaterThan(0);
  expect(response.body.requestId.length).toBeLessThanOrEqual(128);
  expect(response.body.requestId).toBe(response.headers["x-request-id"]);
};

const csvFile = (content, fileName = "import.csv") => ({
  buffer: Buffer.from(content, "utf8"),
  fileName,
});

const createTransactionsForUser = async (token, count) => {
  await Promise.all(
    Array.from({ length: count }, (_, index) =>
      request(app)
        .post("/transactions")
        .set("Authorization", `Bearer ${token}`)
        .send({
          type: "Entrada",
          value: (index + 1) * 10,
          date: `2026-01-${String(index + 1).padStart(2, "0")}`,
          description: `Lancamento ${index + 1}`,
        }),
    ),
  );
};

const AUTH_SECURITY_ENV_KEYS = [
  "AUTH_BRUTE_FORCE_MAX_ATTEMPTS",
  "AUTH_BRUTE_FORCE_WINDOW_MS",
  "AUTH_BRUTE_FORCE_LOCK_MS",
];

const snapshotAuthSecurityEnv = () => {
  return AUTH_SECURITY_ENV_KEYS.reduce((snapshot, key) => {
    snapshot[key] = process.env[key];
    return snapshot;
  }, {});
};

const restoreAuthSecurityEnv = (snapshot) => {
  AUTH_SECURITY_ENV_KEYS.forEach((key) => {
    if (typeof snapshot[key] === "undefined") {
      delete process.env[key];
      return;
    }

    process.env[key] = snapshot[key];
  });
};

describe("API auth and transactions", () => {
  beforeAll(async () => {
    const inMemoryDatabase = newDb({
      autoCreateForeignKeyIndices: true,
    });
    const pgAdapter = inMemoryDatabase.adapters.createPg();
    const pool = new pgAdapter.Pool();

    setDbClientForTests(pool);
    await runMigrations();
  });

  afterAll(async () => {
    await clearDbClientForTests();
  });

  beforeEach(async () => {
    resetLoginProtectionState();
    resetImportRateLimiterState();
    await dbQuery("DELETE FROM transactions");
    await dbQuery("DELETE FROM users");
  });

  it("GET /health responde com status 200 e versao", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(typeof response.body.version).toBe("string");
    expect(response.body.version.length).toBeGreaterThan(0);
    expect(typeof response.body.commit).toBe("string");
    expect(response.body.commit.length).toBeGreaterThan(0);
  });

  it("echoa x-request-id quando informado no header", async () => {
    const response = await request(app)
      .get("/health")
      .set("x-request-id", "request-id-test-123");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBe("request-id-test-123");
  });

  it("gera x-request-id quando nao informado no header", async () => {
    const response = await request(app).get("/health");
    const requestId = response.headers["x-request-id"];

    expect(response.status).toBe(200);
    expect(typeof requestId).toBe("string");
    expect(requestId.length).toBeGreaterThan(0);
    expect(requestId.length).toBeLessThanOrEqual(128);
  });

  it("inclui requestId no JSON de erro quando nao informado no header", async () => {
    const response = await request(app).get("/__not_found__");

    expectErrorResponseWithRequestId(response, 404, "Route not found");
  });

  it("ecoa x-request-id no JSON de erro quando informado no header", async () => {
    const response = await request(app)
      .get("/__not_found__")
      .set("x-request-id", "rid-123");

    expectErrorResponseWithRequestId(response, 404, "Route not found");
    expect(response.body.requestId).toBe("rid-123");
    expect(response.headers["x-request-id"]).toBe("rid-123");
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

  it("GET /categories bloqueia sem token", async () => {
    const response = await request(app).get("/categories");

    expect(response.status).toBe(401);
  });

  it("POST /categories cria categoria e GET /categories lista ordenado por nome", async () => {
    const token = await registerAndLogin("categories@controlfinance.dev");

    const createTransportResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Transporte",
      });

    const createFoodResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "  Alimentacao  ",
      });

    expect(createTransportResponse.status).toBe(201);
    expect(createTransportResponse.body).toMatchObject({
      userId: createTransportResponse.body.userId,
      name: "Transporte",
      normalizedName: "transporte",
      deletedAt: null,
    });
    expect(Number.isInteger(createTransportResponse.body.id)).toBe(true);
    expect(createTransportResponse.body.id).toBeGreaterThan(0);
    expect(Number.isInteger(createTransportResponse.body.userId)).toBe(true);
    expect(typeof createTransportResponse.body.createdAt).toBe("string");

    expect(createFoodResponse.status).toBe(201);
    expect(createFoodResponse.body).toMatchObject({
      userId: createTransportResponse.body.userId,
      name: "Alimentacao",
      normalizedName: "alimentacao",
      deletedAt: null,
    });
    expect(Number.isInteger(createFoodResponse.body.id)).toBe(true);

    const listResponse = await request(app)
      .get("/categories")
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body)).toBe(true);
    expect(listResponse.body).toHaveLength(2);
    expect(listResponse.body.map((category) => category.name)).toEqual([
      "Alimentacao",
      "Transporte",
    ]);
    expect(listResponse.body.map((category) => category.normalizedName)).toEqual([
      "alimentacao",
      "transporte",
    ]);
    expect(listResponse.body.every((category) => category.deletedAt === null)).toBe(true);
  });

  it("POST /categories bloqueia nome vazio", async () => {
    const token = await registerAndLogin("categories-empty@controlfinance.dev");

    const response = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "   ",
      });

    expectErrorResponseWithRequestId(response, 400, "Nome da categoria e obrigatorio.");
  });

  it("POST /categories bloqueia categoria duplicada por usuario (case-insensitive)", async () => {
    const token = await registerAndLogin("categories-duplicate@controlfinance.dev");

    const firstResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Alimentacao",
      });

    const duplicateResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "alimentacao",
      });

    expect(firstResponse.status).toBe(201);
    expectErrorResponseWithRequestId(duplicateResponse, 409, "Categoria ja existe.");
  });

  it("POST /categories bloqueia categoria duplicada por usuario (acento-insensitive)", async () => {
    const token = await registerAndLogin("categories-duplicate-accent@controlfinance.dev");

    const firstResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Caf\u00e9",
      });

    const duplicateResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "cafe",
      });

    expect(firstResponse.status).toBe(201);
    expectErrorResponseWithRequestId(duplicateResponse, 409, "Categoria ja existe.");
  });

  it("GET /categories isola categorias por usuario", async () => {
    const tokenUserA = await registerAndLogin("categories-user-a@controlfinance.dev");
    const tokenUserB = await registerAndLogin("categories-user-b@controlfinance.dev");

    await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${tokenUserA}`)
      .send({
        name: "Lazer",
      });

    await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${tokenUserB}`)
      .send({
        name: "Transporte",
      });

    const listUserAResponse = await request(app)
      .get("/categories")
      .set("Authorization", `Bearer ${tokenUserA}`);

    const listUserBResponse = await request(app)
      .get("/categories")
      .set("Authorization", `Bearer ${tokenUserB}`);

    expect(listUserAResponse.status).toBe(200);
    expect(listUserAResponse.body).toHaveLength(1);
    expect(listUserAResponse.body[0].name).toBe("Lazer");

    expect(listUserBResponse.status).toBe(200);
    expect(listUserBResponse.body).toHaveLength(1);
    expect(listUserBResponse.body[0].name).toBe("Transporte");
  });

  it("PATCH /categories/:id renomeia categoria ativa", async () => {
    const token = await registerAndLogin("categories-update@controlfinance.dev");

    const createResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Mercado",
      });

    const updateResponse = await request(app)
      .patch(`/categories/${createResponse.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "  Mercado   geral  ",
      });

    expect(createResponse.status).toBe(201);
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body).toMatchObject({
      id: createResponse.body.id,
      userId: createResponse.body.userId,
      name: "Mercado geral",
      normalizedName: "mercado geral",
      deletedAt: null,
    });
  });

  it("DELETE /categories/:id aplica soft delete, lista includeDeleted e permite recriar", async () => {
    const token = await registerAndLogin("categories-delete@controlfinance.dev");

    const createResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Mercado",
      });

    const deleteResponse = await request(app)
      .delete(`/categories/${createResponse.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    const listActiveResponse = await request(app)
      .get("/categories")
      .set("Authorization", `Bearer ${token}`);

    const recreateResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Mercado",
      });

    const listWithDeletedResponse = await request(app)
      .get("/categories")
      .query({ includeDeleted: "true" })
      .set("Authorization", `Bearer ${token}`);

    expect(createResponse.status).toBe(201);
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.deletedAt).toBeTruthy();
    expect(listActiveResponse.status).toBe(200);
    expect(listActiveResponse.body).toEqual([]);

    expect(recreateResponse.status).toBe(201);
    expect(recreateResponse.body.name).toBe("Mercado");
    expect(recreateResponse.body.deletedAt).toBeNull();
    expect(recreateResponse.body.id).not.toBe(createResponse.body.id);

    expect(listWithDeletedResponse.status).toBe(200);
    expect(listWithDeletedResponse.body).toHaveLength(2);
    expect(listWithDeletedResponse.body[0].id).toBe(recreateResponse.body.id);
    expect(listWithDeletedResponse.body[0].deletedAt).toBeNull();
    expect(listWithDeletedResponse.body[1].id).toBe(createResponse.body.id);
    expect(listWithDeletedResponse.body[1].deletedAt).toBeTruthy();
  });

  it("POST /categories/:id/restore restaura categoria sem conflito", async () => {
    const token = await registerAndLogin("categories-restore@controlfinance.dev");

    const createResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Transporte",
      });

    const deleteResponse = await request(app)
      .delete(`/categories/${createResponse.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    const restoreResponse = await request(app)
      .post(`/categories/${createResponse.body.id}/restore`)
      .set("Authorization", `Bearer ${token}`);

    expect(createResponse.status).toBe(201);
    expect(deleteResponse.status).toBe(200);
    expect(restoreResponse.status).toBe(200);
    expect(restoreResponse.body).toMatchObject({
      id: createResponse.body.id,
      name: "Transporte",
      normalizedName: "transporte",
      deletedAt: null,
    });
  });

  it("POST /categories/:id/restore retorna 409 quando existe conflito de nome ativo", async () => {
    const token = await registerAndLogin("categories-restore-conflict@controlfinance.dev");

    const originalResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Mercado",
      });

    const deleteOriginalResponse = await request(app)
      .delete(`/categories/${originalResponse.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    const recreateResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Mercado",
      });

    const restoreResponse = await request(app)
      .post(`/categories/${originalResponse.body.id}/restore`)
      .set("Authorization", `Bearer ${token}`);

    expect(originalResponse.status).toBe(201);
    expect(deleteOriginalResponse.status).toBe(200);
    expect(recreateResponse.status).toBe(201);
    expectErrorResponseWithRequestId(restoreResponse, 409, "Categoria ja existe.");
  });

  it("PATCH/DELETE/RESTORE /categories/:id respeitam ownership por usuario", async () => {
    const tokenUserA = await registerAndLogin("categories-owner-a@controlfinance.dev");
    const tokenUserB = await registerAndLogin("categories-owner-b@controlfinance.dev");

    const createResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${tokenUserA}`)
      .send({
        name: "Saude",
      });

    const patchByOtherUserResponse = await request(app)
      .patch(`/categories/${createResponse.body.id}`)
      .set("Authorization", `Bearer ${tokenUserB}`)
      .send({
        name: "Saude nova",
      });

    const deleteByOtherUserResponse = await request(app)
      .delete(`/categories/${createResponse.body.id}`)
      .set("Authorization", `Bearer ${tokenUserB}`);

    const deleteOwnerResponse = await request(app)
      .delete(`/categories/${createResponse.body.id}`)
      .set("Authorization", `Bearer ${tokenUserA}`);

    const restoreByOtherUserResponse = await request(app)
      .post(`/categories/${createResponse.body.id}/restore`)
      .set("Authorization", `Bearer ${tokenUserB}`);

    expect(createResponse.status).toBe(201);
    expectErrorResponseWithRequestId(patchByOtherUserResponse, 404, "Categoria nao encontrada.");
    expectErrorResponseWithRequestId(deleteByOtherUserResponse, 404, "Categoria nao encontrada.");
    expect(deleteOwnerResponse.status).toBe(200);
    expectErrorResponseWithRequestId(restoreByOtherUserResponse, 404, "Categoria nao encontrada.");
  });

  it("GET /budgets bloqueia sem token", async () => {
    const response = await request(app).get("/budgets");

    expect(response.status).toBe(401);
  });

  it("POST /budgets cria e atualiza meta no mesmo mes/categoria", async () => {
    const token = await registerAndLogin("budgets-upsert@controlfinance.dev");
    const categoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Moradia",
      });
    const categoryId = categoryResponse.body.id;

    const createResponse = await request(app)
      .post("/budgets")
      .set("Authorization", `Bearer ${token}`)
      .send({
        categoryId,
        month: "2026-02",
        amount: 1200,
      });

    const updateResponse = await request(app)
      .post("/budgets")
      .set("Authorization", `Bearer ${token}`)
      .send({
        categoryId,
        month: "2026-02",
        amount: 1500,
      });

    expect(createResponse.status).toBe(200);
    expect(createResponse.body).toMatchObject({
      categoryId,
      month: "2026-02",
      amount: 1200,
    });
    expect(Number.isInteger(createResponse.body.id)).toBe(true);

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body).toMatchObject({
      id: createResponse.body.id,
      categoryId,
      month: "2026-02",
      amount: 1500,
    });

    const listResponse = await request(app)
      .get("/budgets")
      .query({ month: "2026-02" })
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toEqual({
      data: [
        {
          id: createResponse.body.id,
          categoryId,
          categoryName: "Moradia",
          month: "2026-02",
          budget: 1500,
          actual: 0,
          remaining: 1500,
          percentage: 0,
          status: "ok",
        },
      ],
    });
  });

  it("GET /budgets calcula actual, remaining, percentage e status", async () => {
    const token = await registerAndLogin("budgets-calc@controlfinance.dev");
    const categoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Alimentacao",
      });
    const categoryId = categoryResponse.body.id;

    await request(app)
      .post("/budgets")
      .set("Authorization", `Bearer ${token}`)
      .send({
        categoryId,
        month: "2026-02",
        amount: 100,
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 60,
        date: "2026-02-10",
        description: "Mercado",
        category_id: categoryId,
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 50,
        date: "2026-02-15",
        description: "Feira",
        category_id: categoryId,
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 999,
        date: "2026-02-20",
        description: "Receita ignorada no actual",
        category_id: categoryId,
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 1000,
        date: "2026-03-01",
        description: "Despesa fora do mes",
        category_id: categoryId,
      });

    const response = await request(app)
      .get("/budgets")
      .query({ month: "2026-02" })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      categoryId,
      categoryName: "Alimentacao",
      month: "2026-02",
      budget: 100,
      actual: 110,
      remaining: -10,
      percentage: 110,
      status: "exceeded",
    });
  });

  it("POST /budgets bloqueia categoria removida por soft delete", async () => {
    const token = await registerAndLogin("budgets-deleted-category@controlfinance.dev");

    const categoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Assinaturas",
      });

    const deleteCategoryResponse = await request(app)
      .delete(`/categories/${categoryResponse.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    const createBudgetResponse = await request(app)
      .post("/budgets")
      .set("Authorization", `Bearer ${token}`)
      .send({
        categoryId: categoryResponse.body.id,
        month: "2026-02",
        amount: 100,
      });

    expect(categoryResponse.status).toBe(201);
    expect(deleteCategoryResponse.status).toBe(200);
    expectErrorResponseWithRequestId(createBudgetResponse, 404, "Categoria nao encontrada.");
  });

  it("DELETE /budgets/:id respeita ownership por usuario", async () => {
    const tokenUserA = await registerAndLogin("budgets-owner-a@controlfinance.dev");
    const tokenUserB = await registerAndLogin("budgets-owner-b@controlfinance.dev");
    const categoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${tokenUserA}`)
      .send({
        name: "Transporte",
      });
    const categoryId = categoryResponse.body.id;

    const budgetResponse = await request(app)
      .post("/budgets")
      .set("Authorization", `Bearer ${tokenUserA}`)
      .send({
        categoryId,
        month: "2026-02",
        amount: 300,
      });
    const budgetId = budgetResponse.body.id;

    const deleteByUserBResponse = await request(app)
      .delete(`/budgets/${budgetId}`)
      .set("Authorization", `Bearer ${tokenUserB}`);

    expectErrorResponseWithRequestId(deleteByUserBResponse, 404, "Meta nao encontrada.");

    const deleteByUserAResponse = await request(app)
      .delete(`/budgets/${budgetId}`)
      .set("Authorization", `Bearer ${tokenUserA}`);

    expect(deleteByUserAResponse.status).toBe(204);

    const listAfterDeleteResponse = await request(app)
      .get("/budgets")
      .query({ month: "2026-02" })
      .set("Authorization", `Bearer ${tokenUserA}`);

    expect(listAfterDeleteResponse.status).toBe(200);
    expect(listAfterDeleteResponse.body).toEqual({ data: [] });
  });

  it("GET /transactions bloqueia sem token", async () => {
    const response = await request(app).get("/transactions");

    expect(response.status).toBe(401);
  });

  it("GET /transactions/summary bloqueia sem token", async () => {
    const response = await request(app).get("/transactions/summary");

    expect(response.status).toBe(401);
  });

  it("GET /transactions/imports bloqueia sem token", async () => {
    const response = await request(app).get("/transactions/imports");

    expect(response.status).toBe(401);
  });

  it("GET /transactions/imports/metrics bloqueia sem token e retorna requestId", async () => {
    const response = await request(app)
      .get("/transactions/imports/metrics")
      .set("x-request-id", "rid-123");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      message: "Token de autenticacao ausente ou invalido.",
      requestId: "rid-123",
    });
    expect(response.headers["x-request-id"]).toBe("rid-123");
  });

  it("GET /transactions/imports/metrics retorna zeros quando usuario nao possui sessoes", async () => {
    const token = await registerAndLogin("imports-metrics-empty@controlfinance.dev");
    const response = await request(app)
      .get("/transactions/imports/metrics")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      total: 0,
      last30Days: 0,
      lastImportAt: null,
    });
  });

  it("GET /transactions/imports/metrics retorna total, last30Days e lastImportAt por usuario", async () => {
    const userAEmail = "imports-metrics-user-a@controlfinance.dev";
    const userBEmail = "imports-metrics-user-b@controlfinance.dev";
    const tokenUserA = await registerAndLogin(userAEmail);
    await registerAndLogin(userBEmail);

    const userAId = await getUserIdByEmail(userAEmail);
    const userBId = await getUserIdByEmail(userBEmail);
    const recentCreatedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const oldCreatedAt = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const otherUserCreatedAt = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

    await dbQuery(
      `
        INSERT INTO transaction_import_sessions (
          id,
          user_id,
          payload_json,
          created_at,
          expires_at,
          committed_at
        )
        VALUES
          ($1, $2, $3::jsonb, $4, $5, $6),
          ($7, $8, $9::jsonb, $10, $11, $12),
          ($13, $14, $15::jsonb, $16, $17, $18)
      `,
      [
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
        userAId,
        JSON.stringify({ summary: { totalRows: 2, validRows: 2, invalidRows: 0 } }),
        recentCreatedAt,
        new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        null,
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
        userAId,
        JSON.stringify({ summary: { totalRows: 1, validRows: 1, invalidRows: 0 } }),
        oldCreatedAt,
        new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        null,
        "cccccccc-cccc-4ccc-8ccc-ccccccccccc3",
        userBId,
        JSON.stringify({ summary: { totalRows: 5, validRows: 4, invalidRows: 1 } }),
        otherUserCreatedAt,
        new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        null,
      ],
    );

    const response = await request(app)
      .get("/transactions/imports/metrics")
      .set("Authorization", `Bearer ${tokenUserA}`);

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(2);
    expect(response.body.last30Days).toBe(1);
    expect(response.body.lastImportAt).toBe(recentCreatedAt);
  });

  it.each([
    { limit: "0" },
    { limit: "101" },
    { limit: "abc" },
    { offset: "-1" },
    { offset: "abc" },
    { limit: "10.5" },
  ])("GET /transactions/imports retorna 400 para paginacao invalida (%o)", async (query) => {
    const token = await registerAndLogin("imports-paginacao@controlfinance.dev");
    const response = await request(app)
      .get("/transactions/imports")
      .query(query)
      .set("Authorization", `Bearer ${token}`);

    expectErrorResponseWithRequestId(response, 400, "Paginacao invalida.");
  });

  it("GET /transactions/imports lista sessoes por usuario com ordem desc e shape consistente", async () => {
    const userAEmail = "imports-list-user-a@controlfinance.dev";
    const userBEmail = "imports-list-user-b@controlfinance.dev";
    const tokenUserA = await registerAndLogin(userAEmail);
    await registerAndLogin(userBEmail);

    const userAId = await getUserIdByEmail(userAEmail);
    const userBId = await getUserIdByEmail(userBEmail);

    const olderImportId = "11111111-1111-4111-8111-111111111111";
    const newerImportId = "22222222-2222-4222-8222-222222222222";
    const otherUserImportId = "33333333-3333-4333-8333-333333333333";

    await dbQuery(
      `
        INSERT INTO transaction_import_sessions (
          id,
          user_id,
          payload_json,
          created_at,
          expires_at,
          committed_at
        )
        VALUES
          ($1, $2, $3::jsonb, $4, $5, $6),
          ($7, $8, $9::jsonb, $10, $11, $12),
          ($13, $14, $15::jsonb, $16, $17, $18)
      `,
      [
        olderImportId,
        userAId,
        JSON.stringify({
          summary: {
            totalRows: 4,
            validRows: 3,
            invalidRows: 1,
            income: 1000,
            expense: 150.5,
          },
        }),
        "2026-04-01T09:00:00.000Z",
        "2026-04-01T09:30:00.000Z",
        null,
        newerImportId,
        userAId,
        JSON.stringify({
          summary: {
            totalRows: 2,
            validRows: 2,
            invalidRows: 0,
            income: 700,
            expense: 220.25,
          },
        }),
        "2026-04-01T10:00:00.000Z",
        "2026-04-01T10:30:00.000Z",
        "2026-04-01T10:10:00.000Z",
        otherUserImportId,
        userBId,
        JSON.stringify({
          summary: {
            totalRows: 1,
            validRows: 1,
            invalidRows: 0,
            income: 50,
            expense: 0,
          },
        }),
        "2026-04-01T11:00:00.000Z",
        "2026-04-01T11:30:00.000Z",
        null,
      ],
    );

    const response = await request(app)
      .get("/transactions/imports")
      .query({
        limit: 20,
        offset: 0,
      })
      .set("Authorization", `Bearer ${tokenUserA}`);

    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({
      limit: 20,
      offset: 0,
    });
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items.map((item) => item.id)).toEqual([
      newerImportId,
      olderImportId,
    ]);

    expect(response.body.items[0]).toEqual({
      id: newerImportId,
      createdAt: "2026-04-01T10:00:00.000Z",
      expiresAt: "2026-04-01T10:30:00.000Z",
      committedAt: "2026-04-01T10:10:00.000Z",
      summary: {
        totalRows: 2,
        validRows: 2,
        invalidRows: 0,
        income: 700,
        expense: 220.25,
        imported: 2,
      },
    });
    expect(response.body.items[1]).toEqual({
      id: olderImportId,
      createdAt: "2026-04-01T09:00:00.000Z",
      expiresAt: "2026-04-01T09:30:00.000Z",
      committedAt: null,
      summary: {
        totalRows: 4,
        validRows: 3,
        invalidRows: 1,
        income: 1000,
        expense: 150.5,
        imported: 0,
      },
    });

    const pagedResponse = await request(app)
      .get("/transactions/imports")
      .query({
        limit: 1,
        offset: 1,
      })
      .set("Authorization", `Bearer ${tokenUserA}`);

    expect(pagedResponse.status).toBe(200);
    expect(pagedResponse.body.items).toHaveLength(1);
    expect(pagedResponse.body.items[0].id).toBe(olderImportId);
    expect(pagedResponse.body.items.map((item) => item.id)).not.toContain(otherUserImportId);
  });

  it("POST /transactions/import/dry-run bloqueia sem token", async () => {
    const response = await request(app)
      .post("/transactions/import/dry-run")
      .attach("file", csvFile("date,type,value,description\n2026-02-01,Entrada,100,Teste").buffer, {
        filename: "import.csv",
        contentType: "text/csv",
      });

    expect(response.status).toBe(401);
  });

  it("POST /transactions/import/dry-run retorna 400 sem arquivo", async () => {
    const token = await registerAndLogin("import-sem-arquivo@controlfinance.dev");

    const response = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`);

    expectErrorResponseWithRequestId(response, 400, "Arquivo CSV (file) e obrigatorio.");
  });

  it("POST /transactions/import/dry-run retorna 400 para arquivo sem formato CSV", async () => {
    const token = await registerAndLogin("import-arquivo-invalido@controlfinance.dev");
    const invalidFile = csvFile("conteudo sem cabecalho", "import.txt");

    const response = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", invalidFile.buffer, {
        filename: invalidFile.fileName,
        contentType: "text/plain",
      });

    expectErrorResponseWithRequestId(response, 400, "Arquivo invalido. Envie um CSV.");
  });

  it("POST /transactions/import/dry-run retorna 413 quando arquivo excede limite", async () => {
    const token = await registerAndLogin("import-arquivo-grande@controlfinance.dev");
    const oversizedContent = `date,type,value,description\n${"a".repeat(2 * 1024 * 1024 + 1)}`;
    const oversizedCsvFile = csvFile(oversizedContent, "oversized.csv");

    const response = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", oversizedCsvFile.buffer, {
        filename: oversizedCsvFile.fileName,
        contentType: "text/csv",
      });

    expectErrorResponseWithRequestId(response, 413, "Arquivo muito grande.");
  });

  it("POST /transactions/import/dry-run retorna 400 quando CSV excede o limite de linhas", async () => {
    const token = await registerAndLogin("import-linhas-maximo@controlfinance.dev");
    const rows = ["date,type,value,description"];

    for (let lineNumber = 1; lineNumber <= 2001; lineNumber += 1) {
      rows.push(`2026-03-01,Entrada,1,Linha ${lineNumber}`);
    }

    const oversizedRowsCsv = csvFile(rows.join("\n"));

    const response = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", oversizedRowsCsv.buffer, {
        filename: oversizedRowsCsv.fileName,
        contentType: "text/csv",
      });

    expectErrorResponseWithRequestId(response, 400, "CSV excede o limite de 2000 linhas.");
  });

  it("POST /transactions/import/dry-run retorna 429 quando excede o limite de requisicoes", async () => {
    const token = await registerAndLogin("import-rate-limit@controlfinance.dev");
    const validCsv = csvFile("date,type,value,description\n2026-03-01,Entrada,100,Teste");

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const allowedResponse = await request(app)
        .post("/transactions/import/dry-run")
        .set("Authorization", `Bearer ${token}`)
        .attach("file", validCsv.buffer, {
          filename: validCsv.fileName,
          contentType: "text/csv",
        });

      expect(allowedResponse.status).toBe(200);
    }

    const throttledResponse = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", validCsv.buffer, {
        filename: validCsv.fileName,
        contentType: "text/csv",
      });

    expectErrorResponseWithRequestId(
      throttledResponse,
      429,
      "Muitas requisicoes. Tente novamente em instantes.",
    );
  });

  it("POST /transactions/import/dry-run retorna 400 para cabecalho invalido", async () => {
    const token = await registerAndLogin("import-cabecalho@controlfinance.dev");
    const invalidHeaderCsv = csvFile("tipo,valor,descricao\nSaida,100,Mercado");

    const response = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", invalidHeaderCsv.buffer, {
        filename: invalidHeaderCsv.fileName,
        contentType: "text/csv",
      });

    expectErrorResponseWithRequestId(
      response,
      400,
      "CSV invalido. Cabecalho esperado: date,type,value,description,notes,category",
    );
  });

  it("POST /transactions/import/dry-run valida linhas e persiste sessao", async () => {
    const token = await registerAndLogin("import-sessao@controlfinance.dev");
    const categoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Alimentacao",
      });

    const mixedCsv = csvFile(
      [
        "date,type,value,description,notes,category",
        "2026-02-01,Entrada,1000,Salario,,",
        "2026-02-10,Saida,220.50,Mercado,,alimentacao",
        "2026-02-11,Saida,0,Cafe,,Alimentacao",
        "2026-02-12,Saida,30,,Lanche,Transporte",
      ].join("\n"),
    );

    const response = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", mixedCsv.buffer, {
        filename: mixedCsv.fileName,
        contentType: "text/csv",
      });

    expect(response.status).toBe(200);
    expect(typeof response.body.importId).toBe("string");
    expect(response.body.importId.length).toBeGreaterThan(10);
    expect(typeof response.body.expiresAt).toBe("string");
    expect(response.body.summary).toEqual({
      totalRows: 4,
      validRows: 2,
      invalidRows: 2,
      income: 1000,
      expense: 220.5,
    });
    expect(response.body.rows).toEqual([
      {
        line: 2,
        status: "valid",
        raw: {
          date: "2026-02-01",
          type: "Entrada",
          value: "1000",
          description: "Salario",
          notes: "",
          category: "",
        },
        normalized: {
          date: "2026-02-01",
          type: "Entrada",
          value: 1000,
          description: "Salario",
          notes: "",
          categoryId: null,
        },
        errors: [],
      },
      {
        line: 3,
        status: "valid",
        raw: {
          date: "2026-02-10",
          type: "Saida",
          value: "220.50",
          description: "Mercado",
          notes: "",
          category: "alimentacao",
        },
        normalized: {
          date: "2026-02-10",
          type: "Saida",
          value: 220.5,
          description: "Mercado",
          notes: "",
          categoryId: categoryResponse.body.id,
        },
        errors: [],
      },
      {
        line: 4,
        status: "invalid",
        raw: {
          date: "2026-02-11",
          type: "Saida",
          value: "0",
          description: "Cafe",
          notes: "",
          category: "Alimentacao",
        },
        normalized: null,
        errors: [{ field: "value", message: "Valor invalido. Informe um numero maior que zero." }],
      },
      {
        line: 5,
        status: "invalid",
        raw: {
          date: "2026-02-12",
          type: "Saida",
          value: "30",
          description: "",
          notes: "Lanche",
          category: "Transporte",
        },
        normalized: null,
        errors: [
          { field: "description", message: "Descricao e obrigatoria." },
          { field: "category", message: "Categoria nao encontrada." },
        ],
      },
    ]);

    const persistedSessionResult = await dbQuery(
      `
        SELECT id, user_id, payload_json, committed_at, expires_at
        FROM transaction_import_sessions
        WHERE id = $1
      `,
      [response.body.importId],
    );
    const persistedSession = persistedSessionResult.rows[0];

    expect(persistedSession.id).toBe(response.body.importId);
    expect(Number(persistedSession.user_id)).toBeGreaterThan(0);
    expect(persistedSession.committed_at).toBeNull();
    expect(new Date(persistedSession.expires_at).getTime()).toBeGreaterThan(Date.now());
    expect(Array.isArray(persistedSession.payload_json.normalizedRows)).toBe(true);
    expect(persistedSession.payload_json.normalizedRows).toHaveLength(2);
  });

  it("POST /transactions/import/dry-run marca date e type invalidos por linha", async () => {
    const token = await registerAndLogin("import-date-type@controlfinance.dev");
    const invalidCsv = csvFile(
      [
        "date,type,value,description,notes,category",
        "2026-02-31,Saida,10,Cafe,,",
        "2026-02-20,Transferencia,20,Pix,,",
      ].join("\n"),
    );

    const response = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", invalidCsv.buffer, {
        filename: invalidCsv.fileName,
        contentType: "text/csv",
      });

    expect(response.status).toBe(200);
    expect(response.body.summary).toEqual({
      totalRows: 2,
      validRows: 0,
      invalidRows: 2,
      income: 0,
      expense: 0,
    });
    expect(response.body.rows[0]).toMatchObject({
      line: 2,
      status: "invalid",
      errors: [{ field: "date", message: "Data invalida. Use YYYY-MM-DD." }],
    });
    expect(response.body.rows[1]).toMatchObject({
      line: 3,
      status: "invalid",
      errors: [{ field: "type", message: "Tipo invalido. Use Entrada ou Saida." }],
    });
  });

  it("POST /transactions/import/commit bloqueia sem token", async () => {
    const response = await request(app).post("/transactions/import/commit").send({
      importId: "11111111-1111-4111-8111-111111111111",
    });

    expect(response.status).toBe(401);
  });

  it("POST /transactions/import/commit retorna 429 quando excede o limite de requisicoes", async () => {
    const token = await registerAndLogin("import-commit-rate-limit@controlfinance.dev");
    const invalidPayload = { importId: "abc" };

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const allowedResponse = await request(app)
        .post("/transactions/import/commit")
        .set("Authorization", `Bearer ${token}`)
        .send(invalidPayload);

      expectErrorResponseWithRequestId(allowedResponse, 400, "importId invalido.");
    }

    const throttledResponse = await request(app)
      .post("/transactions/import/commit")
      .set("Authorization", `Bearer ${token}`)
      .send(invalidPayload);

    expectErrorResponseWithRequestId(
      throttledResponse,
      429,
      "Muitas requisicoes. Tente novamente em instantes.",
    );
  });

  it("POST /transactions/import/commit retorna 400 sem importId", async () => {
    const token = await registerAndLogin("import-commit-sem-id@controlfinance.dev");

    const response = await request(app)
      .post("/transactions/import/commit")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expectErrorResponseWithRequestId(response, 400, "importId e obrigatorio.");
  });

  it("POST /transactions/import/commit retorna 400 com importId invalido", async () => {
    const token = await registerAndLogin("import-commit-id-invalido@controlfinance.dev");

    const response = await request(app)
      .post("/transactions/import/commit")
      .set("Authorization", `Bearer ${token}`)
      .send({
        importId: "abc",
      });

    expectErrorResponseWithRequestId(response, 400, "importId invalido.");
  });

  it("POST /transactions/import/commit importa linhas validas e marca sessao como confirmada", async () => {
    const token = await registerAndLogin("import-commit-sucesso@controlfinance.dev");
    const categoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Alimentacao",
      });

    const dryRunCsv = csvFile(
      [
        "date,type,value,description,notes,category",
        "2026-03-01,Entrada,1000,Salario,,",
        "2026-03-05,Saida,220.5,Mercado,,Alimentacao",
        "2026-03-10,Saida,0,Cafe,,Alimentacao",
      ].join("\n"),
    );

    const dryRunResponse = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", dryRunCsv.buffer, {
        filename: dryRunCsv.fileName,
        contentType: "text/csv",
      });

    expect(dryRunResponse.status).toBe(200);
    expect(dryRunResponse.body.summary.validRows).toBe(2);

    const commitResponse = await request(app)
      .post("/transactions/import/commit")
      .set("Authorization", `Bearer ${token}`)
      .send({
        importId: dryRunResponse.body.importId,
      });

    expect(commitResponse.status).toBe(200);
    expect(commitResponse.body).toEqual({
      imported: 2,
      summary: {
        income: 1000,
        expense: 220.5,
        balance: 779.5,
      },
    });

    const listResponse = await request(app)
      .get("/transactions")
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.meta.total).toBe(2);
    expect(listResponse.body.data).toEqual([
      expect.objectContaining({
        description: "Salario",
        type: "Entrada",
        value: 1000,
        categoryId: null,
      }),
      expect.objectContaining({
        description: "Mercado",
        type: "Saida",
        value: 220.5,
        categoryId: categoryResponse.body.id,
      }),
    ]);

    const persistedSessionResult = await dbQuery(
      `
        SELECT committed_at
        FROM transaction_import_sessions
        WHERE id = $1
      `,
      [dryRunResponse.body.importId],
    );
    expect(persistedSessionResult.rows[0].committed_at).toBeTruthy();
  });

  it("POST /transactions/import/commit retorna 404 para sessao de outro usuario", async () => {
    const ownerToken = await registerAndLogin("import-commit-owner@controlfinance.dev");
    const guestToken = await registerAndLogin("import-commit-guest@controlfinance.dev");

    const dryRunCsv = csvFile(
      ["date,type,value,description,notes,category", "2026-03-01,Entrada,100,Freela,,"].join(
        "\n",
      ),
    );

    const ownerDryRunResponse = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${ownerToken}`)
      .attach("file", dryRunCsv.buffer, {
        filename: dryRunCsv.fileName,
        contentType: "text/csv",
      });

    const response = await request(app)
      .post("/transactions/import/commit")
      .set("Authorization", `Bearer ${guestToken}`)
      .send({
        importId: ownerDryRunResponse.body.importId,
      });

    expectErrorResponseWithRequestId(response, 404, "Sessao de importacao nao encontrada.");
  });

  it("POST /transactions/import/commit retorna 409 quando sessao ja foi confirmada", async () => {
    const token = await registerAndLogin("import-commit-duplicado@controlfinance.dev");
    const dryRunCsv = csvFile(
      ["date,type,value,description,notes,category", "2026-03-02,Saida,50,Mercado,,"].join(
        "\n",
      ),
    );

    const dryRunResponse = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", dryRunCsv.buffer, {
        filename: dryRunCsv.fileName,
        contentType: "text/csv",
      });

    const firstCommitResponse = await request(app)
      .post("/transactions/import/commit")
      .set("Authorization", `Bearer ${token}`)
      .send({
        importId: dryRunResponse.body.importId,
      });

    const secondCommitResponse = await request(app)
      .post("/transactions/import/commit")
      .set("Authorization", `Bearer ${token}`)
      .send({
        importId: dryRunResponse.body.importId,
      });

    expect(firstCommitResponse.status).toBe(200);
    expectErrorResponseWithRequestId(secondCommitResponse, 409, "Importacao ja confirmada.");
  });

  it("POST /transactions/import/commit retorna 410 quando sessao expirou", async () => {
    const token = await registerAndLogin("import-commit-expirado@controlfinance.dev");
    const dryRunCsv = csvFile(
      ["date,type,value,description,notes,category", "2026-03-03,Saida,30,Lanche,,"].join("\n"),
    );

    const dryRunResponse = await request(app)
      .post("/transactions/import/dry-run")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", dryRunCsv.buffer, {
        filename: dryRunCsv.fileName,
        contentType: "text/csv",
      });

    await dbQuery(
      `
        UPDATE transaction_import_sessions
        SET expires_at = NOW() - INTERVAL '1 minute'
        WHERE id = $1
      `,
      [dryRunResponse.body.importId],
    );

    const commitResponse = await request(app)
      .post("/transactions/import/commit")
      .set("Authorization", `Bearer ${token}`)
      .send({
        importId: dryRunResponse.body.importId,
      });

    expectErrorResponseWithRequestId(commitResponse, 410, "Sessao de importacao expirada.");
  });

  it("GET /transactions/summary retorna 400 quando month nao e informado", async () => {
    const token = await registerAndLogin("summary-sem-mes@controlfinance.dev");

    const response = await request(app)
      .get("/transactions/summary")
      .set("Authorization", `Bearer ${token}`);

    expectErrorResponseWithRequestId(response, 400, "Mes e obrigatorio. Use YYYY-MM.");
  });

  it("GET /transactions/summary retorna 400 quando month e invalido", async () => {
    const token = await registerAndLogin("summary-mes-invalido@controlfinance.dev");

    const response = await request(app)
      .get("/transactions/summary")
      .query({
        month: "2026-13",
      })
      .set("Authorization", `Bearer ${token}`);

    expectErrorResponseWithRequestId(response, 400, "Mes invalido. Use YYYY-MM.");
  });

  it("GET /transactions/summary retorna totais zerados quando nao ha transacoes no mes", async () => {
    const token = await registerAndLogin("summary-vazio@controlfinance.dev");

    const response = await request(app)
      .get("/transactions/summary")
      .query({
        month: "2026-02",
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      month: "2026-02",
      income: 0,
      expense: 0,
      balance: 0,
      byCategory: [],
    });
  });

  it("GET /transactions/summary retorna totais do mes e breakdown por categoria", async () => {
    const token = await registerAndLogin("summary-mix@controlfinance.dev");

    const foodCategoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Alimentacao",
      });
    const foodCategoryId = foodCategoryResponse.body.id;

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 1000,
        date: "2026-02-05",
        description: "Salario",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 220.5,
        date: "2026-02-08",
        description: "Mercado",
        category_id: foodCategoryId,
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 80,
        date: "2026-02-09",
        description: "Lanche",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 300,
        date: "2026-03-01",
        description: "Fora do mes",
        category_id: foodCategoryId,
      });

    const deletedExpenseResponse = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 50,
        date: "2026-02-10",
        description: "Despesa removida",
        category_id: foodCategoryId,
      });

    await request(app)
      .delete(`/transactions/${deletedExpenseResponse.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    const response = await request(app)
      .get("/transactions/summary")
      .query({
        month: "2026-02",
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      month: "2026-02",
      income: 1000,
      expense: 300.5,
      balance: 699.5,
      byCategory: [
        {
          categoryId: foodCategoryId,
          categoryName: "Alimentacao",
          expense: 220.5,
        },
        {
          categoryId: null,
          categoryName: "Sem categoria",
          expense: 80,
        },
      ],
    });
  });

  it("GET /transactions/summary ordena categorias por gasto e mantém Sem categoria no final", async () => {
    const token = await registerAndLogin("summary-ordem-categoria@controlfinance.dev");

    const housingCategoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Moradia",
      });
    const foodCategoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Alimentacao",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 500,
        date: "2026-02-02",
        description: "Sem categoria",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 320,
        date: "2026-02-03",
        description: "Aluguel",
        category_id: housingCategoryResponse.body.id,
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 180,
        date: "2026-02-04",
        description: "Mercado",
        category_id: foodCategoryResponse.body.id,
      });

    const response = await request(app)
      .get("/transactions/summary")
      .query({
        month: "2026-02",
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.byCategory).toEqual([
      {
        categoryId: housingCategoryResponse.body.id,
        categoryName: "Moradia",
        expense: 320,
      },
      {
        categoryId: foodCategoryResponse.body.id,
        categoryName: "Alimentacao",
        expense: 180,
      },
      {
        categoryId: null,
        categoryName: "Sem categoria",
        expense: 500,
      },
    ]);
  });

  it("cria e lista transacoes do usuario autenticado", async () => {
    const token = await registerAndLogin("transacoes@controlfinance.dev");

    const createResponse = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 100.5,
        date: "2026-02-13",
        description: "Freelance",
        notes: "Projeto mensal",
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      type: "Entrada",
      value: 100.5,
      date: "2026-02-13",
      description: "Freelance",
      notes: "Projeto mensal",
    });
    expect(createResponse.body.categoryId).toBeNull();
    expect(Number.isInteger(createResponse.body.id)).toBe(true);
    expect(Number.isInteger(createResponse.body.userId)).toBe(true);

    const listResponse = await request(app)
      .get("/transactions")
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.meta).toEqual({
      page: 1,
      limit: 20,
      offset: 0,
      total: 1,
      totalPages: 1,
    });
    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body.data[0]).toMatchObject({
      type: "Entrada",
      value: 100.5,
      date: "2026-02-13",
      description: "Freelance",
      notes: "Projeto mensal",
    });
    expect(listResponse.body.data[0].categoryId).toBeNull();
    expect(listResponse.body.data[0].id).toBe(createResponse.body.id);
    expect(listResponse.body.data[0].userId).toBe(createResponse.body.userId);
  });

  it("cria transacao com category_id valida do proprio usuario", async () => {
    const token = await registerAndLogin("transacoes-categoria@controlfinance.dev");

    const categoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Lazer",
      });

    const createResponse = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 75.9,
        date: "2026-02-15",
        description: "Cinema",
        category_id: categoryResponse.body.id,
      });

    expect(categoryResponse.status).toBe(201);
    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      type: "Saida",
      value: 75.9,
      categoryId: categoryResponse.body.id,
      description: "Cinema",
    });
  });

  it("bloqueia criacao de transacao com category_id removida por soft delete", async () => {
    const token = await registerAndLogin("transacoes-categoria-removida@controlfinance.dev");

    const categoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Assinaturas",
      });

    const deleteCategoryResponse = await request(app)
      .delete(`/categories/${categoryResponse.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    const createResponse = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 45,
        date: "2026-02-16",
        description: "Streaming",
        category_id: categoryResponse.body.id,
      });

    expect(categoryResponse.status).toBe(201);
    expect(deleteCategoryResponse.status).toBe(200);
    expectErrorResponseWithRequestId(createResponse, 404, "Categoria nao encontrada.");
  });

  it("bloqueia criacao de transacao com category_id invalido", async () => {
    const token = await registerAndLogin("transacoes-categoria-invalida@controlfinance.dev");

    const response = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 20,
        category_id: "abc",
      });

    expectErrorResponseWithRequestId(
      response,
      400,
      "Categoria invalida. Informe um inteiro maior que zero.",
    );
  });

  it("retorna 404 quando category_id nao pertence ao usuario autenticado", async () => {
    const tokenUserA = await registerAndLogin("category-owner@controlfinance.dev");
    const tokenUserB = await registerAndLogin("category-guest@controlfinance.dev");

    const categoryUserAResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${tokenUserA}`)
      .send({
        name: "Transporte",
      });

    const createByOtherUserResponse = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${tokenUserB}`)
      .send({
        type: "Saida",
        value: 30,
        category_id: categoryUserAResponse.body.id,
      });

    const createWithUnknownCategoryResponse = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${tokenUserB}`)
      .send({
        type: "Saida",
        value: 30,
        category_id: 999999,
      });

    expect(categoryUserAResponse.status).toBe(201);
    expectErrorResponseWithRequestId(createByOtherUserResponse, 404, "Categoria nao encontrada.");
    expectErrorResponseWithRequestId(
      createWithUnknownCategoryResponse,
      404,
      "Categoria nao encontrada.",
    );
  });

  it("pagina transacoes com meta consistente", async () => {
    const token = await registerAndLogin("pagination@controlfinance.dev");

    await Promise.all(
      [1, 2, 3, 4, 5].map((day) =>
        request(app)
          .post("/transactions")
          .set("Authorization", `Bearer ${token}`)
          .send({
            type: "Entrada",
            value: day * 10,
            date: `2026-02-0${day}`,
            description: `Lancamento ${day}`,
          }),
      ),
    );

    const secondPageResponse = await request(app)
      .get("/transactions")
      .query({
        page: 2,
        limit: 2,
      })
      .set("Authorization", `Bearer ${token}`);

    expect(secondPageResponse.status).toBe(200);
    expect(secondPageResponse.body.meta).toEqual({
      page: 2,
      limit: 2,
      offset: 2,
      total: 5,
      totalPages: 3,
    });
    expect(secondPageResponse.body.data).toHaveLength(2);
    expect(secondPageResponse.body.data[0].description).toBe("Lancamento 3");
    expect(secondPageResponse.body.data[1].description).toBe("Lancamento 4");
  });

  it("aplica limit=20 e offset=0 por padrao em GET /transactions", async () => {
    const token = await registerAndLogin("pagination-default@controlfinance.dev");
    await createTransactionsForUser(token, 25);

    const response = await request(app)
      .get("/transactions")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({
      page: 1,
      limit: 20,
      offset: 0,
      total: 25,
      totalPages: 2,
    });
    expect(response.body.data).toHaveLength(20);
    expect(response.body.data[0].description).toBe("Lancamento 1");
    expect(response.body.data[19].description).toBe("Lancamento 20");
  });

  it("aplica offset=0 quando limit e explicito em GET /transactions", async () => {
    const token = await registerAndLogin("pagination-limit@controlfinance.dev");
    await createTransactionsForUser(token, 25);

    const response = await request(app)
      .get("/transactions")
      .query({
        limit: 10,
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({
      page: 1,
      limit: 10,
      offset: 0,
      total: 25,
      totalPages: 3,
    });
    expect(response.body.data).toHaveLength(10);
    expect(response.body.data[0].description).toBe("Lancamento 1");
    expect(response.body.data[9].description).toBe("Lancamento 10");
  });

  it("aplica precedencia de offset sobre page em GET /transactions", async () => {
    const token = await registerAndLogin("pagination-offset-precedence@controlfinance.dev");
    await createTransactionsForUser(token, 5);

    const response = await request(app)
      .get("/transactions")
      .query({
        page: 3,
        limit: 2,
        offset: 1,
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({
      page: 1,
      limit: 2,
      offset: 1,
      total: 5,
      totalPages: 3,
    });
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data[0].description).toBe("Lancamento 2");
    expect(response.body.data[1].description).toBe("Lancamento 3");
  });

  it("ordena transacoes por amount desc quando sort=amount:desc", async () => {
    const token = await registerAndLogin("pagination-sort-amount-desc@controlfinance.dev");

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 20,
        date: "2026-02-01",
        description: "Valor 20",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 70,
        date: "2026-02-02",
        description: "Valor 70",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 45,
        date: "2026-02-03",
        description: "Valor 45",
      });

    const response = await request(app)
      .get("/transactions")
      .query({
        sort: "amount:desc",
        limit: 20,
        offset: 0,
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(3);
    expect(response.body.data.map((transaction) => Number(transaction.value))).toEqual([70, 45, 20]);
  });

  it("aceita direcao case-insensitive em sort e ordena corretamente", async () => {
    const token = await registerAndLogin("pagination-sort-direction-case@controlfinance.dev");

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 10,
        date: "2026-02-01",
        description: "Valor 10",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 30,
        date: "2026-02-02",
        description: "Valor 30",
      });

    const response = await request(app)
      .get("/transactions")
      .query({
        sort: "amount:DESC",
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((transaction) => Number(transaction.value))).toEqual([30, 10]);
  });

  it("faz fallback para ordenacao padrao quando sort e invalido", async () => {
    const token = await registerAndLogin("pagination-sort-fallback@controlfinance.dev");

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 10,
        date: "2026-02-03",
        description: "Terceiro",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 20,
        date: "2026-02-01",
        description: "Primeiro",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 15,
        date: "2026-02-02",
        description: "Segundo",
      });

    const response = await request(app)
      .get("/transactions")
      .query({
        sort: "hacker:desc",
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(3);
    expect(response.body.data.map((transaction) => transaction.description)).toEqual([
      "Primeiro",
      "Segundo",
      "Terceiro",
    ]);
  });

  it.each([
    { limit: "101" },
    { offset: "-1" },
    { limit: "10.5" },
    { offset: "abc" },
  ])("retorna 400 para paginacao invalida em GET /transactions (%o)", async (query) => {
    const token = await registerAndLogin(
      `pagination-invalid-${Object.keys(query)[0]}-${String(Object.values(query)[0])}@controlfinance.dev`,
    );

    const response = await request(app)
      .get("/transactions")
      .query(query)
      .set("Authorization", `Bearer ${token}`);

    expectErrorResponseWithRequestId(response, 400, "Paginacao invalida.");
  });

  it("filtra transacoes por categoryId", async () => {
    const token = await registerAndLogin("filtro-categoria@controlfinance.dev");

    const foodCategoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Alimentacao",
      });

    const transportCategoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Transporte",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 45,
        date: "2026-02-10",
        description: "Mercado",
        category_id: foodCategoryResponse.body.id,
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 20,
        date: "2026-02-11",
        description: "Onibus",
        category_id: transportCategoryResponse.body.id,
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 100,
        date: "2026-02-12",
        description: "Freela",
      });

    const filteredResponse = await request(app)
      .get("/transactions")
      .query({
        categoryId: foodCategoryResponse.body.id,
      })
      .set("Authorization", `Bearer ${token}`);

    expect(foodCategoryResponse.status).toBe(201);
    expect(transportCategoryResponse.status).toBe(201);
    expect(filteredResponse.status).toBe(200);
    expect(filteredResponse.body.meta).toEqual({
      page: 1,
      limit: 20,
      offset: 0,
      total: 1,
      totalPages: 1,
    });
    expect(filteredResponse.body.data).toHaveLength(1);
    expect(filteredResponse.body.data[0]).toMatchObject({
      description: "Mercado",
      categoryId: foodCategoryResponse.body.id,
    });
  });

  it("retorna 400 para filtro categoryId invalido", async () => {
    const token = await registerAndLogin("filtro-categoria-invalido@controlfinance.dev");

    const response = await request(app)
      .get("/transactions")
      .query({
        categoryId: "abc",
      })
      .set("Authorization", `Bearer ${token}`);

    expectErrorResponseWithRequestId(
      response,
      400,
      "Categoria invalida. Informe um inteiro maior que zero.",
    );
  });

  it("filtra transacoes por tipo, periodo e busca", async () => {
    const token = await registerAndLogin("filtro@controlfinance.dev");

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 100,
        date: "2026-02-01",
        description: "Salario",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 30,
        date: "2026-02-11",
        description: "Mercado central",
        notes: "Compra semanal",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 25,
        date: "2026-02-20",
        description: "Transporte",
      });

    const filteredResponse = await request(app)
      .get("/transactions")
      .query({
        type: "Saida",
        from: "2026-02-01",
        to: "2026-02-15",
        q: "merc",
      })
      .set("Authorization", `Bearer ${token}`);

    expect(filteredResponse.status).toBe(200);
    expect(filteredResponse.body.meta).toEqual({
      page: 1,
      limit: 20,
      offset: 0,
      total: 1,
      totalPages: 1,
    });
    expect(filteredResponse.body.data).toHaveLength(1);
    expect(filteredResponse.body.data[0]).toMatchObject({
      type: "Saida",
      value: 30,
      date: "2026-02-11",
      description: "Mercado central",
    });
  });

  it("exporta CSV filtrado com totais", async () => {
    const token = await registerAndLogin("export@controlfinance.dev");

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 100,
        date: "2026-02-10",
        description: "Salario",
      });

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 40,
        date: "2026-02-12",
        description: "Mercado, feira",
        notes: 'Compra "A"',
      });

    const exportResponse = await request(app)
      .get("/transactions/export.csv")
      .query({
        type: "Saida",
        from: "2026-02-01",
        to: "2026-02-28",
      })
      .set("Authorization", `Bearer ${token}`);

    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers["content-type"]).toContain("text/csv");
    expect(exportResponse.headers["content-disposition"]).toContain(
      'attachment; filename="transacoes-saida-2026-02-01-a-2026-02-28.csv"',
    );
    expect(exportResponse.text).toContain(
      "id,type,value,date,description,notes,created_at",
    );
    expect(exportResponse.text).toContain('"Mercado, feira"');
    expect(exportResponse.text).toContain('"Compra ""A"""');
    expect(exportResponse.text).toContain("summary,total_entradas,total_saidas,saldo");
    expect(exportResponse.text).toContain("totals,0.00,40.00,-40.00");
    expect(exportResponse.text).not.toContain("Salario");
  });

  it("atualiza transacao do proprio usuario", async () => {
    const token = await registerAndLogin("update@controlfinance.dev");

    const createdTransaction = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Entrada",
        value: 200,
        date: "2026-02-14",
        description: "Salario",
      });

    const updatedTransaction = await request(app)
      .patch(`/transactions/${createdTransaction.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 180.4,
        description: "Mercado",
        notes: "Compra quinzenal",
      });

    expect(updatedTransaction.status).toBe(200);
    expect(updatedTransaction.body).toMatchObject({
      id: createdTransaction.body.id,
      type: "Saida",
      value: 180.4,
      date: "2026-02-14",
      description: "Mercado",
      notes: "Compra quinzenal",
    });
  });

  it("atualiza transacao para Sem categoria quando category_id = null", async () => {
    const token = await registerAndLogin("update-category-null@controlfinance.dev");

    const categoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Lazer",
      });

    const createdTransaction = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 90,
        date: "2026-02-14",
        description: "Cinema",
        category_id: categoryResponse.body.id,
      });

    const updatedTransaction = await request(app)
      .patch(`/transactions/${createdTransaction.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        category_id: null,
      });

    expect(categoryResponse.status).toBe(201);
    expect(createdTransaction.status).toBe(201);
    expect(updatedTransaction.status).toBe(200);
    expect(updatedTransaction.body).toMatchObject({
      id: createdTransaction.body.id,
      categoryId: null,
      type: "Saida",
      value: 90,
      date: "2026-02-14",
      description: "Cinema",
    });

    const listResponse = await request(app)
      .get("/transactions")
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body.data[0]).toMatchObject({
      id: createdTransaction.body.id,
      categoryId: null,
    });
  });

  it("bloqueia atualizacao de transacao para category_id removida", async () => {
    const token = await registerAndLogin("update-category-deleted@controlfinance.dev");

    const sourceCategoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Mercado",
      });

    const deletedCategoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Assinaturas",
      });

    const createdTransaction = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 55,
        date: "2026-02-14",
        description: "Compra",
        category_id: sourceCategoryResponse.body.id,
      });

    const deleteCategoryResponse = await request(app)
      .delete(`/categories/${deletedCategoryResponse.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    const updateResponse = await request(app)
      .patch(`/transactions/${createdTransaction.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        category_id: deletedCategoryResponse.body.id,
      });

    expect(sourceCategoryResponse.status).toBe(201);
    expect(deletedCategoryResponse.status).toBe(201);
    expect(createdTransaction.status).toBe(201);
    expect(deleteCategoryResponse.status).toBe(200);
    expectErrorResponseWithRequestId(updateResponse, 404, "Categoria nao encontrada.");
  });

  it("nao permite atualizar transacao de outro usuario", async () => {
    const tokenUserA = await registerAndLogin("owner-update@controlfinance.dev");
    const tokenUserB = await registerAndLogin("guest-update@controlfinance.dev");

    const createdTransaction = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${tokenUserA}`)
      .send({
        type: "Entrada",
        value: 80,
      });

    const updateResponse = await request(app)
      .patch(`/transactions/${createdTransaction.body.id}`)
      .set("Authorization", `Bearer ${tokenUserB}`)
      .send({
        value: 99,
      });

    expect(updateResponse.status).toBe(404);
  });

  it("isola transacoes por usuario", async () => {
    const tokenUserA = await registerAndLogin("usuario-a@controlfinance.dev");
    const tokenUserB = await registerAndLogin("usuario-b@controlfinance.dev");

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${tokenUserA}`)
      .send({
        type: "Entrada",
        value: 80,
      });

    const listUserB = await request(app)
      .get("/transactions")
      .set("Authorization", `Bearer ${tokenUserB}`);

    expect(listUserB.status).toBe(200);
    expect(listUserB.body.data).toEqual([]);
    expect(listUserB.body.meta).toEqual({
      page: 1,
      limit: 20,
      offset: 0,
      total: 0,
      totalPages: 1,
    });
  });

  it("nao permite deletar transacao de outro usuario", async () => {
    const tokenUserA = await registerAndLogin("dono@controlfinance.dev");
    const tokenUserB = await registerAndLogin("visitante@controlfinance.dev");

    const createdTransaction = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${tokenUserA}`)
      .send({
        type: "Entrada",
        value: 15,
      });

    const deleteResponse = await request(app)
      .delete(`/transactions/${createdTransaction.body.id}`)
      .set("Authorization", `Bearer ${tokenUserB}`);

    expect(deleteResponse.status).toBe(404);
  });

  it("deleta transacao do proprio usuario", async () => {
    const token = await registerAndLogin("delete@controlfinance.dev");

    const createdTransaction = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 20,
      });

    const deleteResponse = await request(app)
      .delete(`/transactions/${createdTransaction.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body).toEqual({
      id: createdTransaction.body.id,
      success: true,
    });

    const listResponse = await request(app)
      .get("/transactions")
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toEqual([]);
  });

  it("restaura transacao removida por soft delete", async () => {
    const token = await registerAndLogin("restore@controlfinance.dev");

    const createdTransaction = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "Saida",
        value: 50,
        description: "Internet",
      });

    const deleteResponse = await request(app)
      .delete(`/transactions/${createdTransaction.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(deleteResponse.status).toBe(200);

    const listWithoutDeleted = await request(app)
      .get("/transactions")
      .set("Authorization", `Bearer ${token}`);

    expect(listWithoutDeleted.status).toBe(200);
    expect(listWithoutDeleted.body.data).toEqual([]);

    const listWithDeleted = await request(app)
      .get("/transactions?includeDeleted=true")
      .set("Authorization", `Bearer ${token}`);

    expect(listWithDeleted.status).toBe(200);
    expect(listWithDeleted.body.data).toHaveLength(1);
    expect(listWithDeleted.body.data[0].deletedAt).toBeTruthy();

    const restoreResponse = await request(app)
      .post(`/transactions/${createdTransaction.body.id}/restore`)
      .set("Authorization", `Bearer ${token}`);

    expect(restoreResponse.status).toBe(200);
    expect(restoreResponse.body.deletedAt).toBeNull();

    const listAfterRestore = await request(app)
      .get("/transactions")
      .set("Authorization", `Bearer ${token}`);

    expect(listAfterRestore.status).toBe(200);
    expect(listAfterRestore.body.data).toHaveLength(1);
    expect(listAfterRestore.body.data[0].id).toBe(createdTransaction.body.id);
  });
});
