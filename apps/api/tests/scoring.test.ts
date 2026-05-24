import test from "node:test";
import assert from "node:assert/strict";
import { scoreBet } from "../src/scoring.js";
import type { BetRow, MatchRow } from "../src/db/schema.js";

function match(overrides: Partial<MatchRow> = {}): MatchRow {
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

function bet(overrides: Partial<BetRow> = {}): BetRow {
  return {
    id: "bet-1",
    userId: "user-1",
    matchId: 1,
    predictedHomeGoals: 2,
    predictedAwayGoals: 1,
    predictedOutcome: "HOME",
    predictedAdvancerTeamId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

test("a correct winner without the exact margin scores one point", () => {
  const result = scoreBet(bet({ predictedHomeGoals: 3, predictedAwayGoals: 0 }), match());
  assert.deepEqual(result, {
    totalPoints: 1,
    breakdown: {
      tier: "correctResult",
      correctResult: true,
      correctGoalDifference: false,
      exactScore: false
    }
  });
});

test("a correct winner and exact goal difference score two points", () => {
  const result = scoreBet(bet({ predictedHomeGoals: 4, predictedAwayGoals: 3 }), match());
  assert.equal(result?.totalPoints, 2);
  assert.equal(result?.breakdown.tier, "correctGoalDifference");
});

test("an exact score scores three points", () => {
  const result = scoreBet(bet(), match());
  assert.equal(result?.totalPoints, 3);
  assert.equal(result?.breakdown.tier, "exactScore");
  assert.equal(result?.breakdown.exactScore, true);
});

test("a wrong result scores no points even when one team goal is exact", () => {
  const result = scoreBet(bet({ predictedHomeGoals: 0, predictedAwayGoals: 1, predictedOutcome: "AWAY" }), match());
  assert.equal(result?.totalPoints, 0);
  assert.equal(result?.breakdown.tier, "none");
});

test("a non-exact draw has the correct zero goal difference", () => {
  const result = scoreBet(
    bet({ predictedHomeGoals: 2, predictedAwayGoals: 2, predictedOutcome: "DRAW" }),
    match({ homeGoals: 1, awayGoals: 1, winnerTeamId: null })
  );
  assert.equal(result?.totalPoints, 2);
  assert.equal(result?.breakdown.tier, "correctGoalDifference");
});

test("knockout scoring uses the advancing team before score precision", () => {
  const penaltyMatch = match({
    stage: "knockout",
    round: "Quarter-finals",
    statusShort: "PEN",
    homeGoals: 1,
    awayGoals: 1,
    homePenaltyGoals: 4,
    awayPenaltyGoals: 3,
    winnerTeamId: 10
  });

  assert.equal(
    scoreBet(bet({ predictedHomeGoals: 2, predictedAwayGoals: 1, predictedAdvancerTeamId: 10 }), penaltyMatch)?.totalPoints,
    1
  );
  assert.equal(
    scoreBet(
      bet({ predictedHomeGoals: 0, predictedAwayGoals: 0, predictedOutcome: "DRAW", predictedAdvancerTeamId: 10 }),
      penaltyMatch
    )?.totalPoints,
    2
  );
  assert.equal(
    scoreBet(
      bet({ predictedHomeGoals: 1, predictedAwayGoals: 1, predictedOutcome: "DRAW", predictedAdvancerTeamId: 10 }),
      penaltyMatch
    )?.totalPoints,
    3
  );
  assert.equal(
    scoreBet(
      bet({ predictedHomeGoals: 1, predictedAwayGoals: 1, predictedOutcome: "DRAW", predictedAdvancerTeamId: 20 }),
      penaltyMatch
    )?.totalPoints,
    0
  );
});

test("a knockout match is not scored until an advancing team is known", () => {
  assert.equal(scoreBet(bet({ predictedAdvancerTeamId: 10 }), match({ stage: "knockout", winnerTeamId: null })), null);
});
