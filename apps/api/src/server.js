import app from "./app.js";
import { getDatabaseConnectionDiagnostics } from "./db/index.js";
import { runMigrations } from "./db/migrate.js";
import { startImportSessionsCleanupJob } from "./jobs/import-sessions-cleanup.job.js";

const port = Number(process.env.PORT) || 3001;

const startServer = async () => {
  await runMigrations();
  startImportSessionsCleanupJob();

  app.listen(port, () => {
    console.log(`api running on http://localhost:${port}`);
  });
};

startServer().catch((error) => {
  console.error("Failed to start API server.", error);
  console.error("Database connection diagnostics:", getDatabaseConnectionDiagnostics());
  process.exit(1);
});
