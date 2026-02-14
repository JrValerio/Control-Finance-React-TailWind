import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import app from "./app.js";
import { __resetAuthStoreForTests } from "./services/auth.service.js";
import { __resetTransactionsStoreForTests } from "./services/transactions.service.js";

const registerAndLogin = async (email, password = "123456") => {
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
  beforeEach(() => {
    __resetAuthStoreForTests();
    __resetTransactionsStoreForTests();
  });

  it("GET /health responde com status 200 e versao", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, version: "1.3.0" });
  });

  it("POST /auth/register cria usuario", async () => {
    const response = await request(app).post("/auth/register").send({
      name: "Junior",
      email: "jr@controlfinance.dev",
      password: "123456",
    });

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({
      id: 1,
      name: "Junior",
      email: "jr@controlfinance.dev",
    });
  });

  it("POST /auth/register bloqueia email duplicado", async () => {
    await request(app).post("/auth/register").send({
      email: "duplicado@controlfinance.dev",
      password: "123456",
    });

    const response = await request(app).post("/auth/register").send({
      email: "duplicado@controlfinance.dev",
      password: "123456",
    });

    expect(response.status).toBe(409);
  });

  it("POST /auth/login retorna token", async () => {
    await request(app).post("/auth/register").send({
      email: "login@controlfinance.dev",
      password: "123456",
    });

    const response = await request(app).post("/auth/login").send({
      email: "login@controlfinance.dev",
      password: "123456",
    });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe("login@controlfinance.dev");
    expect(typeof response.body.token).toBe("string");
    expect(response.body.token.length).toBeGreaterThan(10);
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
      id: 1,
      userId: 1,
      type: "Entrada",
      value: 100.5,
      date: "2026-02-13",
    });

    const listResponse = await request(app)
      .get("/transactions")
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toHaveLength(1);
    expect(listResponse.body[0]).toMatchObject({
      id: 1,
      userId: 1,
      type: "Entrada",
      value: 100.5,
      date: "2026-02-13",
    });
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
