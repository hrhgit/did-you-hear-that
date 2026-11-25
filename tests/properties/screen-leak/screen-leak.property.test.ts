import fc from "fast-check";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createSeededRandom } from "../../../src/config/seeded-random";
import { roomRuns } from "../visit-flow-harness";
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
  type ScreenMoment,
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

/**
 * The page changes that fall in a trial's window, from its presentation up to its decision, other
 * than the chase.
 */
function momentsInWindow(record: ScreenRecord, trial: RecordedTrial): number {
  return withoutChase(
    record.moments.filter(
      (moment) =>
        moment.atMs >= trial.presentedAtMs && moment.atMs < trial.decidedAtMs,
    ),
  ).length;
}

/**
 * The chase may change between decisions: a kick at nothing breaks the combo (the rhythm game of
 * 2026-11-18), and it follows the visitor's own presses alone. Nothing else on the page may
 * change with it. The predictor below still sees every change.
 */
function withoutChase(moments: readonly ScreenMoment[]): ScreenMoment[] {
  return moments.filter(
    (moment) => moment.what !== "chase" && moment.what !== "whiff",
  );
}

/**
 * True when the trials of the visit's rooms did not come room by room: a trial of one room was
 * decided after a trial of a later room. That is what the one room is.
 */
function tookTurns(record: ScreenRecord): boolean {
  const rooms = record.trials
    .filter((trial) => trial.inSwappedRepeat !== true)
    .map((trial) => trial.roomIndex);
  return rooms.some((roomIndex, index) => roomIndex < (rooms[index - 1] ?? 0));
}

// Every property here holds however the rooms run (one-room design.md, D1): one after another, as
// before the one room, and with as many searches taking turns in the one room as the shipped site
// runs together. A site set back to one room at a time has only the first.
describe.each(roomRuns)("$name", ({ roomsTogetherMaxCount, together }) => {
  /**
   * Plays `drawingRuns` visits of one kind and checks `holds` on every trial of each. With rooms
   * that run together, most visits must have had their creatures take turns, or the property
   * would say nothing about the one room. One room at a time, none may.
   */
  async function assertOverVisits(
    disturbed: boolean,
    holds: (record: ScreenRecord, trial: RecordedTrial) => void,
  ): Promise<void> {
    let visits = 0;
    let visitsThatTookTurns = 0;
    await fc.assert(
      fc.asyncProperty(
        seedArbitrary,
        seedArbitrary,
        async (flowSeed, visitorSeed) => {
          const { record, run } = await recordVisit(
            flowSeed,
            visitorScriptOf(visitorSeed, { disturbed }),
            roomsTogetherMaxCount,
          );
          expect(run.finalStage).toBe("result");
          expect(record.trials.length).toBeGreaterThan(0);
          visits += 1;
          if (tookTurns(record)) {
            visitsThatTookTurns += 1;
          }
          for (const trial of record.trials) {
            holds(record, trial);
          }
        },
      ),
      { numRuns: drawingRuns },
    );
    if (together) {
      expect(visitsThatTookTurns).toBeGreaterThan(visits / 2);
    } else {
      expect(visitsThatTookTurns).toBe(0);
    }
  }

  describe("when the page draws during a visit", () => {
    it(
      "draws nothing from one decision to the next in a visit that is left alone",
      async () => {
        await assertOverVisits(false, (record, trial) => {
          expect(withoutChase(momentsBeforeDecision(record, trial))).toEqual(
            [],
          );
        });
      },
      timeoutMs,
    );

    it(
      "draws nothing while a trial's window is open in a visit that is paused, hidden, interrupted or moved to another device",
      async () => {
        await assertOverVisits(true, (record, trial) => {
          expect(momentsInWindow(record, trial)).toBe(0);
        });
      },
      timeoutMs,
    );
  });

  describe("when the page draws in the swapped repeat", () => {
    /** The trials of the swapped repeat's room in a record. */
    const repeatTrials = (record: ScreenRecord): RecordedTrial[] =>
      record.trials.filter((trial) => trial.inSwappedRepeat === true);

    /**
     * Plays visits of one kind with a swapped repeat after the result and checks `holds` on every
     * trial, those of the visit's rooms and those of the repeat's room. Most visits must reach the
     * repeat's room, or the property would say nothing about it.
     */
    async function assertOverRepeats(
      disturbed: boolean,
      holds: (record: ScreenRecord, trial: RecordedTrial) => void,
    ): Promise<void> {
      let visits = 0;
      let visitsWithRepeatTrials = 0;
      await fc.assert(
        fc.asyncProperty(
          seedArbitrary,
          seedArbitrary,
          async (flowSeed, visitorSeed) => {
            const { record, run } = await recordVisit(
              flowSeed,
              visitorScriptOf(visitorSeed, { disturbed, swappedRepeat: true }),
              roomsTogetherMaxCount,
            );
            expect(run.finalStage).toBe("result");
            visits += 1;
            if (repeatTrials(record).length > 0) {
              visitsWithRepeatTrials += 1;
            }
            for (const trial of record.trials) {
              holds(record, trial);
            }
          },
        ),
        { numRuns: drawingRuns },
      );
      expect(visitsWithRepeatTrials).toBeGreaterThan(visits / 2);
    }

    it(
      "draws nothing from one decision to the next in the repeated room of a visit that is left alone",
      async () => {
        await assertOverRepeats(false, (record, trial) => {
          expect(withoutChase(momentsBeforeDecision(record, trial))).toEqual(
            [],
          );
        });
      },
      timeoutMs,
    );

    it(
      "draws nothing while a trial's window is open in a repeated room that is paused, hidden or interrupted",
      async () => {
        await assertOverRepeats(true, (record, trial) => {
          expect(momentsInWindow(record, trial)).toBe(0);
        });
      },
      timeoutMs,
    );
  });

  describe("what a predictor can guess from the screen", () => {
    let training: ScreenRecord[] = [];
    let heldOut: ScreenRecord[] = [];

    beforeAll(async () => {
      const half = predictorVisits / 2;
      const visits = (firstSeed: number, disturbed: boolean) =>
        recordVisits(firstSeed, half, { disturbed }, roomsTogetherMaxCount);
      training = [
        ...(await visits(10_000, false)),
        ...(await visits(20_000, true)),
      ];
      heldOut = [
        ...(await visits(30_000, false)),
        ...(await visits(40_000, true)),
      ];
    }, 6 * timeoutMs); // Whole visits of five creatures, a good many of them.

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
        expect(verdict, JSON.stringify(verdict)).toMatchObject({
          leaks: false,
        });
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
});
