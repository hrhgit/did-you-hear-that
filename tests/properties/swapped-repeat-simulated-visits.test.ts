import { describe, expect, it, vi } from "vitest";
import type { VisitType } from "../../src/config/hearing-method-config";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { swappedRepeatCopy } from "../../src/copy/swapped-repeat-copy";
import { resultPicture } from "../../src/session/result-picture";
import { swappedRepeatComparison } from "../../src/session/swapped-repeat-comparison";
import type {
  ResultSnapshot,
  SwappedRepeatOutcome,
  VisitLog,
} from "../../src/session/visit-flow-types";
import type { PsychometricListenerParameters } from "../listeners/psychometric-listener";
import {
  playVisit,
  type VisitorScript,
  type VisitorSwappedRepeatBehaviour,
} from "../listeners/simulated-visitor";
import { restMaxMs } from "./visit-flow-arbitraries";
import { createVisitHarness } from "./visit-flow-harness";

// A quick and a full visit played to the result with the swapped repeat run to its end
// (swapped-repeat R20.6, brief 08 "Done when", tasks.md task 16): an uneven Step_Listener in
// Worn_Headphones, once with an ear difference only and once with an imbalance only, through the
// visit flow's harness and the simulated visitor. Fixed seeds and the worst-case renderers
// (audio-output D43).
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

const timeoutMs = 120_000;

/** Every answer comes within the first half of its window, so that the listener stays a Step_Listener. */
const answerDelayMs = hearingMethodConfig.responseWindowMs / 2;

/**
 * The middle of the two true thresholds, and the size of the one difference each case has. Every
 * threshold lies above the Search_Floor of a calibration at −22 dB (audible-start R12.5).
 */
const baseDb = -15.5;
const differenceDb = 25;

interface Case {
  readonly name: string;
  /** Ear_Difference E: true right minus true left threshold. */
  readonly earDifferenceDb: number;
  /** Headphone_Imbalance H: how much quieter the right earpiece plays than the left. */
  readonly imbalanceDb: number;
  readonly outcome: SwappedRepeatOutcome;
  /** The first run's right minus left, by ear, and the repeat's. */
  readonly firstRightMinusLeftDb: number;
  readonly repeatRightMinusLeftDb: number;
}

// For a Step_Listener each estimate is the lowest grid level at or above the threshold heard
// through the earpiece (threshold-search CP1): −28 dB gives −25 and −3 gives 0.
const cases: readonly Case[] = [
  {
    // Left ear −28, right ear −3, the headphones even: the right ear needs the louder sound both
    // times, whichever earpiece is on it.
    name: "an ear difference only",
    earDifferenceDb: differenceDb,
    imbalanceDb: 0,
    outcome: "followsEar",
    firstRightMinusLeftDb: 25,
    repeatRightMinusLeftDb: 25,
  },
  {
    // Both ears −15.5, the right earpiece 25 dB quieter: through the left earpiece a threshold of
    // −28, through the right −3. The right earpiece needs the louder sound both times.
    name: "an imbalance only",
    earDifferenceDb: 0,
    imbalanceDb: differenceDb,
    outcome: "followsEarpiece",
    firstRightMinusLeftDb: 25,
    repeatRightMinusLeftDb: -25,
  },
];

const flowSeed: Readonly<Record<VisitType, number>> = Object.freeze({
  quick: 20261221,
  full: 20261222,
});

/**
 * The visitor names the lowest offered floor. In the quick visit it swaps at once; in the full
 * visit it first confirms without swapping, hears the hiss on the left and is asked again.
 */
const behaviourFor = (visitType: VisitType): VisitorSwappedRepeatBehaviour => ({
  floor: { kind: "firstOffered" },
  swapsOnFirstInstruction: visitType === "quick",
  firstCheckAnswer: "heard",
  pressDelayMaxMs: 2000,
  events: [],
  turnsBack: true,
});

const stepListener = (
  earDifferenceDb: number,
): PsychometricListenerParameters => ({
  trueThresholdDb: {
    left: baseDb - earDifferenceDb / 2,
    right: baseDb + earDifferenceDb / 2,
  },
  widthDb: 0,
  lapseFraction: 0,
  falseAlarmFraction: 0,
  wrongSideFraction: 0,
});

const scriptFor = (visitType: VisitType, testCase: Case): VisitorScript => ({
  visitType,
  calibrationTargetDb: -22,
  firstHeadphoneCheckAnswer: "left",
  listener: {
    kind: "psychometric",
    parameters: stepListener(testCase.earDifferenceDb),
    seed: 21,
  },
  visitorSeed: 20261223,
  answerDelayMaxMs: answerDelayMs,
  timeStampModes: ["now"],
  restMaxMs,
  extraPresses: [],
  disturbances: [],
  ending: null,
  headphones: { imbalanceDb: testCase.imbalanceDb },
  swappedRepeat: behaviourFor(visitType),
});

describe("swapped repeat: simulated visits (R20.6)", () => {
  for (const visitType of ["quick", "full"] as const) {
    for (const testCase of cases) {
      it(
        `a ${visitType} visit with ${testCase.name} runs the repeat to its end from the result and says the difference ${testCase.outcome === "followsEar" ? "stayed with the ears" : "moved with the headphones"}`,
        async () => {
          const harness = createVisitHarness({
            seed: flowSeed[visitType],
            performanceOffsetMs: 246_810,
            spyOnOutput: true,
          });
          let before: ResultSnapshot | null = null;
          let logCopy: VisitLog | null = null;
          harness.flow.subscribe((snapshot) => {
            if (snapshot.stage === "result" && before === null) {
              before = snapshot;
              logCopy = structuredClone(snapshot.visitLog);
            }
          });
          const run = await playVisit(harness, scriptFor(visitType, testCase));
          expect(run.ending).toBe("done");
          expect(run.finalStage).toBe("result");
          const final = harness.flow.snapshot();
          if (final.stage !== "result" || before === null) {
            throw new Error(
              `The visit ended in ${final.stage}, not in its result.`,
            );
          }
          const first: ResultSnapshot = before;
          const { summary } = final;

          // Every floor offers the repeat, and the visitor named the lowest.
          expect(
            summary.rooms.map((room) => room.swappedRepeatOffered),
          ).toEqual(summary.rooms.map(() => true));
          expect(run.swappedRepeatRoomIndex).toBe(0);
          const firstRun = summary.rooms[0]!;
          expect(firstRun.rightMinusLeftDb).toBe(
            testCase.firstRightMinusLeftDb,
          );

          // The repeat ran to its end and gave one record of that floor.
          expect(final.swappedRepeats).toHaveLength(1);
          const record = final.swappedRepeats[0]!;
          expect(record).toMatchObject({
            roomIndex: 0,
            runNumber: 1,
            earpieceOnEar: { left: "right", right: "left" },
            firstRightMinusLeftDb: testCase.firstRightMinusLeftDb,
            rightMinusLeftDb: testCase.repeatRightMinusLeftDb,
            outcome: testCase.outcome,
            unclearReason: null,
          });
          expect(record.swapChecks.map((check) => check.judgement)).toEqual(
            visitType === "quick" ? ["confirmed"] : ["notSwapped", "confirmed"],
          );
          expect(
            harness.snapshots.some(
              ({ snapshot }) =>
                snapshot.stage === "swappedRepeat" &&
                snapshot.repeat.phase === "finished" &&
                snapshot.repeat.ending === "finished",
            ),
          ).toBe(true);

          // The visit log and the summary are the same objects as before the repeat (R8.8).
          expect(final.visitLog).toBe(first.visitLog);
          expect(final.summary).toBe(first.summary);
          expect(final.visitLog).toEqual(logCopy);
          expect(final.turnBackLine).toBe(swappedRepeatCopy.turnBackLine);

          // Every sound of the room played in the other earpiece, at the level asked.
          const trialPlays = harness.outputCalls.filter(
            (call) => call.name === "play" && call.stage === "swappedRepeat",
          );
          expect(trialPlays.length).toBeGreaterThan(0);
          const soundTrials = record.trials.filter(
            (trial) => trial.kind === "sound",
          );
          expect(soundTrials.length).toBe(trialPlays.length);
          for (const trial of soundTrials) {
            expect(trial.earpiece).toBe(
              trial.ear === "left" ? "right" : "left",
            );
            expect(trial.playedLevelDb).toBe(trial.requestedLevelDb);
          }

          // The picture draws the repeat beside its floor, which offers no repeat any more.
          const picture = resultPicture({
            kind: "live",
            visit: final,
            localDate: "2026-11-20",
            earlierVisit: null,
          });
          expect(picture.floors[0]!.repeat).toEqual(
            swappedRepeatComparison(
              firstRun,
              record,
              hearingMethodConfig.floorDb,
            ),
          );
          expect(picture.floors[0]!.swappedRepeat).toBeNull();
          expect(
            picture.floors
              .slice(1)
              .every((floor) => floor.swappedRepeat !== null),
          ).toBe(true);
        },
        timeoutMs,
      );
    }
  }
});
