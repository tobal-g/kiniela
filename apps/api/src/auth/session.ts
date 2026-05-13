import type { FastifyReply } from "fastify";
import { and, eq, gt, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../db/client.js";
import { sessions, users, type UserRow } from "../db/schema.js";
import { randomToken, sha256 } from "./crypto.js";

export const sessionCookieName = "kiniela_session";
const sessionDays = 30;

export interface CreatedSession {
  token: string;
  expiresAt: string;
}

export function publicUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role
  };
}

export async function createSession(database: AppDatabase, userId: string): Promise<CreatedSession> {
  const token = randomToken();
  const now = new Date();
  const expires = new Date(now.getTime() + sessionDays * 24 * 60 * 60 * 1000);

  database.db.insert(sessions).values({
    id: randomUUID(),
    userId,
    tokenHash: sha256(token),
    expiresAt: expires.toISOString(),
    createdAt: now.toISOString(),
    revokedAt: null
  }).run();

  return { token, expiresAt: expires.toISOString() };
}

export async function getUserBySession(database: AppDatabase, token: string): Promise<UserRow | null> {
  const now = new Date().toISOString();
  const session = database.db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, now), isNull(sessions.revokedAt)))
    .limit(1)
    .get();

  if (!session) return null;

  const user = database.db.select().from(users).where(eq(users.id, session.userId)).limit(1).get();
  return user ?? null;
}

export async function revokeSession(database: AppDatabase, token: string): Promise<void> {
  database.db
    .update(sessions)
    .set({ revokedAt: new Date().toISOString() })
    .where(eq(sessions.tokenHash, sha256(token)))
    .run();
}

export function setSessionCookie(reply: FastifyReply, session: CreatedSession, secure: boolean): void {
  reply.setCookie(sessionCookieName, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: new Date(session.expiresAt)
  });
}

export function clearSessionCookie(reply: FastifyReply, secure: boolean): void {
  reply.clearCookie(sessionCookieName, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/"
  });
}
