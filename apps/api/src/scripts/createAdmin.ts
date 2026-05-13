import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { loadEnv } from "../config/env.js";
import { openDatabase } from "../db/client.js";
import { runMigrations } from "../db/migrations.js";
import { users } from "../db/schema.js";
import { hashPassword } from "../auth/password.js";

const env = loadEnv();

if (!env.ADMIN_EMAIL || !env.ADMIN_NAME || !env.ADMIN_PASSWORD) {
  throw new Error("ADMIN_EMAIL, ADMIN_NAME, and ADMIN_PASSWORD are required");
}

const database = openDatabase(env.DATABASE_URL);
runMigrations(database.sqlite);

const email = env.ADMIN_EMAIL.trim().toLowerCase();
const now = new Date().toISOString();
const passwordHash = await hashPassword(env.ADMIN_PASSWORD);
const existing = database.db.select().from(users).where(eq(users.email, email)).limit(1).get();

if (existing) {
  database.db
    .update(users)
    .set({
      name: env.ADMIN_NAME.trim(),
      passwordHash,
      role: "admin",
      updatedAt: now
    })
    .where(eq(users.id, existing.id))
    .run();
  console.log(`Admin user updated: ${email}`);
} else {
  database.db
    .insert(users)
    .values({
      id: randomUUID(),
      email,
      name: env.ADMIN_NAME.trim(),
      passwordHash,
      role: "admin",
      createdAt: now,
      updatedAt: now
    })
    .run();
  console.log(`Admin user created: ${email}`);
}

database.sqlite.close();
