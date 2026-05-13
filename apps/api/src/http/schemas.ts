import { z } from "zod";

// Request bodies accepted by the API. These are intentionally close to what
// the frontend sends, so validation errors are easier to map to form fields.
export const signupSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  password: z.string().min(12).max(256),
  inviteCode: z.string().min(12).max(128)
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(256)
});

export const createInviteSchema = z.object({
  role: z.enum(["admin", "player"]).default("player"),
  maxUses: z.number().int().min(1).max(100).default(1),
  expiresAt: z.string().datetime().nullable().optional()
});

export const betSchema = z.object({
  // The frontend does not send "HOME/DRAW/AWAY"; the backend calculates it
  // from these two goal numbers.
  predictedHomeGoals: z.number().int().min(0).max(30),
  predictedAwayGoals: z.number().int().min(0).max(30),
  // For knockout matches, this is the team the player thinks will advance.
  // It can be omitted or null for group-stage matches.
  predictedAdvancerTeamId: z.number().int().positive().nullable().optional(),
  boosterUsed: z.boolean().default(false)
});

export function parseJson<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    const err = new Error(message) as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }
  return parsed.data;
}
