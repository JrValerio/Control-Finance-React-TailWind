import { dbQuery } from "../db/index.js";

const DUPLICATE_CATEGORY_ERROR_CODE = "23505";

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const normalizeCategoryName = (name) => {
  if (typeof name !== "string") {
    throw createError(400, "Nome da categoria e obrigatorio.");
  }

  const normalizedName = name.trim();

  if (!normalizedName) {
    throw createError(400, "Nome da categoria e obrigatorio.");
  }

  return normalizedName;
};

const mapCategory = (row) => ({
  id: Number(row.id),
  name: row.name,
  created_at:
    typeof row.created_at === "string"
      ? row.created_at
      : new Date(row.created_at).toISOString(),
});

const mapCategoryListItem = (row) => ({
  id: Number(row.id),
  name: row.name,
});

export const createCategoryForUser = async (userId, payload = {}) => {
  const name = normalizeCategoryName(payload.name);

  try {
    const result = await dbQuery(
      `
        INSERT INTO categories (user_id, name)
        VALUES ($1, $2)
        RETURNING id, name, created_at
      `,
      [userId, name],
    );

    return mapCategory(result.rows[0]);
  } catch (error) {
    if (error.code === DUPLICATE_CATEGORY_ERROR_CODE) {
      throw createError(409, "Categoria ja existe.");
    }

    throw error;
  }
};

export const listCategoriesByUser = async (userId) => {
  const result = await dbQuery(
    `
      SELECT id, name
      FROM categories
      WHERE user_id = $1
      ORDER BY LOWER(name) ASC, id ASC
    `,
    [userId],
  );

  return result.rows.map(mapCategoryListItem);
};
