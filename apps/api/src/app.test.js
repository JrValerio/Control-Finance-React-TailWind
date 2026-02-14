import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newDb } from "pg-mem";
import app from "./app.js";
import { clearDbClientForTests, dbQuery, setDbClientForTests } from "./db/index.js";
import { runMigrations } from "./db/migrate.js";

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
    await dbQuery("DELETE FROM transactions");
    await dbQuery("DELETE FROM users");
  });

  it("GET /health responde com status 200 e versao", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, version: "1.4.0" });
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

  it.each([
    ["12345678", "somente numeros"],
    ["abcdefgh", "somente letras"],
    ["abc123", "menos de 8 caracteres"],
  ])(
    "POST /auth/register bloqueia senha fraca (%s - %s)",
    async (password) => {
      const response = await request(app).post("/auth/register").send({
        email: `fraca-${password}@controlfinance.dev`,
        password,
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(
        "Senha fraca. Use no minimo 8 caracteres com letras e numeros.",
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
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      type: "Entrada",
      value: 100.5,
      date: "2026-02-13",
    });
    expect(Number.isInteger(createResponse.body.id)).toBe(true);
    expect(Number.isInteger(createResponse.body.userId)).toBe(true);

    const listResponse = await request(app)
      .get("/transactions")
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toHaveLength(1);
    expect(listResponse.body[0]).toMatchObject({
      type: "Entrada",
      value: 100.5,
      date: "2026-02-13",
    });
    expect(listResponse.body[0].id).toBe(createResponse.body.id);
    expect(listResponse.body[0].userId).toBe(createResponse.body.userId);
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
    expect(listUserB.body).toEqual([]);
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
  });
});
