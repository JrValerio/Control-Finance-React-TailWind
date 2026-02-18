import { randomUUID } from "node:crypto";
import { parse as parseCsv } from "csv-parse/sync";
import { dbQuery } from "../db/index.js";

const CATEGORY_ENTRY = "Entrada";
const CATEGORY_EXIT = "Saida";
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const IMPORT_TTL_MINUTES = 30;
const REQUIRED_HEADERS = ["date", "type", "value", "description"];
const OPTIONAL_HEADERS = ["notes", "category"];
const ALLOWED_HEADERS = new Set([...REQUIRED_HEADERS, ...OPTIONAL_HEADERS]);
const HEADER_ERROR_MESSAGE =
  "CSV invalido. Cabecalho esperado: date,type,value,description,notes,category";

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const normalizeHeader = (value) => String(value || "").trim().toLowerCase();

const normalizeRawCell = (value) =>
  typeof value === "undefined" || value === null ? "" : String(value);

const ensureValidCsvHeaders = (headerRow) => {
  const normalizedHeaders = headerRow.map(normalizeHeader);
  const uniqueHeaders = new Set(normalizedHeaders);

  if (
    normalizedHeaders.length === 0 ||
    uniqueHeaders.size !== normalizedHeaders.length ||
    normalizedHeaders.some((header) => !header || !ALLOWED_HEADERS.has(header))
  ) {
    throw createError(400, HEADER_ERROR_MESSAGE);
  }

  const missingRequiredHeader = REQUIRED_HEADERS.some(
    (requiredHeader) => !uniqueHeaders.has(requiredHeader),
  );

  if (missingRequiredHeader) {
    throw createError(400, HEADER_ERROR_MESSAGE);
  }

  return normalizedHeaders;
};

const buildRawRow = (sourceRow = {}) => ({
  date: normalizeRawCell(sourceRow.date),
  type: normalizeRawCell(sourceRow.type),
  value: normalizeRawCell(sourceRow.value),
  description: normalizeRawCell(sourceRow.description),
  notes: normalizeRawCell(sourceRow.notes),
  category: normalizeRawCell(sourceRow.category),
});

const parseCsvFileRows = (fileBuffer) => {
  const csvContent = fileBuffer.toString("utf8");

  let parsedRows;

  try {
    parsedRows = parseCsv(csvContent, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
    });
  } catch {
    throw createError(400, "CSV invalido. Nao foi possivel processar o arquivo.");
  }

  if (!Array.isArray(parsedRows) || parsedRows.length === 0) {
    throw createError(400, HEADER_ERROR_MESSAGE);
  }

  const [headerRow, ...dataRows] = parsedRows;

  if (!Array.isArray(headerRow) || headerRow.length === 0) {
    throw createError(400, HEADER_ERROR_MESSAGE);
  }

  const normalizedHeaders = ensureValidCsvHeaders(headerRow);

  return dataRows.map((rowValues, rowIndex) => {
    const sourceValues = Array.isArray(rowValues) ? rowValues : [rowValues];
    const rowObject = {};

    normalizedHeaders.forEach((header, headerIndex) => {
      rowObject[header] = normalizeRawCell(sourceValues[headerIndex]);
    });

    return {
      line: rowIndex + 2,
      raw: buildRawRow(rowObject),
    };
  });
};

const normalizeDate = (value) => {
  const normalizedValue = String(value || "").trim();

  if (!ISO_DATE_REGEX.test(normalizedValue)) {
    throw new Error("Data invalida. Use YYYY-MM-DD.");
  }

  const parsedDate = new Date(`${normalizedValue}T00:00:00`);

  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== normalizedValue
  ) {
    throw new Error("Data invalida. Use YYYY-MM-DD.");
  }

  return normalizedValue;
};

const normalizeType = (value) => {
  const normalizedValue = String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (normalizedValue === "entrada") {
    return CATEGORY_ENTRY;
  }

  if (normalizedValue === "saida") {
    return CATEGORY_EXIT;
  }

  throw new Error("Tipo invalido. Use Entrada ou Saida.");
};

const normalizeValue = (value) => {
  const compactValue = String(value || "").trim().replace(/\s+/g, "");

  if (!compactValue) {
    throw new Error("Valor invalido. Informe um numero maior que zero.");
  }

  const hasComma = compactValue.includes(",");
  const hasDot = compactValue.includes(".");
  let normalizedNumericValue = compactValue;

  if (hasComma && hasDot) {
    const decimalSeparator =
      compactValue.lastIndexOf(",") > compactValue.lastIndexOf(".") ? "," : ".";

    normalizedNumericValue =
      decimalSeparator === ","
        ? compactValue.replace(/\./g, "").replace(",", ".")
        : compactValue.replace(/,/g, "");
  } else if (hasComma) {
    normalizedNumericValue = compactValue.replace(",", ".");
  }

  const parsedValue = Number(normalizedNumericValue);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw new Error("Valor invalido. Informe um numero maior que zero.");
  }

  return Number(parsedValue.toFixed(2));
};

const normalizeDescription = (value) => {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    throw new Error("Descricao e obrigatoria.");
  }

  return normalizedValue;
};

const normalizeNotes = (value) => String(value || "").trim();

const resolveCategoryId = (value, categoryMap) => {
  const normalizedCategoryName = String(value || "").trim();

  if (!normalizedCategoryName) {
    return null;
  }

  const categoryId = categoryMap.get(normalizedCategoryName.toLowerCase());

  if (!categoryId) {
    throw new Error("Categoria nao encontrada.");
  }

  return categoryId;
};

const loadCategoryMapForUser = async (userId) => {
  const result = await dbQuery(
    `
      SELECT id, name
      FROM categories
      WHERE user_id = $1
    `,
    [userId],
  );

  return result.rows.reduce((categoryMap, row) => {
    categoryMap.set(String(row.name).trim().toLowerCase(), Number(row.id));
    return categoryMap;
  }, new Map());
};

const normalizeCsvRow = (rawRow, categoryMap) => {
  const errors = [];
  let normalizedDate;
  let normalizedType;
  let normalizedValue;
  let normalizedDescription;
  let normalizedCategoryId;

  try {
    normalizedDate = normalizeDate(rawRow.date);
  } catch (error) {
    errors.push({ field: "date", message: error.message });
  }

  try {
    normalizedType = normalizeType(rawRow.type);
  } catch (error) {
    errors.push({ field: "type", message: error.message });
  }

  try {
    normalizedValue = normalizeValue(rawRow.value);
  } catch (error) {
    errors.push({ field: "value", message: error.message });
  }

  try {
    normalizedDescription = normalizeDescription(rawRow.description);
  } catch (error) {
    errors.push({ field: "description", message: error.message });
  }

  try {
    normalizedCategoryId = resolveCategoryId(rawRow.category, categoryMap);
  } catch (error) {
    errors.push({ field: "category", message: error.message });
  }

  if (errors.length > 0) {
    return {
      status: "invalid",
      normalized: null,
      errors,
    };
  }

  return {
    status: "valid",
    normalized: {
      date: normalizedDate,
      type: normalizedType,
      value: normalizedValue,
      description: normalizedDescription,
      notes: normalizeNotes(rawRow.notes),
      categoryId: normalizedCategoryId,
    },
    errors: [],
  };
};

const createSummary = (rows = []) => {
  return rows.reduce(
    (summary, row) => {
      if (row.status === "valid") {
        summary.validRows += 1;

        if (row.normalized.type === CATEGORY_ENTRY) {
          summary.income += row.normalized.value;
        } else if (row.normalized.type === CATEGORY_EXIT) {
          summary.expense += row.normalized.value;
        }
      } else {
        summary.invalidRows += 1;
      }

      return summary;
    },
    {
      totalRows: rows.length,
      validRows: 0,
      invalidRows: 0,
      income: 0,
      expense: 0,
    },
  );
};

const persistImportSession = async (userId, payload) => {
  const importId = randomUUID();
  const expiresAtDate = new Date(Date.now() + IMPORT_TTL_MINUTES * 60 * 1000);
  const result = await dbQuery(
    `
      INSERT INTO transaction_import_sessions (id, user_id, payload_json, expires_at)
      VALUES ($1, $2, $3::jsonb, $4)
      RETURNING expires_at
    `,
    [importId, userId, JSON.stringify(payload), expiresAtDate.toISOString()],
  );

  return {
    importId,
    expiresAt:
      typeof result.rows[0]?.expires_at === "string"
        ? result.rows[0].expires_at
        : new Date(result.rows[0]?.expires_at || expiresAtDate).toISOString(),
  };
};

export const dryRunTransactionsImportForUser = async (userId, csvFileBuffer) => {
  const parsedRows = parseCsvFileRows(csvFileBuffer);
  const categoryMap = await loadCategoryMapForUser(userId);
  const rows = parsedRows.map((row) => {
    const normalizedRow = normalizeCsvRow(row.raw, categoryMap);

    return {
      line: row.line,
      status: normalizedRow.status,
      raw: row.raw,
      normalized: normalizedRow.normalized,
      errors: normalizedRow.errors,
    };
  });
  const summary = createSummary(rows);

  const normalizedRows = rows
    .filter((row) => row.status === "valid" && row.normalized)
    .map((row) => row.normalized);

  const persistedSession = await persistImportSession(userId, {
    normalizedRows,
    summary,
  });

  return {
    importId: persistedSession.importId,
    expiresAt: persistedSession.expiresAt,
    summary,
    rows,
  };
};
