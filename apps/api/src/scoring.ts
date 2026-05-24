import type { MatchOutcome, ScoreBreakdownDto, ScoringRulesDto, ScoreTier } from "@kiniela/shared";
import type { BetRow, MatchRow } from "./db/schema.js";

export interface ScoreResult {
  totalPoints: number;
  breakdown: ScoreBreakdownDto;
}

export const SCORING_RULES: ScoringRulesDto = {
  correctResultPoints: 1,
  correctGoalDifferencePoints: 2,
  exactScorePoints: 3
};

export function outcomeFromGoals(homeGoals: number, awayGoals: number): MatchOutcome {
  if (homeGoals > awayGoals) return "HOME";
  if (homeGoals < awayGoals) return "AWAY";
  return "DRAW";
}

export function isFinishedMatch(match: MatchRow): boolean {
  return ["FT", "AET", "PEN"].includes(match.statusShort) && match.homeGoals !== null && match.awayGoals !== null;
}

export function scoreBet(bet: BetRow, match: MatchRow): ScoreResult | null {
  if (!isFinishedMatch(match) || match.homeGoals === null || match.awayGoals === null || match.stage === "unknown") {
    return null;
  }
  if (match.stage === "knockout" && match.winnerTeamId === null) return null;

  const correctResult =
    match.stage === "knockout"
      ? bet.predictedAdvancerTeamId !== null && bet.predictedAdvancerTeamId === match.winnerTeamId
      : bet.predictedOutcome === outcomeFromGoals(match.homeGoals, match.awayGoals);
  const predictedDifference = bet.predictedHomeGoals - bet.predictedAwayGoals;
  const actualDifference = match.homeGoals - match.awayGoals;
  const exactScore = bet.predictedHomeGoals === match.homeGoals && bet.predictedAwayGoals === match.awayGoals;
  const correctGoalDifference = predictedDifference === actualDifference;

  const breakdown: ScoreBreakdownDto = {
    tier: tierForPrediction(correctResult, correctGoalDifference, exactScore),
    correctResult,
    correctGoalDifference: correctResult && correctGoalDifference,
    exactScore: correctResult && exactScore
  };

  return { totalPoints: pointsForTier(breakdown.tier), breakdown };
}

function tierForPrediction(correctResult: boolean, correctGoalDifference: boolean, exactScore: boolean): ScoreTier {
  if (!correctResult) return "none";
  if (exactScore) return "exactScore";
  if (correctGoalDifference) return "correctGoalDifference";
  return "correctResult";
}

function pointsForTier(tier: ScoreTier): number {
  if (tier === "exactScore") return SCORING_RULES.exactScorePoints;
  if (tier === "correctGoalDifference") return SCORING_RULES.correctGoalDifferencePoints;
  if (tier === "correctResult") return SCORING_RULES.correctResultPoints;
  return 0;
}
