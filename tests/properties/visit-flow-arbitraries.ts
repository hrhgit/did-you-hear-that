import fc from "fast-check";
import { audioOutputConfig } from "../../src/config/audio-output-config";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import type { VisitType } from "../../src/config/hearing-method-config";
import { calibrationSettingTopDb } from "../../src/audio/output/calibration-setting-top";
import type { HeadphoneCheckAnswer } from "../../src/session/visit-flow-types";
import {
  extremeListeners,
  type ExtremeListenerName,
} from "../listeners/extreme-listeners";
import {
  attentiveListenerParameters,
  plausibleListenerParameters,
} from "../listeners/listener-parameter-arbitraries";
import type {
  ListenerResponse,
  ListenerTrial,
} from "../listeners/listener-types";
import type {
  TimeStampMode,
  VisitorDisturbance,
  VisitorEnding,
  VisitorExtraPress,
  VisitorListenerSpec,
  VisitorReplayBehaviour,
  VisitorScript,
  VisitorSwapCheckAnswer,
  VisitorSwappedRepeatBehaviour,
  VisitorSwappedRepeatEvent,
  VisitorSwappedRepeatFloor,
} from "../listeners/simulated-visitor";
import {
  endingAfterStartMaxMs,
  replayScriptArbitrary,
  startReplayMaxMs,
} from "./missed-sound-replay-arbitraries";

// Visitor scripts for the visit flow's properties (visit-flow design.md, "Correctness
// properties", the visitor script). A script says everything a Simulated_Visitor does; a run adds
// the flow's seed and the harness's clock offset P.

/** The answers drawn from 0 to this many milliseconds after a window opens, so that some fall after it. */
export const answerDelayMaxMs = hearingMethodConfig.responseWindowMs + 500;
/** The longest rest before a `proceed`. */
export const restMaxMs = 30_000;
/** The longest wait between a disturbance and the visitor's `resume`. */
export const resumeAfterMaxMs = 10_000;
/** The most disturbances in one script. */
export const disturbanceMaxCount = 4;
/** The most extra presses in one script. */
export const extraPressMaxCount = 12;
/**
 * Extra presses, disturbances and the ending fall from 0 to this many milliseconds after the
 * visitor chose the visit: past the end of most full visits, so that some come after the result.
 */
export const scriptSpanMs = 15 * 60_000;
/** The largest clock offset P between the audio clock and the timer. */
export const performanceOffsetMaxMs = 1_000_000;

const seedArbitrary = fc.integer({ min: 0, max: 0xffffffff });

const visitTypeArbitrary: fc.Arbitrary<VisitType> = fc.constantFrom(
  "quick",
  "full",
);

/** A setting on the control's grid from the Keep_Minimum to the top (−40 to −4 dB with the shipped config). */
export const calibrationTargetArbitrary: fc.Arbitrary<number> = fc
  .integer({
    min: 0,
    max: Math.floor(
      (calibrationSettingTopDb() -
        audioOutputConfig.calibrationSettingKeepMinDb) /
        audioOutputConfig.calibrationSettingStepDb,
    ),
  })
  .map(
    (steps) =>
      audioOutputConfig.calibrationSettingKeepMinDb +
      steps * audioOutputConfig.calibrationSettingStepDb,
  );

const headphoneCheckAnswerArbitrary: fc.Arbitrary<HeadphoneCheckAnswer> =
  fc.constantFrom("left", "right", "bothSides", "nothingHeard");

const extremeListenerNames = Object.keys(
  extremeListeners,
) as ExtremeListenerName[];

/**
 * A listener: Psychometric_Listener parameters from the Plausible or the Attentive range, one of
 * the five Extreme_Listeners, or any function of the trial's kind, ear, level and position.
 */
export const visitorListenerArbitrary: fc.Arbitrary<VisitorListenerSpec> =
  fc.oneof(
    fc.record({
      kind: fc.constant("psychometric" as const),
      parameters: fc.oneof(
        plausibleListenerParameters(hearingMethodConfig),
        attentiveListenerParameters(hearingMethodConfig),
      ),
      seed: seedArbitrary,
    }),
    fc.record({
      kind: fc.constant("extreme" as const),
      name: fc.constantFrom(...extremeListenerNames),
      seed: seedArbitrary,
    }),
    fc
      .func<unknown[], ListenerResponse>(
        fc.constantFrom<ListenerResponse>("left", "right", "none"),
      )
      .map((answerOf): VisitorListenerSpec => ({
        kind: "function",
        respond: (trial: ListenerTrial, position: number) =>
          trial.kind === "sound"
            ? answerOf(trial.kind, trial.ear, trial.levelDb, position)
            : answerOf(trial.kind, null, null, position),
      })),
  );

const allTimeStampModes: readonly TimeStampMode[] = [
  "now",
  "earlier",
  "missing",
  "nan",
  "future",
];

const scriptTimeArbitrary = fc.integer({ min: 0, max: scriptSpanMs });

const extraPressArbitrary: fc.Arbitrary<VisitorExtraPress> = fc.record({
  atMs: scriptTimeArbitrary,
  side: fc.constantFrom("left" as const, "right" as const),
});

const disturbanceArbitrary: fc.Arbitrary<VisitorDisturbance> = fc.record({
  atMs: scriptTimeArbitrary,
  kind: fc.constantFrom(
    "pause" as const,
    "hidden" as const,
    "interrupted" as const,
    "deviceChanged" as const,
  ),
  resumeAfterMs: fc.integer({ min: 0, max: resumeAfterMaxMs }),
});

const endingArbitrary: fc.Arbitrary<VisitorEnding> = fc.record({
  atMs: scriptTimeArbitrary,
  kind: fc.constantFrom("stop" as const, "pageLeft" as const),
});

/**
 * A visitor script as the design draws it: a visit type; a calibration target from the
 * Keep_Minimum to the top; a first headphone check answer (anything but `left` is followed by
 * `left`); a listener; answer delays from 0 to `responseWindowMs + 500` ms after the window opens
 * and time stamps of the modes drawn, from the visitor's seeded source; extra presses; up to four
 * disturbances, each followed by `resume` after 0 to 10 s; at most one ending; and rests of 0 to
 * 30 s before each `proceed`.
 *
 * `withEnding: false` gives scripts without an ending, `withDisturbances: false` scripts without
 * disturbances, for the properties that ask for a visit that reaches the result.
 */
export function visitorScriptArbitrary(
  options: {
    readonly withEnding?: boolean;
    readonly withDisturbances?: boolean;
  } = {},
): fc.Arbitrary<VisitorScript> {
  const { withEnding = true, withDisturbances = true } = options;
  return fc.record({
    visitType: visitTypeArbitrary,
    calibrationTargetDb: calibrationTargetArbitrary,
    firstHeadphoneCheckAnswer: headphoneCheckAnswerArbitrary,
    listener: visitorListenerArbitrary,
    visitorSeed: seedArbitrary,
    answerDelayMaxMs: fc.constant(answerDelayMaxMs),
    timeStampModes: fc.subarray([...allTimeStampModes], { minLength: 1 }),
    restMaxMs: fc.constant(restMaxMs),
    extraPresses: fc.array(extraPressArbitrary, {
      maxLength: extraPressMaxCount,
    }),
    disturbances: withDisturbances
      ? fc.array(disturbanceArbitrary, { maxLength: disturbanceMaxCount })
      : fc.constant([]),
    ending: withEnding ? fc.option(endingArbitrary) : fc.constant(null),
  });
}

/** One run: the flow's seed, the clock offset P, and the visitor's script. */
export interface VisitRun {
  readonly seed: number;
  readonly performanceOffsetMs: number;
  readonly script: VisitorScript;
}

/** A run with any flow seed, any P from 0 to 10⁶ ms, and a script of `visitorScriptArbitrary(options)`. */
export function visitRunArbitrary(
  options: Parameters<typeof visitorScriptArbitrary>[0] = {},
): fc.Arbitrary<VisitRun> {
  return fc.record({
    seed: seedArbitrary,
    performanceOffsetMs: fc.integer({ min: 0, max: performanceOffsetMaxMs }),
    script: visitorScriptArbitrary(options),
  });
}

/**
 * A replay behaviour of the visitor (missed-sound-replay design.md, CP10), for this spec's files
 * only: watch to the end, skip or stop at a drawn time after the start press, or the starts and
 * events of a replay script. Start presses come 0 to 30 s after the stage is entered, and a skip
 * or a stop 0 to 40 s after the press.
 */
export const visitorReplayBehaviourArbitrary: fc.Arbitrary<VisitorReplayBehaviour> =
  fc.oneof(
    fc.record({
      kind: fc.constant("watch" as const),
      startAfterMs: fc.integer({ min: 0, max: startReplayMaxMs }),
    }),
    fc.record({
      kind: fc.constantFrom("skip" as const, "stop" as const),
      startAfterMs: fc.integer({ min: 0, max: startReplayMaxMs }),
      endAfterStartMs: fc.integer({ min: 0, max: endingAfterStartMaxMs }),
    }),
    replayScriptArbitrary.map(
      ({ startTimesMs, events }): VisitorReplayBehaviour => ({
        kind: "script",
        startTimesMs,
        events,
      }),
    ),
  );

/**
 * A run of `visitRunArbitrary(options)` whose visitor script has a replay behaviour of
 * `visitorReplayBehaviourArbitrary`, for this spec's files only.
 */
export function replayVisitRunArbitrary(
  options: Parameters<typeof visitorScriptArbitrary>[0] = {},
): fc.Arbitrary<VisitRun> {
  return fc
    .record({
      run: visitRunArbitrary(options),
      replay: visitorReplayBehaviourArbitrary,
    })
    .map(({ run, replay }) => ({ ...run, script: { ...run.script, replay } }));
}

// ─── The swapped repeat (swapped-repeat design.md, CP10), for that spec's files only ──────────

/** The latest time of a swapped-repeat event, from the moment the visitor first sees the stage. */
export const swappedRepeatEventMaxMs = 4 * 60_000;
/** The most events of one swapped-repeat behaviour. */
export const swappedRepeatEventMaxCount = 4;
/** The longest delay before a press the visitor makes in the swapped repeat. */
export const swappedRepeatPressDelayMaxMs = 3000;

const swappedRepeatFloorArbitrary: fc.Arbitrary<VisitorSwappedRepeatFloor> =
  fc.oneof(
    { arbitrary: fc.constant({ kind: "firstOffered" as const }), weight: 3 },
    { arbitrary: fc.constant({ kind: "lastOffered" as const }), weight: 3 },
    {
      arbitrary: fc.record({
        kind: fc.constant("drawnOffered" as const),
        // From 0 to below 1, in thousandths.
        fraction: fc.integer({ min: 0, max: 999 }).map((n) => n / 1000),
      }),
      weight: 3,
    },
    { arbitrary: fc.constant({ kind: "notOffered" as const }), weight: 1 },
  );

const swapCheckAnswerArbitrary: fc.Arbitrary<VisitorSwapCheckAnswer> = fc.oneof(
  { arbitrary: fc.constant("heard" as const), weight: 3 },
  { arbitrary: fc.constant("bothSides" as const), weight: 1 },
  { arbitrary: fc.constant("nothingHeard" as const), weight: 1 },
);

const swappedRepeatActions: readonly VisitorSwappedRepeatEvent["action"][] = [
  "proceed",
  "stop",
  "pause",
  "resume",
  "hidden",
  "interrupted",
  "deviceChanged",
  "pageLeft",
  "refusedPress",
];

const resumingSwappedRepeatActions: readonly VisitorSwappedRepeatEvent["action"][] =
  ["pause", "hidden", "interrupted"];

const swappedRepeatEventArbitrary: fc.Arbitrary<VisitorSwappedRepeatEvent> = fc
  .record({
    atMs: fc.integer({ min: 0, max: swappedRepeatEventMaxMs }),
    action: fc.constantFrom(...swappedRepeatActions),
    resumeAfterMs: fc.option(fc.integer({ min: 0, max: resumeAfterMaxMs }), {
      freq: 4,
    }),
  })
  .map((event) => ({
    ...event,
    resumeAfterMs: resumingSwappedRepeatActions.includes(event.action)
      ? event.resumeAfterMs
      : null,
  }));

/**
 * A swapped-repeat behaviour of the visitor (swapped-repeat design.md, "What tests/listeners
 * gains", CP10), for that spec's files only: the floor named (the lowest, the highest or a drawn
 * offered floor nine times in ten, a floor that does not offer it otherwise); whether the visitor
 * swaps on the first instruction (three times in four); its first answer to the swap check (the
 * side the hiss reached three times in five, otherwise both sides or nothing heard); press delays
 * of 0 to 3 s; one time in two no event, otherwise one to four events of the stage at times from 0
 * to 4 minutes after it is entered, each pause, hidden page or interruption followed by `resume`
 * after 0 to 10 s or at once; and whether it turns the headphones back on reading the
 * Turn_Back_Line.
 */
export const visitorSwappedRepeatBehaviourArbitrary: fc.Arbitrary<VisitorSwappedRepeatBehaviour> =
  fc.record({
    floor: swappedRepeatFloorArbitrary,
    swapsOnFirstInstruction: fc.oneof(
      { arbitrary: fc.constant(true), weight: 3 },
      { arbitrary: fc.constant(false), weight: 1 },
    ),
    firstCheckAnswer: swapCheckAnswerArbitrary,
    pressDelayMaxMs: fc.constant(swappedRepeatPressDelayMaxMs),
    events: fc.oneof(
      { arbitrary: fc.constant([]), weight: 1 },
      {
        arbitrary: fc.array(swappedRepeatEventArbitrary, {
          minLength: 1,
          maxLength: swappedRepeatEventMaxCount,
        }),
        weight: 1,
      },
    ),
    turnsBack: fc.boolean(),
  });
