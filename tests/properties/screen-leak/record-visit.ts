import { createSeededRandom } from "../../../src/config/seeded-random";
import {
  playVisit,
  type VisitorDisturbance,
  type VisitorRun,
  type VisitorScript,
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

/** Plays one visit of `script` on a flow seeded with `flowSeed` and records the screen. */
export async function recordVisit(
  flowSeed: number,
  script: VisitorScript,
): Promise<RecordedVisit> {
  const harness = createVisitHarness({
    seed: flowSeed,
    performanceOffsetMs: 0,
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
    recorder.presented({
      kind: trial.kind,
      ear: trial.ear,
      roomIndex: trial.roomIndex,
      attempt: trial.attempt,
    });
  });
  const run = await playVisit(harness, script);
  return { record: recorder.record(), run };
}

export interface VisitorScriptOptions {
  /** With disturbances the visitor pauses, hides the page, has the sound interrupted and changes device. */
  readonly disturbed: boolean;
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
  return {
    visitType: "quick",
    calibrationTargetDb: whole(-40, -10),
    firstHeadphoneCheckAnswer: "left",
    listener: {
      kind: "psychometric",
      parameters: {
        trueThresholdDb: { left: between(-55, 5), right: between(-55, 5) },
        widthDb: between(1, 8),
        lapseFraction: between(0, 0.1),
        falseAlarmFraction: between(0, 0.5),
        wrongSideFraction: between(0, 0.1),
      },
      seed: whole(0, 0xffffffff),
    },
    visitorSeed: whole(0, 0xffffffff),
    answerDelayMaxMs: 2500,
    timeStampModes: ["now"],
    restMaxMs: 5000,
    extraPresses: [],
    disturbances,
    ending: null,
  };
}

/** Plays `count` visits, numbered from `firstSeed`, and joins their records into one. */
export async function recordVisits(
  firstSeed: number,
  count: number,
  options: VisitorScriptOptions,
): Promise<ScreenRecord[]> {
  const records: ScreenRecord[] = [];
  for (let index = 0; index < count; index += 1) {
    const seed = firstSeed + index;
    const visit = await recordVisit(
      seed,
      visitorScriptOf(seed + 1_000_000, options),
    );
    records.push(visit.record);
  }
  return records;
}
