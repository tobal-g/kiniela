import type Database from "better-sqlite3";

interface Migration {
  id: string;
  sql: string;
  disableForeignKeys?: boolean;
}

const migrations: Migration[] = [
  {
    id: "001_initial",
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('admin', 'player')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS invite_codes (
        id TEXT PRIMARY KEY,
        code_hash TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('admin', 'player')),
        max_uses INTEGER NOT NULL DEFAULT 1,
        uses INTEGER NOT NULL DEFAULT 0,
        expires_at TEXT,
        created_by_user_id TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        revoked_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS teams (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        country TEXT,
        logo_url TEXT,
        raw_json TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS matches (
        id INTEGER PRIMARY KEY,
        league_id INTEGER NOT NULL,
        season INTEGER NOT NULL,
        round TEXT,
        stage TEXT NOT NULL DEFAULT 'unknown' CHECK (stage IN ('group', 'knockout', 'unknown')),
        kickoff_at TEXT NOT NULL,
        status_short TEXT NOT NULL,
        status_long TEXT,
        elapsed INTEGER,
        home_team_id INTEGER,
        away_team_id INTEGER,
        home_goals INTEGER,
        away_goals INTEGER,
        home_penalty_goals INTEGER,
        away_penalty_goals INTEGER,
        winner_team_id INTEGER,
        raw_json TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (home_team_id) REFERENCES teams(id),
        FOREIGN KEY (away_team_id) REFERENCES teams(id),
        FOREIGN KEY (winner_team_id) REFERENCES teams(id)
      );

      CREATE INDEX IF NOT EXISTS matches_kickoff_at_idx ON matches(kickoff_at);

      CREATE TABLE IF NOT EXISTS bets (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        match_id INTEGER NOT NULL,
        predicted_home_goals INTEGER NOT NULL CHECK (predicted_home_goals >= 0),
        predicted_away_goals INTEGER NOT NULL CHECK (predicted_away_goals >= 0),
        predicted_outcome TEXT NOT NULL CHECK (predicted_outcome IN ('HOME', 'DRAW', 'AWAY')),
        predicted_advancer_team_id INTEGER,
        booster_used INTEGER NOT NULL DEFAULT 0 CHECK (booster_used IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (user_id, match_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
        FOREIGN KEY (predicted_advancer_team_id) REFERENCES teams(id)
      );

      CREATE TABLE IF NOT EXISTS scoring_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        correct_outcome_points INTEGER NOT NULL,
        exact_score_points INTEGER NOT NULL,
        correct_goal_difference_points INTEGER NOT NULL,
        exact_home_goals_points INTEGER NOT NULL,
        exact_away_goals_points INTEGER NOT NULL,
        exact_total_goals_points INTEGER NOT NULL,
        knockout_advancer_points INTEGER NOT NULL,
        group_stage_max_points INTEGER NOT NULL,
        knockout_max_points INTEGER NOT NULL,
        boosters_enabled INTEGER NOT NULL CHECK (boosters_enabled IN (0, 1)),
        boosters_per_user INTEGER NOT NULL,
        booster_multiplier INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scores (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        match_id INTEGER NOT NULL,
        total_points INTEGER NOT NULL,
        breakdown_json TEXT NOT NULL,
        calculated_at TEXT NOT NULL,
        UNIQUE (user_id, match_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS sync_runs (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('success', 'error')),
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL,
        error_message TEXT
      );

      INSERT INTO scoring_settings (
        id,
        correct_outcome_points,
        exact_score_points,
        correct_goal_difference_points,
        exact_home_goals_points,
        exact_away_goals_points,
        exact_total_goals_points,
        knockout_advancer_points,
        group_stage_max_points,
        knockout_max_points,
        boosters_enabled,
        boosters_per_user,
        booster_multiplier,
        updated_at
      )
      VALUES (1, 4, 4, 2, 1, 1, 1, 2, 10, 12, 0, 3, 2, datetime('now'))
      ON CONFLICT(id) DO NOTHING;
    `
  },
  {
    id: "002_name_based_login",
    disableForeignKeys: true,
    sql: `
      CREATE TABLE users_without_email (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('admin', 'player')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      INSERT INTO users_without_email (id, name, password_hash, role, created_at, updated_at)
      SELECT id, name, password_hash, role, created_at, updated_at
      FROM users;

      DROP TABLE users;
      ALTER TABLE users_without_email RENAME TO users;
    `
  },
  {
    id: "003_simplified_scoring",
    disableForeignKeys: true,
    sql: `
      CREATE TABLE bets_simplified_scoring (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        match_id INTEGER NOT NULL,
        predicted_home_goals INTEGER NOT NULL CHECK (predicted_home_goals >= 0),
        predicted_away_goals INTEGER NOT NULL CHECK (predicted_away_goals >= 0),
        predicted_outcome TEXT NOT NULL CHECK (predicted_outcome IN ('HOME', 'DRAW', 'AWAY')),
        predicted_advancer_team_id INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (user_id, match_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
        FOREIGN KEY (predicted_advancer_team_id) REFERENCES teams(id)
      );

      INSERT INTO bets_simplified_scoring (
        id,
        user_id,
        match_id,
        predicted_home_goals,
        predicted_away_goals,
        predicted_outcome,
        predicted_advancer_team_id,
        created_at,
        updated_at
      )
      SELECT
        id,
        user_id,
        match_id,
        predicted_home_goals,
        predicted_away_goals,
        predicted_outcome,
        predicted_advancer_team_id,
        created_at,
        updated_at
      FROM bets;

      DROP TABLE bets;
      ALTER TABLE bets_simplified_scoring RENAME TO bets;
      DROP TABLE scoring_settings;

      -- Stored scores were calculated under the replaced additive rule set.
      DELETE FROM scores;
    `
  }
];

export function runMigrations(sqlite: Database.Database): void {
  sqlite.exec("CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const applied = sqlite.prepare("SELECT id FROM _migrations").all().map((row) => (row as { id: string }).id);
  const appliedSet = new Set(applied);

  for (const migration of migrations) {
    if (appliedSet.has(migration.id)) continue;
    if (migration.disableForeignKeys) sqlite.pragma("foreign_keys = OFF");
    try {
      sqlite.transaction(() => {
        sqlite.exec(migration.sql);
        if (migration.disableForeignKeys) {
          const violations = sqlite.pragma("foreign_key_check") as unknown[];
          if (violations.length > 0) throw new Error(`Migration ${migration.id} produced invalid foreign keys`);
        }
        sqlite.prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)").run(migration.id, new Date().toISOString());
      })();
    } finally {
      if (migration.disableForeignKeys) sqlite.pragma("foreign_keys = ON");
    }
  }
}
