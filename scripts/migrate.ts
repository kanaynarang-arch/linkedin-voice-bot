import { loadEnv } from "../src/config/env.js";
import { openDatabase } from "../src/db/client.js";

async function main(): Promise<void> {
  const env = loadEnv();
  console.log("Applying schema to the configured Postgres database...");
  const db = await openDatabase(env.DATABASE_URL);
  await db.close();
  console.log("Schema applied (tables created if they didn't already exist).");
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
