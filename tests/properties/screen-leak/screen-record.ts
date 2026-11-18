import type { RandomSource } from "../../../src/config/seeded-random";
import type {
  VisitEvent,
  VisitSnapshot,
} from "../../../src/session/visit-flow-types";
import { createAmbientSchedule } from "../../../src/ui/ambient/ambient-schedule";
import { reactionOfEvent } from "../../../src/ui/visit/reaction-of-event";
import { screenOfSnapshot } from "../../../src/ui/visit/screen-of-snapshot";
import type { LeakSample } from "./guess-from-screen";

/**
 * A record of everything the house interface would have drawn during a visit, and of the trials
 * that were played meanwhile. The interface draws from two things only: the screen it derives
 * from a snapshot, and the reaction it derives from an event. The recorder runs the same two
 * functions the page runs and notes each time their output asks the page to change.
 */

/** One time the page would have changed, other than the ambient motion of the lit room. */
export interface ScreenMoment {
  readonly atMs: number;
  /**
   * `screen`: the screen derived from a snapshot changed, other than its lantern. `lantern`: only
   * the lantern of the screen changed (the game layer of 2026-11-16). `ripple`, `slipped`, `say`:
   * a reaction to a decided trial, in a room of the visit or in the swapped repeat's room.
   * `gone`: a search has ended and the house says where its creature went (one-room spec). It
   * comes in the moment the search's last trial is scored. `replayRipple`: the ripple of a sound
   * that is played again after the rooms.
   */
  readonly what:
    | "screen"
    | "lantern"
    | "ripple"
    | "slipped"
    | "say"
    | "gone"
    | "replayRipple";
  /** For `lantern`: the lights before and after the change. */
  readonly lantern?: { readonly from: number; readonly to: number };
}

/** What a recorder is told when a trial's window is set. */
export interface PresentedTrialFacts {
  readonly kind: "sound" | "noSound";
  readonly ear: "left" | "right" | null;
  readonly roomIndex: number;
  readonly attempt: number;
  /** True for a trial of the swapped repeat's room. Absent or false for a room of the visit. */
  readonly inSwappedRepeat?: boolean;
}

/** One trial that was answered or ran out, with the times that matter for the picture. */
export interface RecordedTrial extends PresentedTrialFacts {
  /**
   * The decision before this trial in the same room, or the moment the room's counting started:
   * a `countingStarted` event, or the snapshot in which the swapped repeat's room begins.
   */
  readonly anchorMs: number;
  readonly presentedAtMs: number;
  readonly decidedAtMs: number;
}

export interface ScreenRecord {
  readonly moments: readonly ScreenMoment[];
  readonly trials: readonly RecordedTrial[];
}

export interface ScreenRecorder {
  /** Give it every snapshot the flow hands to its listeners, and the first one. */
  snapshot(snapshot: VisitSnapshot): void;
  /** Give it every event of the flow. */
  event(event: VisitEvent): void;
  /** Give it every trial the test hook reports. The interface itself never sees these. */
  presented(trial: PresentedTrialFacts): void;
  record(): ScreenRecord;
}

/** Creates a recorder that reads the time from `now`, the timer of the visit under test. */
export function createScreenRecorder(now: () => number): ScreenRecorder {
  const moments: ScreenMoment[] = [];
  const trials: RecordedTrial[] = [];
  let lastScreen: string | null = null;
  let lastCells: number | null = null;
  let anchorMs = now();
  let waiting: (PresentedTrialFacts & { readonly atMs: number }) | null = null;
  let inRepeatRoom = false;

  return {
    snapshot(snapshot) {
      // The swapped repeat's room has no event of its own when it starts: its snapshot says so.
      const repeatRoom =
        snapshot.stage === "swappedRepeat" && snapshot.repeat.phase === "room";
      if (repeatRoom && !inRepeatRoom) {
        anchorMs = now();
        waiting = null;
      }
      inRepeatRoom = repeatRoom;
      const shown = screenOfSnapshot(snapshot);
      const cells = shown.chase?.lantern.cells ?? null;
      // The screen without its lantern, so that a change of the lantern alone is told apart.
      const screen = JSON.stringify({
        ...shown,
        chase:
          shown.chase === null ? null : { ...shown.chase, lantern: undefined },
      });
      if (screen !== lastScreen) {
        lastScreen = screen;
        moments.push({ atMs: now(), what: "screen" });
      } else if (cells !== lastCells && lastCells !== null && cells !== null) {
        moments.push({
          atMs: now(),
          what: "lantern",
          lantern: { from: lastCells, to: cells },
        });
      }
      lastCells = cells;
    },
    event(event) {
      // A room's counting starts after its practice (audible-start, light plan of 2026-11-16).
      // What the practice draws, the line that a practice sound is playing among it, comes before
      // the first trial is waited for, so the first trial is anchored at the counting's start.
      if (event.kind === "roomStarted" || event.kind === "countingStarted") {
        anchorMs = now();
        waiting = null;
      } else if (event.kind === "practiceSoundScored") {
        waiting = null;
      } else if (event.kind === "reminderSoundScored") {
        // A reminder's decision is a decision of the visitor's, as a trial's is. The trial it
        // stood in for is presented after it, so nothing waits yet.
        anchorMs = now();
      } else if (
        event.kind === "trialScored" ||
        event.kind === "swappedTrialScored"
      ) {
        if (waiting !== null) {
          const { atMs, ...facts } = waiting;
          trials.push({
            ...facts,
            anchorMs,
            presentedAtMs: atMs,
            decidedAtMs: now(),
          });
        }
        anchorMs = now();
        waiting = null;
      }
      const reaction = reactionOfEvent(event);
      if (reaction !== null) {
        moments.push({ atMs: now(), what: reaction.kind });
      }
    },
    presented(trial) {
      // A trial cut off by a pause is presented again later. Only the last presentation counts.
      waiting = { ...trial, atMs: now() };
    },
    record() {
      return { moments: [...moments], trials: [...trials] };
    },
  };
}

/**
 * The moments at which the page changed while a trial was open or being waited for: after the
 * decision before it (or the start of the room) and before its own decision. Whatever is drawn
 * at the instant of a decision belongs to that decision and comes after the answer.
 */
export function momentsBeforeDecision(
  record: ScreenRecord,
  trial: RecordedTrial,
): ScreenMoment[] {
  return record.moments.filter(
    (moment) => moment.atMs > trial.anchorMs && moment.atMs < trial.decidedAtMs,
  );
}

/** What the predictor is asked to guess about a trial from the picture before its decision. */
export type LeakQuestion = "soundOrNot" | "side";

export interface LeakSampleOptions {
  /** A random source for the ambient motion. It must not be shared with the visit. */
  readonly ambientRandom: RandomSource;
  /**
   * How long after the decision before it the ambient motion is watched, in ms. Keep it at or
   * below the shortest gap between trials, so the stretch watched does not depend on the gap.
   */
  readonly ambientWatchMs: number;
}

const largestCount = 9;

function count(moments: readonly { readonly atMs: number }[]): number {
  return Math.min(moments.length, largestCount);
}

/**
 * Turns a record into samples for `guessFromScreen`. The features of a trial are, in order:
 * the page changes while its window was open (from its presentation to its decision); the page
 * changes while it was waited for (from the decision before it to its presentation); the lamp
 * nudges in the stretch watched; the door shadows that began in that stretch. For `side`, only
 * trials with a sound are samples.
 */
export function leakSamples(
  record: ScreenRecord,
  question: LeakQuestion,
  options: LeakSampleOptions,
): LeakSample[] {
  const lastMs = record.trials.reduce(
    (latest, trial) => Math.max(latest, trial.decidedAtMs),
    0,
  );
  const firstMs = record.moments[0]?.atMs ?? 0;
  const ambient = createAmbientSchedule(options.ambientRandom)
    .takeUntil(lastMs - firstMs)
    .map((event) => ({ kind: event.kind, atMs: firstMs + event.atMs }));

  const samples: LeakSample[] = [];
  for (const trial of record.trials) {
    if (question === "side" && trial.kind !== "sound") {
      continue;
    }
    const before = momentsBeforeDecision(record, trial);
    const watched = ambient.filter(
      (event) =>
        event.atMs >= trial.anchorMs &&
        event.atMs < trial.anchorMs + options.ambientWatchMs,
    );
    samples.push({
      features: [
        count(before.filter((moment) => moment.atMs >= trial.presentedAtMs)),
        count(before.filter((moment) => moment.atMs < trial.presentedAtMs)),
        count(watched.filter((event) => event.kind === "lampNudge")),
        count(watched.filter((event) => event.kind === "doorShadow")),
      ],
      label: question === "side" ? String(trial.ear) : trial.kind,
    });
  }
  return samples;
}

/**
 * A copy of a record from a page that gives something away: it changes `changes(trial)` times at
 * the moment each trial is presented. Used to show that the property would catch such a page.
 */
export function recordOfLeakyPage(
  record: ScreenRecord,
  changes: (trial: RecordedTrial) => number,
): ScreenRecord {
  const added: ScreenMoment[] = [];
  for (const trial of record.trials) {
    for (let index = 0; index < changes(trial); index += 1) {
      added.push({ atMs: trial.presentedAtMs, what: "screen" });
    }
  }
  return {
    moments: [...record.moments, ...added].sort((a, b) => a.atMs - b.atMs),
    trials: record.trials,
  };
}
