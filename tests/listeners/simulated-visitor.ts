// The Simulated_Visitor (visit-flow design.md, "The Simulated_Visitor"; R22.2). It plays one visit
// through a visit flow driver: it chooses the visit, sets the calibration sound, answers the headphone check,
// goes through the rules and the rests, answers every presented trial with a Simulated_Listener
// after a delay drawn from a seeded source, and applies the script's disturbances. It knows the
// flow only through the contract and the flow's test options: it learns of a trial from the
// presented-trial hook, never from the screen.
//
// It wears its headphones (swapped-repeat design.md, "What tests/listeners gains"; R21.2, R21.3,
// D24): every trial reaches the listener through Worn_Headphones, with the earpiece the hook gives
// and the arrangement the visitor itself wears, and an optional swapped-repeat behaviour takes it
// from the result through the swapped repeat. With an imbalance of 0, the as-marked arrangement and
// no behaviour, every visit plays exactly as before.

import { audioOutputConfig } from "../../src/config/audio-output-config";
import type { VisitType } from "../../src/config/hearing-method-config";
import {
  createSeededRandom,
  type RandomSource,
} from "../../src/config/seeded-random";
import type { FlowPresentedTrial } from "../../src/session/create-swapped-repeat";
import type { PresentedTrial } from "../../src/session/create-visit-flow";
import { earpieceOnEar } from "../../src/session/earpiece-on-ear";
import type {
  Ear,
  HeadphoneCheckAnswer,
  VisitFlow,
  VisitSnapshot,
  VisitStage,
} from "../../src/session/visit-flow-types";
import {
  extremeListeners,
  type ExtremeListenerName,
} from "./extreme-listeners";
import type {
  ListenerResponse,
  ListenerTrial,
  SimulatedListener,
} from "./listener-types";
import {
  createPsychometricListener,
  type PsychometricListenerParameters,
} from "./psychometric-listener";
import { wornHeadphones, type WornTrial } from "./worn-headphones";

/** A shell stop report the driver can make the backend send. */
export type OutputEventKind =
  "hidden" | "interrupted" | "deviceChanged" | "pageLeft";

/**
 * A presented trial as a driver's hook gives it: the flow's `FlowPresentedTrial`, with the earpiece
 * of the trial and the run number of its swapped repeat. The two fields are optional in this type
 * only so that a driver whose hook is typed for the room runner's `PresentedTrial`
 * (`tests/properties/visit-flow-timeline.ts`) still fits; every driver passes on the flow's own
 * trial, and the visitor throws on a sound trial that comes without its earpiece.
 */
export type DriverPresentedTrial = PresentedTrial &
  Partial<Pick<FlowPresentedTrial, "earpiece" | "swappedRepeatRunNumber">>;

/**
 * What the visitor needs from a visit flow and its clocks. The Visit_Harness of
 * `tests/properties/visit-flow-harness.ts` implements it.
 */
export interface VisitDriver {
  /** The flow. Every action the visitor takes goes through it. */
  readonly flow: VisitFlow;
  /** The timer's time. */
  now(): number;
  /** The due time of the timer's next callback, or null when none is pending. */
  nextDueMs(): number | null;
  /** Moves both clocks to `atMs`, running every timer callback due on the way at its own time. */
  advanceTo(atMs: number): Promise<void>;
  /** Lets pending activations settle. The visitor calls it after every action. */
  settle(): Promise<void>;
  /** Makes the backend report a stop, as a hidden page, an interruption, a device change or a left page do. */
  fireOutputEvent(kind: OutputEventKind): Promise<void>;
  /**
   * Calls `listener` with every trial the flow presents, with the earpiece it plays in. Returns
   * the function that removes it.
   */
  onTrialPresented(listener: (trial: DriverPresentedTrial) => void): () => void;
  /**
   * Makes the backend refuse activation, as a browser that saw no press does, until called with
   * false. Optional: only a replay behaviour's `refusedResume` and `refusedStartReplay` and a
   * swapped-repeat behaviour's `refusedPress` use it, and without it they are given as a plain
   * press.
   */
  refuseActivation?(refused: boolean): void;
}

/** How a visitor's listener is made. */
export type VisitorListenerSpec =
  | {
      readonly kind: "psychometric";
      readonly parameters: PsychometricListenerParameters;
      readonly seed: number;
    }
  | {
      readonly kind: "extreme";
      readonly name: ExtremeListenerName;
      readonly seed: number;
    }
  | {
      readonly kind: "function";
      /** Any answer, as a function of the trial and its position among the presented trials, from 0. */
      readonly respond: (
        trial: ListenerTrial,
        position: number,
      ) => ListenerResponse;
    };

/**
 * The time stamp an answer carries: the timer's time, an earlier time (0 to
 * `earlierStampMaxMs`), none, NaN, or `futureStampMs` in the future.
 */
export type TimeStampMode = "now" | "earlier" | "missing" | "nan" | "future";

/** The visitor presses the stop control or leaves the page. */
export interface VisitorEnding {
  /** When, in milliseconds after the visitor chose the visit. */
  readonly atMs: number;
  readonly kind: "stop" | "pageLeft";
}

/** A pause by the visitor, or a stop report of the output stage, followed by `resume`. */
export interface VisitorDisturbance {
  /** When, in milliseconds after the visitor chose the visit. */
  readonly atMs: number;
  readonly kind: "pause" | "hidden" | "interrupted" | "deviceChanged";
  /** How long after it the visitor presses resume. */
  readonly resumeAfterMs: number;
}

/** One press outside the visitor's answers to trials. */
export interface VisitorExtraPress {
  /** When, in milliseconds after the visitor chose the visit. */
  readonly atMs: number;
  readonly side: Ear;
}

/**
 * What the visitor does in the missed-sound replay besides a pause's `resume`, as a replay script
 * of missed-sound-replay design.md ("Correctness properties") gives it. Times are from the moment
 * the visitor first sees the stage.
 */
export interface VisitorReplayEvent {
  readonly atMs: number;
  readonly action:
    | "proceed"
    | "stop"
    | "pause"
    | "resume"
    | "hidden"
    | "interrupted"
    | "deviceChanged"
    | "pageLeft"
    /** `resume` while the backend refuses activation. */
    | "refusedResume"
    /** `startReplay` while the backend refuses activation. */
    | "refusedStartReplay";
  /**
   * For `hidden` and `interrupted`: the wait to the visitor's `resume`. Null: the visitor resumes
   * at once, as after a disturbance, so that the visit reaches its result.
   */
  readonly resumeAfterMs: number | null;
}

/**
 * How the visitor moves through the missed-sound replay (missed-sound-replay design.md, CP10).
 * Times are from the moment the visitor first sees the stage. In every behaviour the visitor
 * proceeds after a rest once the replay has finished or had nothing to play, and resumes a pause
 * as it does in every stage.
 *
 * - `watch`: presses start after `startAfterMs` and waits for the end.
 * - `skip`, `stop`: presses start after `startAfterMs`, then `proceed` or `stop`
 *   `endAfterStartMs` after that press.
 * - `script`: presses start at each of `startTimesMs` and gives each event at its time. Once
 *   every one has been given, a replay still announcing is skipped after a rest.
 */
export type VisitorReplayBehaviour =
  | { readonly kind: "watch"; readonly startAfterMs: number }
  | {
      readonly kind: "skip" | "stop";
      readonly startAfterMs: number;
      readonly endAfterStartMs: number;
    }
  | {
      readonly kind: "script";
      readonly startTimesMs: readonly number[];
      readonly events: readonly VisitorReplayEvent[];
    };

/**
 * Which floor the visitor names at the result: the lowest or the highest floor that offers the
 * repeat; the offered floor at `fraction` (from 0, the lowest, to below 1) of the offered floors;
 * or a floor that does not offer it (the first such, or a number that is no room when every floor
 * offers it).
 */
export type VisitorSwappedRepeatFloor =
  | { readonly kind: "firstOffered" }
  | { readonly kind: "lastOffered" }
  | { readonly kind: "drawnOffered"; readonly fraction: number }
  | { readonly kind: "notOffered" };

/**
 * How the visitor answers a swap check: with the side the hiss reached in the arrangement it
 * wears (the hiss plays in the left earpiece), or with one of the two other answers.
 */
export type VisitorSwapCheckAnswer = "heard" | "bothSides" | "nothingHeard";

/**
 * What the visitor does in the swapped repeat besides the presses the stage asks for. Times are
 * from the moment the visitor first sees the stage.
 */
export interface VisitorSwappedRepeatEvent {
  readonly atMs: number;
  readonly action:
    | "proceed"
    | "stop"
    | "pause"
    | "resume"
    | "hidden"
    | "interrupted"
    | "deviceChanged"
    | "pageLeft"
    /** The press the stage asks for now (`playSwapCheck`, `startSwappedRoom` or `resume`), while the backend refuses activation. */
    | "refusedPress";
  /**
   * For `pause`, `hidden` and `interrupted`: the wait to the visitor's `resume`. Null: the visitor
   * resumes at once, as after a disturbance.
   */
  readonly resumeAfterMs: number | null;
}

/**
 * How the visitor moves from the result through the swapped repeat (swapped-repeat design.md,
 * "What tests/listeners gains"; R21.3). After a rest at the result it names `floor` with
 * `chooseSwappedRepeat`. In the stage it presses what the stage asks for, each press from 0 to
 * `pressDelayMaxMs` after the view changed: on the instruction it swaps the earpieces it wears and
 * confirms, except on the first instruction when `swapsOnFirstInstruction` is false, where it
 * confirms without swapping; in the check it plays the hiss and answers it, the first time with
 * `firstCheckAnswer` and then always with the side the hiss reached; when ready it starts the
 * room; in the room it answers every trial through what it wears; when the stage is unavailable
 * or finished it goes back to the picture. It gives each event at its time, and turns the
 * headphones back on reading the Turn_Back_Line when `turnsBack` is true. Once it is back at the
 * result, or its press was ignored, or no floor fits `floor`, it stops there.
 */
export interface VisitorSwappedRepeatBehaviour {
  readonly floor: VisitorSwappedRepeatFloor;
  readonly swapsOnFirstInstruction: boolean;
  readonly firstCheckAnswer: VisitorSwapCheckAnswer;
  readonly pressDelayMaxMs: number;
  readonly events: readonly VisitorSwappedRepeatEvent[];
  readonly turnsBack: boolean;
}

/**
 * How the visitor moves the calibration control (audible-start R27.2). `presses`: louder and
 * quieter only, as a person holding the button. `target`: one drag of the control to its setting
 * with `setCalibrationTarget`, then a wait for the played setting to catch up. `both`: one drag to
 * halfway between the bottom of the control and its setting, which need not lie on the control's
 * grid, then presses for the rest.
 */
export type VisitorCalibrationControl = "presses" | "target" | "both";

/** The headphones the visitor wears. */
export interface VisitorHeadphones {
  /** Headphone_Imbalance: how much quieter the right earpiece plays than the left, in dB. */
  readonly imbalanceDb: number;
}

/** Everything a Simulated_Visitor does in one visit. */
export interface VisitorScript {
  readonly visitType: VisitType;
  /**
   * The calibration setting the visitor raises the calibration sound to and keeps, or the top of
   * the control where that is lower.
   */
  readonly calibrationTargetDb: number;
  /** How the visitor moves the control to that setting. Without it, `presses`, as before audible-start. */
  readonly calibrationControl?: VisitorCalibrationControl;
  /** The first answer to the first headphone check. Every later answer is `left`. */
  readonly firstHeadphoneCheckAnswer: HeadphoneCheckAnswer;
  readonly listener: VisitorListenerSpec;
  /** The seed of the source every answer delay, time stamp and rest is drawn from. */
  readonly visitorSeed: number;
  /** An answer comes from 0 to this many milliseconds after its trial's window opens. */
  readonly answerDelayMaxMs: number;
  /** The time stamp of each answer is one of these, drawn with equal chance. Not empty. */
  readonly timeStampModes: readonly TimeStampMode[];
  /** Before each `proceed`, the visitor rests from 0 to this many milliseconds. */
  readonly restMaxMs: number;
  readonly extraPresses: readonly VisitorExtraPress[];
  readonly disturbances: readonly VisitorDisturbance[];
  readonly ending: VisitorEnding | null;
  /**
   * What the visitor does in the missed-sound replay. Without it the visitor proceeds after a
   * rest there, which skips the replay.
   */
  readonly replay?: VisitorReplayBehaviour;
  /**
   * The headphones the visitor wears, put on as marked. Without them the imbalance is 0, and every
   * trial reaches the listener as it is asked for.
   */
  readonly headphones?: VisitorHeadphones;
  /**
   * What the visitor does after the result: the swapped repeat. Without it the visitor stops at
   * the result.
   */
  readonly swappedRepeat?: VisitorSwappedRepeatBehaviour;
}

/** How a visit played by the visitor ended. */
export interface VisitorRun {
  /** `done`: the flow reached `result`, `exit` or `unsupported`. `stuck`: nothing more could happen. `stepLimit`: the guard stopped it. */
  readonly ending: "done" | "stuck" | "stepLimit";
  readonly finalStage: VisitStage;
  /** Trials the hook reported, in order. */
  readonly presentedTrials: readonly DriverPresentedTrial[];
  /** How many steps the visitor took: actions and clock moves. */
  readonly stepCount: number;
  /** The floor the visitor named with `chooseSwappedRepeat`, or null when it named none. */
  readonly swappedRepeatRoomIndex: number | null;
}

/** How much earlier than the press an `earlier` time stamp may be (design.md, the visitor script). */
export const earlierStampMaxMs = 300;
/** How far ahead of the press a `future` time stamp is. */
export const futureStampMs = 1000;
/** The guard against a visit that would never end. Far above any visit the flow can make. */
export const visitorStepLimitCount = 200_000;

const finalStages: readonly VisitStage[] = ["result", "exit", "unsupported"];

/** The floor a behaviour names, from a result's summary, or null when none fits. */
function swappedRepeatFloorIndex(
  floor: VisitorSwappedRepeatFloor,
  offered: readonly boolean[],
): number | null {
  const offeredIndexes = offered.flatMap((isOffered, index) =>
    isOffered ? [index] : [],
  );
  switch (floor.kind) {
    case "firstOffered":
      return offeredIndexes[0] ?? null;
    case "lastOffered":
      return offeredIndexes.at(-1) ?? null;
    case "drawnOffered": {
      if (!(floor.fraction >= 0 && floor.fraction < 1)) {
        throw new RangeError(
          `A drawn floor's fraction must lie from 0 to below 1, but got ${String(floor.fraction)}.`,
        );
      }
      return (
        offeredIndexes[Math.floor(floor.fraction * offeredIndexes.length)] ??
        null
      );
    }
    case "notOffered": {
      const index = offered.indexOf(false);
      return index >= 0 ? index : offered.length;
    }
  }
}

/** Creates the listener of a spec. A function listener's position counts every presented trial. */
export function createVisitorListener(
  spec: VisitorListenerSpec,
): (trial: ListenerTrial, position: number) => ListenerResponse {
  if (spec.kind === "function") {
    return spec.respond;
  }
  const listener: SimulatedListener =
    spec.kind === "psychometric"
      ? createPsychometricListener(
          spec.parameters,
          createSeededRandom(spec.seed),
        )
      : extremeListeners[spec.name](createSeededRandom(spec.seed));
  return (trial) => listener.respond(trial);
}

/** What the visitor's headphones are told of a trial: a sound on its earpiece at the level asked, or no sound. */
const wornTrialOf = (trial: DriverPresentedTrial): WornTrial => {
  if (trial.kind !== "sound" || trial.ear === null || trial.levelDb === null) {
    return { kind: "noSound" };
  }
  if (trial.earpiece === null || trial.earpiece === undefined) {
    throw new Error(
      `The hook gave sound trial ${String(trial.trialNumber)} of room ${String(trial.roomIndex)} without its earpiece.`,
    );
  }
  return { kind: "sound", earpiece: trial.earpiece, levelDb: trial.levelDb };
};

/** A whole number of milliseconds from 0 to `maxMs`, from one draw. */
const drawUpTo = (random: RandomSource, maxMs: number): number =>
  Math.floor(random.next() * (Math.floor(maxMs) + 1));

interface PlannedAction {
  readonly atMs: number;
  /** Breaks ties: the action planned first runs first. */
  readonly order: number;
  readonly run: () => Promise<void>;
}

/**
 * Plays one visit with `script` through `driver` (R22.2), from the front door to `result`,
 * `exit` or `unsupported`.
 *
 * Time moves by events: the visitor keeps its planned actions and moves the clocks to whichever
 * comes first, its next action or the timer's next callback, so that every answer lands at the
 * exact time planned. After every step it looks at the snapshot and plans what the stage asks
 * for: in calibration it starts the calibration sound (the music, or the hiss where the music
 * cannot be loaded), presses louder as the played setting rises until it reaches its target (at
 * most `calibrationRiseMaxDb` above the played setting, as a person holding the button), and keeps
 * it, or first drags the control as `script.calibrationControl` says; at the headphone check it plays the check and answers; at
 * `rules`, `betweenRooms` and `missedSoundReplay` it proceeds after a rest; while a pause holds it
 * resumes, at the time its disturbance set or at once. Each presented trial goes to the listener,
 * and an answer other than `none` is given after a drawn delay with a drawn time stamp. With a
 * replay behaviour, the visitor follows it in `missedSoundReplay` instead of proceeding at once.
 *
 * Every trial reaches the listener through Worn_Headphones: a sound on the earpiece the hook names,
 * heard on the ear that earpiece sits on in the arrangement the visitor wears, lowered by that
 * earpiece's share of `script.headphones.imbalanceDb`. The visitor puts the headphones on as
 * marked. With a swapped-repeat behaviour, `result` is not its last stage until the behaviour has
 * run: it names a floor, goes through the stage and comes back to the result, and stops there.
 */
export async function playVisit(
  driver: VisitDriver,
  script: VisitorScript,
): Promise<VisitorRun> {
  const { flow } = driver;
  const random = createSeededRandom(script.visitorSeed);
  const respond = createVisitorListener(script.listener);
  // What the visitor wears: the arrangement changes when it swaps or turns back.
  const wearing: {
    readonly imbalanceDb: number;
    earpieceOnEar: Readonly<Record<Ear, Ear>>;
  } = {
    imbalanceDb: script.headphones?.imbalanceDb ?? 0,
    earpieceOnEar: earpieceOnEar("asMarked"),
  };
  /** The position of the trial being heard among the presented trials, from 0. */
  let position = 0;
  const hear = wornHeadphones(
    { respond: (trial) => respond(trial, position) },
    wearing,
  );
  const { calibrationRiseMaxDb, calibrationSettingStepDb } = audioOutputConfig;
  if (script.timeStampModes.length === 0) {
    throw new RangeError(
      "A visitor script needs at least one time stamp mode.",
    );
  }

  const planned: PlannedAction[] = [];
  let order = 0;
  const plan = (atMs: number, run: () => Promise<void>): PlannedAction => {
    const action = Object.freeze({ atMs, order, run });
    order += 1;
    planned.push(action);
    return action;
  };
  const act = async (body: () => void): Promise<void> => {
    body();
    await driver.settle();
  };

  const presentedTrials: DriverPresentedTrial[] = [];
  const stampOf = (
    mode: TimeStampMode,
    earlierMs: number,
  ): number | undefined => {
    const nowMs = driver.now();
    switch (mode) {
      case "now":
        return nowMs;
      case "earlier":
        return nowMs - earlierMs;
      case "missing":
        return undefined;
      case "nan":
        return Number.NaN;
      case "future":
        return nowMs + futureStampMs;
    }
  };
  const removeHook = driver.onTrialPresented((trial) => {
    position = presentedTrials.length;
    presentedTrials.push(trial);
    const response = hear(wornTrialOf(trial));
    if (response === "none") {
      return;
    }
    const delayMs = drawUpTo(random, script.answerDelayMaxMs);
    const mode =
      script.timeStampModes[
        Math.floor(random.next() * script.timeStampModes.length)
      ];
    const earlierMs = drawUpTo(random, earlierStampMaxMs);
    plan(trial.windowStartMs + delayMs, () =>
      act(() => flow.answer(response, stampOf(mode, earlierMs))),
    );
  });

  // The front door.
  const visitStartMs = driver.now();
  await act(() => flow.chooseVisit(script.visitType));

  let resumeAtMs: number | null = null;
  for (const press of script.extraPresses) {
    plan(visitStartMs + press.atMs, () =>
      act(() => flow.answer(press.side, driver.now())),
    );
  }
  for (const disturbance of script.disturbances) {
    plan(visitStartMs + disturbance.atMs, async () => {
      if (disturbance.kind === "pause") {
        await act(() => flow.pause());
      } else {
        await driver.fireOutputEvent(disturbance.kind);
      }
      const atMs = driver.now() + disturbance.resumeAfterMs;
      resumeAtMs = resumeAtMs === null ? atMs : Math.max(resumeAtMs, atMs);
    });
  }
  const { ending } = script;
  if (ending !== null) {
    plan(visitStartMs + ending.atMs, () =>
      ending.kind === "stop"
        ? act(() => flow.stop())
        : driver.fireOutputEvent("pageLeft"),
    );
  }

  // What the visitor does for the stage on screen. Replanned whenever the snapshot changes.
  let stageAction: PlannedAction | null = null;
  let reactedTo: VisitSnapshot | null = null;
  /** The visitor's own count of where the control is: the controller's target. */
  let controlDb: number = audioOutputConfig.calibrationSettingMinDb;
  const calibrationControl = script.calibrationControl ?? "presses";
  /** True once the visitor has dragged the control in the calibration under way. */
  let dragged = false;
  let headphoneChecksAnswered = 0;
  /** True when the visitor's last stage action left the snapshot as it was. */
  let retrying = false;

  // The replay behaviour's own actions, planned when the visitor first sees the replay.
  const replayBehaviour = script.replay;
  let replayPlanned = false;
  let replayActionsLeft = 0;
  const planReplayAction = (atMs: number, run: () => Promise<void>): void => {
    replayActionsLeft += 1;
    plan(atMs, async () => {
      replayActionsLeft -= 1;
      await run();
      // Look at the stage again even when the action changed nothing.
      reactedTo = null;
    });
  };
  const withActivationRefused = async (body: () => void): Promise<void> => {
    driver.refuseActivation?.(true);
    try {
      await act(body);
    } finally {
      driver.refuseActivation?.(false);
    }
  };
  const giveReplayEvent = async (event: VisitorReplayEvent): Promise<void> => {
    switch (event.action) {
      case "proceed":
        return act(() => flow.proceed());
      case "stop":
        return act(() => flow.stop());
      case "pause":
        return act(() => flow.pause());
      case "resume":
        return act(() => flow.resume());
      case "hidden":
      case "interrupted": {
        await driver.fireOutputEvent(event.action);
        if (event.resumeAfterMs !== null) {
          const atMs = driver.now() + event.resumeAfterMs;
          resumeAtMs = resumeAtMs === null ? atMs : Math.max(resumeAtMs, atMs);
        }
        return;
      }
      case "deviceChanged":
      case "pageLeft":
        return driver.fireOutputEvent(event.action);
      case "refusedResume":
        return withActivationRefused(() => flow.resume());
      case "refusedStartReplay":
        return withActivationRefused(() => flow.startReplay());
    }
  };
  const planReplay = (behaviour: VisitorReplayBehaviour): void => {
    replayPlanned = true;
    const enteredAtMs = driver.now();
    switch (behaviour.kind) {
      case "watch":
        planReplayAction(enteredAtMs + behaviour.startAfterMs, () =>
          act(() => flow.startReplay()),
        );
        return;
      case "skip":
      case "stop":
        planReplayAction(enteredAtMs + behaviour.startAfterMs, async () => {
          await act(() => flow.startReplay());
          planReplayAction(driver.now() + behaviour.endAfterStartMs, () =>
            act(() =>
              behaviour.kind === "skip" ? flow.proceed() : flow.stop(),
            ),
          );
        });
        return;
      case "script":
        for (const atMs of behaviour.startTimesMs) {
          planReplayAction(enteredAtMs + atMs, () =>
            act(() => flow.startReplay()),
          );
        }
        for (const event of behaviour.events) {
          planReplayAction(enteredAtMs + event.atMs, () =>
            giveReplayEvent(event),
          );
        }
        return;
    }
  };

  // The swapped-repeat behaviour: the floor named, and where the visitor is in it.
  const repeatBehaviour = script.swappedRepeat;
  let swappedRepeatRoomIndex: number | null = null;
  let repeatEntered = false;
  /** True once the behaviour has run, and from the start without one. */
  let repeatDone = repeatBehaviour === undefined;
  let repeatInstructionCount = 0;
  let repeatCheckAnswerCount = 0;
  /** The ear the hiss of the left earpiece reaches, in what the visitor wears now. */
  const hissEar = (): Ear =>
    wearing.earpieceOnEar.left === "left" ? "left" : "right";
  const readTurnBackLine = (): void => {
    if (repeatBehaviour?.turnsBack === true) {
      wearing.earpieceOnEar = earpieceOnEar("asMarked");
    }
  };
  const planRepeatAction = (atMs: number, run: () => Promise<void>): void => {
    plan(atMs, async () => {
      await run();
      // Look at the stage again even when the action changed nothing.
      reactedTo = null;
    });
  };
  const resumeLater = (resumeAfterMs: number | null): void => {
    if (resumeAfterMs !== null) {
      const atMs = driver.now() + resumeAfterMs;
      resumeAtMs = resumeAtMs === null ? atMs : Math.max(resumeAtMs, atMs);
    }
  };
  /** The press the stage asks for now, given while the backend refuses activation. */
  const refusedRepeatPress = (): Promise<void> => {
    const snapshot = flow.snapshot();
    if (snapshot.pause !== null) {
      return withActivationRefused(() => flow.resume());
    }
    if (snapshot.stage !== "swappedRepeat") {
      return Promise.resolve();
    }
    switch (snapshot.repeat.phase) {
      case "check":
        return withActivationRefused(() => flow.playSwapCheck());
      case "ready":
        return withActivationRefused(() => flow.startSwappedRoom());
      default:
        return Promise.resolve();
    }
  };
  const giveRepeatEvent = async (
    event: VisitorSwappedRepeatEvent,
  ): Promise<void> => {
    switch (event.action) {
      case "proceed":
        return act(() => flow.proceed());
      case "stop":
        return act(() => flow.stop());
      case "pause":
        await act(() => flow.pause());
        resumeLater(event.resumeAfterMs);
        return;
      case "resume":
        return act(() => flow.resume());
      case "hidden":
      case "interrupted":
        await driver.fireOutputEvent(event.action);
        resumeLater(event.resumeAfterMs);
        return;
      case "deviceChanged":
      case "pageLeft":
        return driver.fireOutputEvent(event.action);
      case "refusedPress":
        return refusedRepeatPress();
    }
  };
  /** Follows the behaviour's progress: the stage entered, the Turn_Back_Line read, the result again. */
  const observeRepeat = (snapshot: VisitSnapshot): void => {
    if (repeatBehaviour === undefined || repeatDone) {
      return;
    }
    if (snapshot.stage === "swappedRepeat") {
      if (!repeatEntered) {
        repeatEntered = true;
        const enteredAtMs = driver.now();
        for (const event of repeatBehaviour.events) {
          planRepeatAction(enteredAtMs + event.atMs, () =>
            giveRepeatEvent(event),
          );
        }
      }
      if (snapshot.repeat.phase === "finished") {
        readTurnBackLine();
      }
      return;
    }
    if (snapshot.stage === "result" && repeatEntered) {
      repeatDone = true;
      if (snapshot.turnBackLine !== null) {
        readTurnBackLine();
      }
    }
  };
  const isLastStage = (snapshot: VisitSnapshot): boolean =>
    finalStages.includes(snapshot.stage) &&
    (snapshot.stage !== "result" || repeatDone);

  const restThen = (body: () => void, delayMs: number): void => {
    stageAction = plan(
      driver.now() + delayMs + drawUpTo(random, script.restMaxMs),
      () => act(body),
    );
  };
  const after = (delayMs: number, body: () => void): void => {
    stageAction = plan(driver.now() + delayMs, () => act(body));
  };

  const react = (snapshot: VisitSnapshot): void => {
    // An action that changed nothing (a refused play, an activation not yet settled) is tried
    // again after a calibration repeat gap, so that the visitor never presses in a loop.
    const delayMs = retrying ? audioOutputConfig.calibrationRepeatGapMs : 0;
    retrying = false;
    const atOnce = (body: () => void): void => after(delayMs, body);
    if (
      snapshot.stage === "missedSoundReplay" &&
      replayBehaviour !== undefined &&
      !replayPlanned
    ) {
      planReplay(replayBehaviour);
    }
    if (snapshot.pause !== null) {
      const atMs = Math.max(driver.now() + delayMs, resumeAtMs ?? driver.now());
      stageAction = plan(atMs, () => {
        resumeAtMs = null;
        return act(() => flow.resume());
      });
      return;
    }
    switch (snapshot.stage) {
      case "calibration": {
        if (!snapshot.playing) {
          atOnce(() => {
            controlDb = snapshot.controlBottomDb;
            dragged = false;
            flow.startCalibration();
          });
          return;
        }
        const playedDb = snapshot.playedSettingDb;
        if (playedDb === null) {
          return;
        }
        // The control stands where the flow says: with the music, the played setting lies between
        // grid settings and the flow rounds every move down to the grid (audible-start D1).
        if (snapshot.targetSettingDb !== undefined) {
          controlDb = snapshot.targetSettingDb;
        }
        if (calibrationControl !== "presses" && !dragged) {
          atOnce(() => {
            dragged = true;
            flow.setCalibrationTarget(
              calibrationControl === "target"
                ? script.calibrationTargetDb
                : (snapshot.controlBottomDb + script.calibrationTargetDb) / 2,
            );
            // The flow rounds the drag down to the grid; the control now stands where it says.
            const after = flow.snapshot();
            if (
              after.stage === "calibration" &&
              after.targetSettingDb !== undefined
            ) {
              controlDb = after.targetSettingDb;
            }
          });
          return;
        }
        // A setting above the top of the control is the top: there the visitor keeps it, as the
        // line at the top says. The music's top lies a step below the hiss's (audible-start D7).
        const keptDb = Math.min(
          script.calibrationTargetDb,
          snapshot.controlTopDb,
        );
        if (playedDb === keptDb) {
          if (snapshot.keepRefusal === null) {
            atOnce(() => flow.keepCalibration());
          }
          return;
        }
        if (playedDb > keptDb) {
          atOnce(() => {
            controlDb = playedDb - calibrationSettingStepDb;
            flow.quieter();
          });
          return;
        }
        const wantedDb = Math.min(keptDb, playedDb + calibrationRiseMaxDb);
        if (Math.max(controlDb, playedDb) >= wantedDb) {
          return;
        }
        atOnce(() => {
          while (Math.max(controlDb, playedDb) < wantedDb) {
            controlDb =
              Math.max(controlDb, playedDb) + calibrationSettingStepDb;
            flow.louder();
          }
        });
        return;
      }
      case "headphoneCheck":
        if (snapshot.awaitingAnswer) {
          atOnce(() => {
            const answer =
              headphoneChecksAnswered === 0
                ? script.firstHeadphoneCheckAnswer
                : "left";
            headphoneChecksAnswered += 1;
            flow.answerHeadphoneCheck(answer);
          });
          return;
        }
        if (snapshot.judgement === "correct") {
          restThen(() => flow.proceed(), delayMs);
          return;
        }
        atOnce(() => flow.playHeadphoneCheck());
        return;
      case "rules":
      case "betweenRooms":
        restThen(() => flow.proceed(), delayMs);
        return;
      case "result": {
        if (repeatBehaviour === undefined || repeatDone) {
          return;
        }
        const roomIndex = swappedRepeatFloorIndex(
          repeatBehaviour.floor,
          snapshot.summary.rooms.map((room) => room.swappedRepeatOffered),
        );
        if (roomIndex === null) {
          // No floor fits: the visitor names none and stops at the result.
          repeatDone = true;
          return;
        }
        stageAction = plan(
          driver.now() + delayMs + drawUpTo(random, script.restMaxMs),
          async () => {
            swappedRepeatRoomIndex = roomIndex;
            await act(() => flow.chooseSwappedRepeat(roomIndex));
            if (flow.snapshot().stage !== "swappedRepeat") {
              // The press was ignored: the visitor stops at the result.
              repeatDone = true;
            }
          },
        );
        return;
      }
      case "swappedRepeat": {
        if (repeatBehaviour === undefined) {
          return;
        }
        const view = snapshot.repeat;
        const press = (body: () => void): void =>
          after(
            delayMs + drawUpTo(random, repeatBehaviour.pressDelayMaxMs),
            body,
          );
        switch (view.phase) {
          case "unavailable":
          case "finished":
            press(() => flow.proceed());
            return;
          case "instruction":
            press(() => {
              repeatInstructionCount += 1;
              if (
                repeatInstructionCount > 1 ||
                repeatBehaviour.swapsOnFirstInstruction
              ) {
                wearing.earpieceOnEar = earpieceOnEar("swapped");
              }
              flow.confirmSwap();
            });
            return;
          case "check":
            if (view.awaitingAnswer) {
              press(() => {
                const kind =
                  repeatCheckAnswerCount === 0
                    ? repeatBehaviour.firstCheckAnswer
                    : "heard";
                repeatCheckAnswerCount += 1;
                flow.answerSwapCheck(kind === "heard" ? hissEar() : kind);
              });
            } else {
              press(() => flow.playSwapCheck());
            }
            return;
          case "ready":
            press(() => flow.startSwappedRoom());
            return;
          case "room":
            return;
        }
        return;
      }
      case "missedSoundReplay": {
        if (replayBehaviour === undefined) {
          restThen(() => flow.proceed(), delayMs);
          return;
        }
        const view = snapshot.replay;
        if (view.phase === "nothingMissed" || view.phase === "finished") {
          restThen(() => flow.proceed(), delayMs);
          return;
        }
        if (view.phase === "playing" || replayActionsLeft > 0) {
          return;
        }
        // Still announcing with nothing of the behaviour left: a script skips the replay, and
        // the other behaviours press start again (after a press the browser did not see).
        if (replayBehaviour.kind === "script") {
          restThen(() => flow.proceed(), delayMs);
        } else {
          atOnce(() => flow.startReplay());
        }
        return;
      }
      default:
        return;
    }
  };

  let stepCount = 0;
  try {
    for (; stepCount < visitorStepLimitCount; stepCount += 1) {
      const snapshot = flow.snapshot();
      observeRepeat(snapshot);
      if (isLastStage(snapshot)) {
        return Object.freeze({
          ending: "done",
          finalStage: snapshot.stage,
          presentedTrials: Object.freeze([...presentedTrials]),
          stepCount,
          swappedRepeatRoomIndex,
        });
      }
      if (snapshot !== reactedTo) {
        reactedTo = snapshot;
        if (stageAction !== null) {
          planned.splice(planned.indexOf(stageAction), 1);
          stageAction = null;
        }
        react(snapshot);
        if (isLastStage(snapshot)) {
          continue;
        }
      }
      planned.sort((a, b) => a.atMs - b.atMs || a.order - b.order);
      const next = planned[0];
      const dueMs = driver.nextDueMs();
      if (next !== undefined && (dueMs === null || next.atMs <= dueMs)) {
        planned.shift();
        const isStageAction = next === stageAction;
        if (isStageAction) {
          stageAction = null;
        }
        await driver.advanceTo(Math.max(driver.now(), next.atMs));
        const before = flow.snapshot();
        await next.run();
        if (isStageAction && flow.snapshot() === before) {
          reactedTo = null;
          retrying = true;
        }
        continue;
      }
      if (dueMs === null) {
        return Object.freeze({
          ending: "stuck",
          finalStage: snapshot.stage,
          presentedTrials: Object.freeze([...presentedTrials]),
          stepCount,
          swappedRepeatRoomIndex,
        });
      }
      await driver.advanceTo(dueMs);
    }
    return Object.freeze({
      ending: "stepLimit",
      finalStage: flow.snapshot().stage,
      presentedTrials: Object.freeze([...presentedTrials]),
      stepCount,
      swappedRepeatRoomIndex,
    });
  } finally {
    removeHook();
  }
}
