import { Pool } from "pg";

let poolInstance = undefined;
let dbClientOverride = undefined;

const createDatabaseError = (message) => {
  const error = new Error(message);
  error.status = 500;
  return error;
};

const resolveSslConfig = (connectionString) => {
  const dbSsl = (process.env.DB_SSL || "").trim().toLowerCase();

  if (dbSsl === "false" || dbSsl === "0") {
    return false;
  }

  if (dbSsl === "true" || dbSsl === "1") {
    return { rejectUnauthorized: false };
  }

  const requiresSslByConnectionString = /(?:^|[?&])sslmode=require(?:&|$)/i.test(
    connectionString,
  );

  if (requiresSslByConnectionString || process.env.NODE_ENV === "production") {
    return { rejectUnauthorized: false };
  }

  return false;
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
    ssl: resolveSslConfig(connectionString),
    max: 10,
  });
};

const parseConnectionStringDiagnostics = (connectionString) => {
  if (!connectionString) {
    return {
      hasDatabaseUrl: false,
      parseError: null,
      protocol: null,
      host: null,
      port: null,
      database: null,
      user: null,
      sslModeInUrl: null,
    };
  }

  try {
    const parsedUrl = new URL(connectionString);
    const database = parsedUrl.pathname.replace(/^\//, "") || null;

    return {
      hasDatabaseUrl: true,
      parseError: null,
      protocol: parsedUrl.protocol?.replace(":", "") || null,
      host: parsedUrl.hostname || null,
      port: parsedUrl.port || null,
      database,
      user: parsedUrl.username || null,
      sslModeInUrl: parsedUrl.searchParams.get("sslmode"),
    };
  } catch (error) {
    return {
      hasDatabaseUrl: true,
      parseError: error?.message || "invalid_database_url",
      protocol: null,
      host: null,
      port: null,
      database: null,
      user: null,
      sslModeInUrl: null,
    };
  }
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

export const getDatabaseConnectionDiagnostics = () => {
  const connectionString = process.env.DATABASE_URL;
  const parsedDiagnostics = parseConnectionStringDiagnostics(connectionString);

  return {
    ...parsedDiagnostics,
    nodeEnv: process.env.NODE_ENV || null,
    dbSsl: process.env.DB_SSL || null,
  };
};
