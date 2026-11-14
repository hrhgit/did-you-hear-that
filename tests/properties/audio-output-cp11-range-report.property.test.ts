import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { audioOutputConfig } from "../../src/config/audio-output-config";
import { audioSafetyConfig } from "../../src/config/audio-safety-config";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { soundIds } from "../../src/config/sound-id";
import { soundRulesConfig } from "../../src/config/sound-rules-config";
import { decibelsToGain } from "../../src/audio/synth/decibels-to-gain";
import { gainToDecibels } from "../../src/audio/output/gain-to-decibels";
import { rangeReport } from "../../src/audio/output/range-report";
import { roomSearchCapDb } from "../../src/session/room-search-cap";

/** Runs (design.md, Correctness properties). */
const runs = 300;

/** Log-uniform from 1e-6 to 1e2. */
const gainArbitrary = fc
  .double({ min: -6, max: 2, noNaN: true })
  .map((exponent) => 10 ** exponent);

describe("audio output CP11. The range report (Universal; R9.2, R9.5, R9.6)", () => {
  it("gives every room the top of the formula, at most the anchor cap, named by the smaller limit", () => {
    const { capRelativeToAnchorDb } = hearingMethodConfig;
    fc.assert(
      fc.property(gainArbitrary, (calibrationGain) => {
        const report = rangeReport(calibrationGain);
        for (const soundId of soundIds) {
          const ceilingLimitedDb = gainToDecibels(
            audioSafetyConfig.ceilingFraction /
              (soundRulesConfig.referenceRmsFraction *
                decibelsToGain(audioOutputConfig.peakBoundDb[soundId]) *
                calibrationGain),
          );
          const room = report.rooms[soundId];
          expect(room.topLevelDb).toBe(
            Math.min(capRelativeToAnchorDb, ceilingLimitedDb),
          );
          expect(room.topLevelDb).toBeLessThanOrEqual(capRelativeToAnchorDb);
          expect(room.setBy).toBe(
            ceilingLimitedDb < capRelativeToAnchorDb ? "ceiling" : "anchorCap",
          );
          expect(room.belowAnchorCapDb).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: runs },
    );
  }, 120_000);

  it("rounds every room's top down to a grid level within one step of it, at most the anchor cap", () => {
    const { capRelativeToAnchorDb, startingLevelDb, upwardStepDb } =
      hearingMethodConfig;
    // roomSearchCapDb counts a top 10⁻⁹ steps below a grid level as on it (D44).
    const gridToleranceDb = 1e-9 * upwardStepDb;
    fc.assert(
      fc.property(gainArbitrary, (calibrationGain) => {
        const report = rangeReport(calibrationGain);
        for (const soundId of soundIds) {
          const topDb = report.rooms[soundId].topLevelDb;
          const capDb = roomSearchCapDb(topDb, hearingMethodConfig);
          expect(
            Number.isInteger((capDb - startingLevelDb) / upwardStepDb),
          ).toBe(true);
          expect(capDb).toBeLessThanOrEqual(topDb + gridToleranceDb);
          expect(capDb).toBeGreaterThan(topDb - upwardStepDb);
          expect(capDb).toBeLessThanOrEqual(capRelativeToAnchorDb);
        }
      }),
      { numRuns: runs },
    );
  }, 120_000);

  it("never raises a room's top when the calibration gain rises", () => {
    fc.assert(
      fc.property(gainArbitrary, gainArbitrary, (first, second) => {
        const [lower, higher] =
          first <= second ? [first, second] : [second, first];
        const lowerReport = rangeReport(lower);
        const higherReport = rangeReport(higher);
        for (const soundId of soundIds) {
          expect(higherReport.rooms[soundId].topLevelDb).toBeLessThanOrEqual(
            lowerReport.rooms[soundId].topLevelDb,
          );
        }
      }),
      { numRuns: runs },
    );
  }, 120_000);
});
