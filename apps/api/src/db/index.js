import { Pool } from "pg";

let poolInstance = undefined;
let dbClientOverride = undefined;

const createDatabaseError = (message) => {
  const error = new Error(message);
  error.status = 500;
  return error;
};

const createPool = () => {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw createDatabaseError(
      "DATABASE_URL nao configurada. Defina a conexao Postgres para iniciar a API.",
    );
  }

  return new Pool({
    connectionString,
    max: 10,
  });
};

const getDbClient = () => {
  if (dbClientOverride) {
    return dbClientOverride;
  }

  if (!poolInstance) {
    poolInstance = createPool();
  }

  return poolInstance;
};

export const dbQuery = async (text, params = []) => {
  const dbClient = getDbClient();
  return dbClient.query(text, params);
};

export const setDbClientForTests = (dbClient) => {
  dbClientOverride = dbClient;
};

export const clearDbClientForTests = async () => {
  if (dbClientOverride && typeof dbClientOverride.end === "function") {
    await dbClientOverride.end();
  }

  dbClientOverride = undefined;
};

export const closePool = async () => {
  if (!poolInstance) {
    return;
  }

  await poolInstance.end();
  poolInstance = undefined;
};
