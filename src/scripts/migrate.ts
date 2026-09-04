import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set.");
}

// Runs on every container start (see docker-entrypoint.sh) so a fresh VPS
// deploy gets its schema applied automatically instead of needing someone to
// run drizzle-kit by hand against the new database.
async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client);

  const migrationsFolder = process.env.MIGRATIONS_FOLDER ?? "./drizzle";
  console.log("Running migrations...");
  await migrate(db, { migrationsFolder });
  console.log("Migrations complete.");

  await client.end();
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
