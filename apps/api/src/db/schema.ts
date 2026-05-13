import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "player"] }).notNull().default("player"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const inviteCodes = sqliteTable("invite_codes", {
  id: text("id").primaryKey(),
  codeHash: text("code_hash").notNull().unique(),
  role: text("role", { enum: ["admin", "player"] }).notNull().default("player"),
  maxUses: integer("max_uses").notNull().default(1),
  uses: integer("uses").notNull().default(0),
  expiresAt: text("expires_at"),
  createdByUserId: text("created_by_user_id"),
  createdAt: text("created_at").notNull()
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
  revokedAt: text("revoked_at")
});

export const teams = sqliteTable("teams", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  country: text("country"),
  logoUrl: text("logo_url"),
  rawJson: text("raw_json"),
  updatedAt: text("updated_at").notNull()
});

export const matches = sqliteTable("matches", {
  id: integer("id").primaryKey(),
  leagueId: integer("league_id").notNull(),
  season: integer("season").notNull(),
  round: text("round"),
  stage: text("stage", { enum: ["group", "knockout", "unknown"] }).notNull().default("unknown"),
  kickoffAt: text("kickoff_at").notNull(),
  statusShort: text("status_short").notNull(),
  statusLong: text("status_long"),
  elapsed: integer("elapsed"),
  homeTeamId: integer("home_team_id"),
  awayTeamId: integer("away_team_id"),
  homeGoals: integer("home_goals"),
  awayGoals: integer("away_goals"),
  homePenaltyGoals: integer("home_penalty_goals"),
  awayPenaltyGoals: integer("away_penalty_goals"),
  winnerTeamId: integer("winner_team_id"),
  rawJson: text("raw_json"),
  updatedAt: text("updated_at").notNull()
});

export const bets = sqliteTable(
  "bets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    matchId: integer("match_id").notNull(),
    predictedHomeGoals: integer("predicted_home_goals").notNull(),
    predictedAwayGoals: integer("predicted_away_goals").notNull(),
    predictedOutcome: text("predicted_outcome", { enum: ["HOME", "DRAW", "AWAY"] }).notNull(),
    predictedAdvancerTeamId: integer("predicted_advancer_team_id"),
    boosterUsed: integer("booster_used", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [uniqueIndex("bets_user_match_unique").on(table.userId, table.matchId)]
);

export const scoringSettings = sqliteTable("scoring_settings", {
  id: integer("id").primaryKey(),
  correctOutcomePoints: integer("correct_outcome_points").notNull(),
  exactScorePoints: integer("exact_score_points").notNull(),
  correctGoalDifferencePoints: integer("correct_goal_difference_points").notNull(),
  exactHomeGoalsPoints: integer("exact_home_goals_points").notNull(),
  exactAwayGoalsPoints: integer("exact_away_goals_points").notNull(),
  exactTotalGoalsPoints: integer("exact_total_goals_points").notNull(),
  knockoutAdvancerPoints: integer("knockout_advancer_points").notNull(),
  groupStageMaxPoints: integer("group_stage_max_points").notNull(),
  knockoutMaxPoints: integer("knockout_max_points").notNull(),
  boostersEnabled: integer("boosters_enabled", { mode: "boolean" }).notNull(),
  boostersPerUser: integer("boosters_per_user").notNull(),
  boosterMultiplier: integer("booster_multiplier").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const scores = sqliteTable(
  "scores",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    matchId: integer("match_id").notNull(),
    totalPoints: integer("total_points").notNull(),
    breakdownJson: text("breakdown_json").notNull(),
    calculatedAt: text("calculated_at").notNull()
  },
  (table) => [uniqueIndex("scores_user_match_unique").on(table.userId, table.matchId)]
);

export const syncRuns = sqliteTable("sync_runs", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  status: text("status", { enum: ["success", "error"] }).notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at").notNull(),
  errorMessage: text("error_message")
});

export type UserRow = typeof users.$inferSelect;
export type MatchRow = typeof matches.$inferSelect;
export type BetRow = typeof bets.$inferSelect;
export type ScoringSettingsRow = typeof scoringSettings.$inferSelect;
