import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resultPageConfig } from "../../src/config/result-page-config";
import { lightDepthFraction } from "../../src/session/light-depth-fraction";
import { resultPicture } from "../../src/session/result-picture";
import type {
  UnreliableReason,
  VisitEarResult,
} from "../../src/session/visit-flow-types";
import {
  pictureInputArbitrary,
  savedFloorMaxDb,
  savedFloorMinDb,
} from "./result-page-arbitraries";

// CP3. Depth is honest on one floor (Universal; result-page design.md, CP3; R13). On any floor
// scale, found depths lie between the two proposed found ends (Q1) and follow the threshold,
// better than floor reaches the far wall, worse than cap stays dark, unreliable is hatched, and a
// picture's every wing is drawn on its own floor's scale.

/** Runs (design.md, "Run counts and time"). */
const runs = 1000;
const timeoutMs = 120_000;

const {
  foundLightDepthAtCapFraction,
  foundLightDepthAtFloorFraction,
  betterThanFloorLightDepthFraction,
  worseThanCapLightDepthFraction,
} = resultPageConfig;

/** The loudest a floor's cap is drawn, the anchor cap. */
const searchCapMaxDb = 15;
/** How far below the floor a cap may be drawn, so that some spans are 0 or less. */
const capBelowFloorMaxDb = 10;

/** Thresholds in tenths of a decibel, inside and outside every scale drawn. */
const thresholdDbArbitrary = fc
  .integer({ min: -1000, max: 300 })
  .map((tenths) => tenths / 10);

const counts = {
  presentationCount: 10,
  catchCount: 5,
  wrongSideCount: 0,
  missCount: 5,
};

function found(thresholdDb: number): VisitEarResult {
  return { ...counts, state: "found", thresholdDb };
}

const earResultArbitrary: fc.Arbitrary<VisitEarResult> = fc.oneof(
  thresholdDbArbitrary.map(found),
  fc.constant<VisitEarResult>({ ...counts, state: "betterThanFloor" }),
  fc.constant<VisitEarResult>({ ...counts, state: "worseThanCap" }),
  fc
    .subarray<UnreliableReason>(
      ["trialLimit", "inconsistentCatch", "falseAlarmRate"],
      { minLength: 1 },
    )
    .map((reasons): VisitEarResult => ({
      ...counts,
      state: "unreliable",
      reasons,
    })),
);

const scaleArbitrary = fc
  .integer({ min: savedFloorMinDb, max: savedFloorMaxDb })
  .chain((floorDb) =>
    fc.record({
      floorDb: fc.constant(floorDb),
      searchCapDb: fc.integer({
        min: floorDb - capBelowFloorMaxDb,
        max: searchCapMaxDb,
      }),
    }),
  );

describe("result page CP3. Depth is honest on one floor (Universal; R13)", () => {
  it(
    "places each state where it belongs and follows the threshold on one floor's scale",
    () => {
      fc.assert(
        fc.property(
          scaleArbitrary,
          earResultArbitrary,
          earResultArbitrary,
          thresholdDbArbitrary,
          thresholdDbArbitrary,
          (scale, first, second, firstThresholdDb, secondThresholdDb) => {
            for (const result of [first, second]) {
              const depth = lightDepthFraction(result, scale);
              switch (result.state) {
                case "found":
                  expect(depth).not.toBeNull();
                  expect(depth as number).toBeGreaterThanOrEqual(
                    foundLightDepthAtCapFraction,
                  );
                  expect(depth as number).toBeLessThanOrEqual(
                    foundLightDepthAtFloorFraction,
                  );
                  expect(depth as number).toBeLessThan(
                    betterThanFloorLightDepthFraction,
                  );
                  expect(depth as number).toBeGreaterThan(
                    worseThanCapLightDepthFraction,
                  );
                  break;
                case "betterThanFloor":
                  expect(depth).toBe(1);
                  break;
                case "worseThanCap":
                  expect(depth).toBe(0);
                  break;
                case "unreliable":
                  expect(depth).toBeNull();
                  break;
              }
              expect(lightDepthFraction({ ...result }, { ...scale })).toBe(
                depth,
              );
            }

            const lower = Math.min(firstThresholdDb, secondThresholdDb);
            const higher = Math.max(firstThresholdDb, secondThresholdDb);
            const lowerDepth = lightDepthFraction(
              found(lower),
              scale,
            ) as number;
            const higherDepth = lightDepthFraction(
              found(higher),
              scale,
            ) as number;
            expect(lowerDepth).toBeGreaterThanOrEqual(higherDepth);
            const inside = (thresholdDb: number) =>
              thresholdDb >= scale.floorDb && thresholdDb <= scale.searchCapDb;
            if (
              lower < higher &&
              inside(lower) &&
              inside(higher) &&
              scale.searchCapDb - scale.floorDb > 0
            ) {
              expect(lowerDepth).toBeGreaterThan(higherDepth);
            }
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );

  it(
    "draws every wing of a picture at the depth of its own ear result on its own floor's scale",
    () => {
      fc.assert(
        fc.property(pictureInputArbitrary, (drawnInput) => {
          const picture = resultPicture(drawnInput.input);
          const { summary } = drawnInput.drawn.visit;
          picture.floors.forEach((floor, index) => {
            const room = summary.rooms[index];
            expect(room).toBeDefined();
            if (room === undefined) {
              return;
            }
            const scale = {
              searchCapDb: room.searchCapDb,
              floorDb: drawnInput.floorDb,
            };
            expect(floor.left.lightDepthFraction).toBe(
              lightDepthFraction(room.left, scale),
            );
            expect(floor.right.lightDepthFraction).toBe(
              lightDepthFraction(room.right, scale),
            );
          });
        }),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});
