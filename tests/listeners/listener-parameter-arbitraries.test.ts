import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { createSeededRandom } from "../../src/config/seeded-random";
import {
  attentiveListenerParameters,
  attentiveListenerRange,
  drawListenerParameters,
  plausibleListenerParameters,
  plausibleListenerRange,
  type ListenerParameterRange,
} from "./listener-parameter-arbitraries";
import type { PsychometricListenerParameters } from "./psychometric-listener";

/** Is `value` a whole number of grid units, allowing for the rounding of the division? */
const onGrid = (value: number, unitsPerValue: number): boolean =>
  Math.abs(value * unitsPerValue - Math.round(value * unitsPerValue)) < 1e-6;

function expectInRange(
  parameters: PsychometricListenerParameters,
  range: ListenerParameterRange,
): void {
  const { floorDb, capRelativeToAnchorDb } = hearingMethodConfig;
  for (const ear of ["left", "right"] as const) {
    const thresholdDb = parameters.trueThresholdDb[ear];
    expect(thresholdDb).toBeGreaterThanOrEqual(floorDb);
    expect(thresholdDb).toBeLessThanOrEqual(capRelativeToAnchorDb);
    expect(onGrid(thresholdDb, 10), `${ear} threshold on the 0.1 dB grid`).toBe(
      true,
    );
  }
  for (const field of [
    "widthDb",
    "lapseFraction",
    "falseAlarmFraction",
    "wrongSideFraction",
  ] as const) {
    const grid = range[field];
    expect(parameters[field], field).toBeGreaterThanOrEqual(grid.min);
    expect(parameters[field], field).toBeLessThanOrEqual(grid.max);
    expect(
      onGrid(parameters[field], grid.unitsPerValue),
      `${field} on its grid`,
    ).toBe(true);
  }
}

describe("listener parameter ranges (D17)", () => {
  it("holds the Plausible_Range and the Attentive_Range of D17", () => {
    expect(plausibleListenerRange).toEqual({
      name: "plausible",
      widthDb: { min: 1, max: 8, unitsPerValue: 10 },
      lapseFraction: { min: 0, max: 0.1, unitsPerValue: 1000 },
      falseAlarmFraction: { min: 0, max: 0.5, unitsPerValue: 1000 },
      wrongSideFraction: { min: 0, max: 0.1, unitsPerValue: 1000 },
    });
    expect(attentiveListenerRange).toEqual({
      name: "attentive",
      widthDb: { min: 1, max: 4, unitsPerValue: 10 },
      lapseFraction: { min: 0, max: 0.02, unitsPerValue: 1000 },
      falseAlarmFraction: { min: 0, max: 0.02, unitsPerValue: 1000 },
      wrongSideFraction: { min: 0, max: 0.02, unitsPerValue: 1000 },
    });
  });

  it("generates plausible and attentive parameters inside their ranges, on their grids", () => {
    for (const [arbitrary, range] of [
      [
        plausibleListenerParameters(hearingMethodConfig),
        plausibleListenerRange,
      ],
      [
        attentiveListenerParameters(hearingMethodConfig),
        attentiveListenerRange,
      ],
    ] as const) {
      fc.assert(
        fc.property(arbitrary, (parameters) => {
          expectInRange(parameters, range);
        }),
      );
    }
  });

  it("draws parameters inside the range, on the grid, reproducibly from the seed", () => {
    const draw = (seed: number) => {
      const random = createSeededRandom(seed);
      return Array.from({ length: 2000 }, () =>
        drawListenerParameters(
          plausibleListenerRange,
          hearingMethodConfig,
          random,
        ),
      );
    };
    const drawn = draw(7);
    for (const parameters of drawn) {
      expectInRange(parameters, plausibleListenerRange);
    }
    expect(draw(7)).toEqual(drawn);
    // Uniform on the grid: both ends of each range are reached.
    const widths = drawn.map((parameters) => parameters.widthDb);
    expect(Math.min(...widths)).toBeLessThan(1.2);
    expect(Math.max(...widths)).toBeGreaterThan(7.8);
  });
});
