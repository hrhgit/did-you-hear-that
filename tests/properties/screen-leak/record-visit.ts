import {
  createSeededRandom,
  type RandomSource,
} from "../../../src/config/seeded-random";
import {
  playVisit,
  type VisitorDisturbance,
  type VisitorRun,
  type VisitorScript,
  type VisitorSwappedRepeatBehaviour,
  type VisitorSwappedRepeatEvent,
  type VisitorSwappedRepeatFloor,
} from "../../listeners/simulated-visitor";
import { createVisitHarness } from "../visit-flow-harness";
import { createScreenRecorder, type ScreenRecord } from "./screen-record";

/**
 * Plays whole visits on the fake backend and the manual timer, with a simulated visitor, and
 * keeps a record of what the interface would have drawn meanwhile. The files that use it replace
 * the synth's render functions with the worst-case renderers through `vi.mock`, as the visit
 * flow's own properties do.
 */

export interface RecordedVisit {
  readonly record: ScreenRecord;
  readonly run: VisitorRun;
}

/**
 * Plays one visit of `script` on a flow seeded with `flowSeed` and records the screen.
 * `roomsTogetherMaxCount` is how many rooms' searches take turns in one room run (one-room
 * design.md, D1): 1 for the rooms one after another, the shipped count for the one room.
 */
export async function recordVisit(
  flowSeed: number,
  script: VisitorScript,
  roomsTogetherMaxCount: number,
): Promise<RecordedVisit> {
  const harness = createVisitHarness({
    seed: flowSeed,
    performanceOffsetMs: 0,
    roomsTogetherMaxCount,
  });
  const recorder = createScreenRecorder(() => harness.now());
  // The same three things the page's entry does, in the same order: events, then snapshots,
  // then the first snapshot.
  harness.flow.onEvent((event) => {
    recorder.event(event);
  });
  harness.flow.subscribe((snapshot) => {
    recorder.snapshot(snapshot);
  });
  recorder.snapshot(harness.flow.snapshot());
  // What the page never gets: which trial was presented, and when.
  harness.onTrialPresented((trial) => {
    // A practice sound is not a trial: the page may show that it is playing, since nothing of it
    // counts (audible-start, light plan). Its side is still never shown, which `screenOfSnapshot`
    // keeps to.
    // A reminder after a long quiet (the game layer, 2026-11-17) is no trial either: what it
    // draws at its decision is the visitor's own answer to a sound they heard.
    if (trial.practice === true || trial.reminder === true) {
      return;
    }
    recorder.presented({
      kind: trial.kind,
      ear: trial.ear,
      roomIndex: trial.roomIndex,
      attempt: trial.attempt,
      inSwappedRepeat: trial.swappedRepeatRunNumber !== null,
    });
  });
  const run = await playVisit(harness, script);
  return { record: recorder.record(), run };
}

export interface VisitorScriptOptions {
  /** With disturbances the visitor pauses, hides the page, has the sound interrupted and changes device. */
  readonly disturbed: boolean;
  /**
   * With a swapped repeat, one ear needs sounds 20 to 30 dB louder than the other, so that every
   * floor offers the repeat, and the visitor repeats one floor after the result: swapped, the
   * check answered as heard, the room answered through the headphones, and back to the picture.
   * Disturbed, the repeat is also paused, hidden or interrupted, and resumed.
   */
  readonly swappedRepeat?: boolean;
}

/**
 * A visitor for a quick visit, drawn from `seed`: thresholds anywhere a room can reach, a wide
 * range of attention, answers that sometimes come after the window has shut, and a visitor who
 * may answer silence often, so that the house says its line about no sound.
 */
export function visitorScriptOf(
  seed: number,
  options: VisitorScriptOptions,
): VisitorScript {
  const random = createSeededRandom(seed);
  const between = (min: number, max: number): number =>
    min + random.next() * (max - min);
  const whole = (min: number, max: number): number =>
    Math.floor(between(min, max + 1));
  const withRepeat = options.swappedRepeat === true;
  const disturbances: VisitorDisturbance[] = [];
  if (options.disturbed) {
    const kinds = ["pause", "hidden", "interrupted", "deviceChanged"] as const;
    const count = whole(1, 4);
    for (let index = 0; index < count; index += 1) {
      disturbances.push({
        atMs: between(20_000, 240_000),
        kind: kinds[whole(0, kinds.length - 1)] ?? "pause",
        resumeAfterMs: between(0, 10_000),
      });
    }
  }
  // A visit without a repeat draws exactly what it drew before the repeat existed, in the same
  // order, so the fixed seeds of the predictor give the same visits.
  // From the Keep_Minimum (audible-start D25) up.
  const calibrationTargetDb = whole(-27, -10);
  let trueThresholdDb: { left: number; right: number };
  if (withRepeat) {
    // Both ears above the Search_Floor and below the cap (audible-start R12.5), far enough apart
    // for the floor to offer the repeat.
    const louderEarThresholdDb = between(-28, -22);
    const quieterEarThresholdDb = louderEarThresholdDb + between(15, 22);
    trueThresholdDb =
      random.next() < 0.5
        ? { left: quieterEarThresholdDb, right: louderEarThresholdDb }
        : { left: louderEarThresholdDb, right: quieterEarThresholdDb };
  } else {
    trueThresholdDb = { left: between(-55, 5), right: between(-55, 5) };
  }
  const widthDb = between(1, 8);
  const lapseFraction = between(0, 0.1);
  // A visitor who answers silence often makes the ears of a floor unreliable, and such a floor
  // offers no repeat, so a visitor with a repeat answers silence less.
  const falseAlarmFraction = between(0, 0.5) * (withRepeat ? 0.2 : 1);
  const wrongSideFraction = between(0, 0.1);
  const listenerSeed = whole(0, 0xffffffff);
  const visitorSeed = whole(0, 0xffffffff);
  const repeat = withRepeat
    ? {
        headphones: { imbalanceDb: between(-6, 6) },
        swappedRepeat: swappedRepeatOf(random, options.disturbed),
      }
    : {};
  return {
    visitType: "quick",
    calibrationTargetDb,
    firstHeadphoneCheckAnswer: "left",
    listener: {
      kind: "psychometric",
      parameters: {
        trueThresholdDb,
        widthDb,
        lapseFraction,
        falseAlarmFraction,
        wrongSideFraction,
      },
      seed: listenerSeed,
    },
    visitorSeed,
    answerDelayMaxMs: 2500,
    timeStampModes: ["now"],
    restMaxMs: 5000,
    extraPresses: [],
    disturbances,
    ending: null,
    ...repeat,
  };
}

/** The visitor's swapped repeat in a recorded visit, drawn from `random`. */
function swappedRepeatOf(
  random: RandomSource,
  disturbed: boolean,
): VisitorSwappedRepeatBehaviour {
  const floors: readonly VisitorSwappedRepeatFloor[] = [
    { kind: "firstOffered" },
    { kind: "lastOffered" },
    { kind: "drawnOffered", fraction: Math.floor(random.next() * 1000) / 1000 },
  ];
  const events: VisitorSwappedRepeatEvent[] = [];
  if (disturbed) {
    const kinds = ["pause", "hidden", "interrupted"] as const;
    const count = 1 + Math.floor(random.next() * 3);
    for (let index = 0; index < count; index += 1) {
      events.push({
        atMs: Math.floor(random.next() * 120_000),
        action: kinds[Math.floor(random.next() * kinds.length)] ?? "pause",
        resumeAfterMs: Math.floor(random.next() * 10_000),
      });
    }
  }
  return {
    floor: floors[Math.floor(random.next() * floors.length)] ?? {
      kind: "firstOffered",
    },
    swapsOnFirstInstruction: true,
    firstCheckAnswer: "heard",
    pressDelayMaxMs: 3000,
    events,
    turnsBack: random.next() < 0.5,
  };
}

/**
 * Plays `count` visits, numbered from `firstSeed`, with `roomsTogetherMaxCount` rooms taking turns
 * in one room run, and gives their records.
 */
export async function recordVisits(
  firstSeed: number,
  count: number,
  options: VisitorScriptOptions,
  roomsTogetherMaxCount: number,
): Promise<ScreenRecord[]> {
  const records: ScreenRecord[] = [];
  for (let index = 0; index < count; index += 1) {
    const seed = firstSeed + index;
    const visit = await recordVisit(
      seed,
      visitorScriptOf(seed + 1_000_000, options),
      roomsTogetherMaxCount,
    );
    records.push(visit.record);
  }
  return records;
}
