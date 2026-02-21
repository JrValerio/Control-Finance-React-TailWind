import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "./app.js";
import { clearDbClientForTests, dbQuery } from "./db/index.js";
import {
  resetLoginProtectionState,
} from "./middlewares/login-protection.middleware.js";
import {
  resetImportRateLimiterState,
  resetWriteRateLimiterState,
} from "./middlewares/rate-limit.middleware.js";
import { resetHttpMetricsForTests } from "./observability/http-metrics.js";
import { expectErrorResponseWithRequestId, registerAndLogin, setupTestDb } from "./test-helpers.js";

describe("budgets", () => {
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
});
