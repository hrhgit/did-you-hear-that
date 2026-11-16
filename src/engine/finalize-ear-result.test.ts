import { describe, expect, it } from "vitest";
import { hearingMethodConfig as shippedHearingMethodConfig } from "../config/hearing-method-config";
import {
  createEarSearch,
  type EarEnding,
  type Presentation,
} from "./ear-search";
import { finalizeEarResult } from "./finalize-ear-result";
import type { SoundOutcome } from "./search-types";

/**
 * The shipped settings with the starting level these examples were written for, 25 dB below the
 * anchor. The shipped start moved to 10 dB below on 2026-11-16 (audible-start, light plan); the
 * engine's rules do not depend on where it starts, and its examples keep their levels.
 */
const hearingMethodConfig = Object.freeze({
  ...shippedHearingMethodConfig,
  startingLevelDb: -25,
});

const C: SoundOutcome = "caught";
const M: SoundOutcome = "missed";
const W: SoundOutcome = "wrongSide";

/** Trace outcomes from the worked examples in design.md. */
const traceA = [C, C, C, M, C, M, M, C];
const traceB = [M, M, M, M, M, M, M, M];
const traceC = [C, C, C, C, C, C, C];
const traceE = [C, C, C, M, C, C, M, M, M, M, C];
const traceG = [
  M,
  C,
  ...[M, M, M, C],
  ...[M, M, M, C],
  ...[M, M, M, C],
  ...[M, M, M, C],
  M,
  M,
];

/** Runs scripted outcomes through an ear search and returns its ending and presentations. */
function play(outcomes: readonly SoundOutcome[]): {
  ending: EarEnding;
  presentations: readonly Presentation[];
} {
  const search = createEarSearch("left", hearingMethodConfig);
  for (const outcome of outcomes) {
    search.record(outcome);
  }
  const ending = search.ending();
  if (ending === undefined) {
    throw new Error("The scripted outcomes did not end the ear search.");
  }
  return { ending, presentations: search.presentations() };
}

function finalize(
  ending: EarEnding,
  presentations: readonly Presentation[],
  falseAlarmRateAboveLimit = false,
) {
  return finalizeEarResult({
    ending,
    presentations,
    falseAlarmRateAboveLimit,
    settings: hearingMethodConfig,
  });
}

function presentation(levelDb: number, outcome: SoundOutcome): Presentation {
  return { levelDb, direction: "ascending", outcome };
}

describe("finalizeEarResult", () => {
  describe("each reason alone", () => {
    it("gives trace G the reason trialLimit and no other", () => {
      const { ending, presentations } = play(traceG);
      expect(finalize(ending, presentations)).toEqual({
        state: "unreliable",
        reasons: ["trialLimit"],
        presentationCount: 20,
        catchCount: 5,
        wrongSideCount: 0,
        missCount: 15,
      });
    });

    it("gives trace E the reason inconsistentCatch, from the catch at -60 against -50", () => {
      const { ending, presentations } = play(traceE);
      expect(ending).toEqual({ kind: "found", thresholdDb: -50 });
      expect(finalize(ending, presentations)).toEqual({
        state: "unreliable",
        reasons: ["inconsistentCatch"],
        presentationCount: 11,
        catchCount: 6,
        wrongSideCount: 0,
        missCount: 5,
      });
    });

    it("gives a clean found ear the reason falseAlarmRate when the rate is above the limit", () => {
      const { ending, presentations } = play(traceA);
      expect(finalize(ending, presentations, true)).toMatchObject({
        state: "unreliable",
        reasons: ["falseAlarmRate"],
      });
    });
  });

  describe("reasons together, in the order of R8.5", () => {
    it("lists trialLimit before falseAlarmRate", () => {
      const { ending, presentations } = play(traceG);
      expect(finalize(ending, presentations, true)).toMatchObject({
        state: "unreliable",
        reasons: ["trialLimit", "falseAlarmRate"],
      });
    });

    it("lists inconsistentCatch before falseAlarmRate", () => {
      const { ending, presentations } = play(traceE);
      expect(finalize(ending, presentations, true)).toMatchObject({
        state: "unreliable",
        reasons: ["inconsistentCatch", "falseAlarmRate"],
      });
    });

    it("never lists all three, because inconsistentCatch does not apply to a trialLimit ending (D32)", () => {
      // R8.2 and R8.3 tie inconsistentCatch to found and worse than cap. Trace G caught -20 and
      // 0, 20 dB apart, and still gets only the two reasons that apply, in their order.
      const { ending, presentations } = play(traceG);
      expect(finalize(ending, presentations, true)).toMatchObject({
        state: "unreliable",
        reasons: ["trialLimit", "falseAlarmRate"],
      });
    });
  });

  describe("the reference for inconsistent catches", () => {
    it("uses the threshold for found: a catch exactly the margin below is inconsistent", () => {
      const ending: EarEnding = { kind: "found", thresholdDb: -50 };
      expect(
        finalize(ending, [presentation(-60, C), presentation(-50, C)]),
      ).toMatchObject({ state: "unreliable", reasons: ["inconsistentCatch"] });
    });

    it("uses the threshold for found: a catch less than the margin below is not", () => {
      const ending: EarEnding = { kind: "found", thresholdDb: -50 };
      expect(
        finalize(ending, [presentation(-55, C), presentation(-50, C)]),
      ).toMatchObject({ state: "found", thresholdDb: -50 });
    });

    it("ignores misses and wrong sides far below the threshold", () => {
      const ending: EarEnding = { kind: "found", thresholdDb: -50 };
      expect(
        finalize(ending, [
          presentation(-70, M),
          presentation(-70, W),
          presentation(-50, C),
        ]),
      ).toMatchObject({ state: "found", thresholdDb: -50 });
    });

    it("uses the cap for worse than cap: a catch at -5 with a cap of 5 is inconsistent", () => {
      const { presentations } = play(traceB);
      expect(
        finalize({ kind: "worseThanCap" }, [
          presentation(-5, C),
          ...presentations,
        ]),
      ).toMatchObject({ state: "unreliable", reasons: ["inconsistentCatch"] });
    });

    it("uses the cap for worse than cap: a catch at 0 with a cap of 5 is not", () => {
      const { presentations } = play(traceB);
      expect(
        finalize({ kind: "worseThanCap" }, [
          presentation(0, C),
          ...presentations,
        ]),
      ).toMatchObject({ state: "worseThanCap" });
    });

    it("never marks better than floor inconsistent, though trace C caught levels 45 dB apart", () => {
      const { ending, presentations } = play(traceC);
      expect(ending).toEqual({ kind: "betterThanFloor" });
      expect(finalize(ending, presentations)).toEqual({
        state: "betterThanFloor",
        presentationCount: 7,
        catchCount: 7,
        wrongSideCount: 0,
        missCount: 0,
      });
    });
  });

  describe("states and counts", () => {
    it("gives trace A found at -50 with its counts", () => {
      const { ending, presentations } = play(traceA);
      expect(finalize(ending, presentations)).toEqual({
        state: "found",
        thresholdDb: -50,
        presentationCount: 8,
        catchCount: 5,
        wrongSideCount: 0,
        missCount: 3,
      });
    });

    it("gives trace B worse than cap with no level number", () => {
      const { ending, presentations } = play(traceB);
      const result = finalize(ending, presentations);
      expect(result).toEqual({
        state: "worseThanCap",
        presentationCount: 8,
        catchCount: 0,
        wrongSideCount: 0,
        missCount: 8,
      });
      expect(result).not.toHaveProperty("thresholdDb");
    });

    it("counts presentations, catches, wrong sides and misses separately", () => {
      const ending: EarEnding = { kind: "found", thresholdDb: -40 };
      expect(
        finalize(ending, [
          presentation(-40, C),
          presentation(-45, W),
          presentation(-45, W),
          presentation(-45, M),
          presentation(-40, C),
        ]),
      ).toEqual({
        state: "found",
        thresholdDb: -40,
        presentationCount: 5,
        catchCount: 2,
        wrongSideCount: 2,
        missCount: 1,
      });
    });

    it("does not make an ear unreliable for wrong sides alone (R8.7)", () => {
      const { presentations } = play(traceB.map(() => W));
      expect(finalize({ kind: "worseThanCap" }, presentations)).toMatchObject({
        state: "worseThanCap",
        wrongSideCount: 8,
      });
    });

    it("reports no level number for an unreliable ear", () => {
      const { ending, presentations } = play(traceE);
      expect(finalize(ending, presentations)).not.toHaveProperty("thresholdDb");
    });

    it("returns a frozen result with a frozen reasons list", () => {
      const { ending, presentations } = play(traceG);
      const result = finalize(ending, presentations, true);
      expect(Object.isFrozen(result)).toBe(true);
      expect(
        result.state === "unreliable" && Object.isFrozen(result.reasons),
      ).toBe(true);
    });
  });
});
