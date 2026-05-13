import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import { z } from "zod";
import type { PublicUser } from "@kiniela/shared";
import type { Env } from "./config/env.js";
import type { AppDatabase } from "./db/client.js";
import { bets, inviteCodes, matches, teams, users } from "./db/schema.js";
import { sha256, randomToken } from "./auth/crypto.js";
import { hashPassword, verifyPassword } from "./auth/password.js";
import {
  clearSessionCookie,
  createSession,
  getUserBySession,
  publicUser,
  revokeSession,
  sessionCookieName,
  setSessionCookie
} from "./auth/session.js";
import { createInviteSchema, betSchema, loginSchema, parseJson, signupSchema } from "./http/schemas.js";
import { httpError } from "./http/errors.js";
import { serializeMatch } from "./http/serializers.js";
import { outcomeFromGoals } from "./scoring.js";
import {
  getScoringSettings,
  scoringSettingsUpdateSchema,
  serializeScoringSettings,
  updateScoringSettings
} from "./scoringSettings.js";
import { recalculateFinishedScores, syncWorldCupFixtures } from "./integrations/apiFootball.js";
import { safeErrorMessage } from "./logging.js";

export interface BuildAppInput {
  env: Env;
  database: AppDatabase;
  logger: Logger;
  fetchImpl?: typeof fetch;
}

export function buildApp(input: BuildAppInput) {
  const app = Fastify({
    loggerInstance: input.logger,
    disableRequestLogging: false
  });

  app.register(cookie);
  app.register(cors, {
    credentials: true,
    origin: input.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
  });

  // Auth is cookie-based. The frontend should call fetch/axios with credentials
  // enabled so the browser sends the session cookie on later requests.
  app.addHook("onRequest", async (request) => {
    const token = request.cookies[sessionCookieName];
    const user = token ? await getUserBySession(input.database, token) : null;
    request.user = user ? publicUser(user) : null;
  });

  app.setErrorHandler((err, request, reply) => {
    const error = err as Error & { statusCode?: number };
    const statusCode = typeof error.statusCode === "number" ? error.statusCode : 500;
    if (statusCode >= 500) {
      request.log.error({ err: { message: safeErrorMessage(err) } }, "request_failed");
    }
    reply.status(statusCode).send({
      error: statusCode >= 500 ? "Internal server error" : error.message
    });
  });

  app.get("/health", async () => ({ ok: true }));

  // Public auth routes. Signup needs an invite code because this is a private
  // friends game, not an open public app.
  app.post("/auth/signup", async (request, reply) => {
    const body = parseJson(signupSchema, request.body);
    const email = body.email.trim().toLowerCase();
    const now = new Date().toISOString();
    const codeHash = sha256(body.inviteCode.trim());

    const invite = input.database.db
      .select()
      .from(inviteCodes)
      .where(eq(inviteCodes.codeHash, codeHash))
      .limit(1)
      .get();

    if (!invite || invite.uses >= invite.maxUses || (invite.expiresAt !== null && invite.expiresAt <= now)) {
      throw httpError(400, "Invalid invite code");
    }

    const existing = input.database.db.select().from(users).where(eq(users.email, email)).limit(1).get();
    if (existing) throw httpError(409, "Email already registered");

    const passwordHash = await hashPassword(body.password);
    const user = {
      id: randomUUID(),
      email,
      name: body.name.trim(),
      passwordHash,
      role: invite.role,
      createdAt: now,
      updatedAt: now
    };

    input.database.sqlite.transaction(() => {
      input.database.db.insert(users).values(user).run();
      input.database.db
        .update(inviteCodes)
        .set({ uses: invite.uses + 1 })
        .where(eq(inviteCodes.id, invite.id))
        .run();
    })();

    const session = await createSession(input.database, user.id);
    setSessionCookie(reply, session, input.env.NODE_ENV === "production");
    return { user: publicUser(user) };
  });

  app.post("/auth/login", async (request, reply) => {
    const body = parseJson(loginSchema, request.body);
    const email = body.email.trim().toLowerCase();
    const user = input.database.db.select().from(users).where(eq(users.email, email)).limit(1).get();

    if (!user || !(await verifyPassword(user.passwordHash, body.password))) {
      throw httpError(401, "Invalid email or password");
    }

    const session = await createSession(input.database, user.id);
    setSessionCookie(reply, session, input.env.NODE_ENV === "production");
    return { user: publicUser(user) };
  });

  app.post("/auth/logout", async (request, reply) => {
    const token = request.cookies[sessionCookieName];
    if (token) await revokeSession(input.database, token);
    clearSessionCookie(reply, input.env.NODE_ENV === "production");
    reply.status(204).send();
  });

  app.get("/auth/me", async (request) => {
    requireUser(request.user);
    return { user: request.user };
  });

  // Match routes return provider data normalized for the frontend. The raw
  // API-Football response stays in the database and is not exposed here.
  app.get("/matches", async (request) => {
    requireUser(request.user);
    const allMatches = input.database.db.select().from(matches).orderBy(matches.kickoffAt).all();
    return { matches: serializeMatches(input.database, allMatches) };
  });

  app.get("/matches/:id", async (request) => {
    requireUser(request.user);
    const params = parseJson(matchParamsSchema, request.params);
    const match = input.database.db.select().from(matches).where(eq(matches.id, params.id)).limit(1).get();
    if (!match) throw httpError(404, "Match not found");
    return { match: serializeMatches(input.database, [match])[0] };
  });

  app.put("/bets/:matchId", async (request) => {
    const user = requireUser(request.user);
    const params = parseJson(betParamsSchema, request.params);
    const body = parseJson(betSchema, request.body);
    const match = input.database.db.select().from(matches).where(eq(matches.id, params.matchId)).limit(1).get();
    if (!match) throw httpError(404, "Match not found");
    // Once kickoff has passed, bets cannot be changed.
    if (new Date(match.kickoffAt).getTime() <= Date.now()) throw httpError(409, "Bet is locked");

    if (
      body.predictedAdvancerTeamId !== null &&
      body.predictedAdvancerTeamId !== undefined &&
      body.predictedAdvancerTeamId !== match.homeTeamId &&
      body.predictedAdvancerTeamId !== match.awayTeamId
    ) {
      throw httpError(400, "Predicted advancer must be one of the match teams");
    }

    const settings = await getScoringSettings(input.database);
    // If boosters are disabled in settings, the frontend may still send the
    // field, but the backend ignores it.
    const boosterUsed = settings.boostersEnabled ? body.boosterUsed : false;
    if (boosterUsed) enforceBoosterLimit(input.database, user.id, params.matchId, settings.boostersPerUser);

    const now = new Date().toISOString();
    const existing = input.database.db
      .select()
      .from(bets)
      .where(and(eq(bets.userId, user.id), eq(bets.matchId, params.matchId)))
      .limit(1)
      .get();

    const row = {
      id: existing?.id ?? randomUUID(),
      userId: user.id,
      matchId: params.matchId,
      predictedHomeGoals: body.predictedHomeGoals,
      predictedAwayGoals: body.predictedAwayGoals,
      predictedOutcome: outcomeFromGoals(body.predictedHomeGoals, body.predictedAwayGoals),
      predictedAdvancerTeamId: body.predictedAdvancerTeamId ?? null,
      boosterUsed,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    input.database.db.insert(bets).values(row).onConflictDoUpdate({
      target: [bets.userId, bets.matchId],
      set: {
        predictedHomeGoals: row.predictedHomeGoals,
        predictedAwayGoals: row.predictedAwayGoals,
        predictedOutcome: row.predictedOutcome,
        predictedAdvancerTeamId: row.predictedAdvancerTeamId,
        boosterUsed: row.boosterUsed,
        updatedAt: row.updatedAt
      }
    }).run();

    return { bet: serializeBet(row) };
  });

  app.get("/bets/me", async (request) => {
    const user = requireUser(request.user);
    const userBets = input.database.db.select().from(bets).where(eq(bets.userId, user.id)).all();
    return { bets: userBets.map(serializeBet) };
  });

  app.get("/leaderboard", async (request) => {
    requireUser(request.user);
    const rows = input.database.sqlite
      .prepare(
        `
          SELECT
            users.id,
            users.email,
            users.name,
            users.role,
            COALESCE(SUM(scores.total_points), 0) AS totalPoints,
            COUNT(scores.id) AS playedMatches,
            SUM(CASE WHEN json_extract(scores.breakdown_json, '$.exactScore') > 0 THEN 1 ELSE 0 END) AS exactScores,
            SUM(CASE WHEN json_extract(scores.breakdown_json, '$.correctOutcome') > 0 THEN 1 ELSE 0 END) AS correctOutcomes
          FROM users
          LEFT JOIN scores ON scores.user_id = users.id
          WHERE users.role = 'player'
          GROUP BY users.id
          ORDER BY totalPoints DESC, exactScores DESC, correctOutcomes DESC, users.name ASC
        `
      )
      .all() as Array<{
      id: string;
      email: string;
      name: string;
      role: "player";
      totalPoints: number;
      playedMatches: number;
      exactScores: number | null;
      correctOutcomes: number | null;
    }>;

    return {
      leaderboard: rows.map((row) => ({
        user: { id: row.id, email: row.email, name: row.name, role: row.role },
        totalPoints: row.totalPoints,
        exactScores: row.exactScores ?? 0,
        correctOutcomes: row.correctOutcomes ?? 0,
        playedMatches: row.playedMatches
      }))
    };
  });

  app.get("/scoring-settings", async (request) => {
    requireUser(request.user);
    return { scoringSettings: serializeScoringSettings(await getScoringSettings(input.database)) };
  });

  // Admin routes are for setup and tournament maintenance: invites, scoring
  // tweaks, users, and syncing the World Cup data provider.
  app.put("/admin/scoring-settings", async (request) => {
    requireAdmin(request.user);
    const body = parseJson(scoringSettingsUpdateSchema, request.body);
    const updated = await updateScoringSettings(input.database, body);
    await recalculateFinishedScores(input.database);
    return { scoringSettings: serializeScoringSettings(updated) };
  });

  app.post("/admin/invites", async (request) => {
    const user = requireAdmin(request.user);
    const body = parseJson(createInviteSchema, request.body);
    const code = randomToken(18);
    const now = new Date().toISOString();
    const invite = {
      id: randomUUID(),
      codeHash: sha256(code),
      role: body.role,
      maxUses: body.maxUses,
      uses: 0,
      expiresAt: body.expiresAt ?? null,
      createdByUserId: user.id,
      createdAt: now
    };

    input.database.db.insert(inviteCodes).values(invite).run();
    return { invite: { id: invite.id, code, role: invite.role, maxUses: invite.maxUses, expiresAt: invite.expiresAt } };
  });

  app.get("/admin/users", async (request) => {
    requireAdmin(request.user);
    const allUsers = input.database.db.select().from(users).orderBy(users.createdAt).all();
    return { users: allUsers.map(publicUser) };
  });

  app.post("/admin/sync/fixtures", async (request) => {
    requireAdmin(request.user);
    if (!input.env.API_FOOTBALL_KEY) throw httpError(400, "API_FOOTBALL_KEY is not configured");
    return syncWorldCupFixtures({
      database: input.database,
      apiKey: input.env.API_FOOTBALL_KEY,
      logger: input.logger,
      fetchImpl: input.fetchImpl
    });
  });

  return app;
}

const matchParamsSchema = z.object({ id: z.coerce.number().int().positive() });
const betParamsSchema = z.object({ matchId: z.coerce.number().int().positive() });

function requireUser(user: PublicUser | null): PublicUser {
  if (!user) throw httpError(401, "Authentication required");
  return user;
}

function requireAdmin(user: PublicUser | null): PublicUser {
  const currentUser = requireUser(user);
  if (currentUser.role !== "admin") throw httpError(403, "Admin role required");
  return currentUser;
}

function serializeMatches(database: AppDatabase, allMatches: Array<typeof matches.$inferSelect>) {
  const allTeams = database.db.select().from(teams).all();
  const teamMap = new Map(allTeams.map((team) => [team.id, team]));
  return allMatches.map((match) => serializeMatch(match, teamMap));
}

function serializeBet(bet: typeof bets.$inferSelect) {
  return {
    id: bet.id,
    userId: bet.userId,
    matchId: bet.matchId,
    predictedHomeGoals: bet.predictedHomeGoals,
    predictedAwayGoals: bet.predictedAwayGoals,
    predictedOutcome: bet.predictedOutcome,
    predictedAdvancerTeamId: bet.predictedAdvancerTeamId,
    boosterUsed: bet.boosterUsed,
    createdAt: bet.createdAt,
    updatedAt: bet.updatedAt
  };
}

function enforceBoosterLimit(database: AppDatabase, userId: string, matchId: number, boostersPerUser: number): void {
  const row = database.sqlite
    .prepare("SELECT COUNT(*) AS count FROM bets WHERE user_id = ? AND booster_used = 1 AND match_id != ?")
    .get(userId, matchId) as { count: number };

  if (row.count >= boostersPerUser) throw httpError(409, "Booster limit reached");
}
