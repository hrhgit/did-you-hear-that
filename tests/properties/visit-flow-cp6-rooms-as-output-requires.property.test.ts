import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import type { RiseLimitScope } from "../../src/audio/output/create-audio-output";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { ghostSoundIds } from "../../src/config/sound-id";
import { roomSearchCapDb } from "../../src/session/room-search-cap";
import type { VisitRoom } from "../../src/session/visit-flow-types";
import { playVisit } from "../listeners/simulated-visitor";
import { visitRunArbitrary } from "./visit-flow-arbitraries";
import {
  createVisitHarness,
  roomRuns,
  type RecordedOutputCall,
} from "./visit-flow-harness";
import { observeVisit, type TimelineEntry } from "./visit-flow-timeline";

// CP6. Rooms start as the output stage requires (Universal; visit-flow design.md, CP6; R2.5,
// R3.2, R6.1, R6.2, R10.3, R13.2, R16.1; audio-output "What the visit-flow spec must do"). The
// harness's spy records every call the flow makes to the output shell. It does not record the
// calibration repeats, which the calibration controller plays; every calibration is followed by
// a headphone check, which it records. The visits render with the worst-case renderers (D26,
// audio-output D43).
//
// The property holds however the rooms run (one-room design.md, D1). One room at a time, every
// room begins a span of its own and every sound is that room's. In the one room, the searches that
// take turns begin one span between them, which holds each sound to its own last level on an ear
// (one-room design.md, D4), and every sound is the sound of the creature whose trial it is.
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Runs (design.md, Correctness properties). */
const runs = 50;
const timeoutMs = 120_000;

/** Whether a recorded call starts a sound or the span of a room. */
const isSoundOrBeginRoom = (call: RecordedOutputCall): boolean =>
  call.name === "play" ||
  call.name === "playHeadphoneCheck" ||
  call.name === "beginRoom";

/**
 * The last sound or `beginRoom` among the first `count` calls is a `beginRoom`, and its span holds
 * a rise as `riseLimitPer` says.
 */
function expectBeginRoomLast(
  calls: readonly RecordedOutputCall[],
  count: number,
  where: string,
  riseLimitPer: RiseLimitScope,
): void {
  const last = calls.slice(0, count).filter(isSoundOrBeginRoom).at(-1);
  expect(last?.name, where).toBe("beginRoom");
  if (last?.name === "beginRoom") {
    expect(last.riseLimitPer, where).toBe(riseLimitPer);
  }
}

describe("visit flow CP6. Rooms start as the output stage requires (Universal; R2.5, R3.2, R6, R13.2, R16.1)", () => {
  it.each(roomRuns)(
    "activates only in actions, plays trials only after a kept calibration and a correct check, and begins every room ($name)",
    async ({ roomsTogetherMaxCount, together }) => {
      // The sound trials that played the sound of a creature other than the first one still
      // about, over all the visits. One room at a time there is no other.
      let laterCreatureSoundCount = 0;
      await fc.assert(
        fc.asyncProperty(visitRunArbitrary(), async (visitRun) => {
          const harness = createVisitHarness({
            seed: visitRun.seed,
            performanceOffsetMs: visitRun.performanceOffsetMs,
            roomsTogetherMaxCount,
            spyOnOutput: true,
          });
          const timeline = observeVisit(harness);
          const run = await playVisit(timeline.driver, visitRun.script);
          expect(run.ending).toBe("done");
          const { entries } = timeline;
          const calls = harness.outputCalls;

          // `activate` only inside an action, within the call.
          const actionSpans = entries.flatMap((entry) =>
            entry.kind === "action"
              ? [[entry.outputCallCount, entry.after.outputCallCount] as const]
              : [],
          );
          calls.forEach((call, index) => {
            if (call.name === "activate") {
              expect(
                actionSpans.some(([from, to]) => from <= index && index < to),
                `activate at ${String(call.atMs)} in ${call.stage}`,
              ).toBe(true);
            }
          });

          // Trial sounds only after a kept calibration and a correct headphone check after it,
          // and again after a device change; every play is a trial or a practice sound of the room
          // under way (a practice sound is held to every limit of a trial; audible-start, light plan).
          let kept = false;
          let checked = false;
          let room: VisitRoom | null = null;
          // The rooms whose creatures are about: started, and not yet finished.
          const about = new Map<number, VisitRoom>();
          /** The room whose sound a trial of `roomIndex` plays. */
          const roomOfTrial = (roomIndex: number): VisitRoom | null =>
            together ? (about.get(roomIndex) ?? null) : room;
          let pointer = 0;
          const takeCallsUntil = (count: number): void => {
            for (; pointer < count; pointer += 1) {
              const call = calls[pointer];
              if (call === undefined) {
                return;
              }
              if (
                call.name === "keepCalibration" &&
                call.outcome.kind === "kept"
              ) {
                kept = true;
                checked = false;
              }
              if (call.name === "play") {
                expect(call.stage).toBe("room");
                // A reminder after a long quiet plays a creature's sound, and a chime after a
                // catch is the house's bell (the game layer, 2026-11-17).
                expect([
                  "trial",
                  "practice",
                  "reminder",
                  "chime",
                  "miss",
                ]).toContain(call.request.purpose);
                expect(
                  kept && checked,
                  `a trial sound at ${String(call.atMs)}`,
                ).toBe(true);
                if (call.request.purpose === "chime") {
                  expect(call.request.soundId).toBe("chime");
                } else if (call.request.purpose === "miss") {
                  expect(call.request.soundId).toBe("snuff");
                } else if (together) {
                  // The sound of a creature that is about. Whose trial it is, is checked below.
                  expect(
                    [...about.values()].map((one) => one.roomId),
                  ).toContain(call.request.soundId);
                } else {
                  expect(call.request.soundId).toBe(room?.roomId);
                }
              }
            }
          };
          let roomStartedCount = 0;
          // The room runs: the rooms that started in one step are one run.
          let runStartedCount = 0;
          const take = (
            entry: TimelineEntry,
            before: TimelineEntry | undefined,
          ): void => {
            takeCallsUntil(entry.outputCallCount);
            switch (entry.kind) {
              case "action":
                takeCallsUntil(entry.after.outputCallCount);
                if (
                  entry.name === "answerHeadphoneCheck" &&
                  entry.snapshotAfter.stage === "headphoneCheck" &&
                  entry.snapshotAfter.judgement === "correct" &&
                  entry.snapshotBefore.stage === "headphoneCheck" &&
                  entry.snapshotBefore.awaitingAnswer
                ) {
                  checked = kept;
                }
                return;
              case "event":
                if (entry.event.kind === "roomStarted") {
                  roomStartedCount += 1;
                  if (
                    before?.kind !== "event" ||
                    before.event.kind !== "roomStarted"
                  ) {
                    runStartedCount += 1;
                  }
                  room = entry.event.room;
                  about.set(room.roomIndex, room);
                  expectBeginRoomLast(
                    calls,
                    entry.outputCallCount,
                    `room ${String(room.roomIndex)}, run ${String(entry.event.attempt)}`,
                    together ? "sound" : "ear",
                  );
                }
                if (entry.event.kind === "roomFinished") {
                  about.delete(entry.event.room.roomIndex);
                }
                return;
              case "snapshot":
                if (entry.snapshot.pause?.reason === "deviceChanged") {
                  kept = false;
                  checked = false;
                }
                return;
              case "presented": {
                // The play just before a presented sound trial is its own, played as asked.
                if (entry.trial.kind !== "sound") {
                  return;
                }
                const play = calls[entry.outputCallCount - 1];
                expect(play?.name).toBe("play");
                if (play?.name !== "play") {
                  return;
                }
                // Its own room's sound: a creature that has started and has not gone home.
                const own = roomOfTrial(entry.trial.roomIndex);
                expect(own).not.toBeNull();
                expect(own?.roomIndex).toBe(entry.trial.roomIndex);
                if (entry.trial.roomIndex !== Math.min(...about.keys())) {
                  laterCreatureSoundCount += 1;
                }
                // An easy turn (headphone-traits R2) is a reminder sound, held by the search's
                // cap and floor, so its level may differ from the one it asked for.
                if (entry.trial.reminder === true) {
                  expect(play.request).toMatchObject({
                    soundId: own?.roomId,
                    ear: entry.trial.ear,
                    purpose: "reminder",
                  });
                  expect(play.outcome.kind).toBe("scheduled");
                  return;
                }
                expect(play.request).toEqual({
                  soundId: own?.roomId,
                  ear: entry.trial.ear,
                  levelDb: entry.trial.levelDb,
                  purpose: "trial",
                });
                expect(play.outcome.kind).toBe("scheduled");
                if (play.outcome.kind === "scheduled") {
                  expect(play.outcome.clampLimit).toBeNull();
                  expect(play.outcome.playedLevelDb).toBe(entry.trial.levelDb);
                }
                return;
              }
              case "practicePresented": {
                const play = calls[entry.outputCallCount - 1];
                expect(play?.name).toBe("play");
                if (play?.name !== "play" || entry.trial.kind !== "sound") {
                  return;
                }
                const own = roomOfTrial(entry.trial.roomIndex);
                expect(own).not.toBeNull();
                expect(own?.roomIndex).toBe(entry.trial.roomIndex);
                expect(play.request).toEqual({
                  soundId: own?.roomId,
                  ear: entry.trial.ear,
                  levelDb: entry.trial.levelDb,
                  purpose: "practice",
                });
                expect(play.outcome.kind).toBe("scheduled");
                return;
              }
              case "stopReport":
                return;
            }
          };
          entries.forEach((entry, index) => {
            take(entry, entries[index - 1]);
          });
          takeCallsUntil(calls.length);
          // One span for each room, one room at a time, and one for each room run of the one room.
          expect(calls.filter((call) => call.name === "beginRoom").length).toBe(
            together ? runStartedCount : roomStartedCount,
          );

          // Each run's cap is the room top of the calibration kept last before it began.
          const final = harness.flow.snapshot();
          if (final.stage !== "result") {
            return;
          }
          const log = final.visitLog;
          const keptReports = calls.flatMap((call) =>
            call.name === "keepCalibration" && call.outcome.kind === "kept"
              ? [call.outcome.rangeReport]
              : [],
          );
          expect(log.calibrations).toHaveLength(keptReports.length);
          log.calibrations.forEach((calibration, index) => {
            const report = keptReports[index];
            for (const soundId of ghostSoundIds) {
              expect(calibration.roomTopLevelDb[soundId]).toBe(
                report?.rooms[soundId].topLevelDb,
              );
            }
          });
          for (const attempt of log.roomAttempts) {
            const lastKept = log.calibrations
              .filter(
                (calibration) => calibration.keptAtMs <= attempt.startedAtMs,
              )
              .at(-1);
            expect(attempt.calibrationIndex).toBe(lastKept?.calibrationIndex);
            const roomId = log.rooms[attempt.roomIndex]?.roomId;
            expect(roomId).toBeDefined();
            if (lastKept === undefined || roomId === undefined) {
              continue;
            }
            expect(attempt.searchCapDb).toBe(
              roomSearchCapDb(
                lastKept.roomTopLevelDb[roomId],
                hearingMethodConfig,
              ),
            );
          }
        }),
        { numRuns: runs },
      );
      // In the one room the creatures took turns, or the checks above would be the old ones.
      if (together) {
        expect(laterCreatureSoundCount).toBeGreaterThan(runs);
      } else {
        expect(laterCreatureSoundCount).toBe(0);
      }
    },
    timeoutMs,
  );
});
