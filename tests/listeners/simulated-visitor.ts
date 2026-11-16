// The Simulated_Visitor (visit-flow design.md, "The Simulated_Visitor"; R22.2). It plays one visit
// through a visit flow driver: it chooses the visit, matches the hiss, answers the headphone check,
// goes through the rules and the rests, answers every presented trial with a Simulated_Listener
// after a delay drawn from a seeded source, and applies the script's disturbances. It knows the
// flow only through the contract and the flow's test options: it learns of a trial from the
// presented-trial hook, never from the screen.

import { audioOutputConfig } from "../../src/config/audio-output-config";
import type { VisitType } from "../../src/config/hearing-method-config";
import {
  createSeededRandom,
  type RandomSource,
} from "../../src/config/seeded-random";
import type { PresentedTrial } from "../../src/session/create-visit-flow";
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

/** A shell stop report the driver can make the backend send. */
export type OutputEventKind =
  "hidden" | "interrupted" | "deviceChanged" | "pageLeft";

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
  /** Calls `listener` with every trial the flow presents. Returns the function that removes it. */
  onTrialPresented(listener: (trial: PresentedTrial) => void): () => void;
  /**
   * Makes the backend refuse activation, as a browser that saw no press does, until called with
   * false. Optional: only a replay behaviour's `refusedResume` and `refusedStartReplay` use it,
   * and without it they are given as a plain `resume` and `startReplay`.
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

/** Everything a Simulated_Visitor does in one visit. */
export interface VisitorScript {
  readonly visitType: VisitType;
  /** The calibration setting the visitor raises the hiss to and keeps. */
  readonly calibrationTargetDb: number;
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
}

/** How a visit played by the visitor ended. */
export interface VisitorRun {
  /** `done`: the flow reached `result`, `exit` or `unsupported`. `stuck`: nothing more could happen. `stepLimit`: the guard stopped it. */
  readonly ending: "done" | "stuck" | "stepLimit";
  readonly finalStage: VisitStage;
  /** Trials the hook reported, in order. */
  readonly presentedTrials: readonly PresentedTrial[];
  /** How many steps the visitor took: actions and clock moves. */
  readonly stepCount: number;
}

/** How much earlier than the press an `earlier` time stamp may be (design.md, the visitor script). */
export const earlierStampMaxMs = 300;
/** How far ahead of the press a `future` time stamp is. */
export const futureStampMs = 1000;
/** The guard against a visit that would never end. Far above any visit the flow can make. */
export const visitorStepLimitCount = 200_000;

const finalStages: readonly VisitStage[] = ["result", "exit", "unsupported"];

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

const listenerTrialOf = (trial: PresentedTrial): ListenerTrial =>
  trial.kind === "sound" && trial.ear !== null && trial.levelDb !== null
    ? { kind: "sound", ear: trial.ear, levelDb: trial.levelDb }
    : { kind: "noSound" };

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
 * for: in calibration it starts the hiss, presses louder after each repeat until the played
 * setting reaches its target (at most `calibrationRiseMaxDb` above the last repeat, as a person
 * holding the button), and keeps it; at the headphone check it plays the check and answers; at
 * `rules`, `betweenRooms` and `missedSoundReplay` it proceeds after a rest; while a pause holds it
 * resumes, at the time its disturbance set or at once. Each presented trial goes to the listener,
 * and an answer other than `none` is given after a drawn delay with a drawn time stamp. With a
 * replay behaviour, the visitor follows it in `missedSoundReplay` instead of proceeding at once.
 */
export async function playVisit(
  driver: VisitDriver,
  script: VisitorScript,
): Promise<VisitorRun> {
  const { flow } = driver;
  const random = createSeededRandom(script.visitorSeed);
  const respond = createVisitorListener(script.listener);
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

  const presentedTrials: PresentedTrial[] = [];
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
    const position = presentedTrials.length;
    presentedTrials.push(trial);
    const response = respond(listenerTrialOf(trial), position);
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
            flow.startCalibration();
          });
          return;
        }
        const playedDb = snapshot.playedSettingDb;
        if (playedDb === null) {
          return;
        }
        if (playedDb === script.calibrationTargetDb) {
          if (snapshot.keepRefusal === null) {
            atOnce(() => flow.keepCalibration());
          }
          return;
        }
        if (playedDb > script.calibrationTargetDb) {
          atOnce(() => {
            controlDb = playedDb - calibrationSettingStepDb;
            flow.quieter();
          });
          return;
        }
        const wantedDb = Math.min(
          script.calibrationTargetDb,
          playedDb + calibrationRiseMaxDb,
        );
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
      if (finalStages.includes(snapshot.stage)) {
        return Object.freeze({
          ending: "done",
          finalStage: snapshot.stage,
          presentedTrials: Object.freeze([...presentedTrials]),
          stepCount,
        });
      }
      if (snapshot !== reactedTo) {
        reactedTo = snapshot;
        if (stageAction !== null) {
          planned.splice(planned.indexOf(stageAction), 1);
          stageAction = null;
        }
        react(snapshot);
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
        });
      }
      await driver.advanceTo(dueMs);
    }
    return Object.freeze({
      ending: "stepLimit",
      finalStage: flow.snapshot().stage,
      presentedTrials: Object.freeze([...presentedTrials]),
      stepCount,
    });
  } finally {
    removeHook();
  }
}
