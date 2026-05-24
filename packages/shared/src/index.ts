// These types are the frontend/API contract. If the frontend imports this package,
// these are the shapes it should expect from API responses.
export type Role = "admin" | "player";
export type MatchOutcome = "HOME" | "DRAW" | "AWAY";
export type MatchStage = "group" | "knockout" | "unknown";

export interface PublicUser {
  id: string;
  name: string;
  role: Role;
}

export interface TeamDto {
  id: number;
  name: string;
  country: string | null;
  logoUrl: string | null;
}

export interface MatchDto {
  id: number;
  round: string | null;
  stage: MatchStage;
  // ISO date string from the provider. Show it in the user's local time.
  // Bets lock when this time is reached.
  kickoffAt: string;
  // Short provider status like "NS", "FT", "AET", or "PEN".
  // The frontend can use this for small status badges.
  statusShort: string;
  statusLong: string | null;
  homeTeam: TeamDto | null;
  awayTeam: TeamDto | null;
  homeGoals: number | null;
  awayGoals: number | null;
  homePenaltyGoals: number | null;
  awayPenaltyGoals: number | null;
  winnerTeamId: number | null;
}

export interface BetDto {
  id: string;
  userId: string;
  matchId: number;
  // The frontend sends the two goal predictions. The backend derives the outcome.
  predictedHomeGoals: number;
  predictedAwayGoals: number;
  predictedOutcome: MatchOutcome;
  // Required for knockout matches and null for group-stage bets.
  predictedAdvancerTeamId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScoringRulesDto {
  correctResultPoints: number;
  correctGoalDifferencePoints: number;
  exactScorePoints: number;
}

export type ScoreTier = "none" | "correctResult" | "correctGoalDifference" | "exactScore";

export interface ScoreBreakdownDto {
  tier: ScoreTier;
  correctResult: boolean;
  correctGoalDifference: boolean;
  exactScore: boolean;
}

export interface PlayerScoreDto {
  matchId: number;
  totalPoints: number;
  breakdown: ScoreBreakdownDto;
  calculatedAt: string;
}

export interface LeaderboardEntryDto {
  user: PublicUser;
  totalPoints: number;
  exactScores: number;
  correctResults: number;
  playedMatches: number;
}
