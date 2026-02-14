import bcrypt from "bcryptjs";
import { fileURLToPath } from "node:url";
import { dbQuery } from "./index.js";
import { runMigrations } from "./migrate.js";

const DEFAULT_USER = {
  name: "Demo User",
  email: "demo@controlfinance.dev",
  password: "123456",
};

const seedUser = async () => {
  const passwordHash = await bcrypt.hash(DEFAULT_USER.password, 10);

  const result = await dbQuery(
    `
      INSERT INTO users (name, email, password_hash)
      VALUES ($1, $2, $3)
      ON CONFLICT (email) DO UPDATE
      SET name = EXCLUDED.name
      RETURNING id, email;
    `,
    [DEFAULT_USER.name, DEFAULT_USER.email, passwordHash],
  );

  return result.rows[0];
};

const seedTransactions = async (userId) => {
  await dbQuery(`DELETE FROM transactions WHERE user_id = $1`, [userId]);

  await dbQuery(
    `
      INSERT INTO transactions (user_id, type, value, date)
      VALUES
        ($1, 'Entrada', 3000.00, CURRENT_DATE - INTERVAL '2 day'),
        ($1, 'Saida', 120.50, CURRENT_DATE - INTERVAL '1 day'),
        ($1, 'Saida', 90.00, CURRENT_DATE)
    `,
    [userId],
  );
};

export const runSeed = async () => {
  await runMigrations();

  const user = await seedUser();
  await seedTransactions(user.id);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSeed()
    .then(() => {
      console.log("Database seed executed successfully.");
    })
    .catch((error) => {
      console.error("Failed to run database seed.", error);
      process.exit(1);
    });
}
