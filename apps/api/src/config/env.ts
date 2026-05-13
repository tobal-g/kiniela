import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().min(1).default("0.0.0.0"),
  DATABASE_URL: z.string().min(1).default("file:./data/kiniela.sqlite"),
  API_FOOTBALL_KEY: z.string().min(1).optional(),
  AUTH_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:3000"),
  SYNC_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_NAME: z.string().min(1).optional(),
  ADMIN_PASSWORD: z.string().min(12).optional()
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  return parsed.data;
}
