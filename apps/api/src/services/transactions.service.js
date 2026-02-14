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

const normalizeDate = (date) => {
  if (typeof date === "undefined" || date === null || date === "") {
    return toISODate();
  }

  if (!isValidISODate(date)) {
    throw createError(400, "Data invalida. Use o formato YYYY-MM-DD.");
  }

  return date;
};

const mapTransaction = (row) => ({
  id: Number(row.id),
  userId: Number(row.user_id),
  value: Number(row.value),
  type: row.type,
  date:
    typeof row.date === "string"
      ? row.date
      : new Date(row.date).toISOString().slice(0, 10),
  createdAt:
    typeof row.created_at === "string"
      ? row.created_at
      : new Date(row.created_at).toISOString(),
});

export const listTransactionsByUser = async (userId) => {
  const result = await dbQuery(
    `
      SELECT id, user_id, value, type, date, created_at
      FROM transactions
      WHERE user_id = $1
      ORDER BY id ASC
    `,
    [userId],
  );

  return result.rows.map(mapTransaction);
};

export const createTransactionForUser = async (userId, payload = {}) => {
  const result = await dbQuery(
    `
      INSERT INTO transactions (user_id, type, value, date)
      VALUES ($1, $2, $3, $4)
      RETURNING id, user_id, value, type, date, created_at
    `,
    [
      userId,
      normalizeType(payload.type),
      normalizeValue(payload.value),
      normalizeDate(payload.date),
    ],
  );

  return mapTransaction(result.rows[0]);
};

export const deleteTransactionForUser = async (userId, transactionId) => {
  const id = Number(transactionId);

  if (!Number.isInteger(id) || id <= 0) {
    throw createError(400, "ID de transacao invalido.");
  }

  const result = await dbQuery(
    `
      DELETE FROM transactions
      WHERE id = $1 AND user_id = $2
      RETURNING id, user_id, value, type, date, created_at
    `,
    [id, userId],
  );

  if (result.rows.length === 0) {
    throw createError(404, "Transacao nao encontrada.");
  }

  return mapTransaction(result.rows[0]);
};
