import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { swappedRepeatConfig } from "../../src/config/swapped-repeat-config";
import {
  swappedRepeatOutcome,
  type SwappedRepeatOutcomeInput,
  type SwappedRepeatOutcomeSettings,
} from "../../src/session/swapped-repeat-outcome";
import type {
  VisitEarResult,
  VisitUnreliableReason,
} from "../../src/session/visit-flow-types";

// CP2. The outcome rule (Universal; swapped-repeat design.md, CP2; R10.1 to R10.6). Two first-run
// ear results, found and at least the limit apart, two repeat ear results in any state, and
// settings with 0 < unclearBelowDb ≤ differenceLimitDb. Levels and settings lie on a 0.5 dB grid,
// so every difference is exact.

/** Runs (design.md, "Run counts and time"; Q9, PROPOSED, NOT APPROVED). */
const runs = 1000;
const timeoutMs = 120_000;

/** Levels and sizes are drawn in halves of a decibel. */
const halvesPerDb = 2;
const levelMinDb = -100;
const levelMaxDb = 40;
const limitMaxDb = 60;

const halves = (minDb: number, maxDb: number): fc.Arbitrary<number> =>
  fc
    .integer({ min: minDb * halvesPerDb, max: maxDb * halvesPerDb })
    .map((count) => count / halvesPerDb);

const counts = fc.record({
  presentationCount: fc.nat({ max: 40 }),
  catchCount: fc.nat({ max: 20 }),
  wrongSideCount: fc.nat({ max: 20 }),
  missCount: fc.nat({ max: 20 }),
});

const reasons: readonly VisitUnreliableReason[] = [
  "trialLimit",
  "inconsistentCatch",
  "falseAlarmRate",
  "levelNotAsAsked",
  "visitFalseAlarmRate",
];

const foundAt = (thresholdDb: number): fc.Arbitrary<VisitEarResult> =>
  counts.map((earCounts) => ({ ...earCounts, state: "found", thresholdDb }));

/** An ear result without a level. */
const withoutLevelArbitrary: fc.Arbitrary<VisitEarResult> = fc.oneof(
  counts.map((earCounts): VisitEarResult => ({
    ...earCounts,
    state: "betterThanFloor",
  })),
  counts.map((earCounts): VisitEarResult => ({
    ...earCounts,
    state: "worseThanCap",
  })),
  fc
    .tuple(
      counts,
      fc.uniqueArray(fc.constantFrom(...reasons), { minLength: 1 }),
    )
    .map(([earCounts, unreliableReasons]): VisitEarResult => ({
      ...earCounts,
      state: "unreliable",
      reasons: unreliableReasons,
    })),
);

/** The shipped settings one run in four, otherwise any with 0 < unclearBelowDb ≤ differenceLimitDb. */
const settingsArbitrary: fc.Arbitrary<SwappedRepeatOutcomeSettings> = fc.oneof(
  { weight: 1, arbitrary: fc.constant(shippedSettings()) },
  {
    weight: 3,
    arbitrary: halves(0.5, limitMaxDb).chain((differenceLimitDb) =>
      halves(0.5, differenceLimitDb).map((unclearBelowDb) => ({
        differenceLimitDb,
        unclearBelowDb,
      })),
    ),
  },
);

function shippedSettings(): SwappedRepeatOutcomeSettings {
  return {
    differenceLimitDb: hearingMethodConfig.swappedRepeatDifferenceDb,
    unclearBelowDb:
      hearingMethodConfig.swappedRepeatDifferenceDb *
      swappedRepeatConfig.unclearBelowLimitFraction,
  };
}

/**
 * A repeat difference of either sign, often at or one half step around `unclearBelowDb` and 0,
 * otherwise anywhere up to twice the limit.
 */
const repeatDifferenceArbitrary = (
  settings: SwappedRepeatOutcomeSettings,
): fc.Arbitrary<number> =>
  fc.oneof(
    fc
      .tuple(
        fc.constantFrom(
          0,
          settings.unclearBelowDb,
          settings.unclearBelowDb - 1 / halvesPerDb,
          settings.unclearBelowDb + 1 / halvesPerDb,
        ),
        fc.boolean(),
      )
      .map(([size, negative]) => (negative ? -size : size)),
    halves(-2 * settings.differenceLimitDb, 2 * settings.differenceLimitDb),
  );

/** A repeat ear result: found three runs in four, otherwise without a level. */
const repeatEarArbitrary = (thresholdDb: number) =>
  fc.oneof(
    { weight: 3, arbitrary: foundAt(thresholdDb) },
    { weight: 1, arbitrary: withoutLevelArbitrary },
  );

/** A first run found on both ears and at least the limit apart, and a repeat in any state. */
const caseArbitrary = settingsArbitrary.chain((settings) =>
  fc
    .record({
      firstLeftDb: halves(levelMinDb, levelMaxDb),
      firstGapDb: fc.oneof(
        fc.constant(settings.differenceLimitDb),
        halves(settings.differenceLimitDb, 2 * settings.differenceLimitDb),
      ),
      firstNegative: fc.boolean(),
      repeatLeftDb: halves(levelMinDb, levelMaxDb),
      repeatDifferenceDb: repeatDifferenceArbitrary(settings),
    })
    .chain((drawn) =>
      fc.record({
        settings: fc.constant(settings),
        input: fc.record({
          first: fc.record({
            left: foundAt(drawn.firstLeftDb),
            right: foundAt(
              drawn.firstLeftDb +
                (drawn.firstNegative ? -drawn.firstGapDb : drawn.firstGapDb),
            ),
          }),
          repeat: fc.record({
            left: repeatEarArbitrary(drawn.repeatLeftDb),
            right: repeatEarArbitrary(
              drawn.repeatLeftDb + drawn.repeatDifferenceDb,
            ),
          }),
        }),
      }),
    ),
);

/** A first run that does not offer the repeat: an ear without a level, or less than the limit apart. */
const notOfferedArbitrary = settingsArbitrary.chain((settings) =>
  fc.record({
    settings: fc.constant(settings),
    input: fc.record({
      first: fc.oneof(
        fc.record({
          left: withoutLevelArbitrary,
          right: halves(levelMinDb, levelMaxDb).chain(foundAt),
        }),
        fc.record({
          left: halves(levelMinDb, levelMaxDb).chain(foundAt),
          right: withoutLevelArbitrary,
        }),
        fc
          .tuple(
            halves(levelMinDb, levelMaxDb),
            halves(
              -settings.differenceLimitDb + 1 / halvesPerDb,
              settings.differenceLimitDb - 1 / halvesPerDb,
            ),
          )
          .chain(([leftDb, gapDb]) =>
            fc.record({
              left: foundAt(leftDb),
              right: foundAt(leftDb + gapDb),
            }),
          ),
      ),
      repeat: fc.record({
        left: halves(levelMinDb, levelMaxDb).chain(repeatEarArbitrary),
        right: halves(levelMinDb, levelMaxDb).chain(repeatEarArbitrary),
      }),
    }),
  }),
);

const level = (ear: VisitEarResult): number | null =>
  ear.state === "found" ? ear.thresholdDb : null;

/** Left for right: both differences negated. */
const mirrored = (
  input: SwappedRepeatOutcomeInput,
): SwappedRepeatOutcomeInput => ({
  first: { left: input.first.right, right: input.first.left },
  repeat: { left: input.repeat.right, right: input.repeat.left },
});

describe("CP2. The outcome rule (Universal; R10.1 to R10.6)", () => {
  it(
    "is unclear without a repeat level or below unclearBelowDb, and otherwise follows the ear exactly when the signs agree",
    () => {
      fc.assert(
        fc.property(caseArbitrary, ({ settings, input }) => {
          const before = structuredClone(input);
          const judgement = swappedRepeatOutcome(input, settings);
          const firstLeft = level(input.first.left)!;
          const firstRight = level(input.first.right)!;
          const repeatLeft = level(input.repeat.left);
          const repeatRight = level(input.repeat.right);
          const d1 = firstRight - firstLeft;

          expect(judgement.firstRightMinusLeftDb).toBe(d1);
          expect(judgement.differenceLimitDb).toBe(settings.differenceLimitDb);
          expect(judgement.unclearBelowDb).toBe(settings.unclearBelowDb);
          if (repeatLeft === null || repeatRight === null) {
            expect(judgement.outcome).toBe("unclear");
            expect(judgement.unclearReason).toBe("noLevel");
            expect(judgement.rightMinusLeftDb).toBeNull();
          } else {
            const d2 = repeatRight - repeatLeft;
            expect(judgement.rightMinusLeftDb).toBe(d2);
            if (Math.abs(d2) < settings.unclearBelowDb) {
              expect(judgement.outcome).toBe("unclear");
              expect(judgement.unclearReason).toBe("differenceShrank");
            } else {
              expect(judgement.unclearReason).toBeNull();
              expect(judgement.outcome).toBe(
                d2 > 0 === d1 > 0 ? "followsEar" : "followsEarpiece",
              );
            }
          }

          const mirror = swappedRepeatOutcome(mirrored(input), settings);
          expect(mirror.outcome).toBe(judgement.outcome);
          expect(mirror.unclearReason).toBe(judgement.unclearReason);

          expect(Object.isFrozen(judgement)).toBe(true);
          expect(input).toEqual(before);
        }),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );

  it(
    "throws a RangeError for a first run that does not offer the repeat",
    () => {
      fc.assert(
        fc.property(notOfferedArbitrary, ({ settings, input }) => {
          expect(() => swappedRepeatOutcome(input, settings)).toThrow(
            RangeError,
          );
        }),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});
