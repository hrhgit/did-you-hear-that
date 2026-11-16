import fc from "fast-check";
import { audioOutputConfig } from "../../src/config/audio-output-config";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { roomSearchCapDb } from "../../src/session/room-search-cap";
import type { Ear, VisitLog } from "../../src/session/visit-flow-types";
import {
  attentiveListenerParameters,
  plausibleListenerParameters,
} from "../listeners/listener-parameter-arbitraries";
import type { PsychometricListenerParameters } from "../listeners/psychometric-listener";
import type { TimeStampMode } from "../listeners/simulated-visitor";
import type { RefusalScriptEntry } from "./missed-sound-replay-arbitraries";
import {
  refusalScriptArbitrary,
  visitLogArbitrary,
} from "./missed-sound-replay-arbitraries";

// The arbitraries of the swapped repeat's properties (swapped-repeat design.md, "Correctness
// properties"). Task 6 added the first: an ear difference and a headphone imbalance with a base
// level, a search cap and two engine seeds, for CP1. Task 9 adds the visit logs at the result for
// the controller-level properties, the repeat scripts and the refusal scripts. Task 15 adds the
// saved visits.

const {
  floorDb,
  upwardStepDb: stepDb,
  capRelativeToAnchorDb,
  swappedRepeatDifferenceDb,
} = hearingMethodConfig;

/** E and H are drawn from −40 to 40 dB (design.md, "Correctness properties"). */
const differenceRangeDb = 40;

/** One run in ten puts the base level where a threshold may lie beyond the floor or the cap. */
const insideWeight = 9;
const beyondWeight = 1;

/** How far beyond the floor and the cap a base level of a run "beyond" may reach. */
const beyondRangeDb = 20;

const seedMax = 2 ** 32 - 1;

/** One case of "Correct attribution". */
export interface AttributionCase {
  /** Ear_Difference E: the true right threshold minus the true left threshold, by ear. */
  readonly earDifferenceDb: number;
  /** Headphone_Imbalance H: how much quieter the right earpiece plays than the left. */
  readonly imbalanceDb: number;
  /** The middle of the two true thresholds: left at base − E/2, right at base + E/2. */
  readonly baseDb: number;
  /** The search's cap, on the level grid. */
  readonly searchCapDb: number;
  /** Whether every threshold heard through an earpiece lies at least one step inside the floor and the cap. */
  readonly inside: boolean;
  /** The engine seed of the first run, as marked. */
  readonly firstEngineSeed: number;
  /** The engine seed of the repeat, swapped. */
  readonly repeatEngineSeed: number;
}

/** A whole number of decibels from −40 to 40. */
const anyDifferenceArbitrary = fc.integer({
  min: -differenceRangeDb,
  max: differenceRangeDb,
});

/** A whole number of decibels within one step of the limit, of either sign. */
const nearLimitArbitrary = fc
  .tuple(
    fc.integer({
      min: swappedRepeatDifferenceDb - stepDb,
      max: swappedRepeatDifferenceDb + stepDb,
    }),
    fc.boolean(),
  )
  .map(([size, negative]) => (negative ? -size : size));

/**
 * E and H: one run in four with E = 0, one in four with H = 0, one in four with |E| or |H| within
 * one step of 15, and the rest with both anywhere from −40 to 40.
 */
const differencesArbitrary: fc.Arbitrary<{
  readonly earDifferenceDb: number;
  readonly imbalanceDb: number;
}> = fc.oneof(
  anyDifferenceArbitrary.map((imbalanceDb) => ({
    earDifferenceDb: 0,
    imbalanceDb,
  })),
  anyDifferenceArbitrary.map((earDifferenceDb) => ({
    earDifferenceDb,
    imbalanceDb: 0,
  })),
  fc
    .tuple(nearLimitArbitrary, anyDifferenceArbitrary, fc.boolean())
    .map(([near, other, earNear]) =>
      earNear
        ? { earDifferenceDb: near, imbalanceDb: other }
        : { earDifferenceDb: other, imbalanceDb: near },
    ),
  fc.record({
    earDifferenceDb: anyDifferenceArbitrary,
    imbalanceDb: anyDifferenceArbitrary,
  }),
);

/** A search cap on the level grid from the lowest room top to the anchor cap: 0, 5, 10 or 15 dB. */
const searchCapArbitrary = fc
  .integer({
    min: 0,
    max: (capRelativeToAnchorDb - audioOutputConfig.roomTopMinDb) / stepDb,
  })
  .map((steps) => audioOutputConfig.roomTopMinDb + steps * stepDb);

/**
 * The base levels, as whole numbers, that put the four thresholds heard through an earpiece,
 * base ± E/2 ± H/2, at least one step inside the floor and the cap; null when none does.
 */
function insideBaseRange(
  earDifferenceDb: number,
  imbalanceDb: number,
  searchCapDb: number,
): { readonly min: number; readonly max: number } | null {
  const halfSpreadDb = (Math.abs(earDifferenceDb) + Math.abs(imbalanceDb)) / 2;
  const min = Math.ceil(floorDb + stepDb + halfSpreadDb);
  const max = Math.floor(searchCapDb - stepDb - halfSpreadDb);
  return min <= max ? { min, max } : null;
}

/** Every threshold heard through an earpiece, for a base level. */
export function earpieceThresholdsDb(
  earDifferenceDb: number,
  imbalanceDb: number,
  baseDb: number,
): readonly number[] {
  const left = baseDb - earDifferenceDb / 2;
  const right = baseDb + earDifferenceDb / 2;
  const half = imbalanceDb / 2;
  // Through the left earpiece a sound plays H/2 louder, so its threshold is H/2 lower; through
  // the right earpiece H/2 higher.
  return [left - half, left + half, right - half, right + half];
}

/**
 * An ear difference and an imbalance, a base level, a search cap and two engine seeds (CP1). Nine
 * runs in ten whose differences fit put every threshold heard through an earpiece at least one
 * step inside the floor and the cap; the others, and every run whose differences do not fit,
 * draw the base level from 20 dB beyond the floor to 20 dB beyond the cap, so that ears without a
 * level occur.
 */
export const attributionCaseArbitrary: fc.Arbitrary<AttributionCase> = fc
  .tuple(differencesArbitrary, searchCapArbitrary)
  .chain(([{ earDifferenceDb, imbalanceDb }, searchCapDb]) => {
    const inside = insideBaseRange(earDifferenceDb, imbalanceDb, searchCapDb);
    const beyond = fc.integer({
      min: floorDb - beyondRangeDb,
      max: searchCapDb + beyondRangeDb,
    });
    const base: fc.Arbitrary<number> =
      inside === null
        ? beyond
        : fc.oneof(
            { weight: insideWeight, arbitrary: fc.integer(inside) },
            { weight: beyondWeight, arbitrary: beyond },
          );
    return fc.record({
      earDifferenceDb: fc.constant(earDifferenceDb),
      imbalanceDb: fc.constant(imbalanceDb),
      baseDb: base,
      searchCapDb: fc.constant(searchCapDb),
      firstEngineSeed: fc.integer({ min: 0, max: seedMax }),
      repeatEngineSeed: fc.integer({ min: 0, max: seedMax }),
    });
  })
  .map((drawn) => ({
    ...drawn,
    inside: earpieceThresholdsDb(
      drawn.earDifferenceDb,
      drawn.imbalanceDb,
      drawn.baseDb,
    ).every(
      (thresholdDb) =>
        thresholdDb >= floorDb + stepDb &&
        thresholdDb <= drawn.searchCapDb - stepDb,
    ),
  }));

// ─── Visit logs at the result, for the controller-level properties ─────────────────────────

/** One log in this many has a floor whose first run used an earlier calibration than the last. */
const earlierCalibrationOneInCount = 5;
/** The levels of the first run's two ears are drawn on the grid from here up to the anchor. */
const firstRunLowestDb = floorDb + stepDb;
const firstRunHighestDb = 0;
/** The level of every ear of the other floors: found and alike, so that they offer nothing. */
const otherFloorDb = -30;

/** A visit log at the result, with the floor to repeat (CP3 to CP9). */
export interface RepeatLogCase {
  /** Every finished room run has its result; the floor's first run offers the repeat. */
  readonly log: VisitLog;
  /** The floor whose summary offers the repeat. */
  readonly floorIndex: number;
  /** Whether the floor's first run used an earlier calibration than the log's last. */
  readonly earlierCalibration: boolean;
}

const earCounts = {
  presentationCount: 10,
  catchCount: 5,
  wrongSideCount: 0,
  missCount: 5,
};

/** The first run's levels: both on the grid, at least the limit apart, in either order. */
const firstRunLevelsArbitrary: fc.Arbitrary<{
  readonly leftDb: number;
  readonly rightDb: number;
}> = fc
  .record({
    lowSteps: fc.integer({
      min: 0,
      max: Math.floor(
        (firstRunHighestDb - firstRunLowestDb - swappedRepeatDifferenceDb) /
          stepDb,
      ),
    }),
    apartSteps: fc.integer({
      min: Math.ceil(swappedRepeatDifferenceDb / stepDb),
      max: Math.floor((firstRunHighestDb - firstRunLowestDb) / stepDb),
    }),
    leftLower: fc.boolean(),
  })
  .map(({ lowSteps, apartSteps, leftLower }) => {
    const lowDb = firstRunLowestDb + lowSteps * stepDb;
    const highDb = Math.min(firstRunHighestDb, lowDb + apartSteps * stepDb);
    const apartDb =
      highDb - lowDb >= swappedRepeatDifferenceDb
        ? highDb
        : lowDb + swappedRepeatDifferenceDb;
    return leftLower
      ? { leftDb: lowDb, rightDb: apartDb }
      : { leftDb: apartDb, rightDb: lowDb };
  });

/**
 * Gives a drawn log of the replay's arbitraries the results a log at the result has: the floor's
 * last finished run found on both ears at the drawn levels, with no sound played at another level
 * than asked, under the last calibration, or under an earlier one when `earlier`; every other
 * finished run found at the same level on both ears. No false alarm is counted, so the visit rule
 * marks nothing and the summary offers the repeat on the floor.
 */
export function repeatLogOf(
  drawn: VisitLog,
  floorIndex: number,
  levels: { readonly leftDb: number; readonly rightDb: number },
  earlier: boolean,
): VisitLog {
  const calibrations =
    earlier && drawn.calibrations.length === 1
      ? [
          ...drawn.calibrations,
          {
            ...drawn.calibrations[0]!,
            calibrationIndex: 1,
            keptAtMs: drawn.calibrations[0]!.keptAtMs + 1,
          },
        ]
      : [...drawn.calibrations];
  const lastIndex = calibrations.length - 1;
  let floorAttempt = -1;
  drawn.roomAttempts.forEach((attempt, index) => {
    if (attempt.roomIndex === floorIndex && attempt.ending === "finished") {
      floorAttempt = index;
    }
  });
  const floorRoom = drawn.rooms[floorIndex]!;
  const roomAttempts = drawn.roomAttempts.map((attempt, index) => {
    if (attempt.ending !== "finished") {
      return attempt;
    }
    const noSoundTrialCount = drawn.trials.filter(
      (trial) =>
        trial.roomIndex === attempt.roomIndex &&
        trial.attempt === attempt.attempt &&
        trial.kind === "noSound" &&
        trial.status === "scored",
    ).length;
    const isFloor = index === floorAttempt;
    const calibrationIndex = !isFloor
      ? attempt.calibrationIndex
      : earlier
        ? Math.min(attempt.calibrationIndex, lastIndex - 1)
        : lastIndex;
    return {
      ...attempt,
      calibrationIndex,
      searchCapDb: isFloor
        ? roomSearchCapDb(
            calibrations[calibrationIndex]!.roomTopLevelDb[floorRoom.roomId],
            hearingMethodConfig,
          )
        : attempt.searchCapDb,
      result: {
        left: {
          ...earCounts,
          state: "found" as const,
          thresholdDb: isFloor ? levels.leftDb : otherFloorDb,
        },
        right: {
          ...earCounts,
          state: "found" as const,
          thresholdDb: isFloor ? levels.rightDb : otherFloorDb,
        },
        noSoundTrialCount,
        falseAlarmCount: 0,
        falseAlarmRateFraction: 0,
        falseAlarmRateAboveLimit: false,
      },
    };
  });
  const floorRun = drawn.roomAttempts[floorAttempt]!;
  const trials = drawn.trials.map((trial) =>
    trial.kind === "sound" &&
    trial.roomIndex === floorIndex &&
    trial.attempt === floorRun.attempt
      ? {
          ...trial,
          playedLevelDb: trial.requestedLevelDb,
          clampLimit: null,
        }
      : trial,
  );
  return deepFreezeLog({
    ...drawn,
    calibrations,
    roomAttempts,
    trials,
  });
}

function deepFreezeLog<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreezeLog(nested);
    }
  }
  return value;
}

/** A visit log at the result, with or without a floor that used an earlier calibration. */
function repeatLogCases(withEarlier: boolean): fc.Arbitrary<RepeatLogCase> {
  return visitLogArbitrary
    .filter(({ plan }) => plan.rooms.every((room) => room.finished !== null))
    .chain(({ log }) =>
      fc.record({
        drawn: fc.constant(log),
        floorIndex: fc.integer({ min: 0, max: log.rooms.length - 1 }),
        levels: firstRunLevelsArbitrary,
        earlierCalibration: withEarlier
          ? fc
              .integer({ min: 1, max: earlierCalibrationOneInCount })
              .map((pick) => pick === 1)
          : fc.constant(false),
      }),
    )
    .map(({ drawn, floorIndex, levels, earlierCalibration }) => ({
      log: repeatLogOf(drawn, floorIndex, levels, earlierCalibration),
      floorIndex,
      earlierCalibration,
    }));
}

/**
 * A visit log at the result (CP3 to CP9): a drawn log of the replay's arbitraries in which every
 * room has a finished run, given results by `repeatLogOf` with a drawn floor that offers the
 * repeat. One log in five has a floor that used an earlier calibration.
 */
export const repeatLogCaseArbitrary: fc.Arbitrary<RepeatLogCase> =
  repeatLogCases(true);

/** A visit log at the result whose floor used the last calibration, so that the repeat can run (CP4). */
export const runnableRepeatLogCaseArbitrary: fc.Arbitrary<RepeatLogCase> =
  repeatLogCases(false);

// ─── Repeat scripts ────────────────────────────────────────────────────────────────────────

/** The latest time of a scripted event of one visit to the stage: ten minutes. */
export const repeatEventMaxMs = 10 * 60_000;
/** The most scripted events of one visit to the stage. */
export const repeatEventMaxCount = 6;
/** The most stray presses of one visit to the stage. */
export const repeatStrayPressMaxCount = 4;
/** The longest wait from a pause, or a pause report, to the resume that follows it. */
export const repeatResumeAfterMaxMs = 10_000;
/** The longest delay before a press the visitor makes in answer to what the stage shows. */
export const repeatPressDelayMaxMs = 3000;
/** The most answers to the check a script lists; after them the visitor answers what it heard. */
export const checkAnswerMaxCount = 3;
/** The largest output delay of the fake backend's timestamp pair. */
export const repeatOutputDelayMaxMs = 40;
/** The latest time of the ending of an ending script (CP5): in the first minutes, where the stage plays. */
export const repeatEndingMaxMs = 4 * 60_000;

/** Which floor `chooseSwappedRepeat` names: the one the log case offers, one that does not offer, or one with a record. */
export type RepeatFloorChoice = "offered" | "notOffered" | "recorded";

/** What a scripted event of a visit to the stage does. */
export type RepeatScriptAction =
  | "proceed"
  | "stop"
  | "pause"
  | "resume"
  | "hidden"
  | "interrupted"
  | "deviceChanged"
  | "pageLeft"
  /** The press the stage asks for now, while the fake backend refuses activation. */
  | "refusedPress";

export const repeatScriptActions: readonly RepeatScriptAction[] = [
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

/** One scripted event. Times are from the moment the visitor chose the floor. */
export interface RepeatScriptEvent {
  readonly atMs: number;
  readonly action: RepeatScriptAction;
  /** For `pause`, `hidden` and `interrupted`: the wait to the `resume` that follows, or null. */
  readonly resumeAfterMs: number | null;
}

/** A press of the stage at a drawn time, whatever the phase: possibly twice, possibly in the wrong phase. */
export interface RepeatStrayPress {
  readonly atMs: number;
  readonly name:
    | "confirmSwap"
    | "playSwapCheck"
    | "answerSwapCheck"
    | "startSwappedRoom"
    | "answer";
  /** For `answer` and `answerSwapCheck`: the side named. */
  readonly side: Ear;
}

/** How the visitor answers one check: what the hiss reached in what it wears, or one of the two other answers. */
export type CheckAnswerKind = "heard" | "bothSides" | "nothingHeard";

/** How the visitor moves through one visit to the stage. */
export interface RepeatVisitScript {
  readonly floor: RepeatFloorChoice;
  /** Whether the visitor swaps the earpieces on the first instruction, or confirms without swapping. */
  readonly swapsOnFirstInstruction: boolean;
  /** The visitor's answers to the checks, in order; after them it answers what it heard. */
  readonly checkAnswers: readonly CheckAnswerKind[];
  readonly strayPresses: readonly RepeatStrayPress[];
  readonly events: readonly RepeatScriptEvent[];
  /** Whether the visitor turns the headphones back on reading the Turn_Back_Line. */
  readonly turnsBack: boolean;
}

/** Psychometric listener parameters, as the visit flow's scripts draw them. */
export interface RepeatListener {
  readonly parameters: PsychometricListenerParameters;
  readonly seed: number;
}

/** How the visitor and the browser move through the stage, once or twice (design.md, "A repeat script"). */
export interface RepeatScript {
  /** One or two visits to the stage, one after the other. */
  readonly visits: readonly RepeatVisitScript[];
  readonly listener: RepeatListener;
  /** Headphone_Imbalance of the headphones the visitor wears. */
  readonly imbalanceDb: number;
  /** The seed of the visitor's delays and time stamps. */
  readonly visitorSeed: number;
  /** The time stamp of each answer is one of these, drawn with equal chance. Not empty. */
  readonly timeStampModes: readonly TimeStampMode[];
  /** How far the page clock of the fake backend's timestamp pair is ahead of its audio clock. */
  readonly outputDelayMs: number;
}

/** A time from 0 to `maxMs`, drawn more often in the first fifth, where the stage plays. */
const repeatTimeArbitrary = (maxMs: number): fc.Arbitrary<number> =>
  fc.oneof(
    { arbitrary: fc.integer({ min: 0, max: maxMs }), weight: 1 },
    {
      arbitrary: fc.integer({ min: 0, max: Math.floor(maxMs / 5) }),
      weight: 3,
    },
  );

const resumingActions: readonly RepeatScriptAction[] = [
  "pause",
  "hidden",
  "interrupted",
];

const repeatScriptEventArbitrary: fc.Arbitrary<RepeatScriptEvent> = fc
  .record({
    atMs: repeatTimeArbitrary(repeatEventMaxMs),
    action: fc.constantFrom(...repeatScriptActions),
    resumeAfterMs: fc.option(
      fc.integer({ min: 0, max: repeatResumeAfterMaxMs }),
      { freq: 4 },
    ),
  })
  .map((event) => ({
    ...event,
    resumeAfterMs: resumingActions.includes(event.action)
      ? event.resumeAfterMs
      : null,
  }));

const repeatStrayPressArbitrary: fc.Arbitrary<RepeatStrayPress> = fc.record({
  atMs: repeatTimeArbitrary(repeatEventMaxMs),
  name: fc.constantFrom<RepeatStrayPress["name"]>(
    "confirmSwap",
    "playSwapCheck",
    "answerSwapCheck",
    "startSwappedRoom",
    "answer",
  ),
  side: fc.constantFrom<Ear>("left", "right"),
});

const repeatVisitScriptArbitrary: fc.Arbitrary<RepeatVisitScript> = fc.record({
  floor: fc.oneof(
    { arbitrary: fc.constant<RepeatFloorChoice>("offered"), weight: 8 },
    { arbitrary: fc.constant<RepeatFloorChoice>("notOffered"), weight: 1 },
    { arbitrary: fc.constant<RepeatFloorChoice>("recorded"), weight: 1 },
  ),
  swapsOnFirstInstruction: fc.oneof(
    { arbitrary: fc.constant(true), weight: 3 },
    { arbitrary: fc.constant(false), weight: 1 },
  ),
  checkAnswers: fc.array(
    fc.oneof(
      { arbitrary: fc.constant<CheckAnswerKind>("heard"), weight: 3 },
      { arbitrary: fc.constant<CheckAnswerKind>("bothSides"), weight: 1 },
      { arbitrary: fc.constant<CheckAnswerKind>("nothingHeard"), weight: 1 },
    ),
    { maxLength: checkAnswerMaxCount },
  ),
  strayPresses: fc.array(repeatStrayPressArbitrary, {
    maxLength: repeatStrayPressMaxCount,
  }),
  events: fc.array(repeatScriptEventArbitrary, {
    maxLength: repeatEventMaxCount,
  }),
  turnsBack: fc.boolean(),
});

const allTimeStampModes: readonly TimeStampMode[] = [
  "now",
  "earlier",
  "missing",
  "nan",
  "future",
];

const repeatListenerArbitrary: fc.Arbitrary<RepeatListener> = fc.record({
  parameters: fc.oneof(
    attentiveListenerParameters(hearingMethodConfig),
    plausibleListenerParameters(hearingMethodConfig),
  ),
  seed: fc.integer({ min: 0, max: seedMax }),
});

/** A repeat script: one visit to the stage in two, two in one, with a listener, an imbalance and an output delay. */
export const repeatScriptArbitrary: fc.Arbitrary<RepeatScript> = fc.record({
  visits: fc.oneof(
    {
      arbitrary: fc.tuple(repeatVisitScriptArbitrary),
      weight: 1,
    },
    {
      arbitrary: fc.tuple(
        repeatVisitScriptArbitrary,
        repeatVisitScriptArbitrary,
      ),
      weight: 1,
    },
  ),
  listener: repeatListenerArbitrary,
  imbalanceDb: anyDifferenceArbitrary,
  visitorSeed: fc.integer({ min: 0, max: seedMax }),
  timeStampModes: fc.subarray([...allTimeStampModes], { minLength: 1 }),
  outputDelayMs: fc.integer({ min: 0, max: repeatOutputDelayMaxMs }),
});

/** A repeat script whose first visit ends with `proceed`, `stop` or a left page at a drawn time (CP5). */
export interface EndingRepeatScript extends RepeatScript {
  readonly ending: {
    readonly atMs: number;
    readonly action: "proceed" | "stop" | "pageLeft";
  };
}

export const endingRepeatScriptArbitrary: fc.Arbitrary<EndingRepeatScript> =
  fc.record({
    visits: fc
      .tuple(repeatVisitScriptArbitrary)
      .map(([visit]) => [{ ...visit, floor: "offered" as const }]),
    listener: repeatListenerArbitrary,
    imbalanceDb: anyDifferenceArbitrary,
    visitorSeed: fc.integer({ min: 0, max: seedMax }),
    timeStampModes: fc.subarray([...allTimeStampModes], { minLength: 1 }),
    outputDelayMs: fc.integer({ min: 0, max: repeatOutputDelayMaxMs }),
    ending: fc.record({
      atMs: repeatTimeArbitrary(repeatEndingMaxMs),
      action: fc.constantFrom("proceed", "stop", "pageLeft"),
    }),
  });

/** A repeat script whose first visit names the offered floor and swaps at once, so that it reaches the room unless an event ends it (CP4, CP8). */
export const roomRepeatScriptArbitrary: fc.Arbitrary<RepeatScript> =
  repeatScriptArbitrary.map((script) => ({
    ...script,
    visits: script.visits.map((visit, index) =>
      index === 0
        ? { ...visit, floor: "offered" as const, swapsOnFirstInstruction: true }
        : visit,
    ),
  }));

// ─── Refusal scripts ───────────────────────────────────────────────────────────────────────

/** What the scripted output does with the trial sounds and with the checks, each in order (CP6). */
export interface RepeatRefusalScript {
  readonly play: readonly RefusalScriptEntry[];
  readonly check: readonly RefusalScriptEntry[];
}

/** A refusal script for the trials and one for the checks, as the replay's refusal scripts draw them. */
export const repeatRefusalScriptArbitrary: fc.Arbitrary<RepeatRefusalScript> =
  fc.record({
    play: refusalScriptArbitrary,
    check: refusalScriptArbitrary,
  });

/** The script events that end a visit to the stage: none of them comes in a finishing script. */
const endingActions: readonly RepeatScriptAction[] = [
  "proceed",
  "stop",
  "deviceChanged",
  "pageLeft",
];

/**
 * A repeat script that reaches the end of the room (CP4): one visit to the offered floor, in which
 * the visitor swaps at once, every pause is followed by a resume, and no event ends the stage.
 */
export const finishingRepeatScriptArbitrary: fc.Arbitrary<RepeatScript> = fc
  .tuple(
    repeatScriptArbitrary,
    fc.integer({ min: 0, max: repeatResumeAfterMaxMs }),
  )
  .map(([script, resumeAfterMs]) => ({
    ...script,
    visits: [
      {
        ...script.visits[0]!,
        floor: "offered" as const,
        swapsOnFirstInstruction: true,
        events: script.visits[0]!.events.filter(
          (event) => !endingActions.includes(event.action),
        ).map((event) =>
          resumingActions.includes(event.action)
            ? { ...event, resumeAfterMs: event.resumeAfterMs ?? resumeAfterMs }
            : event,
        ),
      },
    ],
  }));
