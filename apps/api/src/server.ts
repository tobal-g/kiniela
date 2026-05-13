import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { openDatabase } from "./db/client.js";
import { runMigrations } from "./db/migrations.js";
import { createLogger } from "./logging.js";
import { syncWorldCupFixtures } from "./integrations/apiFootball.js";

const env = loadEnv();
const logger = createLogger();
const database = openDatabase(env.DATABASE_URL);

runMigrations(database.sqlite);

const app = buildApp({ env, database, logger });

await app.listen({ host: env.HOST, port: env.PORT });

if (env.SYNC_ENABLED && env.API_FOOTBALL_KEY) {
  const runSync = async () => {
    try {
      await syncWorldCupFixtures({ database, apiKey: env.API_FOOTBALL_KEY!, logger });
    } catch {
      // syncWorldCupFixtures already logs a redacted failure.
    }
  };

  await runSync();
  setInterval(runSync, 6 * 60 * 60 * 1000).unref();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    logger.info({ event: "shutdown", signal }, "shutdown");
    await app.close();
    database.sqlite.close();
    process.exit(0);
  });
}
