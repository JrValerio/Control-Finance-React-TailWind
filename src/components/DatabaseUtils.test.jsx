import { describe, expect, it } from "vitest";
import {
  CATEGORY_ALL,
  CATEGORY_ENTRY,
  CATEGORY_EXIT,
  calculateBalance,
  filterByCategory,
  parseCurrencyInput,
} from "./DatabaseUtils";

describe("DatabaseUtils", () => {
  it("filtra transacoes por categoria", () => {
    const transactions = [
      { id: 1, value: 100, type: CATEGORY_ENTRY },
      { id: 2, value: 40, type: CATEGORY_EXIT },
    ];

    expect(filterByCategory(transactions, CATEGORY_ALL)).toEqual(transactions);
    expect(filterByCategory(transactions, CATEGORY_ENTRY)).toEqual([
      { id: 1, value: 100, type: CATEGORY_ENTRY },
    ]);
    expect(filterByCategory(transactions, CATEGORY_EXIT)).toEqual([
      { id: 2, value: 40, type: CATEGORY_EXIT },
    ]);
  });

  it("calcula saldo com entradas e saidas", () => {
    const transactions = [
      { id: 1, value: 100, type: CATEGORY_ENTRY },
      { id: 2, value: 40, type: CATEGORY_EXIT },
      { id: 3, value: 20, type: CATEGORY_ENTRY },
    ];

    expect(calculateBalance(transactions)).toBe(80);
  });

  it("converte entrada de moeda para numero", () => {
    expect(parseCurrencyInput("1.234,56")).toBe(1234.56);
    expect(parseCurrencyInput("70")).toBe(70);
    expect(Number.isNaN(parseCurrencyInput("abc"))).toBe(true);
  });
});
