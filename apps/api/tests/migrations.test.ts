import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { runMigrations } from "../src/db/migrations.js";

test("name-based login migration removes emails without deleting existing sessions", () => {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
    INSERT INTO _migrations (id, applied_at) VALUES ('001_initial', datetime('now')), ('003_simplified_scoring', datetime('now'));

    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revoked_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    INSERT INTO users (id, email, name, password_hash, role, created_at, updated_at)
    VALUES ('user-1', 'friend@example.com', 'Friend', 'password-hash', 'player', datetime('now'), datetime('now'));

    INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, revoked_at)
    VALUES ('session-1', 'user-1', 'token-hash', datetime('now', '+1 day'), datetime('now'), NULL);
  `);

  runMigrations(sqlite);

  const columns = sqlite.pragma("table_info(users)") as Array<{ name: string }>;
  assert.equal(columns.some((column) => column.name === "email"), false);
  assert.deepEqual(sqlite.prepare("SELECT id, name FROM users").all(), [{ id: "user-1", name: "Friend" }]);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM sessions").get().count, 1);
  assert.deepEqual(sqlite.pragma("foreign_key_check"), []);

  assert.throws(
    () =>
      sqlite
        .prepare(
          "INSERT INTO users (id, name, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))"
        )
        .run("user-2", "friend", "password-hash", "player"),
    /UNIQUE constraint failed/
  );

  sqlite.close();
});

test("simplified scoring migration removes booster and configurable settings storage", () => {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");

  runMigrations(sqlite);

  const betColumns = sqlite.pragma("table_info(bets)") as Array<{ name: string }>;
  assert.equal(betColumns.some((column) => column.name === "booster_used"), false);
  assert.equal(
    sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'scoring_settings'").get(),
    undefined
  );
  assert.deepEqual(sqlite.pragma("foreign_key_check"), []);

  sqlite.close();
});
