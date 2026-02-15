import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newDb } from "pg-mem";
import app from "./app.js";
import { clearDbClientForTests, dbQuery, setDbClientForTests } from "./db/index.js";
import { runMigrations } from "./db/migrate.js";
import {
  LOGIN_THROTTLE_MESSAGE,
  resetLoginProtectionState,
} from "./middlewares/login-protection.middleware.js";

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

const sleep = (durationInMs) =>
  new Promise((resolve) => {
    setTimeout(resolve, durationInMs);
  });

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
    await dbQuery("DELETE FROM transactions");
    await dbQuery("DELETE FROM users");
  });

  it("GET /health responde com status 200 e versao", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, version: "1.5.0" });
  });

  it("POST /auth/register cria usuario", async () => {
    const response = await request(app).post("/auth/register").send({
      name: "Junior",
      email: "jr@controlfinance.dev",
      password: "Senha123",
    });

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({
      name: "Junior",
      email: "jr@controlfinance.dev",
    });
    expect(Number.isInteger(response.body.user.id)).toBe(true);
    expect(response.body.user.id).toBeGreaterThan(0);
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

    expect(response.status).toBe(409);
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
  });

  it("aplica bloqueio por brute force e desbloqueia apos janela", async () => {
    const envSnapshot = snapshotAuthSecurityEnv();
    process.env.AUTH_BRUTE_FORCE_MAX_ATTEMPTS = "2";
    process.env.AUTH_BRUTE_FORCE_WINDOW_MS = "150";
    process.env.AUTH_BRUTE_FORCE_LOCK_MS = "150";

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

      await sleep(170);

      const unlockedAttempt = await request(app)
        .post("/auth/login")
        .send(invalidCredentials);

      expect(unlockedAttempt.status).toBe(401);
    } finally {
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

  it("GET /transactions bloqueia sem token", async () => {
    const response = await request(app).get("/transactions");

    expect(response.status).toBe(401);
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
    expect(Number.isInteger(createResponse.body.id)).toBe(true);
    expect(Number.isInteger(createResponse.body.userId)).toBe(true);

    const listResponse = await request(app)
      .get("/transactions")
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.meta).toEqual({
      page: 1,
      limit: 20,
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
    expect(listResponse.body.data[0].id).toBe(createResponse.body.id);
    expect(listResponse.body.data[0].userId).toBe(createResponse.body.userId);
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
      total: 5,
      totalPages: 3,
    });
    expect(secondPageResponse.body.data).toHaveLength(2);
    expect(secondPageResponse.body.data[0].description).toBe("Lancamento 3");
    expect(secondPageResponse.body.data[1].description).toBe("Lancamento 4");
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
