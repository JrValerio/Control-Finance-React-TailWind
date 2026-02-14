import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import app from "./app.js";
import { __resetAuthStoreForTests } from "./services/auth.service.js";

describe("API foundation", () => {
  beforeEach(() => {
    __resetAuthStoreForTests();
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

  it("GET /transactions aceita token valido", async () => {
    await request(app).post("/auth/register").send({
      email: "token@controlfinance.dev",
      password: "123456",
    });

    const loginResponse = await request(app).post("/auth/login").send({
      email: "token@controlfinance.dev",
      password: "123456",
    });

    const response = await request(app)
      .get("/transactions")
      .set("Authorization", `Bearer ${loginResponse.body.token}`);

    expect(response.status).toBe(501);
    expect(response.body.userId).toBe(1);
  });
});
