import app from "./app.js";
import { runMigrations } from "./db/migrate.js";

const port = Number(process.env.PORT) || 3001;

const startServer = async () => {
  await runMigrations();

  app.listen(port, () => {
    console.log(`api running on http://localhost:${port}`);
  });
};

startServer().catch((error) => {
  console.error("Failed to start API server.", error);
  process.exit(1);
});
