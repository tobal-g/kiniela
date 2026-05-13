import type { MatchOutcome, MatchStage, ScoreBreakdownDto } from "@kiniela/shared";
import type { BetRow, MatchRow, ScoringSettingsRow } from "./db/schema.js";

export interface ScoreResult {
  totalPoints: number;
  breakdown: ScoreBreakdownDto;
}

export function outcomeFromGoals(homeGoals: number, awayGoals: number): MatchOutcome {
  if (homeGoals > awayGoals) return "HOME";
  if (homeGoals < awayGoals) return "AWAY";
  return "DRAW";
}

export function isFinishedMatch(match: MatchRow): boolean {
  return ["FT", "AET", "PEN"].includes(match.statusShort) && match.homeGoals !== null && match.awayGoals !== null;
}

export function scoreBet(bet: BetRow, match: MatchRow, settings: ScoringSettingsRow): ScoreResult | null {
  if (!isFinishedMatch(match) || match.homeGoals === null || match.awayGoals === null) return null;

  const actualOutcome = outcomeFromGoals(match.homeGoals, match.awayGoals);
  const predictedDifference = bet.predictedHomeGoals - bet.predictedAwayGoals;
  const actualDifference = match.homeGoals - match.awayGoals;
  const exactScore = bet.predictedHomeGoals === match.homeGoals && bet.predictedAwayGoals === match.awayGoals;

  const breakdown: ScoreBreakdownDto = {
    correctOutcome: bet.predictedOutcome === actualOutcome ? settings.correctOutcomePoints : 0,
    exactScore: exactScore ? settings.exactScorePoints : 0,
    correctGoalDifference: predictedDifference === actualDifference ? settings.correctGoalDifferencePoints : 0,
    exactHomeGoals: !exactScore && bet.predictedHomeGoals === match.homeGoals ? settings.exactHomeGoalsPoints : 0,
    exactAwayGoals: !exactScore && bet.predictedAwayGoals === match.awayGoals ? settings.exactAwayGoalsPoints : 0,
    exactTotalGoals:
      !exactScore && bet.predictedHomeGoals + bet.predictedAwayGoals === match.homeGoals + match.awayGoals
        ? settings.exactTotalGoalsPoints
        : 0,
    knockoutAdvancer:
      match.stage === "knockout" &&
      match.winnerTeamId !== null &&
      bet.predictedAdvancerTeamId !== null &&
      match.winnerTeamId === bet.predictedAdvancerTeamId
        ? settings.knockoutAdvancerPoints
        : 0,
    capApplied: null,
    boosterMultiplier: 1
  };

  let totalPoints =
    breakdown.correctOutcome +
    breakdown.exactScore +
    breakdown.correctGoalDifference +
    breakdown.exactHomeGoals +
    breakdown.exactAwayGoals +
    breakdown.exactTotalGoals +
    breakdown.knockoutAdvancer;

  const cap = capForStage(match.stage, settings);
  if (totalPoints > cap) {
    breakdown.capApplied = cap;
    totalPoints = cap;
  }

  if (settings.boostersEnabled && bet.boosterUsed && totalPoints > 0) {
    breakdown.boosterMultiplier = settings.boosterMultiplier;
    totalPoints *= settings.boosterMultiplier;
  }

  return { totalPoints, breakdown };
}

function capForStage(stage: MatchStage, settings: ScoringSettingsRow): number {
  if (stage === "knockout") return settings.knockoutMaxPoints;
  return settings.groupStageMaxPoints;
}
