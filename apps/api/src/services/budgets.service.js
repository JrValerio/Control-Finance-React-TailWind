import { dbQuery } from "../db/index.js";

const ISO_MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
const STATUS_OK = "ok";
const STATUS_NEAR_LIMIT = "near_limit";
const STATUS_EXCEEDED = "exceeded";
const CATEGORY_EXIT = "Saida";

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

const normalizeCategoryId = (value) => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw createError(400, "Categoria invalida. Informe um inteiro maior que zero.");
  }

  return parsedValue;
};

const normalizeBudgetId = (value) => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw createError(400, "ID de meta invalido.");
  }

  return parsedValue;
};

const normalizeAmount = (value) => {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw createError(400, "Valor invalido. Informe um numero maior que zero.");
  }

  return Number(parsedValue.toFixed(2));
};

const normalizeMonth = (value) => {
  if (typeof value === "undefined" || value === null || value === "") {
    throw createError(400, "Mes e obrigatorio. Use YYYY-MM.");
  }

  if (typeof value !== "string") {
    throw createError(400, "Mes invalido. Use YYYY-MM.");
  }

  const normalizedValue = value.trim();

  if (!ISO_MONTH_REGEX.test(normalizedValue)) {
    throw createError(400, "Mes invalido. Use YYYY-MM.");
  }

  return normalizedValue;
};

const resolveMonthRange = (month) => {
  const [yearPart, monthPart] = month.split("-");
  const year = Number(yearPart);
  const monthNumber = Number(monthPart);
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;

  return {
    from: `${yearPart}-${monthPart}-01`,
    to: `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`,
  };
};

const ensureCategoryBelongsToUser = async (userId, categoryId) => {
  const result = await dbQuery(
    `
      SELECT id
      FROM categories
      WHERE id = $1 AND user_id = $2
      LIMIT 1
    `,
    [categoryId, userId],
  );

  if (result.rows.length === 0) {
    throw createError(404, "Categoria nao encontrada.");
  }
};

const toISODateTime = (value) => {
  if (typeof value === "string") {
    return value;
  }

  return new Date(value).toISOString();
};

const toMoney = (value) => Number(Number(value || 0).toFixed(2));
const toPercentage = (value) => Number(Number(value || 0).toFixed(2));

const resolveBudgetStatus = (percentage) => {
  if (percentage > 100) {
    return STATUS_EXCEEDED;
  }

  if (percentage >= 80) {
    return STATUS_NEAR_LIMIT;
  }

  return STATUS_OK;
};

const mapBudgetRow = (row) => ({
  id: Number(row.id),
  categoryId: Number(row.category_id),
  month: row.month,
  amount: toMoney(row.amount),
  createdAt: toISODateTime(row.created_at),
  updatedAt: toISODateTime(row.updated_at),
});

const mapBudgetSummaryRow = (row) => {
  const budget = toMoney(row.budget);
  const actual = toMoney(row.actual);
  const remaining = toMoney(budget - actual);
  const percentage = budget > 0 ? toPercentage((actual / budget) * 100) : 0;

  return {
    id: Number(row.id),
    categoryId: Number(row.category_id),
    categoryName: row.category_name || "Sem categoria",
    month: row.month,
    budget,
    actual,
    remaining,
    percentage,
    status: resolveBudgetStatus(percentage),
  };
};

export const upsertMonthlyBudgetForUser = async (userId, payload = {}) => {
  const normalizedUserId = normalizeUserId(userId);
  const categoryId = normalizeCategoryId(payload.categoryId);
  const month = normalizeMonth(payload.month);
  const amount = normalizeAmount(payload.amount);

  await ensureCategoryBelongsToUser(normalizedUserId, categoryId);

  const result = await dbQuery(
    `
      INSERT INTO monthly_budgets (user_id, category_id, month, amount)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, category_id, month)
      DO UPDATE SET
        amount = EXCLUDED.amount,
        updated_at = NOW()
      RETURNING id, user_id, category_id, month, amount, created_at, updated_at
    `,
    [normalizedUserId, categoryId, month, amount],
  );

  return mapBudgetRow(result.rows[0]);
};

export const listMonthlyBudgetsByUser = async (userId, month) => {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedMonth = normalizeMonth(month);
  const monthRange = resolveMonthRange(normalizedMonth);

  const result = await dbQuery(
    `
      SELECT
        b.id,
        b.category_id,
        b.month,
        b.amount::numeric AS budget,
        c.name AS category_name,
        COALESCE(SUM(t.value), 0)::numeric AS actual
      FROM monthly_budgets b
      INNER JOIN categories c
        ON c.id = b.category_id
       AND c.user_id = b.user_id
      LEFT JOIN transactions t
        ON t.user_id = b.user_id
       AND t.category_id = b.category_id
       AND t.deleted_at IS NULL
       AND t.type = $5
       AND t.date >= $3
       AND t.date < $4
      WHERE b.user_id = $1
        AND b.month = $2
      GROUP BY b.id, b.category_id, b.month, b.amount, c.name
      ORDER BY LOWER(c.name) ASC, b.id ASC
    `,
    [normalizedUserId, normalizedMonth, monthRange.from, monthRange.to, CATEGORY_EXIT],
  );

  return result.rows.map(mapBudgetSummaryRow);
};

export const deleteMonthlyBudgetForUser = async (userId, budgetId) => {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedBudgetId = normalizeBudgetId(budgetId);

  const result = await dbQuery(
    `
      DELETE FROM monthly_budgets
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `,
    [normalizedBudgetId, normalizedUserId],
  );

  if (result.rows.length === 0) {
    throw createError(404, "Meta nao encontrada.");
  }

  return { id: Number(result.rows[0].id) };
};
