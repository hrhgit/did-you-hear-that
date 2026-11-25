import { describe, expect, it, vi } from "vitest";
import type { VisitType } from "../../src/config/hearing-method-config";
import { replayCopy } from "../../src/copy/replay-copy";
import { planMissedSoundReplay } from "../../src/session/missed-sound-replay-plan";
import { summarizeVisit } from "../../src/session/summarize-visit";
import type {
  MissedSoundReplaySnapshot,
  ResultSnapshot,
  VisitLog,
} from "../../src/session/visit-flow-types";
import type { PsychometricListenerParameters } from "../listeners/psychometric-listener";
import {
  playVisit,
  type VisitorListenerSpec,
  type VisitorScript,
} from "../listeners/simulated-visitor";
import { answerDelayMaxMs, restMaxMs } from "./visit-flow-arbitraries";
import { createVisitHarness, type VisitHarness } from "./visit-flow-harness";

// A quick and a full visit played to the result with the replay watched to its end
// (missed-sound-replay R17.6, brief 07 "Done when", tasks.md task 13), and the visit of CP4 with a
// listener who catches everything, through the visit flow. Fixed seeds and the worst-case
// renderers (audio-output D43).
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

const timeoutMs = 120_000;

/**
 * The visitor presses start this long after the stage is entered: longer than any ghost sound,
 * so that the last trial's sound has ended and every replayed sound is scheduled at the first ask.
 */
const startAfterMs = 5000;

/** A listener from the Attentive_Range (threshold-search D17), who misses sounds below threshold. */
const attentiveListener: PsychometricListenerParameters = Object.freeze({
  trueThresholdDb: Object.freeze({ left: -35.4, right: -22.8 }),
  widthDb: 2.5,
  lapseFraction: 0.01,
  falseAlarmFraction: 0.01,
  wrongSideFraction: 0.005,
});

const flowSeed: Readonly<Record<VisitType, number>> = Object.freeze({
  full: 20261212,
});

const scriptFor = (
  visitType: VisitType,
  listener: VisitorListenerSpec,
  answerDelayMs: number,
): VisitorScript => ({
  visitType,
  calibrationTargetDb: -22,
  firstHeadphoneCheckAnswer: "left",
  listener,
  visitorSeed: 20261213,
  answerDelayMaxMs: answerDelayMs,
  timeStampModes: ["now"],
  restMaxMs,
  extraPresses: [],
  disturbances: [],
  ending: null,
  replay: { kind: "watch", startAfterMs },
});

interface PlayedVisit {
  readonly harness: VisitHarness;
  readonly entered: MissedSoundReplaySnapshot;
  readonly logCopy: VisitLog;
  readonly result: ResultSnapshot;
}

async function playToResult(script: VisitorScript): Promise<PlayedVisit> {
  const harness = createVisitHarness({
    seed: flowSeed[script.visitType],
    performanceOffsetMs: 654_321,
    spyOnOutput: true,
  });
  let entered: MissedSoundReplaySnapshot | null = null;
  let logCopy: VisitLog | null = null;
  harness.flow.subscribe((snapshot) => {
    if (entered === null && snapshot.stage === "missedSoundReplay") {
      entered = snapshot;
      logCopy = structuredClone(snapshot.visitLog);
    }
  });
  const run = await playVisit(harness, script);
  expect(run.ending).toBe("done");
  const result = harness.flow.snapshot();
  if (result.stage !== "result" || entered === null || logCopy === null) {
    throw new Error(`The visit ended in ${result.stage}, not in its result.`);
  }
  const replayStage: MissedSoundReplaySnapshot = entered;
  // The same log object, unchanged, and the summary of it (R13.4, R13.5).
  expect(result.visitLog).toBe(replayStage.visitLog);
  expect(result.visitLog).toEqual(logCopy);
  expect(result.summary).toEqual(summarizeVisit(result.visitLog));
  return { harness, entered: replayStage, logCopy, result };
}

const replayPlaysOf = (harness: VisitHarness) =>
  harness.outputCalls.filter(
    (call) => call.name === "play" && call.request.purpose === "replay",
  );

describe("missed-sound replay: simulated visits (R17.6)", () => {
  for (const visitType of ["full"] as const) {
    it(
      `a ${visitType} visit plays its whole plan with the Purpose replay, watched to the end, and reaches the result with the same log`,
      async () => {
        const { harness, result } = await playToResult(
          scriptFor(
            visitType,
            { kind: "psychometric", parameters: attentiveListener, seed: 11 },
            answerDelayMaxMs,
          ),
        );
        const plan = planMissedSoundReplay(result.visitLog);
        expect(plan.sounds.length).toBeGreaterThan(0);

        const plays = replayPlaysOf(harness);
        expect(
          plays.map((call) =>
            call.name === "play"
              ? {
                  stage: call.stage,
                  request: call.request,
                  outcome: call.outcome.kind,
                }
              : null,
          ),
        ).toEqual(
          plan.sounds.map((sound) => ({
            stage: "missedSoundReplay",
            request: {
              soundId: sound.room.roomId,
              ear: sound.ear,
              levelDb: sound.askedLevelDb,
              purpose: "replay",
            },
            outcome: "scheduled",
          })),
        );
        for (const call of plays) {
          if (call.name === "play" && call.outcome.kind === "scheduled") {
            expect(call.outcome.playedLevelDb).toBe(call.request.levelDb);
            expect(call.outcome.clampLimit).toBeNull();
          }
        }

        const started = harness.events.flatMap((entry) =>
          entry.event.kind === "replaySoundStarted" ? [entry.event.sound] : [],
        );
        expect(started.map((sound) => sound.position)).toEqual(
          plan.sounds.map((_, index) => index + 1),
        );
        expect(started.map((sound) => sound.trialOrder)).toEqual(
          plan.sounds.map((sound) => sound.trialOrder),
        );

        // The replay ran to its end and waited for the visitor (R13.1, R13.2, D17).
        const finished = harness.snapshots.find(
          ({ snapshot }) =>
            snapshot.stage === "missedSoundReplay" &&
            snapshot.replay.phase === "finished",
        );
        expect(finished?.snapshot).toMatchObject({
          replay: { phase: "finished", ending: "allPlayed" },
        });
      },
      timeoutMs,
    );
  }

  it(
    "a visit with a listener who catches everything shows nothing to play again, plays nothing and reaches the result (CP4, R9)",
    async () => {
      const { harness, entered, result } = await playToResult(
        scriptFor(
          "full",
          {
            kind: "function",
            respond: (trial) => (trial.kind === "sound" ? trial.ear : "none"),
          },
          // Every answer well inside its window.
          400,
        ),
      );
      expect(planMissedSoundReplay(result.visitLog).missedSounds).toEqual([]);
      expect(entered.replay).toMatchObject({
        phase: "nothingMissed",
        line: replayCopy.nothingMissedLine,
        canStart: false,
        canSkip: false,
      });
      expect(
        harness.snapshots.filter(
          ({ snapshot }) =>
            snapshot.stage === "missedSoundReplay" &&
            snapshot.replay.phase !== "nothingMissed",
        ),
      ).toEqual([]);
      expect(replayPlaysOf(harness)).toEqual([]);
      expect(
        harness.schedules.filter((call) => call.stage === "missedSoundReplay"),
      ).toEqual([]);
      expect(
        harness.events.filter(
          (entry) => entry.event.kind === "replaySoundStarted",
        ),
      ).toEqual([]);
    },
    timeoutMs,
  );
});
