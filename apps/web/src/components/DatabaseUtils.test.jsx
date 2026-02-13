import { describe, expect, it } from "vitest";
import {
  CATEGORY_ALL,
  CATEGORY_ENTRY,
  CATEGORY_EXIT,
  PERIOD_CUSTOM,
  PERIOD_LAST_7_DAYS,
  PERIOD_TODAY,
  calculateBalance,
  filterByCategory,
  filterByPeriod,
  getTodayISODate,
  normalizeTransactionDate,
  parseCurrencyInput,
} from "./DatabaseUtils";

describe("DatabaseUtils", () => {
  it("filtra transacoes por categoria", () => {
    const transactions = [
      { id: 1, value: 100, type: CATEGORY_ENTRY, date: "2026-02-01" },
      { id: 2, value: 40, type: CATEGORY_EXIT, date: "2026-02-02" },
    ];

    expect(filterByCategory(transactions, CATEGORY_ALL)).toEqual(transactions);
    expect(filterByCategory(transactions, CATEGORY_ENTRY)).toEqual([
      { id: 1, value: 100, type: CATEGORY_ENTRY, date: "2026-02-01" },
    ]);
    expect(filterByCategory(transactions, CATEGORY_EXIT)).toEqual([
      { id: 2, value: 40, type: CATEGORY_EXIT, date: "2026-02-02" },
    ]);
  });

  it("filtra por periodo relativo e personalizado", () => {
    const referenceDate = new Date("2026-02-13T12:00:00");
    const transactions = [
      { id: 1, value: 100, type: CATEGORY_ENTRY, date: "2026-02-13" },
      { id: 2, value: 50, type: CATEGORY_ENTRY, date: "2026-02-10" },
      { id: 3, value: 30, type: CATEGORY_EXIT, date: "2026-01-20" },
    ];

    expect(filterByPeriod(transactions, PERIOD_TODAY, {}, referenceDate)).toEqual([
      { id: 1, value: 100, type: CATEGORY_ENTRY, date: "2026-02-13" },
    ]);

    expect(
      filterByPeriod(transactions, PERIOD_LAST_7_DAYS, {}, referenceDate),
    ).toEqual([
      { id: 1, value: 100, type: CATEGORY_ENTRY, date: "2026-02-13" },
      { id: 2, value: 50, type: CATEGORY_ENTRY, date: "2026-02-10" },
    ]);

    expect(
      filterByPeriod(
        transactions,
        PERIOD_CUSTOM,
        { startDate: "2026-02-01", endDate: "2026-02-12" },
        referenceDate,
      ),
    ).toEqual([{ id: 2, value: 50, type: CATEGORY_ENTRY, date: "2026-02-10" }]);
  });

  it("calcula saldo com entradas e saidas", () => {
    const transactions = [
      { id: 1, value: 100, type: CATEGORY_ENTRY, date: "2026-02-01" },
      { id: 2, value: 40, type: CATEGORY_EXIT, date: "2026-02-02" },
      { id: 3, value: 20, type: CATEGORY_ENTRY, date: "2026-02-03" },
    ];

    expect(calculateBalance(transactions)).toBe(80);
  });

  it("normaliza data invalida com fallback", () => {
    const fallbackDate = getTodayISODate(new Date("2026-02-13T12:00:00"));

    expect(normalizeTransactionDate("2026-02-01", fallbackDate)).toBe(
      "2026-02-01",
    );
    expect(normalizeTransactionDate("2026-13-88", fallbackDate)).toBe(
      fallbackDate,
    );
  });

  it("converte entrada de moeda para numero", () => {
    expect(parseCurrencyInput("1.234,56")).toBe(1234.56);
    expect(parseCurrencyInput("70")).toBe(70);
    expect(Number.isNaN(parseCurrencyInput("abc"))).toBe(true);
  });
});
