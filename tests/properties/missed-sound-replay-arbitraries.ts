import fc from "fast-check";
import { audioOutputConfig } from "../../src/config/audio-output-config";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import type { VisitType } from "../../src/config/hearing-method-config";
import { missedSoundReplayConfig } from "../../src/config/missed-sound-replay-config";
import type { RandomSource } from "../../src/config/seeded-random";
import { createSeededRandom } from "../../src/config/seeded-random";
import { ghostSoundIds } from "../../src/config/sound-id";
import type { GhostSoundId } from "../../src/config/sound-id";
import { calibrationSettingTopDb } from "../../src/audio/output/calibration-setting-top";
import type { ClampLimit } from "../../src/audio/output/output-types";
import { rangeReport } from "../../src/audio/output/range-report";
import { decibelsToGain } from "../../src/audio/synth/decibels-to-gain";
import type { ReplayPlanSettings } from "../../src/session/missed-sound-replay-plan";
import { roomSearchCapDb } from "../../src/session/room-search-cap";
import type {
  Ear,
  LoggedCalibration,
  LoggedRoomAttempt,
  VisitLog,
  VisitTrial,
} from "../../src/session/visit-flow-types";
import { visitRooms } from "../../src/session/visit-rooms";

// The arbitraries of the missed-sound replay's properties (missed-sound-replay design.md,
// "Correctness properties"): drawn visit logs and most counts. Task 9 adds the replay scripts and
// the refusal scripts.
//
// A visit log is drawn as a plan, whose structure fast-check draws and shrinks: the visit type,
// the calibrations and their tops, the runs of each room, how many trials each run has, and the
// log's shares of no-sound trials and of misses. The details of each trial (its ear, its level,
// its outcome, whether it was clamped or discarded) are drawn from a seeded source per run, whose
// seed is part of the plan, so that a log of hundreds of trials costs a few fast-check values and
// every counterexample replays from the plan alone.

const { floorDb, startingLevelDb, upwardStepDb } = hearingMethodConfig;
const { calibrationSettingKeepMinDb, calibrationSettingStepDb } =
  audioOutputConfig;

/** The fewest and most calibrations of a drawn log. */
export const calibrationMinCount = 1;
export const calibrationMaxCount = 3;
/** The most abandoned runs before a room's finished run. */
export const abandonedRunMaxCount = 2;
/** The most trials of one room run. */
export const runTrialMaxCount = 60;
/** The largest share of no-sound trials of a log. */
export const noSoundShareMaxFraction = 0.3;
/** The range of the tops drawn freely, one log in five. */
export const freeTopMinDb = -10;
export const freeTopMaxDb = 20;
/** One sound trial in this many is played lower than asked, with a clamp limit. */
export const clampedOneInCount = 20;
/** One trial in this many is discarded and followed by its scored copy. */
export const discardedOneInCount = 20;
/** The most a clamp lowers a level, in dB. */
export const clampMaxDb = 10;
/** The most counts given through the settings, drawn from 2 to this. */
export const drawnMostMaxCount = 80;

/** The time from one logged trial to the next. */
const trialStepMs = 3000;

const clampLimits: readonly ClampLimit[] = ["anchorCap", "rise", "ceiling"];

const seedArbitrary = fc.integer({ min: 0, max: 0xffffffff });

const visitTypeArbitrary: fc.Arbitrary<VisitType> = fc.constantFrom(
  "quick",
  "full",
);

/** A setting on the control's grid from the Keep_Minimum to the top (−40 to −4 dB with the shipped config). */
const calibrationSettingArbitrary: fc.Arbitrary<number> = fc
  .integer({
    min: 0,
    max: Math.floor(
      (calibrationSettingTopDb() - calibrationSettingKeepMinDb) /
        calibrationSettingStepDb,
    ),
  })
  .map(
    (steps) => calibrationSettingKeepMinDb + steps * calibrationSettingStepDb,
  );

const freeTopsArbitrary: fc.Arbitrary<Record<GhostSoundId, number>> = fc
  .array(fc.double({ min: freeTopMinDb, max: freeTopMaxDb, noNaN: true }), {
    minLength: ghostSoundIds.length,
    maxLength: ghostSoundIds.length,
  })
  .map(
    (levels) =>
      Object.fromEntries(
        ghostSoundIds.map((soundId, index) => [soundId, levels[index]!]),
      ) as Record<GhostSoundId, number>,
  );

/** A share from 0 to `max` in thousandths of `max`, with both ends drawn often. */
function shareArbitrary(max: number): fc.Arbitrary<number> {
  return fc.oneof(
    { arbitrary: fc.constant(0), weight: 1 },
    { arbitrary: fc.constant(max), weight: 1 },
    {
      arbitrary: fc
        .integer({ min: 0, max: 1000 })
        .map((perMille) => (max * perMille) / 1000),
      weight: 4,
    },
  );
}

/** One run of a room in a plan: how many trials it has and the seed of their details. */
export interface RunPlan {
  readonly trialCount: number;
  readonly seed: number;
}

/** The runs of one room: abandoned runs, then a finished one unless the room has none. */
export interface RoomRunsPlan {
  readonly abandoned: readonly RunPlan[];
  readonly finished: RunPlan | null;
}

/** What a drawn visit log holds. */
export interface VisitLogPlan {
  readonly visitType: VisitType;
  readonly visitSeed: number;
  /** The kept settings, in order. */
  readonly calibrationSettingsDb: readonly number[];
  /** When not null, the tops of every calibration, drawn freely; otherwise those of `rangeReport`. */
  readonly freeTops: readonly Record<GhostSoundId, number>[] | null;
  /** One entry per room of the visit type. */
  readonly rooms: readonly RoomRunsPlan[];
  readonly noSoundShareFraction: number;
  readonly missShareFraction: number;
}

const runPlanArbitrary: fc.Arbitrary<RunPlan> = fc.record({
  trialCount: fc.integer({ min: 0, max: runTrialMaxCount }),
  seed: seedArbitrary,
});

const roomRunsArbitrary = (withFinished: boolean): fc.Arbitrary<RoomRunsPlan> =>
  fc.record({
    abandoned: fc.array(runPlanArbitrary, { maxLength: abandonedRunMaxCount }),
    finished: withFinished ? runPlanArbitrary : fc.constant(null),
  });

/** A visit log plan. One log in five has free tops; one in ten has a room with no finished run. */
export const visitLogPlanArbitrary: fc.Arbitrary<VisitLogPlan> =
  visitTypeArbitrary.chain((visitType) => {
    const roomCount = visitRooms(visitType).length;
    return fc
      .record({
        calibrationSettingsDb: fc.array(calibrationSettingArbitrary, {
          minLength: calibrationMinCount,
          maxLength: calibrationMaxCount,
        }),
        useFreeTops: fc.integer({ min: 1, max: 5 }).map((pick) => pick === 1),
        // A room index, or −1 for none: one log in ten has a room with no finished run.
        roomWithoutFinished: fc.oneof(
          { arbitrary: fc.constant(-1), weight: 9 },
          { arbitrary: fc.integer({ min: 0, max: roomCount - 1 }), weight: 1 },
        ),
      })
      .chain(({ calibrationSettingsDb, useFreeTops, roomWithoutFinished }) =>
        fc.record({
          visitType: fc.constant(visitType),
          visitSeed: seedArbitrary,
          calibrationSettingsDb: fc.constant(calibrationSettingsDb),
          freeTops: useFreeTops
            ? fc.array(freeTopsArbitrary, {
                minLength: calibrationSettingsDb.length,
                maxLength: calibrationSettingsDb.length,
              })
            : fc.constant(null),
          rooms: fc.tuple(
            ...Array.from({ length: roomCount }, (_, roomIndex) =>
              roomRunsArbitrary(roomIndex !== roomWithoutFinished),
            ),
          ),
          noSoundShareFraction: shareArbitrary(noSoundShareMaxFraction),
          missShareFraction: shareArbitrary(1),
        }),
      );
  });

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}

const pick = <T>(random: RandomSource, items: readonly T[]): T =>
  items[Math.floor(random.next() * items.length)]!;

const oneIn = (random: RandomSource, count: number): boolean =>
  Math.floor(random.next() * count) === 0;

/** The levels the search can ask for in a run of this cap: the 5 dB grid from the floor to the cap. */
function gridLevelsDb(searchCapDb: number): number[] {
  const lowest = Math.ceil((floorDb - startingLevelDb) / upwardStepDb);
  const highest = Math.floor((searchCapDb - startingLevelDb) / upwardStepDb);
  const levels: number[] = [];
  for (let step = lowest; step <= highest; step += 1) {
    levels.push(startingLevelDb + step * upwardStepDb);
  }
  return levels;
}

/** The visit log of a plan, frozen like the recorder's logs. */
export function visitLogOf(plan: VisitLogPlan): VisitLog {
  const rooms = visitRooms(plan.visitType);
  const calibrations: LoggedCalibration[] = plan.calibrationSettingsDb.map(
    (settingDb, calibrationIndex) => {
      const report = rangeReport(decibelsToGain(settingDb));
      const roomTopLevelDb =
        plan.freeTops?.[calibrationIndex] ??
        (Object.fromEntries(
          ghostSoundIds.map((soundId) => [
            soundId,
            report.rooms[soundId].topLevelDb,
          ]),
        ) as Record<GhostSoundId, number>);
      return {
        calibrationIndex,
        settingDb,
        roomTopLevelDb: { ...roomTopLevelDb },
        keptAtMs: calibrationIndex * 1000,
      };
    },
  );
  const roomAttempts: LoggedRoomAttempt[] = [];
  const trials: VisitTrial[] = [];
  let calibrationIndex = 0;
  let nowMs = 10_000;

  const playRun = (
    roomIndex: number,
    attempt: number,
    run: RunPlan,
    ending: "finished" | "abandoned",
  ): void => {
    const room = rooms[roomIndex]!;
    const calibration = calibrations[calibrationIndex]!;
    const searchCapDb = roomSearchCapDb(
      calibration.roomTopLevelDb[room.roomId],
      hearingMethodConfig,
    );
    const levels = gridLevelsDb(searchCapDb);
    const random = createSeededRandom(run.seed);
    const startedAtMs = nowMs;
    for (let trialNumber = 1; trialNumber <= run.trialCount; trialNumber += 1) {
      const isSound =
        levels.length > 0 && random.next() >= plan.noSoundShareFraction;
      const ear: Ear = random.next() < 0.5 ? "left" : "right";
      const requestedLevelDb = isSound ? pick(random, levels) : null;
      const clamped = isSound && oneIn(random, clampedOneInCount);
      const playedLevelDb =
        requestedLevelDb === null
          ? null
          : clamped
            ? requestedLevelDb - (random.next() * clampMaxDb + 0.1)
            : requestedLevelDb;
      const clampLimit = clamped ? pick(random, clampLimits) : null;
      const discarded = oneIn(random, discardedOneInCount);
      const outcomeDraw = random.next();
      const answerDraw = random.next();
      const copies = discarded ? 2 : 1;
      for (let copy = 0; copy < copies; copy += 1) {
        nowMs += trialStepMs;
        const common = {
          order: trials.length + 1,
          roomIndex,
          attempt,
          trialNumber,
          gapBeforeMs: 2000,
          presentedAtMs: nowMs,
          windowStartMs: nowMs + 50,
        };
        const soundPart =
          requestedLevelDb !== null && playedLevelDb !== null
            ? {
                kind: "sound" as const,
                ear,
                requestedLevelDb,
                playedLevelDb,
                clampLimit,
              }
            : null;
        const noSoundPart = {
          kind: "noSound" as const,
          ear: null,
          requestedLevelDb: null,
          playedLevelDb: null,
          clampLimit: null,
        };
        if (copy === 0 && discarded) {
          trials.push({
            ...common,
            ...(soundPart ?? noSoundPart),
            status: "discarded",
            discardedAtMs: nowMs + 400,
          });
          continue;
        }
        const scoredAtMs = nowMs + 700;
        if (soundPart === null) {
          const falseAlarm = answerDraw < 0.5;
          trials.push({
            ...common,
            ...noSoundPart,
            status: "scored",
            response: falseAlarm ? ear : "none",
            outcome: falseAlarm ? "falseAlarm" : "noResponse",
            answeredAtMs: falseAlarm ? scoredAtMs : null,
            responseTimeMs: falseAlarm ? 650 : null,
            scoredAtMs,
          });
          continue;
        }
        const other: Ear = ear === "left" ? "right" : "left";
        const outcome =
          outcomeDraw < plan.missShareFraction
            ? ("missed" as const)
            : answerDraw < 0.75
              ? ("caught" as const)
              : ("wrongSide" as const);
        const response =
          outcome === "missed" ? "none" : outcome === "caught" ? ear : other;
        trials.push({
          ...common,
          ...soundPart,
          status: "scored",
          response,
          outcome,
          answeredAtMs: response === "none" ? null : scoredAtMs,
          responseTimeMs: response === "none" ? null : 650,
          scoredAtMs: response === "none" ? nowMs + 2050 : scoredAtMs,
        });
      }
    }
    nowMs += trialStepMs;
    roomAttempts.push({
      roomIndex,
      attempt,
      engineSeed: run.seed,
      calibrationIndex,
      searchCapDb,
      startedAtMs,
      endedAtMs: nowMs,
      ending,
      result: null,
    });
  };

  plan.rooms.forEach((roomRuns, roomIndex) => {
    let attempt = 0;
    for (const run of roomRuns.abandoned) {
      attempt += 1;
      playRun(roomIndex, attempt, run, "abandoned");
      // A device change abandoned the run; the room runs again under the next calibration.
      calibrationIndex = Math.min(
        calibrationIndex + 1,
        calibrations.length - 1,
      );
    }
    if (roomRuns.finished !== null) {
      attempt += 1;
      playRun(roomIndex, attempt, roomRuns.finished, "finished");
    }
  });

  return deepFreeze({
    formatVersion: 1,
    visitType: plan.visitType,
    visitSeed: plan.visitSeed,
    rooms,
    calibrations,
    headphoneChecks: [],
    roomAttempts,
    trials,
    ignoredAnswers: [],
    pauses: [],
    refusedPlays: [],
  });
}

/** A drawn visit log, with the plan it was made from. */
export interface DrawnVisitLog {
  readonly plan: VisitLogPlan;
  readonly log: VisitLog;
}

export const visitLogArbitrary: fc.Arbitrary<DrawnVisitLog> =
  visitLogPlanArbitrary.map((plan) => ({ plan, log: visitLogOf(plan) }));

/**
 * A most count: null for the shipped `replaySoundsMaxCount`, which the plan reads by default, or
 * a whole number from 2 to 80 given through the settings parameter, so that the properties hold
 * whatever the owner chooses in Q1.
 */
export const mostCountArbitrary: fc.Arbitrary<number | null> = fc.oneof(
  fc.constant(null),
  fc.integer({ min: 2, max: drawnMostMaxCount }),
);

/** The settings that give the plan this most count, or undefined for the shipped settings. */
export function planSettingsOf(
  mostCount: number | null,
): ReplayPlanSettings | undefined {
  return mostCount === null
    ? undefined
    : {
        capRelativeToAnchorDb: hearingMethodConfig.capRelativeToAnchorDb,
        replayRaiseDb: missedSoundReplayConfig.replayRaiseDb,
        replaySoundsMaxCount: mostCount,
      };
}
