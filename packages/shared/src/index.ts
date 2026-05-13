// These types are the frontend/API contract. If the frontend imports this package,
// these are the shapes it should expect from API responses.
export type Role = "admin" | "player";
export type MatchOutcome = "HOME" | "DRAW" | "AWAY";
export type MatchStage = "group" | "knockout" | "unknown";

export interface PublicUser {
  id: string;
  email: string;
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
  // Only useful for knockout matches. Null is fine for group-stage bets.
  predictedAdvancerTeamId: number | null;
  boosterUsed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScoringSettingsDto {
  // These numbers are editable by admins, so the frontend should read them
  // from the API instead of hard-coding the point values.
  correctOutcomePoints: number;
  exactScorePoints: number;
  correctGoalDifferencePoints: number;
  exactHomeGoalsPoints: number;
  exactAwayGoalsPoints: number;
  exactTotalGoalsPoints: number;
  knockoutAdvancerPoints: number;
  groupStageMaxPoints: number;
  knockoutMaxPoints: number;
  boostersEnabled: boolean;
  boostersPerUser: number;
  boosterMultiplier: number;
  updatedAt: string;
}

export interface ScoreBreakdownDto {
  // Values are the points earned for each part of a bet.
  // Zero means that part of the prediction did not score.
  correctOutcome: number;
  exactScore: number;
  correctGoalDifference: number;
  exactHomeGoals: number;
  exactAwayGoals: number;
  exactTotalGoals: number;
  knockoutAdvancer: number;
  capApplied: number | null;
  boosterMultiplier: number;
}

export interface LeaderboardEntryDto {
  user: PublicUser;
  totalPoints: number;
  exactScores: number;
  correctOutcomes: number;
  playedMatches: number;
}
