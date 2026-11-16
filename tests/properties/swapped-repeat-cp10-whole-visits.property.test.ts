import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { createSeededRandom } from "../../src/config/seeded-random";
import { swappedRepeatCopy } from "../../src/copy/swapped-repeat-copy";
import type * as RepeatControllerModule from "../../src/session/create-swapped-repeat";
import type { SwappedRepeatOptions } from "../../src/session/create-swapped-repeat";
import { createVisitArchive } from "../../src/session/create-visit-archive";
import type {
  ResultPicture,
  VisitToSave,
} from "../../src/session/result-page-types";
import { resultPicture } from "../../src/session/result-picture";
import { swappedRepeatComparison } from "../../src/session/swapped-repeat-comparison";
import { swappedRepeatEngineSeed } from "../../src/session/swapped-repeat-engine-seed";
import type {
  ResultSnapshot,
  SwappedRepeat,
  VisitLog,
  VisitSnapshot,
} from "../../src/session/visit-flow-types";
import { createFakeStorageArea } from "../../src/storage/fake-storage-area";
import type { PsychometricListenerParameters } from "../listeners/psychometric-listener";
import { playVisit, type VisitDriver } from "../listeners/simulated-visitor";
import { fixedWallClock, storedEntries } from "./result-page-arbitraries";
import {
  attributionCaseArbitrary,
  type AttributionCase,
} from "./swapped-repeat-arbitraries";
import { acceptedAnswers } from "./swapped-repeat-oracle";
import {
  visitorSwappedRepeatBehaviourArbitrary,
  visitRunArbitrary,
  type VisitRun,
} from "./visit-flow-arbitraries";
import {
  createVisitHarness,
  type RecordedOutputCall,
  type VisitHarness,
} from "./visit-flow-harness";

// CP10. The repeat in whole visits (Universal; swapped-repeat design.md, CP10; R1, R8.7, R8.8, R9,
// R11, R12, R13, R20.6; brief, "Done when"). A visitor script of the visit flow's arbitraries,
// with a Step_Listener in Worn_Headphones of a drawn ear difference E and imbalance H and a
// swapped-repeat behaviour, is played through the visit flow's harness with `spyOnOutput`, so that
// the flow's own part of the repeat is checked. The visits render with the worst-case renderers
// (audio-output D43).
//
// The listener is a Step_Listener so that each estimate lies within one step of the truth
// (threshold-search CP1), which is what the oracle's tolerance needs (Q2, PROPOSED, NOT APPROVED).
// So that its answers stay those of a Step_Listener in a whole visit, every answer comes within
// the first half of its window with the time stamp of its press, and the script has no extra
// presses; its disturbances and the behaviour's events stay as drawn.
//
// The engine seed the flow draws when the room starts is read where the flow hands it over: the
// module of the Repeat_Controller is wrapped so that every controller the flow makes records the
// log it was given, its run number and each seed its `drawEngineSeed` gives (CP4's check of the
// flow's draw).
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

interface MadeRepeat {
  readonly log: VisitLog;
  readonly runNumber: number;
  readonly seeds: number[];
}

const madeRepeats = vi.hoisted(() => [] as MadeRepeat[]);

vi.mock("../../src/session/create-swapped-repeat", async (importOriginal) => {
  const actual = await importOriginal<typeof RepeatControllerModule>();
  return {
    ...actual,
    createSwappedRepeat: (options: SwappedRepeatOptions) => {
      const made: MadeRepeat = {
        log: options.log,
        runNumber: options.runNumber,
        seeds: [],
      };
      madeRepeats.push(made);
      return actual.createSwappedRepeat({
        ...options,
        drawEngineSeed: () => {
          const seed = options.drawEngineSeed();
          made.seeds.push(seed);
          return seed;
        },
      });
    },
  };
});

/** Runs (design.md, "Run counts and time": PROPOSED, NOT APPROVED, Q9). */
const runs = 30;
const timeoutMs = 120_000;

/** Seeds are drawn as `floor(u × 2³²)` (visit-flow D19). */
const seedRangeCount = 0x100000000;

/** Every answer comes within the first half of its window, so that none is late. */
const stepAnswerDelayMaxMs = hearingMethodConfig.responseWindowMs / 2;

/** The wall time of the save. */
const savedAt = Object.freeze({
  epochMs: 1795180800000,
  localDate: "2026-11-20",
});

type PlayCall = Extract<RecordedOutputCall, { readonly name: "play" }>;

const isPlay = (call: RecordedOutputCall): call is PlayCall =>
  call.name === "play";

const roundTrip = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** One run of CP10: a visit run whose script has the Step_Listener, the headphones and a behaviour. */
interface WholeVisitRun extends VisitRun {
  readonly attribution: AttributionCase;
}

const wholeVisitRunArbitrary: fc.Arbitrary<WholeVisitRun> = fc
  .record({
    run: visitRunArbitrary({ withEnding: false }),
    attribution: attributionCaseArbitrary,
    behaviour: visitorSwappedRepeatBehaviourArbitrary,
  })
  .map(({ run, attribution, behaviour }) => {
    const { earDifferenceDb, imbalanceDb, baseDb } = attribution;
    const parameters: PsychometricListenerParameters = {
      trueThresholdDb: {
        left: baseDb - earDifferenceDb / 2,
        right: baseDb + earDifferenceDb / 2,
      },
      widthDb: 0,
      lapseFraction: 0,
      falseAlarmFraction: 0,
      wrongSideFraction: 0,
    };
    return {
      ...run,
      attribution,
      script: {
        ...run.script,
        listener: {
          kind: "psychometric" as const,
          parameters,
          seed: run.script.visitorSeed,
        },
        answerDelayMaxMs: stepAnswerDelayMaxMs,
        timeStampModes: ["now" as const],
        extraPresses: [],
        headphones: { imbalanceDb },
        swappedRepeat: behaviour,
      },
    };
  });

/** The visit flow's harness as the visitor's driver, able to refuse activation for a scripted press. */
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

/** The engine seed of repeat run `runNumber`, drawn from the visit's source by visit-flow D19 and R7.3, written out. */
function nextDrawOf(log: VisitLog, runNumber: number): number {
  const source = createSeededRandom(log.visitSeed);
  const draw = (): number => Math.floor(source.next() * seedRangeCount);
  draw(); // the visit's render seed
  for (const attempt of log.roomAttempts) {
    expect(draw()).toBe(attempt.engineSeed);
  }
  draw(); // the replay's render seed
  for (let earlier = 1; earlier < runNumber; earlier += 1) {
    draw();
  }
  return draw();
}

/** The picture of a live result, on the date of the save, without an earlier visit. */
const livePicture = (visit: VisitToSave): ResultPicture =>
  resultPicture({
    kind: "live",
    visit,
    localDate: savedAt.localDate,
    earlierVisit: null,
  });

/** The picture with one floor's repeat taken out and its offer as in `plain`. */
function withoutRepeat(
  picture: ResultPicture,
  plain: ResultPicture,
  roomIndex: number,
): ResultPicture {
  return {
    ...picture,
    floors: picture.floors.map((floor, index) =>
      index === roomIndex
        ? {
            ...floor,
            repeat: null,
            swappedRepeat: plain.floors[index]!.swappedRepeat,
          }
        : floor,
    ),
  };
}

/** The times from the start of each pause of the stage to its end, from the snapshots the flow published. */
function stagePausesMs(
  harness: VisitHarness,
): readonly { readonly fromMs: number; readonly toMs: number }[] {
  const pauses: { fromMs: number; toMs: number }[] = [];
  let fromMs: number | null = null;
  for (const { atMs, snapshot } of harness.snapshots) {
    const paused =
      snapshot.stage === "swappedRepeat" && snapshot.pause !== null;
    if (paused && fromMs === null) {
      fromMs = atMs;
    } else if (!paused && fromMs !== null) {
      pauses.push({ fromMs, toMs: atMs });
      fromMs = null;
    }
  }
  if (fromMs !== null) {
    pauses.push({ fromMs, toMs: Number.POSITIVE_INFINITY });
  }
  return pauses;
}

describe("swapped repeat CP10. The repeat in whole visits (Universal; R1, R8.7, R8.8, R9, R11, R12, R13, R20.6)", () => {
  it(
    "reaches the result with the same log and summary, records a finished repeat whose answer the oracle accepts, draws it beside its floor, plays only after a press, draws the next seed of the visit, and saves and reads its records back",
    async () => {
      await fc.assert(
        fc.asyncProperty(wholeVisitRunArbitrary, async (visitRun) => {
          madeRepeats.length = 0;
          const behaviour = visitRun.script.swappedRepeat!;
          const harness = createVisitHarness({
            seed: visitRun.seed,
            performanceOffsetMs: visitRun.performanceOffsetMs,
            spyOnOutput: true,
          });
          let lastResult: ResultSnapshot | null = null;
          let before: ResultSnapshot | null = null;
          let logCopy: VisitLog | null = null;
          const views: SwappedRepeat[] = [];
          harness.flow.subscribe((snapshot: VisitSnapshot) => {
            if (snapshot.stage === "result" && before === null) {
              lastResult = snapshot;
            }
            if (snapshot.stage === "swappedRepeat") {
              if (before === null) {
                before = lastResult;
                logCopy = structuredClone(snapshot.visitLog);
              }
              views.push(snapshot.repeat);
            }
          });
          const run = await playVisit(driverOf(harness), visitRun.script);
          expect(run.ending).toBe("done");

          // The visit reaches its result.
          const final = harness.flow.snapshot();
          expect(final.stage).toBe("result");
          if (final.stage !== "result") {
            throw new Error("The visit did not reach its result.");
          }
          const log = final.visitLog;
          const { summary } = final;
          const offered = summary.rooms.flatMap((room, index) =>
            room.swappedRepeatOffered ? [index] : [],
          );
          const roomIndex = run.swappedRepeatRoomIndex;
          const plain = livePicture({ visitLog: log, summary });
          const picture = livePicture(final);
          const { earDifferenceDb, imbalanceDb } = visitRun.attribution;

          // Every presented trial names its earpiece: its own ear's in the rooms of the visit, the
          // other one in the repeat (R8.7).
          for (const trial of run.presentedTrials) {
            const own = trial.kind === "sound" ? trial.ear : null;
            const other =
              own === null ? null : own === "left" ? "right" : "left";
            if (trial.swappedRepeatRunNumber === null) {
              expect(trial.earpiece).toBe(own);
            } else {
              expect(trial.swappedRepeatRunNumber).toBe(1);
              expect(trial.earpiece).toBe(other);
            }
          }
          // No pause of the stage is in the log (R14.10).
          expect(
            log.pauses.some((pause) => pause.stage === "swappedRepeat"),
          ).toBe(false);

          const entered: ResultSnapshot | null = before;
          if (entered === null) {
            // The visitor named no floor that opens the stage: nothing of a repeat anywhere.
            if (behaviour.floor.kind !== "notOffered") {
              expect(offered).toEqual([]);
              expect(roomIndex).toBeNull();
            } else {
              expect(
                roomIndex === null ? true : !offered.includes(roomIndex),
              ).toBe(true);
            }
            expect(madeRepeats).toEqual([]);
            expect(final.swappedRepeats).toEqual([]);
            expect(final.turnBackLine).toBeNull();
            expect(picture).toEqual(plain);
            expect(
              harness.outputCalls.filter(
                (call) => call.stage === "swappedRepeat",
              ),
            ).toEqual([]);
          } else {
            const stageEntered: ResultSnapshot = entered;
            expect(roomIndex).not.toBeNull();
            expect(offered).toContain(roomIndex);
            // The result holds the same log and summary objects, the log unchanged (R8.8).
            expect(log).toBe(stageEntered.visitLog);
            expect(summary).toBe(stageEntered.summary);
            expect(log).toEqual(logCopy);

            // The turn-back line once the stage got past `unavailable` (R9.1, R9.2).
            expect(final.turnBackLine).toBe(
              views.some((view) => view.phase !== "unavailable")
                ? swappedRepeatCopy.turnBackLine
                : null,
            );

            const finished = views.find(
              (view) => view.phase === "finished" && view.ending === "finished",
            );
            if (finished !== undefined && finished.phase === "finished") {
              // One record of that floor, whose answer the oracle accepts (R11.1, R11.4, CP1).
              expect(final.swappedRepeats).toHaveLength(1);
              const record = final.swappedRepeats[0]!;
              expect(record.roomIndex).toBe(roomIndex);
              expect(record.runNumber).toBe(1);
              const firstRun = summary.rooms[roomIndex!]!;
              const accepted = acceptedAnswers({
                earDifferenceDb,
                imbalanceDb,
                first: firstRun,
                repeat: record,
              });
              expect(
                accepted.has(record.outcome),
                `E ${String(earDifferenceDb)} dB, H ${String(imbalanceDb)} dB: first run ${JSON.stringify(
                  [firstRun.left, firstRun.right].map((ear) =>
                    ear.state === "found" ? ear.thresholdDb : ear.state,
                  ),
                )}, repeat ${JSON.stringify(
                  [record.left, record.right].map((ear) =>
                    ear.state === "found" ? ear.thresholdDb : ear.state,
                  ),
                )}, ${record.outcome}; accepted ${JSON.stringify([...accepted])}`,
              ).toBe(true);

              // Beside its floor, with no offer there, and every other field as without it (R12).
              const comparison = swappedRepeatComparison(
                firstRun,
                record,
                hearingMethodConfig.floorDb,
              );
              expect(finished.comparison).toEqual(comparison);
              expect(picture.floors[roomIndex!]!.repeat).toEqual(comparison);
              expect(picture.floors[roomIndex!]!.swappedRepeat).toBeNull();
              expect(plain.floors[roomIndex!]!.swappedRepeat).not.toBeNull();
              expect(withoutRepeat(picture, plain, roomIndex!)).toEqual(plain);
            } else {
              // A repeat that did not finish leaves no record, and the offer stays (R11.5, D11).
              expect(final.swappedRepeats).toEqual([]);
              expect(picture).toEqual(plain);
            }

            // The engine seed is the next draw of the visit's source (CP4, R7.3).
            expect(madeRepeats).toHaveLength(1);
            const made = madeRepeats[0]!;
            expect(made.log).toBe(log);
            expect(made.runNumber).toBe(1);
            expect(made.seeds.length).toBeLessThanOrEqual(1);
            if (made.seeds.length === 1) {
              const seed = made.seeds[0]!;
              expect(seed).toBe(nextDrawOf(log, 1));
              expect(seed).toBe(swappedRepeatEngineSeed(log, 1));
            }
            if (final.swappedRepeats.length === 1) {
              expect(made.seeds).toEqual([
                final.swappedRepeats[0]!.attempt.engineSeed,
              ]);
            }

            // Every sound of the stage is a check or a trial, and none comes before its press
            // (R17.1, CP5).
            const calls = harness.outputCalls;
            const stageCalls = calls.filter(
              (call) => call.stage === "swappedRepeat",
            );
            const stageActions = harness.actions.filter(
              (action) => action.stageBefore === "swappedRepeat",
            );
            for (const call of stageCalls) {
              if (isPlay(call)) {
                expect(call.request.purpose).toBe("trial");
              }
              if (call.name === "playHeadphoneCheck") {
                expect(call.cause).toBe("action");
                expect(
                  stageActions.some(
                    (action) =>
                      action.name === "playSwapCheck" &&
                      action.atMs === call.atMs,
                  ),
                ).toBe(true);
              }
            }
            const firstTrial = stageCalls.find(isPlay);
            const firstStart = stageActions.find(
              (action) => action.name === "startSwappedRoom",
            );
            if (firstTrial !== undefined) {
              expect(firstStart).toBeDefined();
              expect(firstTrial.atMs).toBeGreaterThanOrEqual(firstStart!.atMs);
              // beginRoom after the last check and before the first trial (R17.4).
              const trialAt = calls.indexOf(firstTrial);
              const lastIndexBefore = (
                name: RecordedOutputCall["name"],
              ): number => {
                for (let index = trialAt - 1; index >= 0; index -= 1) {
                  if (calls[index]!.name === name) {
                    return index;
                  }
                }
                return -1;
              };
              const lastCheckAt = lastIndexBefore("playHeadphoneCheck");
              const beginRoomAt = lastIndexBefore("beginRoom");
              expect(beginRoomAt).toBeGreaterThan(lastCheckAt);
            }
            const firstScheduled = harness.schedules.find(
              (schedule) => schedule.stage === "swappedRepeat",
            );
            if (firstScheduled !== undefined) {
              const firstPress = stageActions.find(
                (action) =>
                  action.name === "playSwapCheck" ||
                  action.name === "startSwappedRoom",
              );
              expect(firstPress).toBeDefined();
              expect(firstScheduled.atMs).toBeGreaterThanOrEqual(
                firstPress!.atMs,
              );
            }
            // While a pause of the stage holds, nothing is asked to play (R14.3, R14.4).
            for (const { fromMs, toMs } of stagePausesMs(harness)) {
              expect(
                stageCalls.filter(
                  (call) =>
                    (isPlay(call) || call.name === "playHeadphoneCheck") &&
                    call.atMs > fromMs &&
                    call.atMs < toMs,
                ),
              ).toEqual([]);
            }
          }

          // Saved with an archive on a fake storage area and read back (R13.1, R13.3).
          const area = createFakeStorageArea();
          const archive = createVisitArchive({
            localStorage: () => area,
            wallClock: fixedWallClock(savedAt),
            seed: visitRun.seed,
            mode: "keep",
          });
          const saved = archive.save(final, "Buds");
          expect(saved.saved).toBe(true);
          expect(archive.savedCopyLacksRepeats(final)).toBe(false);
          const listed = archive.list().visits;
          expect(listed).toHaveLength(1);
          expect(listed[0]!.visit.swappedRepeats).toEqual(
            roundTrip(final.swappedRepeats),
          );
          const entries = storedEntries(area.items()) as
            { readonly payloadJson: string }[] | null;
          expect(entries).toHaveLength(1);
          if (final.swappedRepeats.length === 0) {
            // Written exactly as before this spec.
            expect(entries![0]!.payloadJson).toBe(
              JSON.stringify({
                formatVersion: 1,
                floorDb: hearingMethodConfig.floorDb,
                swappedRepeatDifferenceDb:
                  hearingMethodConfig.swappedRepeatDifferenceDb,
                summary,
                visitLog: log,
              }),
            );
          }
        }),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});
