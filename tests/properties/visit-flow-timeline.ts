import type { PresentedTrial } from "../../src/session/create-visit-flow";
import type {
  VisitEvent,
  VisitFlow,
  VisitSnapshot,
} from "../../src/session/visit-flow-types";
import type {
  OutputEventKind,
  VisitDriver,
} from "../listeners/simulated-visitor";
import type { HarnessCause, VisitHarness } from "./visit-flow-harness";

// One ordered record of a visit for the visit flow's properties (visit-flow design.md,
// "Correctness properties"). The Visit_Harness keeps its records in separate lists; the
// properties that ask what came before what need them in one order. `observeVisit` hears the
// flow's snapshots, events and presented trials, and wraps the harness's driver so that every
// action and stop report the visitor gives is in the same list, with the snapshot before and after
// and the lengths of the harness's output-call and schedule lists at that moment. It changes
// nothing in the harness.

/** The positions in the harness's lists at the moment of an entry. */
interface ListPositions {
  /** `harness.outputCalls.length`. */
  readonly outputCallCount: number;
  /** `harness.schedules.length`. */
  readonly scheduleCount: number;
}

interface EntryBase extends ListPositions {
  /** Its position in the timeline, from 0. */
  readonly seq: number;
  /** The timer's time. */
  readonly atMs: number;
  /** The harness's cause at that moment. */
  readonly cause: HarnessCause;
}

/** A flow action the visitor gave, with what it found and what it left. */
export interface ActionEntry extends EntryBase {
  readonly kind: "action";
  readonly name: keyof VisitFlow;
  readonly args: readonly unknown[];
  readonly snapshotBefore: VisitSnapshot;
  readonly snapshotAfter: VisitSnapshot;
  /** The positions when the call returned. Entries made inside the call have seq up to `endSeq`. */
  readonly after: ListPositions;
  /** The seq of the last entry made inside the call, or `seq` when there was none. */
  readonly endSeq: number;
}

/** A stop report the visitor made the backend send. */
export interface StopReportEntry extends EntryBase {
  readonly kind: "stopReport";
  readonly reportKind: OutputEventKind;
  readonly snapshotBefore: VisitSnapshot;
  readonly snapshotAfter: VisitSnapshot;
}

export interface EventEntry extends EntryBase {
  readonly kind: "event";
  readonly event: VisitEvent;
}

export interface SnapshotEntry extends EntryBase {
  readonly kind: "snapshot";
  readonly snapshot: VisitSnapshot;
}

export interface PresentedEntry extends EntryBase {
  readonly kind: "presented";
  readonly trial: PresentedTrial;
}

/**
 * A practice sound presented (audible-start, light plan). Kept apart from `presented`, which holds
 * only the trials of the search, so that every check of the trials reads as before.
 */
export interface PracticePresentedEntry extends EntryBase {
  readonly kind: "practicePresented";
  readonly trial: PresentedTrial;
}

export type TimelineEntry =
  | ActionEntry
  | StopReportEntry
  | EventEntry
  | SnapshotEntry
  | PresentedEntry
  | PracticePresentedEntry;

export interface VisitTimeline {
  /** The driver to give `playVisit`. Its flow and stop reports are recorded in `entries`. */
  readonly driver: VisitDriver;
  readonly entries: readonly TimelineEntry[];
  /**
   * Asks the driver to stop the clocks at `atMs` on its way to a later time and call `callback`
   * there. A stop already passed when the clocks next move is dropped.
   */
  stopAt(atMs: number, callback: () => void): void;
}

const flowActionNames = [
  "chooseVisit",
  "startCalibration",
  "louder",
  "quieter",
  "setCalibrationTarget",
  "keepCalibration",
  "playHeadphoneCheck",
  "answerHeadphoneCheck",
  "proceed",
  "answer",
  "pause",
  "resume",
  "goOnWithoutPractice",
  "stop",
  "chooseSwappedRepeat",
  "startReplay",
  "confirmSwap",
  "playSwapCheck",
  "answerSwapCheck",
  "startSwappedRoom",
  "backToFrontDoor",
] as const satisfies readonly (keyof VisitFlow)[];

/** Starts recording `harness` in one ordered list. Call it before the visit is played. */
export function observeVisit(harness: VisitHarness): VisitTimeline {
  const entries: TimelineEntry[] = [];
  const positions = (): ListPositions => ({
    outputCallCount: harness.outputCalls.length,
    scheduleCount: harness.schedules.length,
  });
  const base = (): EntryBase => ({
    seq: entries.length,
    atMs: harness.now(),
    cause: harness.cause(),
    ...positions(),
  });

  harness.flow.onEvent((event) => {
    entries.push(Object.freeze({ ...base(), kind: "event", event }));
  });
  harness.flow.subscribe((snapshot) => {
    entries.push(Object.freeze({ ...base(), kind: "snapshot", snapshot }));
  });
  harness.onTrialPresented((trial) => {
    entries.push(
      Object.freeze({
        ...base(),
        kind: trial.practice === true ? "practicePresented" : "presented",
        trial,
      }),
    );
  });

  const recordedAction =
    (name: (typeof flowActionNames)[number]) =>
    (...args: unknown[]): void => {
      const snapshotBefore = harness.flow.snapshot();
      const index = entries.length;
      const start = { ...base(), cause: "action" as const };
      // A placeholder keeps the action's place; the entries the call makes come after it.
      entries.push(
        Object.freeze({
          ...start,
          kind: "action",
          name,
          args: Object.freeze([...args]),
          snapshotBefore,
          snapshotAfter: snapshotBefore,
          after: start,
          endSeq: start.seq,
        }),
      );
      try {
        (harness.flow[name] as (...callArgs: unknown[]) => void)(...args);
      } finally {
        entries[index] = Object.freeze({
          ...start,
          kind: "action",
          name,
          args: Object.freeze([...args]),
          snapshotBefore,
          snapshotAfter: harness.flow.snapshot(),
          after: positions(),
          endSeq: entries.length - 1,
        });
      }
    };

  const actions = Object.fromEntries(
    flowActionNames.map((name) => [name, recordedAction(name)]),
  ) as unknown as Pick<VisitFlow, (typeof flowActionNames)[number]>;
  const flow: VisitFlow = Object.freeze({
    snapshot: () => harness.flow.snapshot(),
    subscribe: (listener: (snapshot: VisitSnapshot) => void) =>
      harness.flow.subscribe(listener),
    onEvent: (listener: (event: VisitEvent) => void) =>
      harness.flow.onEvent(listener),
    ...actions,
  });

  const stops: { readonly atMs: number; readonly callback: () => void }[] = [];

  const driver: VisitDriver = Object.freeze({
    flow,
    now: () => harness.now(),
    nextDueMs: () => harness.nextDueMs(),
    async advanceTo(atMs: number): Promise<void> {
      for (;;) {
        stops.sort((a, b) => a.atMs - b.atMs);
        const next = stops[0];
        if (next === undefined || next.atMs > atMs) {
          break;
        }
        stops.shift();
        if (next.atMs < harness.now()) {
          continue;
        }
        await harness.advanceTo(next.atMs);
        next.callback();
      }
      await harness.advanceTo(atMs);
    },
    settle: () => harness.settle(),
    async fireOutputEvent(kind: OutputEventKind): Promise<void> {
      const snapshotBefore = harness.flow.snapshot();
      const index = entries.length;
      const start = { ...base(), cause: "stopReport" as const };
      entries.push(
        Object.freeze({
          ...start,
          kind: "stopReport",
          reportKind: kind,
          snapshotBefore,
          snapshotAfter: snapshotBefore,
        }),
      );
      await harness.fireOutputEvent(kind);
      entries[index] = Object.freeze({
        ...start,
        kind: "stopReport",
        reportKind: kind,
        snapshotBefore,
        snapshotAfter: harness.flow.snapshot(),
      });
    },
    onTrialPresented: (listener: (trial: PresentedTrial) => void) =>
      harness.onTrialPresented(listener),
  });

  return Object.freeze({
    driver,
    entries,
    stopAt(atMs: number, callback: () => void): void {
      stops.push(Object.freeze({ atMs, callback }));
    },
  });
}

/** The time the visit began: the first `chooseVisit` that left the front door. */
export function visitStartMs(entries: readonly TimelineEntry[]): number {
  const start = entries.find(
    (entry): entry is ActionEntry =>
      entry.kind === "action" &&
      entry.name === "chooseVisit" &&
      entry.snapshotBefore.stage === "entry" &&
      entry.snapshotAfter.stage !== "entry",
  );
  if (start === undefined) {
    throw new Error("The visit never left the front door.");
  }
  return start.atMs;
}

/** Whether two presented or logged trials are the same trial of the same room run. */
export function sameTrialPlace(
  first: {
    readonly roomIndex: number;
    readonly attempt: number;
    readonly trialNumber: number;
  },
  second: {
    readonly roomIndex: number;
    readonly attempt: number;
    readonly trialNumber: number;
  },
): boolean {
  return (
    first.roomIndex === second.roomIndex &&
    first.attempt === second.attempt &&
    first.trialNumber === second.trialNumber
  );
}
