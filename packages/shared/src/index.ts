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
  kickoffAt: string;
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
  predictedHomeGoals: number;
  predictedAwayGoals: number;
  predictedOutcome: MatchOutcome;
  predictedAdvancerTeamId: number | null;
  boosterUsed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScoringSettingsDto {
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
