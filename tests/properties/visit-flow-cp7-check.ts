import { expect } from "vitest";
import type { PresentedTrial } from "../../src/session/create-visit-flow";
import type {
  Ear,
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
//
// `checkPausesDiscardAndRepeat` is the condition for rooms that run one after another.
// `checkPausesInOneRoom` is the same condition for the one room, where several searches take turns
// in one room run (one-room design.md, "The flow").

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

/** A side of a room that the roll call's round left uncaught. */
interface MissedSide {
  readonly roomIndex: number;
  readonly ear: Ear;
}

/**
 * A pause that began in the one room, until the next sound is presented, or until a pause begins
 * in the new runs that the pause's device change started.
 */
interface OneRoomPause {
  /** The runs of the creatures that were about when the pause began, in room order. */
  readonly runs: readonly Run[];
  /** The trial presented and not decided when the pause began, or null in a gap. */
  readonly waiting: PresentedTrial | null;
  /** The roll call the pause began in, or null when it began in the counting. */
  readonly practice: {
    /** The practice sound presented and not decided when the pause began, or null. */
    readonly waiting: PresentedTrial | null;
    /** The sides that did not catch their sound, in the order practised, when the pause is the not-heard notice. */
    readonly notHeard: readonly MissedSide[] | null;
  } | null;
  deviceChanged: boolean;
}

/** What the check of one visit met in the one room, for a property to count over its visits. */
export interface OneRoomPauseTally {
  /** The trials and practice sounds that a pause interrupted and that were presented again as they were. */
  readonly presentedAgainCount: number;
  /** The pauses that began in a gap of the counting and were followed by the trial its creature's search waited on. */
  readonly gapPauseCount: number;
  /** The room runs a change of device stopped. */
  readonly abandonedRunCount: number;
  /** The changes of device in the room that came after a creature had gone home, which stays there. */
  readonly restartsPastAGoneCreatureCount: number;
}

const sameRuns = (one: readonly Run[], other: readonly Run[]): boolean =>
  one.length === other.length &&
  one.every((run, index) => {
    const against = other[index];
    return against !== undefined && runKey(run) === runKey(against);
  });

/**
 * Checks CP7 for one visit played on `harness` with rooms that take turns in one room, given its
 * timeline `entries` and the visitor's `run`.
 *
 * While a pause holds, nothing is scheduled. A trial or a practice sound that a pause interrupts
 * is presented again as it was, by the same creature: the turn stays where it was through the
 * pause. A pause in a gap of the counting is followed by the trial that its creature's search was
 * waiting on. A pause in the roll call is followed by more of the roll call, by a new round that
 * starts with the first side that missed, after the not-heard notice, or by the first trial of a
 * search if the visitor goes on.
 *
 * A change of device in the room stops the run of every creature that is still about, and of no
 * other. After a calibration again and a correct headphone check, those creatures start their next
 * run with a roll call of their own, from its first sound. A creature that has gone home stays
 * there: its room starts no other run. The rules are shown once.
 */
export function checkPausesInOneRoom(
  harness: VisitHarness,
  entries: readonly TimelineEntry[],
  run: VisitorRun,
): OneRoomPauseTally {
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

  /** The run of each creature that is about, by room: started, and not yet gone home. */
  const about = new Map<number, Run>();
  /** The rooms whose creatures have gone home. */
  const gone = new Set<number>();
  /** The last run of each room, and whether a change of device stopped it. */
  const lastRunOf = new Map<number, { attempt: number; abandoned: boolean }>();
  const aboutRuns = (): Run[] =>
    [...about.values()].sort((one, other) => one.roomIndex - other.roomIndex);
  let pending: PresentedTrial | null = null;
  let pendingPractice: PresentedTrial | null = null;
  const lastDecidedNumber = new Map<string, number>();
  let roomPause: OneRoomPause | null = null;
  /** After a device change: whether a calibration again and then a correct check came. */
  let afterDeviceChange: {
    calibratedAgain: boolean;
    checked: boolean;
  } | null = null;
  const abandonedRuns: string[] = [];
  let previousStage: VisitStage | null = null;
  let rulesShownCount = 0;
  let presentedAgainCount = 0;
  let gapPauseCount = 0;
  let restartsPastAGoneCreatureCount = 0;

  /** The check every sound after a change of device has to meet first. */
  const expectReadyAgain = (what: string): void => {
    if (afterDeviceChange !== null) {
      expect(
        afterDeviceChange,
        `${what} after a device change came before a calibration and a correct check`,
      ).toEqual({ calibratedAgain: true, checked: true });
      afterDeviceChange = null;
    }
  };

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
          about.size > 0
        ) {
          const runsNow = aboutRuns();
          if (roomPause !== null && !sameRuns(roomPause.runs, runsNow)) {
            // New runs started after the pause roomPause holds and have presented nothing yet,
            // and now a pause begins in them. Only a device change may start new runs, and they
            // are the next runs of the same creatures. This pause belongs to the new runs, so a
            // device change now stops those too (regression 1, in the one room).
            expect(
              roomPause.deviceChanged,
              "new runs started in the room after a pause without a device change",
            ).toBe(true);
            expect(runsNow).toEqual(
              roomPause.runs.map((stopped) => ({
                roomIndex: stopped.roomIndex,
                attempt: stopped.attempt + 1,
              })),
            );
            roomPause = null;
          }
          if (roomPause === null) {
            const phase = snapshot.practice?.phase;
            roomPause = {
              runs: runsNow,
              waiting: pending,
              practice:
                phase === "practice" || phase === "notHeard"
                  ? {
                      waiting: pendingPractice,
                      notHeard:
                        snapshot.pause?.reason === "practiceNotHeard"
                          ? (snapshot.practice?.notHeard ?? []).map(
                              ({ room, ear }) => ({
                                roomIndex: room.roomIndex,
                                ear,
                              }),
                            )
                          : null,
                    }
                  : null,
              deviceChanged: false,
            };
          }
          pending = null;
          pendingPractice = null;
        }
        if (paused?.reason === "deviceChanged") {
          if (roomPause !== null && !roomPause.deviceChanged) {
            // Every creature that is still about has its run stopped, and no other.
            roomPause.deviceChanged = true;
            for (const stopped of roomPause.runs) {
              abandonedRuns.push(runKey(stopped));
              lastRunOf.set(stopped.roomIndex, {
                attempt: stopped.attempt,
                abandoned: true,
              });
            }
            if (gone.size > 0) {
              restartsPastAGoneCreatureCount += 1;
            }
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
          const { roomIndex } = entry.event.room;
          const { attempt } = entry.event;
          // A creature that has gone home stays there. A room starts again only as its next run,
          // after a change of device stopped the one before.
          expect(
            gone.has(roomIndex),
            `room ${String(roomIndex)} started again after its creature had gone home`,
          ).toBe(false);
          const last = lastRunOf.get(roomIndex);
          expect(attempt).toBe(last === undefined ? 1 : last.attempt + 1);
          if (last !== undefined) {
            expect(
              last.abandoned,
              `room ${String(roomIndex)} started run ${String(attempt)} while its last run was not stopped`,
            ).toBe(true);
          }
          lastRunOf.set(roomIndex, { attempt, abandoned: false });
          about.set(roomIndex, { roomIndex, attempt });
        }
        if (entry.event.kind === "roomFinished") {
          const { roomIndex } = entry.event.room;
          about.delete(roomIndex);
          gone.add(roomIndex);
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
        expectReadyAgain("a practice sound");
        const ownRun = { roomIndex: trial.roomIndex, attempt: trial.attempt };
        // Only a creature that is about is introduced, in its own run.
        expect(about.get(trial.roomIndex)).toEqual(ownRun);
        if (roomPause !== null) {
          const { practice } = roomPause;
          if (roomPause.deviceChanged) {
            // The roll call again from its first sound: the first creature that was still
            // about, in its next run.
            const firstStopped = roomPause.runs[0];
            expect({ ...ownRun, trialNumber: trial.trialNumber }).toEqual({
              roomIndex: firstStopped?.roomIndex,
              attempt: (firstStopped?.attempt ?? 0) + 1,
              trialNumber: 1,
            });
          } else {
            // Only a pause in the roll call is followed by more of it, in the same runs.
            expect(
              practice,
              "a practice sound after a pause in the counting",
            ).not.toBeNull();
            expect(roomPause.runs).toContainEqual(ownRun);
            if (practice?.waiting != null) {
              expect({
                ...ownRun,
                trialNumber: trial.trialNumber,
                ear: trial.ear,
                levelDb: trial.levelDb,
              }).toEqual({
                roomIndex: practice.waiting.roomIndex,
                attempt: practice.waiting.attempt,
                trialNumber: practice.waiting.trialNumber,
                ear: practice.waiting.ear,
                levelDb: practice.waiting.levelDb,
              });
              presentedAgainCount += 1;
            }
            if (practice?.notHeard != null) {
              // A new round, which starts with the first side that missed.
              expect({
                roomIndex: trial.roomIndex,
                ear: trial.ear,
                trialNumber: trial.trialNumber,
              }).toEqual({ ...practice.notHeard[0], trialNumber: 1 });
            }
          }
          roomPause = null;
        }
        pendingPractice = trial;
        break;
      }
      case "presented": {
        const { trial } = entry;
        expectReadyAgain("a trial");
        const ownRun = { roomIndex: trial.roomIndex, attempt: trial.attempt };
        // Only a creature that is about has a turn, in its own run.
        expect(about.get(trial.roomIndex)).toEqual(ownRun);
        if (roomPause !== null) {
          if (roomPause.deviceChanged) {
            // The first trial of the next run of a creature that was still about.
            expect(roomPause.runs).toContainEqual({
              roomIndex: trial.roomIndex,
              attempt: trial.attempt - 1,
            });
            expect(trial.trialNumber).toBe(1);
          } else if (roomPause.practice !== null) {
            // A pause in the roll call: the counting that follows starts each search from its
            // first trial.
            expect(roomPause.runs).toContainEqual(ownRun);
            expect(trial.trialNumber).toBe(1);
          } else {
            expect(roomPause.runs).toContainEqual(ownRun);
            const { waiting } = roomPause;
            if (waiting !== null) {
              // The trial that the pause interrupted, again as it was: the turn stays with its
              // creature through the pause.
              expect({
                ...ownRun,
                trialNumber: trial.trialNumber,
                kind: trial.kind,
                ear: trial.ear,
                levelDb: trial.levelDb,
              }).toEqual({
                roomIndex: waiting.roomIndex,
                attempt: waiting.attempt,
                trialNumber: waiting.trialNumber,
                kind: waiting.kind,
                ear: waiting.ear,
                levelDb: waiting.levelDb,
              });
              presentedAgainCount += 1;
            } else {
              // A pause in a gap: the trial its creature's search was waiting on.
              expect(trial.trialNumber).toBe(
                (lastDecidedNumber.get(runKey(ownRun)) ?? 0) + 1,
              );
              gapPauseCount += 1;
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

  const tally: OneRoomPauseTally = {
    presentedAgainCount,
    gapPauseCount,
    abandonedRunCount: abandonedRuns.length,
    restartsPastAGoneCreatureCount,
  };
  const final = harness.flow.snapshot();
  expect(rulesShownCount).toBeLessThanOrEqual(1);
  if (final.stage !== "result") {
    return tally;
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
  // The runs a device change stopped are the abandoned ones, and every other run finished.
  expect(
    log.roomAttempts
      .filter((attempt) => attempt.ending === "abandoned")
      .map(runKey),
  ).toEqual(abandonedRuns);
  expect(
    log.roomAttempts
      .filter((attempt) => attempt.ending === "finished")
      .map((attempt) => attempt.roomIndex)
      .sort((one, other) => one - other),
  ).toEqual(log.rooms.map((room) => room.roomIndex));
  return tally;
}
