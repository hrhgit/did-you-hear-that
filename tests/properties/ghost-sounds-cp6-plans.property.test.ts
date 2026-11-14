import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ghostSoundConfig } from "../../src/config/ghost-sound-config";
import { createSeededRandom } from "../../src/config/seeded-random";
import { soundIds } from "../../src/config/sound-id";
import { planAtticWhine } from "../../src/audio/synth/attic-whine-plan";
import { planCellarKnock } from "../../src/audio/synth/cellar-knock-plan";
import { planCorridorHum } from "../../src/audio/synth/corridor-hum-plan";
import { planNurseryMusicBox } from "../../src/audio/synth/nursery-music-box-plan";
import { soundRenderers } from "../../src/audio/synth/sound-renderers";
import { planStairsScrape } from "../../src/audio/synth/stairs-scrape-plan";
import {
  seedArbitrary,
  supportedSampleRateArbitrary,
} from "./sound-arbitraries";

/** Runs per plan (design.md, CP6). */
const runsPerPlan = 200;
/** Runs per sound for the buffer length, which renders and so costs as much as CP2 (D21). */
const lengthRunsPerSound = 25;
/** Sums of drawn times are compared with this tolerance. */
const toleranceMs = 1e-9;

const { cellar, corridor, nursery, stairs, attic } = ghostSoundConfig;

function expectWithin(
  label: string,
  value: number,
  minimum: number,
  maximum: number,
): void {
  expect(value, label).toBeGreaterThanOrEqual(minimum - toleranceMs);
  expect(value, label).toBeLessThanOrEqual(maximum + toleranceMs);
}

function expectPhase(value: number): void {
  expect(value).toBeGreaterThanOrEqual(0);
  expect(value).toBeLessThan(2 * Math.PI);
}

describe("ghost sounds CP6. Plans keep their shape (Universal; R5.1 to R5.5, R5.7, R5.8, R7.3, R8.2)", () => {
  it("cellar: knockCount knocks, onsets, carriers and levels in range, the last knock ending before the fade-out", () => {
    fc.assert(
      fc.property(seedArbitrary, (seed) => {
        const { knocks } = planCellarKnock(createSeededRandom(seed));
        expect(knocks).toHaveLength(cellar.knockCount);
        expectWithin(
          "first onset",
          knocks[0].onsetMs,
          cellar.firstKnockOnsetMinMs,
          cellar.firstKnockOnsetMaxMs,
        );
        for (const [index, knock] of knocks.entries()) {
          if (index > 0) {
            expectWithin(
              "interval",
              knock.onsetMs - knocks[index - 1].onsetMs,
              cellar.knockIntervalMinMs,
              cellar.knockIntervalMaxMs,
            );
          }
          expect(
            Math.abs(knock.carrierHz / cellar.centreHz - 1),
          ).toBeLessThanOrEqual(
            cellar.knockCarrierDeviationMaxFraction + 1e-12,
          );
          expectWithin("level", knock.levelDb, -cellar.knockLevelRangeDb, 0);
          expectPhase(knock.startPhaseRadians);
        }
        const lastKnock = knocks[knocks.length - 1];
        expect(
          lastKnock.onsetMs + cellar.knockAttackMs + cellar.knockDecayMs,
        ).toBeLessThanOrEqual(cellar.durationMs - cellar.outerFadeMs);
      }),
      { numRuns: runsPerPlan },
    );
  }, 120_000);

  it("nursery: noteCount notes, each a configured pitch, none equal to the one before, the last ending before the fade-out", () => {
    fc.assert(
      fc.property(seedArbitrary, (seed) => {
        const { notes } = planNurseryMusicBox(createSeededRandom(seed));
        expect(notes).toHaveLength(nursery.noteCount);
        expectWithin(
          "first onset",
          notes[0].onsetMs,
          nursery.firstNoteOnsetMinMs,
          nursery.firstNoteOnsetMaxMs,
        );
        for (const [index, note] of notes.entries()) {
          expect(note.frequencyHz).toBe(
            nursery.noteFrequenciesHz[note.pitchIndex],
          );
          if (index > 0) {
            expect(note.frequencyHz).not.toBe(notes[index - 1].frequencyHz);
            expectWithin(
              "interval",
              note.onsetMs - notes[index - 1].onsetMs,
              nursery.noteIntervalMinMs,
              nursery.noteIntervalMaxMs,
            );
          }
          expectPhase(note.startPhaseRadians);
        }
        expect(
          notes[notes.length - 1].onsetMs + nursery.noteLengthMs,
        ).toBeLessThanOrEqual(nursery.durationMs - nursery.outerFadeMs);
      }),
      { numRuns: runsPerPlan },
    );
  }, 120_000);

  it("corridor: wobble rates and phases in range", () => {
    fc.assert(
      fc.property(seedArbitrary, (seed) => {
        const plan = planCorridorHum(createSeededRandom(seed));
        expect(plan.pitchWobbles).toHaveLength(
          corridor.pitchWobbleSinusoidCount,
        );
        for (const wobble of plan.pitchWobbles) {
          expectWithin(
            "pitch wobble rate",
            wobble.rateHz,
            corridor.pitchWobbleRateMinHz,
            corridor.pitchWobbleRateMaxHz,
          );
          expectPhase(wobble.phaseRadians);
        }
        expectWithin(
          "level wobble rate",
          plan.levelWobble.rateHz,
          corridor.levelWobbleRateMinHz,
          corridor.levelWobbleRateMaxHz,
        );
        expectPhase(plan.levelWobble.phaseRadians);
        expectPhase(plan.startPhaseRadians);
      }),
      { numRuns: runsPerPlan },
    );
  }, 120_000);

  it("attic: carrier deviation, wobble rate and phases in range", () => {
    fc.assert(
      fc.property(seedArbitrary, (seed) => {
        const plan = planAtticWhine(createSeededRandom(seed));
        expect(
          Math.abs(plan.carrierHz / attic.centreHz - 1),
        ).toBeLessThanOrEqual(attic.carrierDeviationMaxFraction + 1e-12);
        expectWithin(
          "pitch wobble rate",
          plan.pitchWobbleRateHz,
          attic.pitchWobbleRateMinHz,
          attic.pitchWobbleRateMaxHz,
        );
        expectPhase(plan.pitchWobblePhaseRadians);
        expectPhase(plan.startPhaseRadians);
      }),
      { numRuns: runsPerPlan },
    );
  }, 120_000);

  it("stairs: grains from 0, spacings, lengths and levels in range, every start before durationMs - grainLengthMinMs", () => {
    const lastStartBeforeMs = stairs.durationMs - stairs.grainLengthMinMs;
    fc.assert(
      fc.property(seedArbitrary, (seed) => {
        const { grains } = planStairsScrape(createSeededRandom(seed));
        expect(grains.length).toBeGreaterThan(0);
        expect(grains[0].startMs).toBe(0);
        for (const [index, grain] of grains.entries()) {
          expect(grain.startMs).toBeLessThan(lastStartBeforeMs);
          if (index > 0) {
            expectWithin(
              "spacing",
              grain.startMs - grains[index - 1].startMs,
              stairs.grainSpacingMinMs,
              stairs.grainSpacingMaxMs,
            );
          }
          expectWithin(
            "length",
            grain.lengthMs,
            stairs.grainLengthMinMs,
            stairs.grainLengthMaxMs,
          );
          expectWithin("level", grain.levelDb, -stairs.grainLevelRangeDb, 0);
        }
        // The pattern stops only when one more spacing could reach the limit.
        expect(
          grains[grains.length - 1].startMs + stairs.grainSpacingMaxMs,
        ).toBeGreaterThanOrEqual(lastStartBeforeMs);
      }),
      { numRuns: runsPerPlan },
    );
  }, 120_000);

  for (const soundId of soundIds) {
    it(`${soundId}: the buffer length is floor(durationMs x rate / 1000) at any supported rate`, () => {
      const { durationMs } = ghostSoundConfig[soundId];
      fc.assert(
        fc.property(
          seedArbitrary,
          supportedSampleRateArbitrary,
          (seed, sampleRateHz) => {
            const samples = soundRenderers[soundId](
              sampleRateHz,
              createSeededRandom(seed),
            );
            expect(samples).toHaveLength(
              Math.floor((durationMs * sampleRateHz) / 1000),
            );
          },
        ),
        { numRuns: lengthRunsPerSound },
      );
    }, 120_000);
  }
});
