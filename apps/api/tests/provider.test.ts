import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { createTestDatabase, testLogger } from "./helpers.js";
import { syncWorldCupFixtures } from "../src/integrations/apiFootball.js";
import { matches, teams } from "../src/db/schema.js";

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
