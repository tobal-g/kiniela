import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Logger } from "pino";
import { z } from "zod";
import type { AppDatabase } from "../db/client.js";
import { matches, scores, syncRuns, teams, bets } from "../db/schema.js";
import { scoreBet } from "../scoring.js";
import { safeErrorMessage } from "../logging.js";

const baseUrl = "https://v3.football.api-sports.io";
const worldCupLeagueId = 1;
const worldCupSeason = 2026;

const apiFootballErrorsSchema = z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]);
const apiFootballScoreSchema = z.object({
  home: z.number().int().nullable(),
  away: z.number().int().nullable()
});
const apiFootballFixtureSchema = z.object({
  fixture: z.object({
    id: z.number().int(),
    date: z.string(),
    status: z.object({
      long: z.string().nullable(),
      short: z.string(),
      elapsed: z.number().int().nullable()
    })
  }),
  league: z.object({
    id: z.number().int(),
    season: z.number().int(),
    round: z.string().nullable()
  }),
  teams: z.object({
    home: z.object({
      id: z.number().int(),
      name: z.string(),
      logo: z.string().nullable(),
      winner: z.boolean().nullable().optional()
    }),
    away: z.object({
      id: z.number().int(),
      name: z.string(),
      logo: z.string().nullable(),
      winner: z.boolean().nullable().optional()
    })
  }),
  goals: apiFootballScoreSchema,
  score: z
    .object({
      penalty: apiFootballScoreSchema.optional()
    })
    .optional()
});
const apiFootballFixturesResponseSchema = z.object({
  errors: apiFootballErrorsSchema.optional(),
  response: z.array(apiFootballFixtureSchema)
});
const apiFootballTeamsResponseSchema = z.object({
  errors: apiFootballErrorsSchema.optional(),
  response: z.array(
    z.object({
      team: z.object({
        id: z.number().int(),
        name: z.string(),
        country: z.string().nullable(),
        logo: z.string().nullable()
      })
    })
  )
});

type ApiFootballFixture = z.infer<typeof apiFootballFixtureSchema>;

export async function syncWorldCupFixtures(input: {
  database: AppDatabase;
  apiKey: string;
  logger: Logger;
  fetchImpl?: typeof fetch;
}): Promise<{ fixtures: number; teams: number }> {
  const startedAt = new Date().toISOString();
  const fetchImpl = input.fetchImpl ?? fetch;

  try {
    const teamsJson = await fetchApiFootball(fetchImpl, input.apiKey, "teams", apiFootballTeamsResponseSchema);
    const fixturesJson = await fetchApiFootball(fetchImpl, input.apiKey, "fixtures", apiFootballFixturesResponseSchema);
    const now = new Date().toISOString();

    input.database.sqlite.transaction(() => {
      for (const item of teamsJson.response) {
        upsertTeam(input.database, item.team, now);
      }
      for (const fixture of fixturesJson.response) {
        upsertFixture(input.database, fixture, now);
      }
    })();

    await recalculateFinishedScores(input.database);
    await recordSyncRun(input.database, "fixtures", "success", startedAt, null);

    input.logger.info(
      { event: "fixtures_synced", fixtures: fixturesJson.response.length, teams: teamsJson.response.length },
      "fixtures_synced"
    );
    return { fixtures: fixturesJson.response.length, teams: teamsJson.response.length };
  } catch (err) {
    const message = safeErrorMessage(err);
    await recordSyncRun(input.database, "fixtures", "error", startedAt, message);
    input.logger.error({ event: "fixtures_sync_failed", err: { message } }, "fixtures_sync_failed");
    throw err;
  }
}

async function fetchApiFootball<T>(
  fetchImpl: typeof fetch,
  apiKey: string,
  resource: "fixtures" | "teams",
  schema: z.ZodType<T>
): Promise<T> {
  const url = new URL(`${baseUrl}/${resource}`);
  url.searchParams.set("league", String(worldCupLeagueId));
  url.searchParams.set("season", String(worldCupSeason));

  const response = await fetchImpl(url, {
    headers: {
      "x-apisports-key": apiKey
    }
  });

  if (!response.ok) throw new Error(`API-Football ${resource} request failed with status ${response.status}`);
  const payload: unknown = await response.json();
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new Error(`API-Football ${resource} response is missing required fields`);

  const errors = (parsed.data as { errors?: unknown[] | Record<string, unknown> }).errors;
  if (errors && (Array.isArray(errors) ? errors.length > 0 : Object.keys(errors).length > 0)) {
    throw new Error(`API-Football ${resource} response contains provider errors`);
  }

  // Return the unmodified payload so raw fixture storage still includes fields
  // that are not part of the application's required contract.
  return payload as T;
}

function upsertTeam(
  database: AppDatabase,
  team: { id: number; name: string; country: string | null; logo: string | null },
  now: string
): void {
  const row = {
    id: team.id,
    name: team.name,
    country: team.country,
    logoUrl: team.logo,
    rawJson: JSON.stringify(team),
    updatedAt: now
  };

  database.db.insert(teams).values(row).onConflictDoUpdate({
    target: teams.id,
    set: row
  }).run();
}

function upsertFixture(database: AppDatabase, fixture: ApiFootballFixture, now: string): void {
  const homeWinner = fixture.teams.home.winner === true;
  const awayWinner = fixture.teams.away.winner === true;
  const winnerTeamId = homeWinner ? fixture.teams.home.id : awayWinner ? fixture.teams.away.id : null;

  const homeTeam = {
    id: fixture.teams.home.id,
    name: fixture.teams.home.name,
    country: null,
    logoUrl: fixture.teams.home.logo,
    rawJson: JSON.stringify(fixture.teams.home),
    updatedAt: now
  };

  const awayTeam = {
    id: fixture.teams.away.id,
    name: fixture.teams.away.name,
    country: null,
    logoUrl: fixture.teams.away.logo,
    rawJson: JSON.stringify(fixture.teams.away),
    updatedAt: now
  };

  database.db.insert(teams).values(homeTeam).onConflictDoUpdate({
    target: teams.id,
    set: {
      name: homeTeam.name,
      logoUrl: homeTeam.logoUrl,
      rawJson: homeTeam.rawJson,
      updatedAt: homeTeam.updatedAt
    }
  }).run();

  database.db.insert(teams).values(awayTeam).onConflictDoUpdate({
    target: teams.id,
    set: {
      name: awayTeam.name,
      logoUrl: awayTeam.logoUrl,
      rawJson: awayTeam.rawJson,
      updatedAt: awayTeam.updatedAt
    }
  }).run();

  const match = {
    id: fixture.fixture.id,
    leagueId: fixture.league.id,
    season: fixture.league.season,
    round: fixture.league.round,
    stage: inferStage(fixture.league.round),
    kickoffAt: fixture.fixture.date,
    statusShort: fixture.fixture.status.short,
    statusLong: fixture.fixture.status.long,
    elapsed: fixture.fixture.status.elapsed,
    homeTeamId: fixture.teams.home.id,
    awayTeamId: fixture.teams.away.id,
    homeGoals: fixture.goals.home,
    awayGoals: fixture.goals.away,
    homePenaltyGoals: fixture.score?.penalty?.home ?? null,
    awayPenaltyGoals: fixture.score?.penalty?.away ?? null,
    winnerTeamId,
    rawJson: JSON.stringify(fixture),
    updatedAt: now
  };

  database.db.insert(matches).values(match).onConflictDoUpdate({
    target: matches.id,
    set: match
  }).run();
}

function inferStage(round: string | null): "group" | "knockout" | "unknown" {
  if (!round) return "unknown";
  const normalized = round.toLowerCase();
  if (normalized.includes("group")) return "group";
  if (
    normalized.includes("round of") ||
    normalized.includes("quarter") ||
    normalized.includes("semi") ||
    normalized.includes("final") ||
    normalized.includes("third")
  ) {
    return "knockout";
  }
  return "unknown";
}

async function recordSyncRun(
  database: AppDatabase,
  kind: string,
  status: "success" | "error",
  startedAt: string,
  errorMessage: string | null
): Promise<void> {
  database.db.insert(syncRuns).values({
    id: randomUUID(),
    kind,
    status,
    startedAt,
    finishedAt: new Date().toISOString(),
    errorMessage
  }).run();
}

export async function recalculateFinishedScores(database: AppDatabase): Promise<void> {
  const allBets = database.db.select().from(bets).all();

  for (const bet of allBets) {
    const match = database.db.select().from(matches).where(eq(matches.id, bet.matchId)).limit(1).get();
    if (!match) continue;
    const result = scoreBet(bet, match);
    if (!result) {
      database.db.delete(scores).where(and(eq(scores.userId, bet.userId), eq(scores.matchId, bet.matchId))).run();
      continue;
    }

    const row = {
      id: randomUUID(),
      userId: bet.userId,
      matchId: bet.matchId,
      totalPoints: result.totalPoints,
      breakdownJson: JSON.stringify(result.breakdown),
      calculatedAt: new Date().toISOString()
    };

    database.db.insert(scores).values(row).onConflictDoUpdate({
      target: [scores.userId, scores.matchId],
      set: {
        totalPoints: row.totalPoints,
        breakdownJson: row.breakdownJson,
        calculatedAt: row.calculatedAt
      }
    }).run();
  }
}
