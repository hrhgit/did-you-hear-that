import { describe, expect, it } from "vitest";
import { judgeVisitFalseAlarms } from "./judge-visit-false-alarms";

function room(noSoundTrialCount: number, falseAlarmCount: number) {
  return { noSoundTrialCount, falseAlarmCount };
}

describe("judgeVisitFalseAlarms", () => {
  it("does not put 4 of 20 above a limit of 0.2: a rate at the limit is not above it (R17.2)", () => {
    const judgement = judgeVisitFalseAlarms(
      [room(7, 1), room(6, 2), room(7, 1)],
      0.2,
    );
    expect(judgement).toEqual({
      pooledNoSoundTrialCount: 20,
      pooledFalseAlarmCount: 4,
      pooledFalseAlarmRateFraction: 0.2,
      aboveLimit: false,
    });
  });

  it("puts 5 of 21 above a limit of 0.2 (R17.2)", () => {
    const judgement = judgeVisitFalseAlarms(
      [room(7, 2), room(7, 2), room(7, 1)],
      0.2,
    );
    expect(judgement.pooledNoSoundTrialCount).toBe(21);
    expect(judgement.pooledFalseAlarmCount).toBe(5);
    expect(judgement.pooledFalseAlarmRateFraction).toBeCloseTo(5 / 21, 12);
    expect(judgement.aboveLimit).toBe(true);
  });

  it("gives a rate of 0, not above the limit, without no-sound trials (R17.1)", () => {
    expect(judgeVisitFalseAlarms([room(0, 0), room(0, 0)], 0.2)).toEqual({
      pooledNoSoundTrialCount: 0,
      pooledFalseAlarmCount: 0,
      pooledFalseAlarmRateFraction: 0,
      aboveLimit: false,
    });
    expect(judgeVisitFalseAlarms([], 0.2).aboveLimit).toBe(false);
  });

  it("sums the counts of every room it is given (R17.1)", () => {
    const judgement = judgeVisitFalseAlarms(
      [room(3, 0), room(9, 4), room(1, 1), room(13, 2), room(5, 5)],
      0.3,
    );
    expect(judgement.pooledNoSoundTrialCount).toBe(3 + 9 + 1 + 13 + 5);
    expect(judgement.pooledFalseAlarmCount).toBe(0 + 4 + 1 + 2 + 5);
    expect(judgement.pooledFalseAlarmRateFraction).toBe(12 / 31);
  });

  it("judges against the limit it is given", () => {
    const rooms = [room(10, 3)];
    expect(judgeVisitFalseAlarms(rooms, 0.3).aboveLimit).toBe(false);
    expect(judgeVisitFalseAlarms(rooms, 0.25).aboveLimit).toBe(true);
  });

  it("returns a frozen judgement", () => {
    expect(Object.isFrozen(judgeVisitFalseAlarms([room(5, 1)], 0.2))).toBe(
      true,
    );
  });
});
