import { loadEnv } from "../config/env.js";
import { openDatabase } from "./client.js";
import { runMigrations } from "./migrations.js";

const env = loadEnv();
const database = openDatabase(env.DATABASE_URL);

runMigrations(database.sqlite);
database.sqlite.close();

console.log("Database migrations applied");
