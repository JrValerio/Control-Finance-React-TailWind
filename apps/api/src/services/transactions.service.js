import { dbQuery } from "../db/index.js";

const CATEGORY_ENTRY = "Entrada";
const CATEGORY_EXIT = "Saida";
const VALID_TYPES = new Set([CATEGORY_ENTRY, CATEGORY_EXIT]);
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const toISODate = (value = new Date()) => {
  const date = new Date(value);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const isValidISODate = (value) => {
  if (typeof value !== "string" || !ISO_DATE_REGEX.test(value)) {
    return false;
  }

  const parsedDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return false;
  }

  return toISODate(parsedDate) === value;
};

const normalizeValue = (value) => {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw createError(400, "Valor invalido. Informe um numero maior que zero.");
  }

  return Number(parsedValue.toFixed(2));
};

const normalizeType = (type) => {
  if (!VALID_TYPES.has(type)) {
    throw createError(400, "Tipo invalido. Use Entrada ou Saida.");
  }

  return type;
};

const normalizeOptionalType = (type) => {
  if (typeof type === "undefined") {
    return undefined;
  }

  return normalizeType(type);
};

const normalizeDate = (date) => {
  if (typeof date === "undefined" || date === null || date === "") {
    return toISODate();
  }

  if (!isValidISODate(date)) {
    throw createError(400, "Data invalida. Use o formato YYYY-MM-DD.");
  }

  return date;
};

const normalizeOptionalDate = (date) => {
  if (typeof date === "undefined") {
    return undefined;
  }

  if (date === null || date === "") {
    throw createError(400, "Data invalida. Use o formato YYYY-MM-DD.");
  }

  return normalizeDate(date);
};

const normalizeOptionalFilterType = (type) => {
  if (typeof type === "undefined" || type === null || type === "") {
    return undefined;
  }

  return normalizeType(type);
};

const normalizeOptionalFilterDate = (date) => {
  if (typeof date === "undefined" || date === null || date === "") {
    return undefined;
  }

  if (!isValidISODate(date)) {
    throw createError(400, "Data invalida. Use o formato YYYY-MM-DD.");
  }

  return date;
};

const normalizeOptionalSearchQuery = (value) => {
  if (typeof value === "undefined" || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw createError(400, "Busca invalida.");
  }

  const normalizedValue = value.trim();
  return normalizedValue ? normalizedValue : undefined;
};

const normalizePositiveInteger = (
  value,
  fieldName,
  fallbackValue,
  maximumValue = Number.POSITIVE_INFINITY,
) => {
  if (typeof value === "undefined" || value === null || value === "") {
    return fallbackValue;
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw createError(400, `${fieldName} invalido. Informe um inteiro maior que zero.`);
  }

  return Math.min(parsedValue, maximumValue);
};

const normalizeCategoryId = (value) => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw createError(400, "Categoria invalida. Informe um inteiro maior que zero.");
  }

  return parsedValue;
};

const normalizeOptionalFilterCategoryId = (value) => {
  if (typeof value === "undefined" || value === null || value === "") {
    return undefined;
  }

  return normalizeCategoryId(value);
};

const normalizeOptionalPayloadCategoryId = (value) => {
  if (typeof value === "undefined" || value === null) {
    return null;
  }

  return normalizeCategoryId(value);
};

const resolveCategoryIdFromPayload = (payload = {}) => {
  if (Object.prototype.hasOwnProperty.call(payload, "category_id")) {
    return payload.category_id;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "categoryId")) {
    return payload.categoryId;
  }

  return undefined;
};

const ensureCategoryBelongsToUser = async (userId, categoryId) => {
  if (categoryId === null) {
    return null;
  }

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

  return categoryId;
};

const normalizeText = (value, fieldName) => {
  if (typeof value !== "string") {
    throw createError(400, `${fieldName} invalido.`);
  }

  return value.trim();
};

const normalizeOptionalText = (value, fieldName) => {
  if (typeof value === "undefined") {
    return undefined;
  }

  if (value === null) {
    return "";
  }

  return normalizeText(value, fieldName);
};

const mapTransaction = (row) => ({
  id: Number(row.id),
  userId: Number(row.user_id),
  categoryId: row.category_id === null ? null : Number(row.category_id),
  value: Number(row.value),
  type: row.type,
  description: row.description || "",
  notes: row.notes || "",
  date:
    typeof row.date === "string"
      ? row.date
      : new Date(row.date).toISOString().slice(0, 10),
  deletedAt: row.deleted_at
    ? typeof row.deleted_at === "string"
      ? row.deleted_at
      : new Date(row.deleted_at).toISOString()
    : null,
  createdAt:
    typeof row.created_at === "string"
      ? row.created_at
      : new Date(row.created_at).toISOString(),
});

const normalizeListFilters = (options = {}) => {
  const includeDeleted =
    options.includeDeleted === true ||
    String(options.includeDeleted || "").toLowerCase() === "true";
  const type = normalizeOptionalFilterType(options.type);
  let from = normalizeOptionalFilterDate(options.from);
  let to = normalizeOptionalFilterDate(options.to);
  const query = normalizeOptionalSearchQuery(options.q);
  const categoryId = normalizeOptionalFilterCategoryId(options.categoryId);
  const page = normalizePositiveInteger(options.page, "Pagina", DEFAULT_PAGE);
  const limit = normalizePositiveInteger(
    options.limit,
    "Limite",
    DEFAULT_LIMIT,
    MAX_LIMIT,
  );

  if (from && to && from > to) {
    [from, to] = [to, from];
  }

  return {
    includeDeleted,
    type,
    from,
    to,
    query,
    categoryId,
    page,
    limit,
  };
};

const buildListTransactionsFilters = (userId, filters) => {
  const conditions = ["user_id = $1"];
  const values = [userId];
  let parameterIndex = 2;

  if (!filters.includeDeleted) {
    conditions.push("deleted_at IS NULL");
  }

  if (filters.type) {
    conditions.push(`type = $${parameterIndex}`);
    values.push(filters.type);
    parameterIndex += 1;
  }

  if (filters.from) {
    conditions.push(`date >= $${parameterIndex}`);
    values.push(filters.from);
    parameterIndex += 1;
  }

  if (filters.to) {
    conditions.push(`date <= $${parameterIndex}`);
    values.push(filters.to);
    parameterIndex += 1;
  }

  if (filters.query) {
    conditions.push(`(description ILIKE $${parameterIndex} OR notes ILIKE $${parameterIndex})`);
    values.push(`%${filters.query}%`);
    parameterIndex += 1;
  }

  if (typeof filters.categoryId !== "undefined") {
    conditions.push(`category_id = $${parameterIndex}`);
    values.push(filters.categoryId);
    parameterIndex += 1;
  }

  return {
    whereClause: conditions.join("\n        AND "),
    values,
    parameterIndex,
  };
};

const runListTransactions = async (
  userId,
  options = {},
  config = { paginate: true },
) => {
  const filters = normalizeListFilters(options);
  const statement = buildListTransactionsFilters(userId, filters);
  const { paginate } = config;
  const listQuerySuffix = paginate
    ? `
      LIMIT $${statement.parameterIndex}
      OFFSET $${statement.parameterIndex + 1}
    `
    : "";
  const queryParams = paginate
    ? [...statement.values, filters.limit, (filters.page - 1) * filters.limit]
    : statement.values;

  const result = await dbQuery(
    `
      SELECT id, user_id, category_id, value, type, date, description, notes, deleted_at, created_at
      FROM transactions
      WHERE ${statement.whereClause}
      ORDER BY date ASC, id ASC
      ${listQuerySuffix}
    `,
    queryParams,
  );
  const transactions = result.rows.map(mapTransaction);

  let total = transactions.length;

  if (paginate) {
    const countResult = await dbQuery(
      `
        SELECT COUNT(*)::int AS total
        FROM transactions
        WHERE ${statement.whereClause}
      `,
      statement.values,
    );
    total = Number(countResult.rows[0]?.total || 0);
  }

  const totalPages = Math.max(1, Math.ceil(total / filters.limit));

  return {
    filters,
    transactions,
    meta: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages,
    },
  };
};

const formatCsvCell = (value) => {
  const text = value === null || typeof value === "undefined" ? "" : String(value);

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
};

const formatCurrency = (value) => Number(value).toFixed(2);

const getTotalsByType = (transactions) => {
  return transactions.reduce(
    (totals, transaction) => {
      if (transaction.type === CATEGORY_ENTRY) {
        totals.entry += transaction.value;
      }

      if (transaction.type === CATEGORY_EXIT) {
        totals.exit += transaction.value;
      }

      return totals;
    },
    { entry: 0, exit: 0 },
  );
};

const buildExportFileName = (filters) => {
  const nameParts = ["transacoes"];

  if (filters.type) {
    nameParts.push(filters.type.toLowerCase());
  }

  if (filters.from || filters.to) {
    nameParts.push(filters.from || "inicio");
    nameParts.push("a");
    nameParts.push(filters.to || "hoje");
  } else {
    nameParts.push(toISODate());
  }

  return `${nameParts.join("-")}.csv`;
};

export const listTransactionsByUser = async (userId, options = {}) => {
  const { transactions, meta } = await runListTransactions(userId, options);
  return {
    data: transactions,
    meta,
  };
};

export const exportTransactionsCsvByUser = async (userId, options = {}) => {
  const { filters, transactions } = await runListTransactions(userId, options, {
    paginate: false,
  });
  const totalsByType = getTotalsByType(transactions);
  const balance = totalsByType.entry - totalsByType.exit;
  const csvLines = [
    "id,type,value,date,description,notes,created_at",
    ...transactions.map((transaction) =>
      [
        transaction.id,
        transaction.type,
        formatCurrency(transaction.value),
        transaction.date,
        transaction.description,
        transaction.notes,
        transaction.createdAt,
      ]
        .map(formatCsvCell)
        .join(","),
    ),
    "",
    "summary,total_entradas,total_saidas,saldo",
    ["totals", formatCurrency(totalsByType.entry), formatCurrency(totalsByType.exit), formatCurrency(balance)]
      .map(formatCsvCell)
      .join(","),
  ];

  return {
    fileName: buildExportFileName(filters),
    content: `\uFEFF${csvLines.join("\n")}`,
  };
};

export const createTransactionForUser = async (userId, payload = {}) => {
  const normalizedDescription =
    normalizeOptionalText(payload.description, "Descricao") ?? "";
  const normalizedNotes = normalizeOptionalText(payload.notes, "Observacoes") ?? "";
  const normalizedCategoryId = await ensureCategoryBelongsToUser(
    userId,
    normalizeOptionalPayloadCategoryId(resolveCategoryIdFromPayload(payload)),
  );

  const result = await dbQuery(
    `
      INSERT INTO transactions (user_id, type, value, date, description, notes, category_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, user_id, category_id, value, type, date, description, notes, deleted_at, created_at
    `,
    [
      userId,
      normalizeType(payload.type),
      normalizeValue(payload.value),
      normalizeDate(payload.date),
      normalizedDescription,
      normalizedNotes,
      normalizedCategoryId,
    ],
  );

  return mapTransaction(result.rows[0]);
};

export const updateTransactionForUser = async (userId, transactionId, payload = {}) => {
  const id = Number(transactionId);

  if (!Number.isInteger(id) || id <= 0) {
    throw createError(400, "ID de transacao invalido.");
  }

  const nextType = normalizeOptionalType(payload.type);
  const nextValue =
    typeof payload.value === "undefined" ? undefined : normalizeValue(payload.value);
  const nextDate = normalizeOptionalDate(payload.date);
  const nextDescription = normalizeOptionalText(payload.description, "Descricao");
  const nextNotes = normalizeOptionalText(payload.notes, "Observacoes");

  const fieldsToUpdate = [];
  const queryParams = [];
  let parameterIndex = 1;

  if (typeof nextType !== "undefined") {
    fieldsToUpdate.push(`type = $${parameterIndex}`);
    queryParams.push(nextType);
    parameterIndex += 1;
  }

  if (typeof nextValue !== "undefined") {
    fieldsToUpdate.push(`value = $${parameterIndex}`);
    queryParams.push(nextValue);
    parameterIndex += 1;
  }

  if (typeof nextDate !== "undefined") {
    fieldsToUpdate.push(`date = $${parameterIndex}`);
    queryParams.push(nextDate);
    parameterIndex += 1;
  }

  if (typeof nextDescription !== "undefined") {
    fieldsToUpdate.push(`description = $${parameterIndex}`);
    queryParams.push(nextDescription);
    parameterIndex += 1;
  }

  if (typeof nextNotes !== "undefined") {
    fieldsToUpdate.push(`notes = $${parameterIndex}`);
    queryParams.push(nextNotes);
    parameterIndex += 1;
  }

  if (fieldsToUpdate.length === 0) {
    throw createError(400, "Informe ao menos um campo para atualizar.");
  }

  queryParams.push(id, userId);

  const result = await dbQuery(
    `
      UPDATE transactions
      SET ${fieldsToUpdate.join(", ")}
      WHERE id = $${parameterIndex}
        AND user_id = $${parameterIndex + 1}
        AND deleted_at IS NULL
      RETURNING id, user_id, category_id, value, type, date, description, notes, deleted_at, created_at
    `,
    queryParams,
  );

  if (result.rows.length === 0) {
    throw createError(404, "Transacao nao encontrada.");
  }

  return mapTransaction(result.rows[0]);
};

export const deleteTransactionForUser = async (userId, transactionId) => {
  const id = Number(transactionId);

  if (!Number.isInteger(id) || id <= 0) {
    throw createError(400, "ID de transacao invalido.");
  }

  const result = await dbQuery(
    `
      UPDATE transactions
      SET deleted_at = NOW()
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
      RETURNING id, user_id, category_id, value, type, date, description, notes, deleted_at, created_at
    `,
    [id, userId],
  );

  if (result.rows.length === 0) {
    throw createError(404, "Transacao nao encontrada.");
  }

  return mapTransaction(result.rows[0]);
};

export const restoreTransactionForUser = async (userId, transactionId) => {
  const id = Number(transactionId);

  if (!Number.isInteger(id) || id <= 0) {
    throw createError(400, "ID de transacao invalido.");
  }

  const result = await dbQuery(
    `
      UPDATE transactions
      SET deleted_at = NULL
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL
      RETURNING id, user_id, category_id, value, type, date, description, notes, deleted_at, created_at
    `,
    [id, userId],
  );

  if (result.rows.length === 0) {
    throw createError(404, "Transacao nao encontrada.");
  }

  return mapTransaction(result.rows[0]);
};
