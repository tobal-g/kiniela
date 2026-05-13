import test from "node:test";
import assert from "node:assert/strict";
import { scoreBet } from "../src/scoring.js";
import type { BetRow, MatchRow, ScoringSettingsRow } from "../src/db/schema.js";

const settings: ScoringSettingsRow = {
  id: 1,
  correctOutcomePoints: 4,
  exactScorePoints: 4,
  correctGoalDifferencePoints: 2,
  exactHomeGoalsPoints: 1,
  exactAwayGoalsPoints: 1,
  exactTotalGoalsPoints: 1,
  knockoutAdvancerPoints: 2,
  groupStageMaxPoints: 10,
  knockoutMaxPoints: 12,
  boostersEnabled: false,
  boostersPerUser: 3,
  boosterMultiplier: 2,
  updatedAt: new Date().toISOString()
};

function match(overrides: Partial<MatchRow>): MatchRow {
  return {
    id: 1,
    leagueId: 1,
    season: 2026,
    round: "Group Stage - 1",
    stage: "group",
    kickoffAt: "2026-06-11T00:00:00Z",
    statusShort: "FT",
    statusLong: "Match Finished",
    elapsed: 90,
    homeTeamId: 10,
    awayTeamId: 20,
    homeGoals: 2,
    awayGoals: 1,
    homePenaltyGoals: null,
    awayPenaltyGoals: null,
    winnerTeamId: 10,
    rawJson: null,
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

function bet(overrides: Partial<BetRow>): BetRow {
  return {
    id: "bet-1",
    userId: "user-1",
    matchId: 1,
    predictedHomeGoals: 2,
    predictedAwayGoals: 1,
    predictedOutcome: "HOME",
    predictedAdvancerTeamId: null,
    boosterUsed: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

test("exact score gets outcome, exact score, and goal difference points", () => {
  const result = scoreBet(bet({}), match({}), settings);
  assert.equal(result?.totalPoints, 10);
  assert.equal(result?.breakdown.correctOutcome, 4);
  assert.equal(result?.breakdown.exactScore, 4);
  assert.equal(result?.breakdown.correctGoalDifference, 2);
});

test("partial points can be awarded without the correct outcome", () => {
  const result = scoreBet(
    bet({ predictedHomeGoals: 0, predictedAwayGoals: 1, predictedOutcome: "AWAY" }),
    match({}),
    settings
  );
  assert.equal(result?.totalPoints, 1);
  assert.equal(result?.breakdown.exactAwayGoals, 1);
});

test("draw predictions are scored as their own outcome", () => {
  const result = scoreBet(
    bet({ predictedHomeGoals: 2, predictedAwayGoals: 2, predictedOutcome: "DRAW" }),
    match({ homeGoals: 1, awayGoals: 1, winnerTeamId: null }),
    settings
  );
  assert.equal(result?.totalPoints, 6);
  assert.equal(result?.breakdown.correctOutcome, 4);
  assert.equal(result?.breakdown.correctGoalDifference, 2);
});

test("knockout advancer bonus applies after a winner is known", () => {
  const result = scoreBet(
    bet({ predictedAdvancerTeamId: 10 }),
    match({ stage: "knockout", round: "Final" }),
    settings
  );
  assert.equal(result?.totalPoints, 12);
  assert.equal(result?.breakdown.knockoutAdvancer, 2);
});

test("scoring figures are configurable", () => {
  const result = scoreBet(
    bet({}),
    match({}),
    { ...settings, exactScorePoints: 8, groupStageMaxPoints: 20 }
  );
  assert.equal(result?.totalPoints, 14);
});

test("boosters multiply positive capped scores when enabled", () => {
  const result = scoreBet(
    bet({ boosterUsed: true }),
    match({}),
    { ...settings, boostersEnabled: true }
  );
  assert.equal(result?.totalPoints, 20);
  assert.equal(result?.breakdown.boosterMultiplier, 2);
});
