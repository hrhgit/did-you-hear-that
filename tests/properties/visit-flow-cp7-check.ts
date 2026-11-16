import { expect } from "vitest";
import type { PresentedTrial } from "../../src/session/create-visit-flow";
import type {
  VisitPause,
  VisitStage,
} from "../../src/session/visit-flow-types";
import type { VisitorRun } from "../listeners/simulated-visitor";
import type { VisitHarness } from "./visit-flow-harness";
import { visitStartMs, type TimelineEntry } from "./visit-flow-timeline";

// The condition of CP7 for one visit (visit-flow design.md, CP7; R12.3 to R12.7, R13.1 to R13.3,
// R21.3). The property file checks it for every drawn visit, and the regression file for the
// visits of its CP7 cases.
//
// A room practises before it counts (audible-start, light plan of 2026-11-16). A pause in the
// practice is followed by the practice sound it interrupted, or, after a practice sound was not
// heard, by a new round for the side that missed it, or by the first counted trial if the visitor
// goes on; a new run after a device change practises again from its first practice sound.

/** A room run. */
interface Run {
  readonly roomIndex: number;
  readonly attempt: number;
}

const runKey = (run: Run): string =>
  `${String(run.roomIndex)}:${String(run.attempt)}`;

/**
 * A pause that began in a room, until the next trial is presented, or until a pause begins in a
 * new run of the room that the pause's device change started.
 */
interface RoomPause {
  readonly run: Run;
  /** The trial presented and not decided when the pause began, or null in a gap. */
  readonly waiting: PresentedTrial | null;
  /** The practice the pause began in, or null when it began in the counting. */
  readonly practice: {
    /** The practice sound presented and not decided when the pause began, or null. */
    readonly waiting: PresentedTrial | null;
    /** The sides that did not catch the practice, when the pause is the not-heard notice. */
    readonly notHeardEars: readonly string[] | null;
  } | null;
  /** The number of the trial the search waits on. */
  readonly trialNumber: number;
  deviceChanged: boolean;
}

/**
 * Checks CP7 for one visit played on `harness`, given its timeline `entries` and the visitor's
 * `run`: while a pause holds, nothing is scheduled; after a pause in a room with the calibration
 * still kept, the next presentation is the trial the search was waiting on; after a device change
 * in a room, the attempt is abandoned and the next room trial is the first of a new attempt of the
 * same room, after a calibration again and a correct headphone check; the rules are shown once.
 */
export function checkPausesDiscardAndRepeat(
  harness: VisitHarness,
  entries: readonly TimelineEntry[],
  run: VisitorRun,
): void {
  expect(run.ending).toBe("done");
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
  let pendingPractice: PresentedTrial | null = null;
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
          if (
            roomPause !== null &&
            runKey(roomPause.run) !== runKey(currentRun)
          ) {
            // A new run of the room started after the pause roomPause holds and has presented no
            // trial yet, and now a pause begins in it. Only a device change may start a new run,
            // and that run is the next attempt of the same room. This pause belongs to the new
            // run, so a device change now stops that run too (regression 1).
            expect(
              roomPause.deviceChanged,
              "a new run of a room started after a pause without a device change",
            ).toBe(true);
            expect(currentRun).toEqual({
              roomIndex: roomPause.run.roomIndex,
              attempt: roomPause.run.attempt + 1,
            });
            roomPause = null;
          }
          if (roomPause === null) {
            const phase = snapshot.practice?.phase;
            roomPause = {
              run: currentRun,
              waiting: pending,
              practice:
                phase === "practice" || phase === "notHeard"
                  ? {
                      waiting: pendingPractice,
                      notHeardEars:
                        snapshot.pause?.reason === "practiceNotHeard"
                          ? (snapshot.practice?.notHeardEars ?? [])
                          : null,
                    }
                  : null,
              trialNumber:
                pending?.trialNumber ??
                (lastDecidedNumber.get(runKey(currentRun)) ?? 0) + 1,
              deviceChanged: false,
            };
          }
          pending = null;
          pendingPractice = null;
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
        if (entry.event.kind === "practiceSoundScored") {
          pendingPractice = null;
        }
        break;
      case "practicePresented": {
        const { trial } = entry;
        if (afterDeviceChange !== null) {
          expect(
            afterDeviceChange,
            "a practice sound after a device change came before a calibration and a correct check",
          ).toEqual({ calibratedAgain: true, checked: true });
          afterDeviceChange = null;
        }
        if (roomPause !== null) {
          const { run: pausedRun, practice } = roomPause;
          if (roomPause.deviceChanged) {
            // A new run of the same room practises again from its first practice sound.
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
            // Only a pause in the practice is followed by more practice, in the same run.
            expect(
              practice,
              "a practice sound after a pause in the counting",
            ).not.toBeNull();
            expect({
              roomIndex: trial.roomIndex,
              attempt: trial.attempt,
            }).toEqual(pausedRun);
            if (practice?.waiting != null) {
              expect({
                trialNumber: trial.trialNumber,
                ear: trial.ear,
                levelDb: trial.levelDb,
              }).toEqual({
                trialNumber: practice.waiting.trialNumber,
                ear: practice.waiting.ear,
                levelDb: practice.waiting.levelDb,
              });
            }
            if (practice?.notHeardEars != null) {
              expect(practice.notHeardEars).toContain(trial.ear);
            }
          }
          roomPause = null;
        }
        pendingPractice = trial;
        break;
      }
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
          } else if (roomPause.practice !== null) {
            // A pause in the practice: the counting that follows starts from its first trial.
            expect({
              roomIndex: trial.roomIndex,
              attempt: trial.attempt,
              trialNumber: trial.trialNumber,
            }).toEqual({ ...pausedRun, trialNumber: 1 });
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
}
