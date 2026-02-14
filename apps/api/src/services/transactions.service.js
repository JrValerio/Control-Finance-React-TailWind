const CATEGORY_ENTRY = "Entrada";
const CATEGORY_EXIT = "Saida";
const VALID_TYPES = new Set([CATEGORY_ENTRY, CATEGORY_EXIT]);

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const transactionsByUser = new Map();
let nextTransactionId = 1;

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

const getUserTransactions = (userId) => {
  if (!transactionsByUser.has(userId)) {
    transactionsByUser.set(userId, []);
  }

  return transactionsByUser.get(userId);
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

export const listTransactionsByUser = (userId) => {
  const transactions = getUserTransactions(userId);
  return [...transactions];
};

export const createTransactionForUser = (userId, payload = {}) => {
  const transaction = {
    id: nextTransactionId,
    userId,
    value: normalizeValue(payload.value),
    type: normalizeType(payload.type),
    date: normalizeDate(payload.date),
    createdAt: new Date().toISOString(),
  };

  const transactions = getUserTransactions(userId);
  transactions.push(transaction);
  nextTransactionId += 1;

  return transaction;
};

export const deleteTransactionForUser = (userId, transactionId) => {
  const id = Number(transactionId);

  if (!Number.isInteger(id) || id <= 0) {
    throw createError(400, "ID de transacao invalido.");
  }

  const transactions = getUserTransactions(userId);
  const index = transactions.findIndex((transaction) => transaction.id === id);

  if (index === -1) {
    throw createError(404, "Transacao nao encontrada.");
  }

  const [removedTransaction] = transactions.splice(index, 1);
  return removedTransaction;
};

export const __resetTransactionsStoreForTests = () => {
  transactionsByUser.clear();
  nextTransactionId = 1;
};
