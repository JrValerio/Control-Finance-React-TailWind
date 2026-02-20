import { fileURLToPath } from "node:url";
import { runMigrations } from "./migrate.js";
import { dbQuery, withDbTransaction } from "./index.js";
import {
  normalizeCategoryNameKey,
  normalizeCategoryNameValue,
} from "../services/categories-normalization.js";

const createError = (message) => new Error(message);

const formatConflictLine = (userId, normalizedName, categoryIds) =>
  `user=${userId}, normalizedName="${normalizedName}", categoryIds=${categoryIds.join(",")}`;

const loadCategories = async () => {
  const result = await dbQuery(
    `
      SELECT id, user_id, name, normalized_name, deleted_at
      FROM categories
      ORDER BY user_id ASC, id ASC
    `,
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    userId: Number(row.user_id),
    name: String(row.name || ""),
    normalizedName: row.normalized_name ? String(row.normalized_name) : "",
    deletedAt: row.deleted_at,
  }));
};

const buildPreparedRows = (rows) =>
  rows.map((row) => {
    const normalizedDisplayName = normalizeCategoryNameValue(row.name);
    const normalizedName = normalizeCategoryNameKey(normalizedDisplayName);

    if (!normalizedDisplayName || !normalizedName) {
      throw createError(
        `Categoria invalida para backfill (id=${row.id}, user=${row.userId}). Nome vazio apos normalizacao.`,
      );
    }

    return {
      ...row,
      normalizedDisplayName,
      nextNormalizedName: normalizedName,
      needsUpdate:
        normalizedDisplayName !== row.name ||
        normalizedName !== (row.normalizedName || ""),
    };
  });

const assertNoActiveConflicts = (rows) => {
  const activeRows = rows.filter((row) => row.deletedAt === null);
  const buckets = activeRows.reduce((accumulator, row) => {
    const key = `${row.userId}:${row.nextNormalizedName}`;
    const existing = accumulator.get(key) || [];
    existing.push(row);
    accumulator.set(key, existing);
    return accumulator;
  }, new Map());

  const conflicts = Array.from(buckets.values()).filter((bucket) => bucket.length > 1);

  if (conflicts.length === 0) {
    return;
  }

  const details = conflicts
    .map((rowsInConflict) =>
      formatConflictLine(
        rowsInConflict[0].userId,
        rowsInConflict[0].nextNormalizedName,
        rowsInConflict.map((row) => row.id),
      ),
    )
    .join("\n");

  throw createError(
    `Backfill abortado por conflito de categorias ativas apos normalizacao:\n${details}\nResolva os conflitos e rode novamente.`,
  );
};

const applyBackfillUpdates = async (rows) => {
  const rowsToUpdate = rows.filter((row) => row.needsUpdate);

  if (rowsToUpdate.length === 0) {
    return { updatedRows: 0 };
  }

  await withDbTransaction(async (transactionClient) => {
    for (const row of rowsToUpdate) {
      await transactionClient.query(
        `
          UPDATE categories
          SET name = $2,
              normalized_name = $3
          WHERE id = $1
        `,
        [row.id, row.normalizedDisplayName, row.nextNormalizedName],
      );
    }
  });

  return { updatedRows: rowsToUpdate.length };
};

export const runCategoriesNormalizedBackfill = async () => {
  await runMigrations();

  const categories = await loadCategories();
  const preparedRows = buildPreparedRows(categories);
  assertNoActiveConflicts(preparedRows);

  const result = await applyBackfillUpdates(preparedRows);

  return {
    totalRows: preparedRows.length,
    updatedRows: result.updatedRows,
  };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCategoriesNormalizedBackfill()
    .then((result) => {
      console.log(
        `Categories normalized_name backfill executed successfully. totalRows=${result.totalRows} updatedRows=${result.updatedRows}`,
      );
    })
    .catch((error) => {
      console.error("Failed to execute categories normalized_name backfill.", error);
      process.exit(1);
    });
}
