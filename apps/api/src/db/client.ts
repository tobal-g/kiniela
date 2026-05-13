import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { dirname, resolve } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import * as schema from "./schema.js";

export type SqliteDatabase = ReturnType<typeof drizzle<typeof schema>>;

export interface AppDatabase {
  sqlite: Database.Database;
  db: SqliteDatabase;
}

export function sqlitePathFromUrl(databaseUrl: string): string {
  const path = databaseUrl.startsWith("file:") ? databaseUrl.slice("file:".length) : databaseUrl;
  if (path === ":memory:") return path;
  return resolve(path);
}

export function openDatabase(databaseUrl: string): AppDatabase {
  const path = sqlitePathFromUrl(databaseUrl);
  if (path !== ":memory:") {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(path);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  return { sqlite, db: drizzle(sqlite, { schema }) };
}
