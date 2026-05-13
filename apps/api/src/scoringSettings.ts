import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "./db/client.js";
import { scoringSettings, type ScoringSettingsRow } from "./db/schema.js";

export const scoringSettingsUpdateSchema = z.object({
  correctOutcomePoints: z.number().int().min(0).optional(),
  exactScorePoints: z.number().int().min(0).optional(),
  correctGoalDifferencePoints: z.number().int().min(0).optional(),
  exactHomeGoalsPoints: z.number().int().min(0).optional(),
  exactAwayGoalsPoints: z.number().int().min(0).optional(),
  exactTotalGoalsPoints: z.number().int().min(0).optional(),
  knockoutAdvancerPoints: z.number().int().min(0).optional(),
  groupStageMaxPoints: z.number().int().min(0).optional(),
  knockoutMaxPoints: z.number().int().min(0).optional(),
  boostersEnabled: z.boolean().optional(),
  boostersPerUser: z.number().int().min(0).optional(),
  boosterMultiplier: z.number().int().min(1).optional()
});

export type ScoringSettingsUpdate = z.infer<typeof scoringSettingsUpdateSchema>;

export async function getScoringSettings(database: AppDatabase): Promise<ScoringSettingsRow> {
  const settings = database.db.select().from(scoringSettings).where(eq(scoringSettings.id, 1)).limit(1).get();
  if (!settings) throw new Error("Scoring settings are missing. Run database migrations.");
  return settings;
}

export async function updateScoringSettings(database: AppDatabase, input: ScoringSettingsUpdate): Promise<ScoringSettingsRow> {
  database.db
    .update(scoringSettings)
    .set({ ...input, updatedAt: new Date().toISOString() })
    .where(eq(scoringSettings.id, 1))
    .run();
  return getScoringSettings(database);
}

export function serializeScoringSettings(settings: ScoringSettingsRow) {
  return {
    correctOutcomePoints: settings.correctOutcomePoints,
    exactScorePoints: settings.exactScorePoints,
    correctGoalDifferencePoints: settings.correctGoalDifferencePoints,
    exactHomeGoalsPoints: settings.exactHomeGoalsPoints,
    exactAwayGoalsPoints: settings.exactAwayGoalsPoints,
    exactTotalGoalsPoints: settings.exactTotalGoalsPoints,
    knockoutAdvancerPoints: settings.knockoutAdvancerPoints,
    groupStageMaxPoints: settings.groupStageMaxPoints,
    knockoutMaxPoints: settings.knockoutMaxPoints,
    boostersEnabled: settings.boostersEnabled,
    boostersPerUser: settings.boostersPerUser,
    boosterMultiplier: settings.boosterMultiplier,
    updatedAt: settings.updatedAt
  };
}
