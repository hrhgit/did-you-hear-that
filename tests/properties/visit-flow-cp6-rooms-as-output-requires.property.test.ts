import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { ghostSoundIds } from "../../src/config/sound-id";
import { roomSearchCapDb } from "../../src/session/room-search-cap";
import type { VisitRoom } from "../../src/session/visit-flow-types";
import { playVisit } from "../listeners/simulated-visitor";
import { visitRunArbitrary } from "./visit-flow-arbitraries";
import {
  createVisitHarness,
  type RecordedOutputCall,
} from "./visit-flow-harness";
import { observeVisit, type TimelineEntry } from "./visit-flow-timeline";

// CP6. Rooms start as the output stage requires (Universal; visit-flow design.md, CP6; R2.5,
// R3.2, R6.1, R6.2, R10.3, R13.2, R16.1; audio-output "What the visit-flow spec must do"). The
// harness's spy records every call the flow makes to the output shell. It does not record the
// calibration repeats, which the calibration controller plays; every calibration is followed by
// a headphone check, which it records. The visits render with the worst-case renderers (D26,
// audio-output D43).
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

/** The last sound or `beginRoom` among the first `count` calls is a `beginRoom`. */
function expectBeginRoomLast(
  calls: readonly RecordedOutputCall[],
  count: number,
  where: string,
): void {
  const last = calls.slice(0, count).filter(isSoundOrBeginRoom).at(-1);
  expect(last?.name, where).toBe("beginRoom");
}

describe("visit flow CP6. Rooms start as the output stage requires (Universal; R2.5, R3.2, R6, R13.2, R16.1)", () => {
  it(
    "activates only in actions, plays trials only after a kept calibration and a correct check, and begins every room and the replay",
    async () => {
      await fc.assert(
        fc.asyncProperty(visitRunArbitrary(), async (visitRun) => {
          const harness = createVisitHarness({
            seed: visitRun.seed,
            performanceOffsetMs: visitRun.performanceOffsetMs,
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
          // and again after a device change; every play is a trial of the room under way.
          let kept = false;
          let checked = false;
          let room: VisitRoom | null = null;
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
                expect(call.request.purpose).toBe("trial");
                expect(
                  kept && checked,
                  `a trial sound at ${String(call.atMs)}`,
                ).toBe(true);
                expect(call.request.soundId).toBe(room?.roomId);
              }
            }
          };
          let roomStartedCount = 0;
          let replayReached = false;
          const take = (entry: TimelineEntry): void => {
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
                  room = entry.event.room;
                  expectBeginRoomLast(
                    calls,
                    entry.outputCallCount,
                    `room ${String(room.roomIndex)}, run ${String(entry.event.attempt)}`,
                  );
                }
                return;
              case "snapshot":
                if (entry.snapshot.pause?.reason === "deviceChanged") {
                  kept = false;
                  checked = false;
                }
                if (
                  entry.snapshot.stage === "missedSoundReplay" &&
                  !replayReached
                ) {
                  replayReached = true;
                  expectBeginRoomLast(
                    calls,
                    entry.outputCallCount,
                    "the replay",
                  );
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
                expect(play.request).toEqual({
                  soundId: room?.roomId,
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
              case "stopReport":
                return;
            }
          };
          for (const entry of entries) {
            take(entry);
          }
          takeCallsUntil(calls.length);
          expect(calls.filter((call) => call.name === "beginRoom").length).toBe(
            roomStartedCount + (replayReached ? 1 : 0),
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
    },
    timeoutMs,
  );
});
