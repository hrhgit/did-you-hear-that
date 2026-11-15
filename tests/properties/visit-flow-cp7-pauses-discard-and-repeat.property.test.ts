import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import type { PresentedTrial } from "../../src/session/create-visit-flow";
import type {
  VisitPause,
  VisitStage,
} from "../../src/session/visit-flow-types";
import { playVisit } from "../listeners/simulated-visitor";
import { visitRunArbitrary } from "./visit-flow-arbitraries";
import { createVisitHarness } from "./visit-flow-harness";
import { observeVisit, visitStartMs } from "./visit-flow-timeline";

// CP7. Pauses discard and repeat (Universal; visit-flow design.md, CP7; R12.3 to R12.7, R13.1 to
// R13.3, R21.3). The visits render with the worst-case renderers (D26, audio-output D43).
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Runs (design.md, Correctness properties). */
const runs = 50;
const timeoutMs = 120_000;

/** A room run. */
interface Run {
  readonly roomIndex: number;
  readonly attempt: number;
}

const runKey = (run: Run): string =>
  `${String(run.roomIndex)}:${String(run.attempt)}`;

/** A pause that began in a room, until the next trial is presented. */
interface RoomPause {
  readonly run: Run;
  /** The trial presented and not decided when the pause began, or null in a gap. */
  readonly waiting: PresentedTrial | null;
  /** The number of the trial the search waits on. */
  readonly trialNumber: number;
  deviceChanged: boolean;
}

describe("visit flow CP7. Pauses discard and repeat (Universal; R12.3 to R12.7, R13.1 to R13.3)", () => {
  it(
    "schedules nothing in a pause, presents the waiting trial again after it, and starts a room again after a device change",
    async () => {
      await fc.assert(
        fc.asyncProperty(visitRunArbitrary(), async (visitRun) => {
          const harness = createVisitHarness({
            seed: visitRun.seed,
            performanceOffsetMs: visitRun.performanceOffsetMs,
          });
          const timeline = observeVisit(harness);
          const run = await playVisit(timeline.driver, visitRun.script);
          expect(run.ending).toBe("done");
          const { entries } = timeline;
          const { schedules } = harness;

          let paused: VisitPause | null = null;
          let schedulePointer = 0;
          const takeSchedulesUntil = (count: number): void => {
            for (; schedulePointer < count; schedulePointer += 1) {
              expect(
                paused,
                `a sound scheduled at ${String(schedules[schedulePointer]?.atMs)} in a pause`,
              ).toBeNull();
            }
          };

          let currentRun: Run | null = null;
          let pending: PresentedTrial | null = null;
          const lastDecidedNumber = new Map<string, number>();
          let roomPause: RoomPause | null = null;
          /** After a device change: whether a calibration again and then a correct check came. */
          let afterDeviceChange: {
            calibratedAgain: boolean;
            checked: boolean;
          } | null = null;
          const abandonedRuns: string[] = [];
          let previousStage: VisitStage | null = null;
          let rulesShownCount = 0;

          for (const entry of entries) {
            takeSchedulesUntil(entry.scheduleCount);
            switch (entry.kind) {
              case "snapshot": {
                const { snapshot } = entry;
                const was = paused;
                paused = snapshot.pause;
                if (
                  was === null &&
                  paused !== null &&
                  snapshot.stage === "room" &&
                  currentRun !== null
                ) {
                  if (roomPause === null) {
                    roomPause = {
                      run: currentRun,
                      waiting: pending,
                      trialNumber:
                        pending?.trialNumber ??
                        (lastDecidedNumber.get(runKey(currentRun)) ?? 0) + 1,
                      deviceChanged: false,
                    };
                  }
                  pending = null;
                }
                if (paused?.reason === "deviceChanged") {
                  if (roomPause !== null && !roomPause.deviceChanged) {
                    roomPause.deviceChanged = true;
                    abandonedRuns.push(runKey(roomPause.run));
                  }
                  afterDeviceChange = {
                    calibratedAgain: false,
                    checked: false,
                  };
                }
                if (afterDeviceChange !== null) {
                  if (snapshot.stage === "calibration" && snapshot.again) {
                    afterDeviceChange.calibratedAgain = true;
                  }
                  if (
                    afterDeviceChange.calibratedAgain &&
                    snapshot.stage === "headphoneCheck" &&
                    snapshot.judgement === "correct"
                  ) {
                    afterDeviceChange.checked = true;
                  }
                }
                if (snapshot.stage === "rules" && previousStage !== "rules") {
                  rulesShownCount += 1;
                }
                previousStage = snapshot.stage;
                break;
              }
              case "event":
                if (entry.event.kind === "roomStarted") {
                  currentRun = {
                    roomIndex: entry.event.room.roomIndex,
                    attempt: entry.event.attempt,
                  };
                }
                if (entry.event.kind === "trialScored") {
                  const { trial } = entry.event;
                  pending = null;
                  lastDecidedNumber.set(runKey(trial), trial.trialNumber);
                }
                break;
              case "presented": {
                const { trial } = entry;
                if (afterDeviceChange !== null) {
                  expect(
                    afterDeviceChange,
                    "a trial after a device change came before a calibration and a correct check",
                  ).toEqual({ calibratedAgain: true, checked: true });
                  afterDeviceChange = null;
                }
                if (roomPause !== null) {
                  const { run: pausedRun } = roomPause;
                  if (roomPause.deviceChanged) {
                    // The first trial of a new run of the same room.
                    expect({
                      roomIndex: trial.roomIndex,
                      attempt: trial.attempt,
                      trialNumber: trial.trialNumber,
                    }).toEqual({
                      roomIndex: pausedRun.roomIndex,
                      attempt: pausedRun.attempt + 1,
                      trialNumber: 1,
                    });
                  } else {
                    // The trial the search was waiting on when the pause began.
                    expect({
                      roomIndex: trial.roomIndex,
                      attempt: trial.attempt,
                      trialNumber: trial.trialNumber,
                    }).toEqual({
                      roomIndex: pausedRun.roomIndex,
                      attempt: pausedRun.attempt,
                      trialNumber: roomPause.trialNumber,
                    });
                    const { waiting } = roomPause;
                    if (waiting !== null) {
                      expect({
                        kind: trial.kind,
                        ear: trial.ear,
                        levelDb: trial.levelDb,
                      }).toEqual({
                        kind: waiting.kind,
                        ear: waiting.ear,
                        levelDb: waiting.levelDb,
                      });
                    }
                  }
                  roomPause = null;
                }
                pending = trial;
                break;
              }
              case "action":
              case "stopReport":
                break;
            }
          }
          takeSchedulesUntil(schedules.length);

          const final = harness.flow.snapshot();
          expect(rulesShownCount).toBeLessThanOrEqual(1);
          if (final.stage !== "result") {
            return;
          }
          expect(rulesShownCount).toBe(1);
          const log = final.visitLog;
          const startMs = visitStartMs(entries);
          // No sound is scheduled inside any logged pause.
          for (const pause of log.pauses) {
            const inside = schedules.filter(
              (schedule) =>
                schedule.atMs - startMs > pause.startedAtMs &&
                schedule.atMs - startMs < pause.endedAtMs,
            );
            expect(inside).toEqual([]);
          }
          // The runs a device change stopped are the abandoned ones.
          expect(
            log.roomAttempts
              .filter((attempt) => attempt.ending === "abandoned")
              .map(runKey),
          ).toEqual(abandonedRuns);
        }),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});
