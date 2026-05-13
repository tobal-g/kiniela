import type { MatchDto, TeamDto } from "@kiniela/shared";
import type { MatchRow } from "../db/schema.js";

interface TeamRow {
  id: number;
  name: string;
  country: string | null;
  logoUrl: string | null;
}

export function serializeTeam(team: TeamRow | null | undefined): TeamDto | null {
  if (!team) return null;
  return {
    id: team.id,
    name: team.name,
    country: team.country,
    logoUrl: team.logoUrl
  };
}

export function serializeMatch(match: MatchRow, teamMap: Map<number, TeamRow>): MatchDto {
  return {
    id: match.id,
    round: match.round,
    stage: match.stage,
    kickoffAt: match.kickoffAt,
    statusShort: match.statusShort,
    statusLong: match.statusLong,
    homeTeam: match.homeTeamId === null ? null : serializeTeam(teamMap.get(match.homeTeamId)),
    awayTeam: match.awayTeamId === null ? null : serializeTeam(teamMap.get(match.awayTeamId)),
    homeGoals: match.homeGoals,
    awayGoals: match.awayGoals,
    homePenaltyGoals: match.homePenaltyGoals,
    awayPenaltyGoals: match.awayPenaltyGoals,
    winnerTeamId: match.winnerTeamId
  };
}
