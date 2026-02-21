import { dbQuery } from "../db/index.js";
import {
  TRANSACTION_TYPE_ENTRY,
  TRANSACTION_TYPE_EXIT,
} from "../constants/transaction-types.js";

const CATEGORY_ENTRY = TRANSACTION_TYPE_ENTRY;
const CATEGORY_EXIT = TRANSACTION_TYPE_EXIT;
const DEFAULT_MONTHS = 6;
const MIN_MONTHS = 1;
const MAX_MONTHS = 24;

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const normalizeUserId = (value) => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw createError(401, "Usuario nao autenticado.");
  }

  return parsedValue;
};

const normalizeMonths = (value) => {
  if (typeof value === "undefined" || value === null) {
    return DEFAULT_MONTHS;
  }

  const normalizedValue = String(value).trim();

  if (!normalizedValue) {
    throw createError(400, "months invalido. Use inteiro entre 1 e 24.");
  }

  const parsedValue = Number(normalizedValue);

  if (!Number.isInteger(parsedValue) || parsedValue < MIN_MONTHS || parsedValue > MAX_MONTHS) {
    throw createError(400, "months invalido. Use inteiro entre 1 e 24.");
  }

  return parsedValue;
};

const addMonthsUtc = (baseDate, monthsToAdd) =>
  new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + monthsToAdd, 1));

const toMonthValue = (value) => {
  const date = new Date(value);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
};

const toIsoDate = (value) => {
  const date = new Date(value);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const resolveTrendRange = (months) => {
  const now = new Date();
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startMonth = addMonthsUtc(currentMonthStart, -(months - 1));

  return {
    startMonthDate: startMonth,
    endMonthDate: currentMonthStart,
    startMonth: toIsoDate(startMonth),
    endMonth: toIsoDate(currentMonthStart),
  };
};

const resolveMonthSeries = (startMonthDate, months) =>
  Array.from({ length: months }, (_unusedValue, index) =>
    toMonthValue(addMonthsUtc(startMonthDate, index)),
  );

const mapTrendRow = (row) => ({
  month: String(row?.month || ""),
  income: Number(row?.income || 0),
  expense: Number(row?.expense || 0),
  balance: Number(row?.balance || 0),
});

export const getMonthlyTrendForUser = async (userId, months) => {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedMonths = normalizeMonths(months);
  const trendRange = resolveTrendRange(normalizedMonths);
  const queryParams = [
    normalizedUserId,
    trendRange.startMonth,
    trendRange.endMonth,
    CATEGORY_ENTRY,
    CATEGORY_EXIT,
  ];

  try {
    const result = await dbQuery(
      `
        WITH series AS (
          SELECT
            generate_series($2::date, $3::date, '1 month'::interval)::date AS month_start
        ),
        agg AS (
          SELECT
            date_trunc('month', t.date)::date AS month_start,
            COALESCE(SUM(CASE WHEN t.type = $4 THEN t.value ELSE 0 END), 0)::numeric AS income,
            COALESCE(SUM(CASE WHEN t.type = $5 THEN t.value ELSE 0 END), 0)::numeric AS expense
          FROM transactions t
          WHERE t.user_id = $1
            AND t.deleted_at IS NULL
            AND t.date >= $2::date
            AND t.date < ($3::date + interval '1 month')
          GROUP BY 1
        )
        SELECT
          to_char(s.month_start, 'YYYY-MM') AS month,
          COALESCE(a.income, 0) AS income,
          COALESCE(a.expense, 0) AS expense,
          (COALESCE(a.income, 0) - COALESCE(a.expense, 0)) AS balance
        FROM series s
        LEFT JOIN agg a ON a.month_start = s.month_start
        ORDER BY s.month_start ASC
      `,
      queryParams,
    );

    return result.rows.map(mapTrendRow);
  } catch (error) {
    const errorMessage = String(error?.message || "").toLowerCase();

    if (!errorMessage.includes("generate_series")) {
      throw error;
    }
  }

  const fallbackTransactionsResult = await dbQuery(
    `
      SELECT
        t.type,
        t.value,
        t.date
      FROM transactions t
      WHERE t.user_id = $1
        AND t.deleted_at IS NULL
        AND t.date >= $2::date
        AND t.date < ($3::date + interval '1 month')
      ORDER BY t.date ASC, t.id ASC
    `,
    [queryParams[0], queryParams[1], queryParams[2]],
  );

  const totalsByMonth = new Map();
  fallbackTransactionsResult.rows.forEach((row) => {
    const month = toMonthValue(row?.date);
    const currentTotals = totalsByMonth.get(month) || { income: 0, expense: 0 };
    const normalizedValue = Number(row?.value || 0);

    if (row?.type === CATEGORY_ENTRY) {
      currentTotals.income += normalizedValue;
    } else if (row?.type === CATEGORY_EXIT) {
      currentTotals.expense += normalizedValue;
    }

    totalsByMonth.set(month, currentTotals);
  });

  return resolveMonthSeries(trendRange.startMonthDate, normalizedMonths).map((month) => {
    const monthTotals = totalsByMonth.get(month) || { income: 0, expense: 0 };
    const income = Number(monthTotals.income || 0);
    const expense = Number(monthTotals.expense || 0);

    return {
      month,
      income,
      expense,
      balance: income - expense,
    };
  });
};
