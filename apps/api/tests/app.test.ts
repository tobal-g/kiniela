import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { bets, inviteCodes, matches, teams, users } from "../src/db/schema.js";
import { hashPassword } from "../src/auth/password.js";
import { sha256 } from "../src/auth/crypto.js";
import { recalculateFinishedScores } from "../src/integrations/apiFootball.js";
import { createTestDatabase, testEnv, testLogger } from "./helpers.js";

async function createTestApp() {
  const database = createTestDatabase();
  const now = new Date().toISOString();

  database.db
    .insert(users)
    .values({
      id: "admin-user",
      name: "Admin",
      passwordHash: await hashPassword("admin-password-123"),
      role: "admin",
      createdAt: now,
      updatedAt: now
    })
    .run();

  const app = buildApp({ env: testEnv(), database, logger: testLogger() });
  await app.ready();
  return { app, database };
}

async function loginAdmin(app: Awaited<ReturnType<typeof createTestApp>>["app"]): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: {
      name: "admin",
      password: "admin-password-123"
    }
  });

  assert.equal(response.statusCode, 200);
  const setCookie = response.headers["set-cookie"];
  assert.ok(setCookie);
  return Array.isArray(setCookie) ? setCookie[0].split(";")[0] : setCookie.split(";")[0];
}

test("signup requires a valid invite code", async () => {
  const { app, database } = await createTestApp();

  const response = await app.inject({
    method: "POST",
    url: "/auth/signup",
    payload: {
      name: "Friend",
      password: "friend-password-123",
      inviteCode: "missing-invite-code"
    }
  });

  assert.equal(response.statusCode, 400);
  await app.close();
  database.sqlite.close();
});

test("admin can create an invite and a friend can sign up with it", async () => {
  const { app, database } = await createTestApp();
  const adminCookie = await loginAdmin(app);

  const inviteResponse = await app.inject({
    method: "POST",
    url: "/admin/invites",
    headers: { cookie: adminCookie },
    payload: { role: "player", maxUses: 1 }
  });

  assert.equal(inviteResponse.statusCode, 200);
  const inviteBody = inviteResponse.json() as { invite: { code: string } };

  const signupResponse = await app.inject({
    method: "POST",
    url: "/auth/signup",
    payload: {
      name: "Friend",
      password: "friend-password-123",
      inviteCode: inviteBody.invite.code
    }
  });

  assert.equal(signupResponse.statusCode, 200);
  assert.equal(signupResponse.json().user.role, "player");

  const loginResponse = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: {
      name: "friend",
      password: "friend-password-123"
    }
  });

  assert.equal(loginResponse.statusCode, 200);
  assert.deepEqual(loginResponse.json().user, signupResponse.json().user);
  await app.close();
  database.sqlite.close();
});

test("players cannot access admin routes", async () => {
  const { app, database } = await createTestApp();
  const inviteCode = "valid-player-invite";

  database.db
    .insert(inviteCodes)
    .values({
      id: randomUUID(),
      codeHash: sha256(inviteCode),
      role: "player",
      maxUses: 1,
      uses: 0,
      expiresAt: null,
      createdByUserId: "admin-user",
      createdAt: new Date().toISOString()
    })
    .run();

  const signupResponse = await app.inject({
    method: "POST",
    url: "/auth/signup",
    payload: {
      name: "Friend",
      password: "friend-password-123",
      inviteCode
    }
  });

  const playerCookieHeader = signupResponse.headers["set-cookie"];
  assert.ok(playerCookieHeader);
  const playerCookie = Array.isArray(playerCookieHeader)
    ? playerCookieHeader[0].split(";")[0]
    : playerCookieHeader.split(";")[0];

  const response = await app.inject({
    method: "GET",
    url: "/admin/users",
    headers: { cookie: playerCookie }
  });

  assert.equal(response.statusCode, 403);
  await app.close();
  database.sqlite.close();
});

test("players can read the fixed scoring rules", async () => {
  const { app, database } = await createTestApp();
  const adminCookie = await loginAdmin(app);

  const response = await app.inject({
    method: "GET",
    url: "/scoring-rules",
    headers: { cookie: adminCookie }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().scoringRules, {
    correctResultPoints: 1,
    correctGoalDifferencePoints: 2,
    exactScorePoints: 3
  });
  await app.close();
  database.sqlite.close();
});

test("players can place consistent group and knockout bets before kickoff and cannot bet after kickoff", async () => {
  const { app, database } = await createTestApp();
  const adminCookie = await loginAdmin(app);

  const inviteResponse = await app.inject({
    method: "POST",
    url: "/admin/invites",
    headers: { cookie: adminCookie },
    payload: { role: "player", maxUses: 1 }
  });
  const inviteCode = inviteResponse.json().invite.code;

  const signupResponse = await app.inject({
    method: "POST",
    url: "/auth/signup",
    payload: {
      name: "Friend",
      password: "friend-password-123",
      inviteCode
    }
  });
  const playerCookieHeader = signupResponse.headers["set-cookie"];
  assert.ok(playerCookieHeader);
  const playerCookie = Array.isArray(playerCookieHeader)
    ? playerCookieHeader[0].split(";")[0]
    : playerCookieHeader.split(";")[0];

  database.db
    .insert(teams)
    .values([
      { id: 10, name: "Argentina", country: null, logoUrl: null, rawJson: null, updatedAt: new Date().toISOString() },
      { id: 20, name: "Canada", country: null, logoUrl: null, rawJson: null, updatedAt: new Date().toISOString() }
    ])
    .run();

  database.db
    .insert(matches)
    .values({
      id: 100,
      leagueId: 1,
      season: 2026,
      round: "Group Stage - 1",
      stage: "group",
      kickoffAt: new Date(Date.now() + 60_000).toISOString(),
      statusShort: "NS",
      statusLong: "Not Started",
      elapsed: null,
      homeTeamId: 10,
      awayTeamId: 20,
      homeGoals: null,
      awayGoals: null,
      homePenaltyGoals: null,
      awayPenaltyGoals: null,
      winnerTeamId: null,
      rawJson: null,
      updatedAt: new Date().toISOString()
    })
    .run();

  const invalidGroupAdvancerResponse = await app.inject({
    method: "PUT",
    url: "/bets/100",
    headers: { cookie: playerCookie },
    payload: { predictedHomeGoals: 2, predictedAwayGoals: 1, predictedAdvancerTeamId: 10 }
  });
  assert.equal(invalidGroupAdvancerResponse.statusCode, 400);

  const betResponse = await app.inject({
    method: "PUT",
    url: "/bets/100",
    headers: { cookie: playerCookie },
    payload: { predictedHomeGoals: 2, predictedAwayGoals: 1 }
  });

  assert.equal(betResponse.statusCode, 200);
  assert.equal(database.db.select().from(bets).all().length, 1);

  database.db.update(matches).set({ round: "Final", stage: "knockout" }).where(eq(matches.id, 100)).run();

  const missingAdvancerResponse = await app.inject({
    method: "PUT",
    url: "/bets/100",
    headers: { cookie: playerCookie },
    payload: { predictedHomeGoals: 1, predictedAwayGoals: 1 }
  });
  assert.equal(missingAdvancerResponse.statusCode, 400);

  const conflictingAdvancerResponse = await app.inject({
    method: "PUT",
    url: "/bets/100",
    headers: { cookie: playerCookie },
    payload: { predictedHomeGoals: 2, predictedAwayGoals: 1, predictedAdvancerTeamId: 20 }
  });
  assert.equal(conflictingAdvancerResponse.statusCode, 400);

  const penaltyAdvancerResponse = await app.inject({
    method: "PUT",
    url: "/bets/100",
    headers: { cookie: playerCookie },
    payload: { predictedHomeGoals: 1, predictedAwayGoals: 1, predictedAdvancerTeamId: 10 }
  });
  assert.equal(penaltyAdvancerResponse.statusCode, 200);

  database.db
    .update(matches)
    .set({
      kickoffAt: new Date(Date.now() - 60_000).toISOString(),
      statusShort: "PEN",
      statusLong: "Match Finished",
      homeGoals: 1,
      awayGoals: 1,
      homePenaltyGoals: 4,
      awayPenaltyGoals: 3,
      winnerTeamId: 10
    })
    .where(eq(matches.id, 100))
    .run();

  await recalculateFinishedScores(database);
  const scoresResponse = await app.inject({
    method: "GET",
    url: "/scores/me",
    headers: { cookie: playerCookie }
  });
  assert.equal(scoresResponse.statusCode, 200);
  assert.equal(scoresResponse.json().scores[0].totalPoints, 3);
  assert.deepEqual(scoresResponse.json().scores[0].breakdown, {
    tier: "exactScore",
    correctResult: true,
    correctGoalDifference: true,
    exactScore: true
  });

  const lockedResponse = await app.inject({
    method: "PUT",
    url: "/bets/100",
    headers: { cookie: playerCookie },
    payload: { predictedHomeGoals: 1, predictedAwayGoals: 1 }
  });

  assert.equal(lockedResponse.statusCode, 409);
  await app.close();
  database.sqlite.close();
});
