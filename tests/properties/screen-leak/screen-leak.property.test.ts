import fc from "fast-check";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createSeededRandom } from "../../../src/config/seeded-random";
import {
  balanceLabels,
  guessFromScreen,
  type LeakSample,
} from "./guess-from-screen";
import { recordVisit, recordVisits, visitorScriptOf } from "./record-visit";
import {
  leakSamples,
  momentsBeforeDecision,
  recordOfLeakyPage,
  type LeakQuestion,
  type RecordedTrial,
  type ScreenRecord,
} from "./screen-record";

// The picture does not leak (brief 05, "What the page may show and when"). Whole visits are
// played by a simulated visitor on the fake backend and the manual timer. The recorder runs the
// two functions the page draws from, `screenOfSnapshot` and `reactionOfEvent`, on everything the
// flow hands out, and the test hook of the flow tells the recorder what the page is never told:
// which trial was presented and when.
vi.mock("../../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("../worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Visits played for each of the two properties about when the page draws. */
const drawingRuns = 50;
/** A visit takes a few hundredths of a second to play, and each test plays many. */
const timeoutMs = 60_000;
/** Visits the predictor learns from, and visits it is judged on. Half of each are disturbed. */
const predictorVisits = 120;
/**
 * The stretch after a decision in which the lamp and the door shadow are watched, in ms. It is
 * the shortest gap between trials, so the stretch never reaches into a trial's window.
 */
const ambientWatchMs = 1500;

const seedArbitrary = fc.integer({ min: 0, max: 0xffffffff });

/** The page changes that fall in a trial's window: from its presentation up to its decision. */
function momentsInWindow(record: ScreenRecord, trial: RecordedTrial): number {
  return record.moments.filter(
    (moment) =>
      moment.atMs >= trial.presentedAtMs && moment.atMs < trial.decidedAtMs,
  ).length;
}

describe("when the page draws during a visit", () => {
  it(
    "draws nothing from one decision to the next in a visit that is left alone",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          seedArbitrary,
          seedArbitrary,
          async (flowSeed, visitorSeed) => {
            const { record, run } = await recordVisit(
              flowSeed,
              visitorScriptOf(visitorSeed, { disturbed: false }),
            );
            expect(run.finalStage).toBe("result");
            expect(record.trials.length).toBeGreaterThan(0);
            for (const trial of record.trials) {
              expect(momentsBeforeDecision(record, trial)).toEqual([]);
            }
          },
        ),
        { numRuns: drawingRuns },
      );
    },
    timeoutMs,
  );

  it(
    "draws nothing while a trial's window is open in a visit that is paused, hidden, interrupted or moved to another device",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          seedArbitrary,
          seedArbitrary,
          async (flowSeed, visitorSeed) => {
            const { record, run } = await recordVisit(
              flowSeed,
              visitorScriptOf(visitorSeed, { disturbed: true }),
            );
            expect(run.finalStage).toBe("result");
            expect(record.trials.length).toBeGreaterThan(0);
            for (const trial of record.trials) {
              expect(momentsInWindow(record, trial)).toBe(0);
            }
          },
        ),
        { numRuns: drawingRuns },
      );
    },
    timeoutMs,
  );
});

describe("what a predictor can guess from the screen", () => {
  let training: ScreenRecord[] = [];
  let heldOut: ScreenRecord[] = [];

  beforeAll(async () => {
    const half = predictorVisits / 2;
    training = [
      ...(await recordVisits(10_000, half, { disturbed: false })),
      ...(await recordVisits(20_000, half, { disturbed: true })),
    ];
    heldOut = [
      ...(await recordVisits(30_000, half, { disturbed: false })),
      ...(await recordVisits(40_000, half, { disturbed: true })),
    ];
  }, 2 * timeoutMs);

  /** The samples of every record, each visit with ambient motion of its own. */
  function samplesOf(
    records: readonly ScreenRecord[],
    question: LeakQuestion,
    firstAmbientSeed: number,
  ): LeakSample[] {
    const samples = records.flatMap((record, index) =>
      leakSamples(record, question, {
        ambientRandom: createSeededRandom(firstAmbientSeed + index),
        ambientWatchMs,
      }),
    );
    // Four trials in five have a sound. In equal numbers, any link between the screen and
    // whether there was a sound shows.
    return question === "soundOrNot"
      ? balanceLabels(samples, createSeededRandom(firstAmbientSeed))
      : samples;
  }

  it.each<LeakQuestion>(["soundOrNot", "side"])(
    "does no better than chance at %s",
    (question) => {
      const verdict = guessFromScreen(
        samplesOf(training, question, 50_000),
        samplesOf(heldOut, question, 60_000),
      );
      // Enough samples for one extra right guess in fifty to show.
      expect(verdict.heldOutCount).toBeGreaterThan(3000);
      expect(verdict.limit - verdict.chance).toBeLessThan(0.03);
      expect(verdict, JSON.stringify(verdict)).toMatchObject({ leaks: false });
    },
  );

  it("would catch a page that changed when a sound came, one time in ten", () => {
    const leaky = (records: readonly ScreenRecord[], seed: number) => {
      const random = createSeededRandom(seed);
      return records.map((record) =>
        recordOfLeakyPage(record, (trial) =>
          trial.kind === "sound" && random.next() < 0.1 ? 1 : 0,
        ),
      );
    };
    const verdict = guessFromScreen(
      samplesOf(leaky(training, 1), "soundOrNot", 50_000),
      samplesOf(leaky(heldOut, 2), "soundOrNot", 60_000),
    );
    expect(verdict.leaks).toBe(true);
    expect(verdict.chosenFeatures).toContain(0);
  });

  it("would catch a page that changed for the left side only, one time in ten", () => {
    const leaky = (records: readonly ScreenRecord[], seed: number) => {
      const random = createSeededRandom(seed);
      return records.map((record) =>
        recordOfLeakyPage(record, (trial) =>
          trial.ear === "left" && random.next() < 0.1 ? 1 : 0,
        ),
      );
    };
    const verdict = guessFromScreen(
      samplesOf(leaky(training, 3), "side", 50_000),
      samplesOf(leaky(heldOut, 4), "side", 60_000),
    );
    expect(verdict.leaks).toBe(true);
    expect(verdict.chosenFeatures).toContain(0);
  });
});
