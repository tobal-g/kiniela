import { createLogger } from "../src/logging.js";
import { openDatabase, type AppDatabase } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrations.js";
import type { Env } from "../src/config/env.js";

export function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: "test",
    PORT: 3001,
    HOST: "127.0.0.1",
    DATABASE_URL: ":memory:",
    API_FOOTBALL_KEY: "test-api-football-key",
    AUTH_SECRET: "test-auth-secret-with-more-than-32-chars",
    CORS_ORIGIN: "http://localhost:3000",
    SYNC_ENABLED: false,
    ADMIN_NAME: undefined,
    ADMIN_PASSWORD: undefined,
    ...overrides
  };
}

export function createTestDatabase(): AppDatabase {
  const database = openDatabase(":memory:");
  runMigrations(database.sqlite);
  return database;
}

export function testLogger() {
  return createLogger("silent");
}
