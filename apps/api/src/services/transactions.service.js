import { dbQuery } from "../db/index.js";

const CATEGORY_ENTRY = "Entrada";
const CATEGORY_EXIT = "Saida";
const VALID_TYPES = new Set([CATEGORY_ENTRY, CATEGORY_EXIT]);
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

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

export const listTransactionsByUser = async (userId, options = {}) => {
  const includeDeleted = options.includeDeleted === true;

  const result = await dbQuery(
    `
      SELECT id, user_id, value, type, date, description, notes, deleted_at, created_at
      FROM transactions
      WHERE user_id = $1
        AND ($2::boolean = TRUE OR deleted_at IS NULL)
      ORDER BY id ASC
    `,
    [userId, includeDeleted],
  );

  return result.rows.map(mapTransaction);
};

export const createTransactionForUser = async (userId, payload = {}) => {
  const normalizedDescription =
    normalizeOptionalText(payload.description, "Descricao") ?? "";
  const normalizedNotes = normalizeOptionalText(payload.notes, "Observacoes") ?? "";

  const result = await dbQuery(
    `
      INSERT INTO transactions (user_id, type, value, date, description, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, user_id, value, type, date, description, notes, deleted_at, created_at
    `,
    [
      userId,
      normalizeType(payload.type),
      normalizeValue(payload.value),
      normalizeDate(payload.date),
      normalizedDescription,
      normalizedNotes,
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
      RETURNING id, user_id, value, type, date, description, notes, deleted_at, created_at
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
      RETURNING id, user_id, value, type, date, description, notes, deleted_at, created_at
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
      RETURNING id, user_id, value, type, date, description, notes, deleted_at, created_at
    `,
    [id, userId],
  );

  if (result.rows.length === 0) {
    throw createError(404, "Transacao nao encontrada.");
  }

  return mapTransaction(result.rows[0]);
};
