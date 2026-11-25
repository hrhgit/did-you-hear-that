import { describe, expect, it } from "vitest";
import { rhythmConfig } from "../config/rhythm-config";
import {
  createRhythmScore,
  judgementOf,
  type JudgedTurn,
} from "./rhythm-score";
import type { ScoredVisitTrial } from "./visit-flow-types";

const caught = (responseTimeMs: number): JudgedTurn => ({
  kind: "sound",
  outcome: "caught",
  responseTimeMs,
});
const turn = (judged: JudgedTurn): ScoredVisitTrial =>
  judged as unknown as ScoredVisitTrial;
const missed = turn({ kind: "sound", outcome: "missed", responseTimeMs: null });
const wrong = turn({
  kind: "sound",
  outcome: "wrongSide",
  responseTimeMs: 400,
});
const trick = turn({
  kind: "noSound",
  outcome: "falseAlarm",
  responseTimeMs: 400,
} as unknown as JudgedTurn);
const steady = turn({
  kind: "noSound",
  outcome: "correctRejection",
  responseTimeMs: null,
} as unknown as JudgedTurn);

describe("judgementOf (the rhythm game, 2026-11-18)", () => {
  it("judges a catch by how soon it came", () => {
    expect(judgementOf(caught(0))).toBe("perfect");
    expect(judgementOf(caught(rhythmConfig.perfectWithinMs))).toBe("perfect");
    expect(judgementOf(caught(rhythmConfig.perfectWithinMs + 1))).toBe("great");
    expect(judgementOf(caught(rhythmConfig.greatWithinMs))).toBe("great");
    expect(judgementOf(caught(rhythmConfig.greatWithinMs + 1))).toBe("good");
  });

  it("judges what went by, the other side, a kick at nothing and a turn left alone", () => {
    expect(judgementOf(missed)).toBe("miss");
    expect(judgementOf(wrong)).toBe("wrong");
    expect(judgementOf(trick)).toBe("trick");
    expect(judgementOf(steady)).toBe("steady");
  });

  it("judges a practice sound, which has no kind, as a sound", () => {
    expect(judgementOf({ outcome: "caught", responseTimeMs: 100 })).toBe(
      "perfect",
    );
    expect(judgementOf({ outcome: "missed", responseTimeMs: null })).toBe(
      "miss",
    );
  });
});

describe("createRhythmScore", () => {
  it("starts from nothing with Jack's flame full", () => {
    expect(createRhythmScore().standing()).toMatchObject({
      score: 0,
      combo: 0,
      maxCombo: 0,
      flame: rhythmConfig.flameMax,
      flameMax: rhythmConfig.flameMax,
      relights: 0,
    });
  });

  it("builds the combo on catches and steady turns and breaks it on everything else", () => {
    const score = createRhythmScore();
    score.judge(turn(caught(100)));
    score.judge(steady);
    score.judge(turn(caught(900)));
    expect(score.standing().combo).toBe(3);
    score.judge(missed);
    expect(score.standing()).toMatchObject({ combo: 0, maxCombo: 3 });
    score.judge(turn(caught(100)));
    score.kickAtNothing();
    expect(score.standing().combo).toBe(0);
    score.judge(turn(caught(100)));
    score.judge(trick);
    expect(score.standing().combo).toBe(0);
    score.judge(turn(caught(100)));
    score.judge(wrong);
    expect(score.standing()).toMatchObject({
      combo: 0,
      maxCombo: 3,
      counts: {
        perfect: 4,
        great: 1,
        good: 0,
        miss: 1,
        wrong: 1,
        trick: 1,
        steady: 1,
      },
    });
  });

  it("scores each judgement and adds the combo's bonus", () => {
    const score = createRhythmScore();
    score.judge(turn(caught(100)));
    score.judge(turn(caught(900)));
    score.judge(turn(caught(1500)));
    score.judge(steady);
    const { points } = rhythmConfig;
    expect(score.standing().score).toBe(
      points.perfect + points.great + points.good + points.steady,
    );
    // From the tenth turn in a row on, every turn earns a tenth more.
    const long = createRhythmScore();
    for (let index = 0; index < rhythmConfig.comboStepCount; index += 1) {
      long.judge(steady);
    }
    const before = long.standing().score;
    long.judge(turn(caught(100)));
    expect(long.standing().score - before).toBe(
      Math.round(points.perfect * (1 + rhythmConfig.comboBonusStepFraction)),
    );
  });

  it("burns Jack's flame for what reaches him, gives some back for a catch, and lights it again", () => {
    const score = createRhythmScore();
    score.judge(missed);
    expect(score.standing().flame).toBe(
      rhythmConfig.flameMax - rhythmConfig.flameLostToCreature,
    );
    score.judge(trick);
    expect(score.standing().flame).toBe(
      rhythmConfig.flameMax -
        rhythmConfig.flameLostToCreature -
        rhythmConfig.flameLostToTrick,
    );
    for (let index = 0; index < 50; index += 1) {
      score.judge(turn(caught(100)));
    }
    expect(score.standing().flame).toBe(rhythmConfig.flameMax);
    for (let index = 0; index < 10; index += 1) {
      score.judge(missed);
    }
    expect(score.standing()).toMatchObject({
      relights: 1,
      flame: rhythmConfig.flameRelitAt,
    });
    // The score never goes down.
    expect(score.standing().score).toBeGreaterThan(0);
  });

  it("hands out a standing that does not change after the fact", () => {
    const score = createRhythmScore();
    const standing = score.standing();
    score.judge(turn(caught(100)));
    expect(standing.score).toBe(0);
    expect(Object.isFrozen(standing)).toBe(true);
  });
});
