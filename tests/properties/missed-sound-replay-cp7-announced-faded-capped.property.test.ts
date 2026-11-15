import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { audioOutputConfig } from "../../src/config/audio-output-config";
import { audioSafetyConfig } from "../../src/config/audio-safety-config";
import { missedSoundReplayConfig } from "../../src/config/missed-sound-replay-config";
import { measureFadeLengths } from "../../src/audio/synth/measure/fade-lengths";
import { announcementLines } from "../../src/copy/replay-lines";
import { replaySoundOf } from "../../src/session/replay-sound";
import {
  missedLogArbitrary,
  replayScriptArbitrary,
} from "./missed-sound-replay-arbitraries";
import {
  createReplayHarness,
  expectedPlanIndexes,
  interruptionsAfter,
  pageTimesOf,
  playCompleted,
} from "./missed-sound-replay-harness";

// CP7. Every replayed sound is announced, faded and within the cap (Universal; missed-sound-replay
// design.md, CP7; R4.4, R4.6, R6, R7, R15.3, R15.4). For a drawn visit log with at least one miss
// and a replay script, every backend `schedule` call of the run came after the press of
// `startReplay` that started the replay, whose last published view before it was `announcing`
// with all four announcement lines; it plays on its ear only, with exact zeros on the other
// channel; it stays within the ceiling and the longest duration and fades in and out over at
// least the shortest fade; it is the next sound of the plan, or the same one again after a cut or
// a refusal, at its asked level and played at that level with no clamp; it starts at least one gap
// after the end of the sound before; and its `replaySoundStarted` event comes at its start.
//
// The end of a sound that was cut is the end of the stop fade that cut it, when that comes before
// its own end: the stop fade of `stopFadeMs` starts on the audio clock when the stop comes.
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Runs (design.md, "Run counts and time"). */
const runs = 300;
const timeoutMs = 120_000;
/** How long the harness runs on after the script's last entry. */
const tailMs = 60_000;

const { ceilingFraction, fadeMinMs, ghostSoundMaxDurationMs } =
  audioSafetyConfig;
const { stopFadeMs } = audioOutputConfig;
const { replayGapMs, replayRaiseDb } = missedSoundReplayConfig;

describe("missed-sound replay CP7: every replayed sound is announced, faded and within the cap", () => {
  it(
    "plays each planned sound after the announcement and the press, on its ear, faded, within the ceiling and at its asked level",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          missedLogArbitrary,
          replayScriptArbitrary,
          async ({ log }, script) => {
            const delayMs = script.outputDelayMs;
            const harness = await createReplayHarness({
              log,
              outputDelayMs: delayMs,
            });
            const { plan } = harness.controller;
            await harness.run(script, tailMs);

            // The press: the action whose step first shows `playing`.
            const firstPlaying = harness.steps.find(
              (step) => step.view?.phase === "playing",
            );
            if (firstPlaying === undefined) {
              expect(harness.plays).toEqual([]);
              expect(harness.schedules).toEqual([]);
              return;
            }
            expect(firstPlaying.cause).toMatchObject({
              kind: "action",
              name: "startReplay",
            });
            const press = harness.actions
              .filter((action) => action.seq < firstPlaying.seq)
              .at(-1)!;
            expect(press.name).toBe("startReplay");
            const shownBefore = harness.steps
              .filter((step) => step.published && step.seq < press.seq)
              .at(-1);
            expect(shownBefore?.view).toMatchObject({
              phase: "announcing",
              announcementLines: announcementLines(replayRaiseDb),
            });
            expect(
              shownBefore?.view?.phase === "announcing" &&
                shownBefore.view.announcementLines,
            ).toHaveLength(4);

            const indexes = expectedPlanIndexes(harness, delayMs);
            let endBeforeMs: number | null = null;
            harness.plays.forEach((play, playIndex) => {
              const planned = plan.sounds[indexes[playIndex]!];
              expect(planned).toBeDefined();
              if (planned === undefined) {
                return;
              }
              expect(play.seq).toBeGreaterThan(firstPlaying.seq);
              expect(play.withRenderSource).toBe(true);
              expect(play.request).toEqual({
                soundId: planned.room.roomId,
                ear: planned.ear,
                levelDb: planned.askedLevelDb,
                purpose: "replay",
              });
              expect(planned.askedLevelDb).toBeLessThanOrEqual(
                planned.replayCapDb,
              );
              if (play.outcome.kind !== "scheduled") {
                return;
              }
              // At or below the room top the output stage plays the level asked (audio-output R9.4).
              expect(play.outcome.playedLevelDb).toBe(planned.askedLevelDb);
              expect(play.outcome.clampLimit).toBeNull();
              expect(play.outcome.playedLevelDb).toBeLessThanOrEqual(
                planned.replayCapDb,
              );

              const schedule = harness.schedules[play.scheduleIndex!]!;
              expect(schedule.seq).toBeLessThan(play.seq);
              expect(schedule.seq).toBeGreaterThan(press.seq);
              const own =
                planned.ear === "left" ? schedule.left : schedule.right;
              const other =
                planned.ear === "left" ? schedule.right : schedule.left;
              expect(own.some((sample) => sample !== 0)).toBe(true);
              expect(other.every((sample) => Object.is(sample, 0))).toBe(true);
              let peak = 0;
              for (const sample of own) {
                peak = Math.max(peak, Math.abs(sample));
              }
              expect(peak).toBeLessThanOrEqual(ceilingFraction);
              expect(
                (own.length / schedule.sampleRateHz) * 1000,
              ).toBeLessThanOrEqual(ghostSoundMaxDurationMs);
              const fades = measureFadeLengths(own, schedule.sampleRateHz);
              expect(fades.fadeInMs).toBeGreaterThanOrEqual(fadeMinMs);
              expect(fades.fadeOutMs).toBeGreaterThanOrEqual(fadeMinMs);

              const times = pageTimesOf(play, delayMs)!;
              if (endBeforeMs !== null) {
                expect(times.startPageMs).toBeGreaterThanOrEqual(
                  endBeforeMs + replayGapMs,
                );
              }
              const cut = interruptionsAfter(harness, play.seq).find(
                (interruption) => interruption.atMs < times.endPageMs,
              );
              endBeforeMs = playCompleted(harness, play, delayMs)
                ? times.endPageMs
                : Math.min(times.endPageMs, cut!.atMs + stopFadeMs + delayMs);

              // The event of this sound, when it started before anything cut it.
              const nextPlaySeq =
                harness.plays[playIndex + 1]?.seq ?? Number.POSITIVE_INFINITY;
              const ownEvents = harness.events.filter(
                (event) => event.seq > play.seq && event.seq < nextPlaySeq,
              );
              const startedBeforeCut =
                cut === undefined || cut.atMs >= times.startPageMs;
              expect(ownEvents).toHaveLength(startedBeforeCut ? 1 : 0);
              const started = ownEvents[0];
              if (started === undefined) {
                return;
              }
              expect(started.atMs).toBe(times.startPageMs);
              expect(started.event).toEqual({
                kind: "replaySoundStarted",
                sound: replaySoundOf(
                  planned,
                  play.outcome,
                  indexes[playIndex]! + 1,
                  plan.sounds.length,
                ),
              });
              if (started.event.sound.playedLevelDb < planned.raisedLevelDb) {
                expect(started.event.sound.capChangedLevel).toBe(true);
              }
            });
            // Every backend schedule call after the stage was entered is one of these plays.
            expect(
              harness.backendCalls().filter((call) => call.kind === "schedule"),
            ).toHaveLength(harness.schedules.length);
            expect(
              harness.plays.filter((play) => play.scheduleIndex !== null),
            ).toHaveLength(harness.schedules.length);
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});
