import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dbQuery } from "./index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, "migrations");
const MIGRATIONS_TABLE = "schema_migrations";

const ensureMigrationsTable = async () => {
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
};

const listMigrationFiles = async () => {
  const directoryEntries = await fs.readdir(MIGRATIONS_DIR, {
    withFileTypes: true,
  });

  return directoryEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
};

const getAppliedMigrations = async () => {
  const { rows } = await dbQuery(`SELECT name FROM ${MIGRATIONS_TABLE}`);
  return new Set(rows.map((row) => row.name));
};

export const runMigrations = async () => {
  await ensureMigrationsTable();

  const migrationFiles = await listMigrationFiles();
  const appliedMigrations = await getAppliedMigrations();

  for (const migrationFile of migrationFiles) {
    if (appliedMigrations.has(migrationFile)) {
      continue;
    }

    const filePath = path.join(MIGRATIONS_DIR, migrationFile);
    const migrationSql = await fs.readFile(filePath, "utf8");

    await dbQuery(migrationSql);
    await dbQuery(`INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES ($1)`, [
      migrationFile,
    ]);
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => {
      console.log("Database migrations executed successfully.");
    })
    .catch((error) => {
      console.error("Failed to run database migrations.", error);
      process.exit(1);
    });
}
