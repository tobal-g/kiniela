import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { bets, inviteCodes, matches, teams, users } from "../src/db/schema.js";
import { hashPassword } from "../src/auth/password.js";
import { sha256 } from "../src/auth/crypto.js";
import { createTestDatabase, testEnv, testLogger } from "./helpers.js";

async function createTestApp() {
  const database = createTestDatabase();
  const now = new Date().toISOString();

  database.db
    .insert(users)
    .values({
      id: "admin-user",
      email: "admin@example.com",
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
      email: "admin@example.com",
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
      email: "friend@example.com",
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
      email: "friend@example.com",
      name: "Friend",
      password: "friend-password-123",
      inviteCode: inviteBody.invite.code
    }
  });

  assert.equal(signupResponse.statusCode, 200);
  assert.equal(signupResponse.json().user.role, "player");
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
      email: "friend@example.com",
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
    method: "PUT",
    url: "/admin/scoring-settings",
    headers: { cookie: playerCookie },
    payload: { exactScorePoints: 8 }
  });

  assert.equal(response.statusCode, 403);
  await app.close();
  database.sqlite.close();
});

test("admin can update scoring settings", async () => {
  const { app, database } = await createTestApp();
  const adminCookie = await loginAdmin(app);

  const response = await app.inject({
    method: "PUT",
    url: "/admin/scoring-settings",
    headers: { cookie: adminCookie },
    payload: { exactScorePoints: 8 }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().scoringSettings.exactScorePoints, 8);
  await app.close();
  database.sqlite.close();
});

test("players can place bets before kickoff and cannot after kickoff", async () => {
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
      email: "friend@example.com",
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

  const betResponse = await app.inject({
    method: "PUT",
    url: "/bets/100",
    headers: { cookie: playerCookie },
    payload: { predictedHomeGoals: 2, predictedAwayGoals: 1 }
  });

  assert.equal(betResponse.statusCode, 200);
  assert.equal(database.db.select().from(bets).all().length, 1);

  database.db
    .update(matches)
    .set({ kickoffAt: new Date(Date.now() - 60_000).toISOString() })
    .where(eq(matches.id, 100))
    .run();

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
