import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "./app.js";

describe("API foundation", () => {
  it("GET /health responde com status 200 e versao", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, version: "1.3.0" });
  });

  it("POST /auth/register retorna placeholder 501", async () => {
    const response = await request(app).post("/auth/register").send({});

    expect(response.status).toBe(501);
  });

  it("GET /transactions retorna placeholder 501", async () => {
    const response = await request(app).get("/transactions");

    expect(response.status).toBe(501);
  });
});
