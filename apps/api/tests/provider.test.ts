import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { createTestDatabase, testLogger } from "./helpers.js";
import { recalculateFinishedScores, syncWorldCupFixtures } from "../src/integrations/apiFootball.js";
import { bets, matches, scores, teams, users } from "../src/db/schema.js";

test("syncWorldCupFixtures normalizes teams and fixtures", async () => {
  const database = createTestDatabase();
  const fakeFetch: typeof fetch = async (url) => {
    const pathname = new URL(String(url)).pathname;
    if (pathname.endsWith("/teams")) {
      return new Response(
        JSON.stringify({
          response: [
            { team: { id: 10, name: "Argentina", country: "Argentina", logo: "https://example.com/arg.png" } },
            { team: { id: 20, name: "Canada", country: "Canada", logo: "https://example.com/can.png" } }
          ]
        }),
        { status: 200 }
      );
    }

    return new Response(
      JSON.stringify({
        response: [
          {
            fixture: {
              id: 100,
              date: "2026-06-11T22:00:00+00:00",
              status: { long: "Match Finished", short: "FT", elapsed: 90 }
            },
            league: { id: 1, season: 2026, round: "Group Stage - 1" },
            teams: {
              home: { id: 10, name: "Argentina", logo: "https://example.com/arg.png", winner: true },
              away: { id: 20, name: "Canada", logo: "https://example.com/can.png", winner: false }
            },
            goals: { home: 2, away: 0 },
            score: { penalty: { home: null, away: null } }
          }
        ]
      }),
      { status: 200 }
    );
  };

  const result = await syncWorldCupFixtures({
    database,
    apiKey: "secret",
    logger: testLogger(),
    fetchImpl: fakeFetch
  });

  assert.equal(result.fixtures, 1);
  const syncedTeams = database.db.select().from(teams).all();
  assert.equal(syncedTeams.length, 2);
  assert.equal(syncedTeams.find((team) => team.id === 10)?.country, "Argentina");

  const match = database.db.select().from(matches).where(eq(matches.id, 100)).limit(1).get();
  assert.equal(match?.stage, "group");
  assert.equal(match?.winnerTeamId, 10);

  database.sqlite.close();
});

test("syncWorldCupFixtures maps extra-time and penalty-resolved knockout fixtures", async () => {
  const database = createTestDatabase();
  const fakeFetch: typeof fetch = async (url) => {
    const pathname = new URL(String(url)).pathname;
    if (pathname.endsWith("/teams")) {
      return new Response(JSON.stringify({ errors: [], response: [] }), { status: 200 });
    }

    return new Response(
      JSON.stringify({
        errors: [],
        response: [
          {
            fixture: {
              id: 200,
              date: "2026-07-18T22:00:00+00:00",
              status: { long: "Match Finished", short: "PEN", elapsed: 120 }
            },
            league: { id: 1, season: 2026, round: "Final" },
            teams: {
              home: { id: 10, name: "Argentina", logo: null, winner: true },
              away: { id: 20, name: "France", logo: null, winner: false }
            },
            goals: { home: 3, away: 3 },
            score: {
              fulltime: { home: 2, away: 2 },
              extratime: { home: 1, away: 1 },
              penalty: { home: 4, away: 2 }
            }
          },
          {
            fixture: {
              id: 201,
              date: "2026-07-14T22:00:00+00:00",
              status: { long: "Match Finished", short: "AET", elapsed: 120 }
            },
            league: { id: 1, season: 2026, round: "Semi-finals" },
            teams: {
              home: { id: 30, name: "Croatia", logo: null, winner: true },
              away: { id: 40, name: "England", logo: null, winner: false }
            },
            goals: { home: 2, away: 1 },
            score: {
              fulltime: { home: 1, away: 1 },
              extratime: { home: 1, away: 0 },
              penalty: { home: null, away: null }
            }
          }
        ]
      }),
      { status: 200 }
    );
  };

  await syncWorldCupFixtures({
    database,
    apiKey: "secret",
    logger: testLogger(),
    fetchImpl: fakeFetch
  });

  const penaltyMatch = database.db.select().from(matches).where(eq(matches.id, 200)).limit(1).get();
  assert.equal(penaltyMatch?.stage, "knockout");
  assert.equal(penaltyMatch?.homeGoals, 3);
  assert.equal(penaltyMatch?.awayGoals, 3);
  assert.equal(penaltyMatch?.homePenaltyGoals, 4);
  assert.equal(penaltyMatch?.winnerTeamId, 10);
  assert.equal(JSON.parse(penaltyMatch?.rawJson ?? "{}").score.fulltime.home, 2);

  const extraTimeMatch = database.db.select().from(matches).where(eq(matches.id, 201)).limit(1).get();
  assert.equal(extraTimeMatch?.stage, "knockout");
  assert.equal(extraTimeMatch?.homeGoals, 2);
  assert.equal(extraTimeMatch?.awayGoals, 1);
  assert.equal(extraTimeMatch?.homePenaltyGoals, null);
  assert.equal(extraTimeMatch?.winnerTeamId, 30);

  database.sqlite.close();
});

test("syncWorldCupFixtures rejects provider errors sent with a successful HTTP response", async () => {
  const database = createTestDatabase();
  const fakeFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ errors: { plan: "Access denied" }, response: [] }), { status: 200 });

  await assert.rejects(
    syncWorldCupFixtures({
      database,
      apiKey: "secret",
      logger: testLogger(),
      fetchImpl: fakeFetch
    }),
    /response contains provider errors/
  );

  database.sqlite.close();
});

test("syncWorldCupFixtures rejects a fixture payload missing fields required by scoring", async () => {
  const database = createTestDatabase();
  const fakeFetch: typeof fetch = async (url) => {
    const pathname = new URL(String(url)).pathname;
    if (pathname.endsWith("/teams")) {
      return new Response(JSON.stringify({ errors: [], response: [] }), { status: 200 });
    }
    return new Response(
      JSON.stringify({
        errors: [],
        response: [
          {
            fixture: { id: 202, date: "2026-07-18T22:00:00+00:00", status: { long: "Match Finished", short: "PEN", elapsed: 120 } },
            league: { id: 1, season: 2026, round: "Final" },
            goals: { home: 1, away: 1 },
            score: { penalty: { home: 4, away: 3 } }
          }
        ]
      }),
      { status: 200 }
    );
  };

  await assert.rejects(
    syncWorldCupFixtures({
      database,
      apiKey: "secret",
      logger: testLogger(),
      fetchImpl: fakeFetch
    }),
    /response is missing required fields/
  );

  database.sqlite.close();
});

test("recalculateFinishedScores removes points after a result becomes unscorable", async () => {
  const database = createTestDatabase();
  const now = new Date().toISOString();
  database.db
    .insert(users)
    .values({ id: "user-1", name: "Friend", passwordHash: "hash", role: "player", createdAt: now, updatedAt: now })
    .run();
  database.db
    .insert(teams)
    .values([
      { id: 10, name: "Argentina", country: null, logoUrl: null, rawJson: null, updatedAt: now },
      { id: 20, name: "Norway", country: null, logoUrl: null, rawJson: null, updatedAt: now }
    ])
    .run();
  database.db
    .insert(matches)
    .values({
      id: 300,
      leagueId: 1,
      season: 2026,
      round: "Final",
      stage: "knockout",
      kickoffAt: "2026-07-19T00:00:00Z",
      statusShort: "PEN",
      statusLong: "Match Finished",
      elapsed: 120,
      homeTeamId: 10,
      awayTeamId: 20,
      homeGoals: 1,
      awayGoals: 1,
      homePenaltyGoals: 4,
      awayPenaltyGoals: 3,
      winnerTeamId: 10,
      rawJson: null,
      updatedAt: now
    })
    .run();
  database.db
    .insert(bets)
    .values({
      id: "bet-1",
      userId: "user-1",
      matchId: 300,
      predictedHomeGoals: 1,
      predictedAwayGoals: 1,
      predictedOutcome: "DRAW",
      predictedAdvancerTeamId: 10,
      createdAt: now,
      updatedAt: now
    })
    .run();

  await recalculateFinishedScores(database);
  assert.equal(database.db.select().from(scores).all()[0]?.totalPoints, 3);

  database.db.update(matches).set({ winnerTeamId: null }).where(eq(matches.id, 300)).run();
  await recalculateFinishedScores(database);
  assert.equal(database.db.select().from(scores).all().length, 0);

  database.sqlite.close();
});
