import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { createSeededRandom } from "../../src/config/seeded-random";
import { replayCopy } from "../../src/copy/replay-copy";
import type * as ReplayControllerModule from "../../src/session/create-missed-sound-replay";
import type { MissedSoundReplayOptions } from "../../src/session/create-missed-sound-replay";
import { planMissedSoundReplay } from "../../src/session/missed-sound-replay-plan";
import { replayRenderSeed } from "../../src/session/replay-render-seed";
import { summarizeVisit } from "../../src/session/summarize-visit";
import type {
  MissedSoundReplaySnapshot,
  VisitLog,
} from "../../src/session/visit-flow-types";
import { playVisit, type VisitDriver } from "../listeners/simulated-visitor";
import { replayVisitRunArbitrary } from "./visit-flow-arbitraries";
import {
  createVisitHarness,
  type RecordedOutputCall,
  type VisitHarness,
} from "./visit-flow-harness";

// CP10. The replay at the end of whole visits (Universal; missed-sound-replay design.md, CP10;
// R1, R7.1, R13.3, R13.4, R14.2, R15.1, R17.6; brief, "Done when"). A visitor script of the
// visit flow's arbitraries, with a replay behaviour added, is played through the visit flow's
// harness with `spyOnOutput`, so that the flow's own part of the replay is checked. The visits
// render with the worst-case renderers (audio-output D43).
//
// The seed the flow draws on entering the stage is read where the flow hands it over: the module
// of the Replay_Controller is wrapped so that every controller the flow makes records the seed of
// its render source and the log it was given, and then is made as before.
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

const madeReplays = vi.hoisted(
  () => [] as { readonly seed: number; readonly log: VisitLog }[],
);

vi.mock(
  "../../src/session/create-missed-sound-replay",
  async (importOriginal) => {
    const actual = await importOriginal<typeof ReplayControllerModule>();
    return {
      ...actual,
      createMissedSoundReplay: (options: MissedSoundReplayOptions) => {
        madeReplays.push({ seed: options.random.seed, log: options.log });
        return actual.createMissedSoundReplay(options);
      },
    };
  },
);

/** Runs (design.md, "Run counts and time": PROPOSED, NOT APPROVED, Q7). */
const runs = 30;
const timeoutMs = 120_000;

/** Seeds are drawn as `floor(u × 2³²)` (visit-flow D19). */
const seedRangeCount = 0x100000000;

type PlayCall = Extract<RecordedOutputCall, { readonly name: "play" }>;

const isPlay = (call: RecordedOutputCall): call is PlayCall =>
  call.name === "play";

/** The visit flow's harness as the visitor's driver, able to refuse activation for a replay script. */
const driverOf = (harness: VisitHarness): VisitDriver => ({
  flow: harness.flow,
  now: () => harness.now(),
  nextDueMs: () => harness.nextDueMs(),
  advanceTo: (atMs) => harness.advanceTo(atMs),
  settle: () => harness.settle(),
  fireOutputEvent: (kind) => harness.fireOutputEvent(kind),
  onTrialPresented: (listener) => harness.onTrialPresented(listener),
  refuseActivation: (refused) =>
    harness.backend.setUserActivationActive(!refused),
});

/** The times at which a pause of the replay began, from the snapshots the flow published. */
function replayPauseStartsMs(harness: VisitHarness): readonly number[] {
  const starts: number[] = [];
  let paused = false;
  for (const { atMs, snapshot } of harness.snapshots) {
    const now =
      snapshot.stage === "missedSoundReplay" && snapshot.pause !== null;
    if (now && !paused) {
      starts.push(atMs);
    }
    paused = now;
  }
  return starts;
}

/**
 * The index in the plan's sounds that each replayed play must ask for, written from R7.1, R11.3
 * and R12.3 and not from the controller: the first play asks for the first sound; a play asks for
 * the next sound after a play that was scheduled, whose sound started (its `replaySoundStarted`
 * event) and that no pause cut before its end; and for the same sound again otherwise.
 */
function expectedPlanIndexes(
  harness: VisitHarness,
  plays: readonly PlayCall[],
): readonly number[] {
  const pauseStarts = replayPauseStartsMs(harness);
  const started = harness.events.filter(
    (entry) => entry.event.kind === "replaySoundStarted",
  );
  const indexes: number[] = [];
  let index = 0;
  plays.forEach((play, position) => {
    if (position > 0) {
      const before = plays[position - 1]!;
      const event = started.find(
        (entry) => entry.atMs >= before.atMs && entry.atMs <= play.atMs,
      );
      const ran =
        before.outcome.kind === "scheduled" &&
        event !== undefined &&
        !pauseStarts.some(
          (atMs) =>
            before.outcome.kind === "scheduled" &&
            atMs >= event.atMs &&
            atMs < event.atMs + (before.outcome.endMs - before.outcome.startMs),
        );
      index = ran ? index + 1 : index;
    }
    indexes.push(index);
  });
  return indexes;
}

describe("missed-sound replay CP10. The replay at the end of whole visits (Universal; R1, R7.1, R13.3, R13.4, R14.2, R15.1, R17.6)", () => {
  it(
    "reaches the result with the same log, plays only the plan with the Purpose replay after beginRoom, draws the render seed of the log, and keeps its pauses out of the log",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          replayVisitRunArbitrary({ withEnding: false }),
          async (visitRun) => {
            madeReplays.length = 0;
            const harness = createVisitHarness({
              seed: visitRun.seed,
              performanceOffsetMs: visitRun.performanceOffsetMs,
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
            const run = await playVisit(driverOf(harness), visitRun.script);
            expect(run.ending).toBe("done");

            // The result holds the same log object, unchanged, and its summary (R13.4, R13.5).
            const final = harness.flow.snapshot();
            expect(final.stage).toBe("result");
            if (final.stage !== "result" || entered === null) {
              throw new Error(
                "The visit did not pass the replay to its result.",
              );
            }
            const replayStage: MissedSoundReplaySnapshot = entered;
            const log = final.visitLog;
            expect(log).toBe(replayStage.visitLog);
            expect(log).toEqual(logCopy);
            expect(final.summary).toEqual(summarizeVisit(log));

            // The seed drawn on entering (R14.2, CP6): after the visit's render seed and the
            // logged engine seeds, and equal to replayRenderSeed of the log.
            expect(madeReplays).toHaveLength(1);
            expect(madeReplays[0]!.log).toBe(log);
            const source = createSeededRandom(log.visitSeed);
            const draw = (): number =>
              Math.floor(source.next() * seedRangeCount);
            draw();
            for (const attempt of log.roomAttempts) {
              expect(draw()).toBe(attempt.engineSeed);
            }
            const drawnSeed = madeReplays[0]!.seed;
            expect(drawnSeed).toBe(draw());
            expect(drawnSeed).toBe(replayRenderSeed(log));

            // Every play of the stage is a replay, and no replay is played elsewhere (R15.1).
            const calls = harness.outputCalls;
            const plays = calls.filter(isPlay);
            for (const play of plays) {
              expect(play.request.purpose === "replay").toBe(
                play.stage === "missedSoundReplay",
              );
            }
            const replayPlays = plays.filter(
              (play) => play.request.purpose === "replay",
            );

            // Each is a sound of the plan, in the order CP7 states (R7.1).
            const plan = planMissedSoundReplay(log);
            const indexes = expectedPlanIndexes(harness, replayPlays);
            replayPlays.forEach((play, position) => {
              const planned = plan.sounds[indexes[position]!];
              expect(
                planned,
                `replayed play ${String(position)}`,
              ).toBeDefined();
              expect(play.request).toEqual({
                soundId: planned!.room.roomId,
                ear: planned!.ear,
                levelDb: planned!.askedLevelDb,
                purpose: "replay",
              });
            });

            // beginRoom after the last trial and before the first replayed play (visit-flow R16.1).
            let lastTrial = -1;
            calls.forEach((call, position) => {
              if (isPlay(call) && call.request.purpose === "trial") {
                lastTrial = position;
              }
            });
            const beginRoom = calls.findIndex(
              (call, position) =>
                position > lastTrial && call.name === "beginRoom",
            );
            expect(beginRoom).toBeGreaterThan(lastTrial);
            const firstReplay = calls.findIndex(
              (call) => isPlay(call) && call.request.purpose === "replay",
            );
            if (firstReplay >= 0) {
              expect(beginRoom).toBeLessThan(firstReplay);
            }

            // While a pause of the replay holds, the snapshot says so and nothing proceeds; no
            // pause of the stage is in the log (R11.7, R11.9).
            for (const { snapshot } of harness.snapshots) {
              if (
                snapshot.stage !== "missedSoundReplay" ||
                snapshot.pause === null
              ) {
                continue;
              }
              const { reason } = snapshot.pause;
              expect(["hidden", "interrupted"]).toContain(reason);
              expect(snapshot.canProceed).toBe(false);
              expect(snapshot.replay).toMatchObject({
                phase: "playing",
                canSkip: false,
                pauseLine:
                  reason === "hidden" || reason === "interrupted"
                    ? replayCopy.pauseLines[reason]
                    : null,
              });
            }
            expect(
              log.pauses.some((pause) => pause.stage === "missedSoundReplay"),
            ).toBe(false);
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});
