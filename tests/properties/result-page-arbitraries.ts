import fc from "fast-check";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import type { VisitType } from "../../src/config/hearing-method-config";
import { resultPageConfig } from "../../src/config/result-page-config";
import { ghostSoundIds } from "../../src/config/sound-id";
import type { GhostSoundId } from "../../src/config/sound-id";
import { canonicalHeadphoneName } from "../../src/session/canonical-headphone-name";
import { createVisitArchive } from "../../src/session/create-visit-archive";
import type {
  DeleteOutcome,
  ResultPictureInput,
  SavedVisit,
  SavedVisitList,
  SaveOutcome,
  StorageArea,
  SwappedRepeatRun,
  VisitArchive,
  VisitToSave,
  WallClock,
  WallTime,
} from "../../src/session/result-page-types";
import { savedVisitPayloadJson } from "../../src/session/saved-visit-payload";
import { summarizeVisit } from "../../src/session/summarize-visit";
import type { SummarizeVisitSettings } from "../../src/session/summarize-visit";
import type {
  LoggedEarResult,
  LoggedIgnoredAnswer,
  LoggedRoomAttempt,
  UnreliableReason,
  VisitLog,
  VisitTrial,
} from "../../src/session/visit-flow-types";
import { visitRooms } from "../../src/session/visit-rooms";
import { entryChecksum } from "../../src/storage/entry-checksum";
import { createFakeStorageArea } from "../../src/storage/fake-storage-area";
import type { FakeStorageArea } from "../../src/storage/fake-storage-area";
import {
  savedVisitsFormatVersion,
  savedVisitsKey,
} from "../../src/storage/saved-visits-key";
import type { StoreEntryFields } from "../../src/storage/visit-store-types";

// The arbitraries of the result page's properties (result-page design.md, "Correctness
// properties"): visits and their summaries, picture inputs, typed headphone names, the list
// scenarios of CP1 and CP2, saving through an archive, stored values an archive wrote and then
// changed, and storage behaviours. The visits are hand-built visit logs whose summaries come from
// `summarizeVisit` itself, so every summary has every invariant the visit flow gives one.
// Earlier visits, and the lists and names that `findEarlierVisit` chooses one from, are drawn for
// the comparison (tasks 12 and 13): CP1 and CP2 draw an earlier visit or none, and CP9 checks the
// choice and the outlines.

const { floorDb, capRelativeToAnchorDb, swappedRepeatDifferenceDb } =
  hearingMethodConfig;

/** The 5 dB grid of the levels the search asks for. */
export const levelGridStepDb = 5;

/** The most no-sound trials one room is drawn with. */
export const noSoundTrialMaxCount = 13;
/** The most ignored answers one visit is drawn with. */
export const ignoredAnswerMaxCount = 40;
/** The most of any one count of an ear result. */
export const earCountMaxCount = 40;
/** The visit limits drawn, in thousandths: 0.05 to 0.30. */
export const visitLimitMinPerMille = 50;
export const visitLimitMaxPerMille = 300;
/** The swapped-repeat differences drawn for the picture properties. */
export const swappedRepeatDifferenceMinDb = 5;
export const swappedRepeatDifferenceMaxDb = 30;
/** The `floorDb` of a saved visit, drawn from −80 to −40. */
export const savedFloorMinDb = -80;
export const savedFloorMaxDb = -40;

/** The first and last local dates drawn: 2026-01-01 to 2030-12-31. */
const firstDateEpochMs = Date.UTC(2026, 0, 1);
const lastDateEpochMs = Date.UTC(2030, 11, 31);
const dayMs = 86_400_000;

export const seedArbitrary = fc.integer({ min: 0, max: 0xffffffff });

export const visitTypeArbitrary: fc.Arbitrary<VisitType> = fc.constantFrom(
  "full",
  "full",
);

/** A local date from 2026-01-01 to 2030-12-31, written "YYYY-MM-DD". */
export const localDateArbitrary: fc.Arbitrary<string> = fc
  .integer({ min: 0, max: (lastDateEpochMs - firstDateEpochMs) / dayMs })
  .map((days) =>
    new Date(firstDateEpochMs + days * dayMs).toISOString().slice(0, 10),
  );

/** A wall time: any whole epoch millisecond from 2026 to 2031 and a local date. */
export const wallTimeArbitrary: fc.Arbitrary<WallTime> = fc.record({
  epochMs: fc.integer({ min: firstDateEpochMs, max: lastDateEpochMs + dayMs }),
  localDate: localDateArbitrary,
});

/** Eight lowercase hexadecimal digits. */
export const savedVisitIdArbitrary: fc.Arbitrary<string> = seedArbitrary.map(
  (value) => value.toString(16).padStart(8, "0"),
);

/** A level on the 5 dB grid from `floorDb + 5 × lowSteps` to `floorDb + 5 × highSteps`. */
function gridLevelArbitrary(
  lowSteps: number,
  highSteps: number,
): fc.Arbitrary<number> {
  return fc
    .integer({ min: lowSteps, max: highSteps })
    .map((steps) => floorDb + levelGridStepDb * steps);
}

const capStepCount = (capRelativeToAnchorDb - floorDb) / levelGridStepDb;

const earCountsArbitrary = fc.record({
  presentationCount: fc.integer({ min: 0, max: earCountMaxCount }),
  catchCount: fc.integer({ min: 0, max: earCountMaxCount }),
  wrongSideCount: fc.integer({ min: 0, max: earCountMaxCount }),
  missCount: fc.integer({ min: 0, max: earCountMaxCount }),
});

const searchReasons: readonly UnreliableReason[] = [
  "trialLimit",
  "inconsistentCatch",
  "falseAlarmRate",
];

/** An ear result as the search gives it, in any of the four states, on a floor of this cap. */
export function loggedEarResultArbitrary(
  searchCapDb: number,
): fc.Arbitrary<LoggedEarResult> {
  const capSteps = (searchCapDb - floorDb) / levelGridStepDb;
  // Found is drawn as often as the other three together, so that both ears of a floor are often
  // found and the floor has a left and right difference.
  return fc.oneof(
    {
      arbitrary: fc
        .tuple(earCountsArbitrary, gridLevelArbitrary(0, capSteps))
        .map(([counts, thresholdDb]): LoggedEarResult => ({
          ...counts,
          state: "found",
          thresholdDb,
        })),
      weight: 3,
    },
    earCountsArbitrary.map((counts): LoggedEarResult => ({
      ...counts,
      state: "betterThanFloor",
    })),
    earCountsArbitrary.map((counts): LoggedEarResult => ({
      ...counts,
      state: "worseThanCap",
    })),
    fc
      .tuple(
        earCountsArbitrary,
        fc.subarray([...searchReasons], { minLength: 1 }),
      )
      .map(([counts, reasons]): LoggedEarResult => ({
        ...counts,
        state: "unreliable",
        reasons,
      })),
  );
}

/** What one room of a drawn visit holds. */
export interface RoomPlan {
  /** On the 5 dB grid from `floorDb + 5` to `capRelativeToAnchorDb`. */
  readonly searchCapDb: number;
  readonly left: LoggedEarResult;
  readonly right: LoggedEarResult;
  readonly noSoundTrialCount: number;
  readonly falseAlarmCount: number;
  /** Whether a device change abandoned a first run of the room. */
  readonly abandonedFirst: boolean;
  /** Whether one decided sound trial was played at another level than asked. */
  readonly levelNotAsAsked: boolean;
}

export const roomPlanArbitrary: fc.Arbitrary<RoomPlan> = gridLevelArbitrary(
  1,
  capStepCount,
).chain((searchCapDb) =>
  fc.integer({ min: 0, max: noSoundTrialMaxCount }).chain((noSoundTrialCount) =>
    fc.record({
      searchCapDb: fc.constant(searchCapDb),
      left: loggedEarResultArbitrary(searchCapDb),
      right: loggedEarResultArbitrary(searchCapDb),
      noSoundTrialCount: fc.constant(noSoundTrialCount),
      // Mostly few false alarms, so that some visits are marked as a whole and most are not.
      falseAlarmCount: fc.oneof(
        { arbitrary: fc.constant(0), weight: 4 },
        {
          arbitrary: fc.integer({
            min: 0,
            max: Math.min(1, noSoundTrialCount),
          }),
          weight: 3,
        },
        {
          arbitrary: fc.integer({ min: 0, max: noSoundTrialCount }),
          weight: 1,
        },
      ),
      abandonedFirst: fc.boolean(),
      levelNotAsAsked: fc.oneof(
        { arbitrary: fc.constant(false), weight: 9 },
        { arbitrary: fc.constant(true), weight: 1 },
      ),
    }),
  ),
);

/**
 * How a drawn visit's calibration anchor was set (audible-start R11): with the music or the hiss,
 * or `absent`, as every visit recorded before the audible-start spec, whose kind is `hands`.
 */
export type DrawnAnchor = "music" | "hiss" | "absent";

/** Any of the three, for the properties of saved visits from before and of anchors (CP10). */
export const drawnAnchorArbitrary: fc.Arbitrary<DrawnAnchor> = fc.constantFrom(
  "music",
  "hiss",
  "absent",
);

/** What a drawn visit holds: one room plan per room of its visit type, and its calibration's anchor. */
export interface VisitPlan {
  readonly visitType: VisitType;
  readonly visitSeed: number;
  readonly rooms: readonly RoomPlan[];
  readonly ignoredAnswerCount: number;
  readonly anchor: DrawnAnchor;
}

/**
 * A visit plan whose anchor is drawn from `anchor`: the music by default, as a visit recorded
 * now, so that every property that compares visits draws visits that may be compared;
 * `drawnAnchorArbitrary` draws saved visits with and without an anchor.
 */
export function visitPlanArbitraryWith(
  anchor: fc.Arbitrary<DrawnAnchor> = fc.constant("music"),
): fc.Arbitrary<VisitPlan> {
  return visitTypeArbitrary.chain((visitType) =>
    fc.record({
      visitType: fc.constant(visitType),
      visitSeed: seedArbitrary,
      rooms: fc.array(roomPlanArbitrary, {
        minLength: visitRooms(visitType).length,
        maxLength: visitRooms(visitType).length,
      }),
      ignoredAnswerCount: fc.integer({ min: 0, max: ignoredAnswerMaxCount }),
      anchor,
    }),
  );
}

export const visitPlanArbitrary: fc.Arbitrary<VisitPlan> =
  visitPlanArbitraryWith();

const roomSpanMs = 200_000;

function finishedAttempt(
  roomIndex: number,
  attempt: number,
  plan: RoomPlan,
): LoggedRoomAttempt {
  const falseAlarmRateFraction =
    plan.noSoundTrialCount > 0
      ? plan.falseAlarmCount / plan.noSoundTrialCount
      : 0;
  const startedAtMs = roomSpanMs * roomIndex + (attempt - 1) * 1000;
  return {
    roomIndex,
    attempt,
    engineSeed: 1000 + roomIndex,
    calibrationIndex: 0,
    searchCapDb: plan.searchCapDb,
    startedAtMs,
    endedAtMs: startedAtMs + 90_000,
    ending: "finished",
    result: {
      left: plan.left,
      right: plan.right,
      noSoundTrialCount: plan.noSoundTrialCount,
      falseAlarmCount: plan.falseAlarmCount,
      falseAlarmRateFraction,
      falseAlarmRateAboveLimit:
        falseAlarmRateFraction >
        hearingMethodConfig.falseAlarmRateUnreliableAboveFraction,
    },
  };
}

function abandonedAttempt(
  roomIndex: number,
  plan: RoomPlan,
): LoggedRoomAttempt {
  const startedAtMs = roomSpanMs * roomIndex;
  return {
    roomIndex,
    attempt: 1,
    engineSeed: 2000 + roomIndex,
    calibrationIndex: 0,
    searchCapDb: plan.searchCapDb,
    startedAtMs,
    endedAtMs: startedAtMs + 500,
    ending: "abandoned",
    result: null,
  };
}

/** A decided sound trial of this room run played 5 dB below the level asked for. */
function levelNotAsAskedTrial(
  order: number,
  roomIndex: number,
  attempt: number,
  plan: RoomPlan,
): VisitTrial {
  const presentedAtMs = roomSpanMs * roomIndex + attempt * 2000;
  return {
    order,
    roomIndex,
    attempt,
    trialNumber: 1,
    gapBeforeMs: 2000,
    presentedAtMs,
    windowStartMs: presentedAtMs + 50,
    kind: "sound",
    ear: "left",
    requestedLevelDb: plan.searchCapDb,
    playedLevelDb: plan.searchCapDb - levelGridStepDb,
    clampLimit: "ceiling",
    status: "scored",
    response: "left",
    outcome: "caught",
    answeredAtMs: presentedAtMs + 700,
    responseTimeMs: 650,
    scoredAtMs: presentedAtMs + 700,
  };
}

/** The visit log of a plan. Only the fields the summary and the payload read carry meaning. */
export function visitLogOf(plan: VisitPlan): VisitLog {
  const rooms = visitRooms(plan.visitType);
  const roomAttempts: LoggedRoomAttempt[] = [];
  const trials: VisitTrial[] = [];
  plan.rooms.forEach((roomPlan, roomIndex) => {
    const attempt = roomPlan.abandonedFirst ? 2 : 1;
    if (roomPlan.abandonedFirst) {
      roomAttempts.push(abandonedAttempt(roomIndex, roomPlan));
    }
    roomAttempts.push(finishedAttempt(roomIndex, attempt, roomPlan));
    if (roomPlan.levelNotAsAsked) {
      trials.push(
        levelNotAsAskedTrial(trials.length + 1, roomIndex, attempt, roomPlan),
      );
    }
  });
  const ignoredAnswers: LoggedIgnoredAnswer[] = Array.from(
    { length: plan.ignoredAnswerCount },
    (_unused, index) => ({
      atMs: 1000 + index * 37,
      side: index % 2 === 0 ? "left" : "right",
      roomIndex: index % rooms.length,
      attempt: 1,
    }),
  );
  const roomTopLevelDb = Object.fromEntries(
    ghostSoundIds.map((roomId) => [roomId, capRelativeToAnchorDb]),
  ) as Record<GhostSoundId, number>;
  return {
    formatVersion: 1,
    visitType: plan.visitType,
    visitSeed: plan.visitSeed,
    rooms,
    calibrations: [
      {
        calibrationIndex: 0,
        settingDb: -22,
        roomTopLevelDb,
        keptAtMs: 500,
        ...(plan.anchor === "absent" ? {} : { anchor: plan.anchor }),
      },
    ],
    headphoneChecks: [
      {
        calibrationIndex: 0,
        answer: "left",
        judgement: "correct",
        answeredAtMs: 900,
      },
    ],
    roomAttempts,
    trials,
    ignoredAnswers,
    pauses: [],
    refusedPlays: [],
  };
}

/** A drawn visit: its plan, the settings of its summary, and the visit itself. */
export interface DrawnVisit {
  readonly plan: VisitPlan;
  readonly settings: SummarizeVisitSettings;
  readonly visit: VisitToSave;
}

/** The visit of a plan, summarized with these settings by `summarizeVisit`. */
export function drawnVisitOf(
  plan: VisitPlan,
  settings: SummarizeVisitSettings,
): DrawnVisit {
  const visitLog = visitLogOf(plan);
  return {
    plan,
    settings,
    visit: { visitLog, summary: summarizeVisit(visitLog, settings) },
  };
}

/** A visit limit from 0.05 to 0.30, in steps of 0.001, so that some limits have a decimal place in percent. */
export const visitLimitArbitrary: fc.Arbitrary<number> = fc.oneof(
  fc.constant(0.2),
  fc
    .integer({ min: visitLimitMinPerMille, max: visitLimitMaxPerMille })
    .map((perMille) => perMille / 1000),
);

/**
 * A visit with any summary settings: the visit limit from 0.05 to 0.30 and, with
 * `anyDifference`, a swapped-repeat difference from 5 to 30 dB (the picture properties);
 * otherwise the shipped difference, which is the one the archive saves (the storage properties).
 */
export function drawnVisitArbitrary(
  options: {
    readonly anyDifference?: boolean;
    /** How the calibration's anchor is drawn; the music by default (audible-start R11). */
    readonly anchor?: fc.Arbitrary<DrawnAnchor>;
  } = {},
): fc.Arbitrary<DrawnVisit> {
  const differenceArbitrary =
    options.anyDifference === true
      ? fc.integer({
          min: swappedRepeatDifferenceMinDb,
          max: swappedRepeatDifferenceMaxDb,
        })
      : fc.constant(swappedRepeatDifferenceDb);
  return fc
    .tuple(
      visitPlanArbitraryWith(options.anchor),
      visitLimitArbitrary,
      differenceArbitrary,
    )
    .map(([plan, visitLimitFraction, differenceDb]) =>
      drawnVisitOf(plan, {
        swappedRepeatDifferenceDb: differenceDb,
        visitFalseAlarmRateUnreliableAboveFraction: visitLimitFraction,
      }),
    );
}

// ─── Typed headphone names ──────────────────────────────────────────────────────────────────

/**
 * Words that occur in no string of the house, so that a name holding one cannot appear in a
 * generated string by chance. Every name that tidies to something holds at least one.
 */
export const nameMarkerWords: readonly string[] = Object.freeze([
  "Zorbex",
  "Quillon",
  "Vexmira",
  "Kappelt",
  "Xunderby",
]);

/** Banned words as a visitor might type them. They are the visitor's text and never reach a sentence. */
const bannedNameWords: readonly string[] = Object.freeze([
  "normal",
  "Deaf",
  "LOSS",
  "test result",
  "Pass",
  "score",
  "audiogram",
]);

/** White space and control characters that tidying makes one space or removes at the ends. */
const nameSpacing = fc.constantFrom(
  " ",
  "  ",
  "\t",
  "\n",
  "\r\n",
  "\u00a0",
  "\u3000",
  "\u0000",
  "\u0007",
  "\u001f",
  "\u0085",
  " \u007f ",
);

/** Name words: markers, banned words, and markers with a combining mark (NFD) or an astral character. */
const nameWord = fc.oneof(
  fc.constantFrom(...nameMarkerWords),
  fc.constantFrom(...bannedNameWords),
  fc.constantFrom("Zorbe\u0301x", "Quillo\u0308n", "Kappelt\u{1F3A7}"),
);

const letterCase = fc.constantFrom(
  (text: string) => text,
  (text: string) => text.toLowerCase(),
  (text: string) => text.toUpperCase(),
);

/** A name of one marker and up to two more words, with any spacing between and around them. */
const composedName: fc.Arbitrary<string> = fc
  .tuple(
    fc.option(nameSpacing, { nil: "" }),
    fc.constantFrom(...nameMarkerWords),
    fc.array(fc.tuple(nameSpacing, nameWord), { maxLength: 2 }),
    fc.option(nameSpacing, { nil: "" }),
    fc.boolean(),
    letterCase,
  )
  .map(([before, marker, rest, after, markerLast, caseOf]) => {
    const words = rest.map(([space, word]) => space + word);
    const body = markerLast
      ? words.join("").trimStart() + " " + marker
      : marker + words.join("");
    return caseOf(before + body + after);
  });

/** A name of exactly `codePointCount` code points after tidying, made of marker letters and one astral character. */
function nameOfLength(codePointCount: number): fc.Arbitrary<string> {
  return fc
    .tuple(fc.constantFrom(...nameMarkerWords), fc.boolean())
    .map(([marker, withAstral]) => {
      const unit = withAstral ? `${marker}\u{1F3A7}` : marker;
      return Array.from(unit.repeat(codePointCount))
        .slice(0, codePointCount)
        .join("");
    });
}

/**
 * A typed headphone name: empty, spacing only, a short name of marker and banned words with any
 * spacing, letter case, line breaks, tabs, control characters and combining marks, a name at the
 * limit and one past it.
 */
export const typedNameArbitrary: fc.Arbitrary<string> = fc.oneof(
  { arbitrary: fc.constant(""), weight: 1 },
  {
    arbitrary: fc
      .array(nameSpacing, { minLength: 1, maxLength: 3 })
      .map((parts) => parts.join("")),
    weight: 1,
  },
  { arbitrary: composedName, weight: 6 },
  {
    arbitrary: nameOfLength(resultPageConfig.headphoneNameMaxCharacterCount),
    weight: 1,
  },
  {
    arbitrary: nameOfLength(
      resultPageConfig.headphoneNameMaxCharacterCount + 1,
    ),
    weight: 1,
  },
);

// ─── Picture inputs ─────────────────────────────────────────────────────────────────────────

/** A drawn picture input and the visit it was made from. */
export interface DrawnPictureInput {
  readonly drawn: DrawnVisit;
  readonly input: ResultPictureInput;
  /** The `floorDb` the picture is drawn with. */
  readonly floorDb: number;
  /** The local date the picture shows. */
  readonly localDate: string;
}

/**
 * A saved visit made directly from a drawn visit, as the archive would list it, with the swapped
 * repeats given, none by default, so that every caller that gives none draws as before
 * (swapped-repeat task 15).
 */
export function savedVisitOfDrawn(
  drawn: DrawnVisit,
  envelope: {
    readonly savedVisitId: string;
    readonly wallTime: WallTime;
    readonly typedName: string;
    readonly floorDb: number;
  },
  swappedRepeats: readonly SwappedRepeatRun[] = [],
): SavedVisit {
  return {
    savedVisitId: envelope.savedVisitId,
    savedAtEpochMs: envelope.wallTime.epochMs,
    savedOnLocalDate: envelope.wallTime.localDate,
    visitType: drawn.visit.visitLog.visitType,
    headphoneName: canonicalHeadphoneName(envelope.typedName),
    summary: drawn.visit.summary,
    visitLog: drawn.visit.visitLog,
    floorDb: envelope.floorDb,
    swappedRepeatDifferenceDb: drawn.settings.swappedRepeatDifferenceDb,
    swappedRepeats,
  };
}

/**
 * A picture input: live with a local date, or saved with a `floorDb` from −80 to −40 and a local
 * date. Its `earlierVisit` is null; `pictureInputWithEarlierArbitrary` draws one or none.
 */
export const pictureInputArbitrary: fc.Arbitrary<DrawnPictureInput> = fc
  .tuple(
    drawnVisitArbitrary({ anyDifference: true }),
    fc.boolean(),
    wallTimeArbitrary,
    fc.integer({ min: savedFloorMinDb, max: savedFloorMaxDb }),
    savedVisitIdArbitrary,
    typedNameArbitrary,
  )
  .map(([drawn, live, wallTime, savedFloorDb, savedVisitId, typedName]) => {
    if (live) {
      return {
        drawn,
        input: {
          kind: "live",
          visit: drawn.visit,
          localDate: wallTime.localDate,
          earlierVisit: null,
        },
        floorDb,
        localDate: wallTime.localDate,
      };
    }
    return {
      drawn,
      input: {
        kind: "saved",
        savedVisit: savedVisitOfDrawn(drawn, {
          savedVisitId,
          wallTime,
          typedName,
          floorDb: savedFloorDb,
        }),
        earlierVisit: null,
      },
      floorDb: savedFloorDb,
      localDate: wallTime.localDate,
    };
  });

// ─── Earlier visits (comparison) ────────────────────────────────────────────────────────────

/**
 * A saved visit to draw as outlines: any drawn visit, of either visit type, with any id, wall
 * time, typed name, and the shipped `floorDb` or one from −80 to −40 saved with it.
 */
export const earlierVisitArbitrary: fc.Arbitrary<SavedVisit> = fc
  .tuple(
    drawnVisitArbitrary({ anyDifference: true }),
    savedVisitIdArbitrary,
    wallTimeArbitrary,
    typedNameArbitrary,
    fc.oneof(
      fc.constant(floorDb),
      fc.integer({ min: savedFloorMinDb, max: savedFloorMaxDb }),
    ),
  )
  .map(([drawn, savedVisitId, wallTime, typedName, savedFloorDb]) =>
    savedVisitOfDrawn(drawn, {
      savedVisitId,
      wallTime,
      typedName,
      floorDb: savedFloorDb,
    }),
  );

/** A picture input of `pictureInputArbitrary` with an earlier visit or none (CP1, CP2). */
export const pictureInputWithEarlierArbitrary: fc.Arbitrary<DrawnPictureInput> =
  fc
    .tuple(
      pictureInputArbitrary,
      fc.option(earlierVisitArbitrary, { nil: null }),
    )
    .map(([drawnInput, earlierVisit]) => ({
      ...drawnInput,
      input: { ...drawnInput.input, earlierVisit },
    }));

/**
 * Headphone names CP9 matches, each written as words. Two typed names are the same name exactly
 * when they come from the same entry here, whatever their letter case, spacing and Unicode form.
 * Some differ only by a mark or a space, so that near names must not match.
 */
export const headphoneNameBases: readonly (readonly string[])[] = Object.freeze(
  [
    ["Zorbex"],
    ["Zorbex", "Quillon"],
    ["ZorbexQuillon"],
    ["Zorb\u00e9x"],
    ["Caf\u00e9", "buds"],
    ["Vexmira", "buds"],
    ["Kappelt\u{1F3A7}"],
  ],
);

/** A typed name of CP9 and the entry of `headphoneNameBases` it is, or null for no name. */
export interface DrawnHeadphoneName {
  readonly typed: string;
  readonly baseIndex: number | null;
}

/**
 * A typed name of CP9: an entry of `headphoneNameBases` in any letter case, NFC or NFD, with any
 * run of spacing or control characters between its words and around them; or a name of spacing
 * only, or empty, which is no name.
 */
export const drawnHeadphoneNameArbitrary: fc.Arbitrary<DrawnHeadphoneName> =
  fc.oneof(
    {
      arbitrary: fc
        .tuple(
          fc.integer({ min: 0, max: headphoneNameBases.length - 1 }),
          letterCase,
          fc.constantFrom<"NFC" | "NFD">("NFC", "NFD"),
          fc.option(nameSpacing, { nil: "" }),
          fc.array(nameSpacing, { minLength: 3, maxLength: 3 }),
          fc.option(nameSpacing, { nil: "" }),
        )
        .map(([baseIndex, caseOf, form, before, between, after]) => {
          const words = (headphoneNameBases[baseIndex] ?? []).map((word) =>
            caseOf(word).normalize(form),
          );
          const body = words
            .map((word, index) =>
              index === 0 ? word : `${between[index - 1] ?? " "}${word}`,
            )
            .join("");
          return { typed: before + body + after, baseIndex };
        }),
      weight: 8,
    },
    {
      arbitrary: fc
        .array(nameSpacing, { maxLength: 3 })
        .map((parts) => ({ typed: parts.join(""), baseIndex: null })),
      weight: 1,
    },
  );

// ─── Stored entries written directly ────────────────────────────────────────────────────────

/** A stored entry as the store writes it: the six fields and their checksum. */
export function storedEntryOf(
  fields: StoreEntryFields,
): Record<string, unknown> {
  return { ...fields, checksum: entryChecksum(fields) };
}

/** The value under the key as the store writes it, holding these entries in this order. */
export function storedValueText(entries: readonly unknown[]): string {
  return JSON.stringify({
    formatVersion: savedVisitsFormatVersion,
    visits: entries,
  });
}

/** Entries the store reads but the archive cannot, or the store cannot read at all. */
export const unreadableEntryArbitrary: fc.Arbitrary<unknown> = fc.oneof(
  fc.jsonValue(),
  fc
    .tuple(savedVisitIdArbitrary, localDateArbitrary, fc.string())
    .map(([savedVisitId, savedOnLocalDate, payloadJson]) =>
      storedEntryOf({
        savedVisitId,
        savedAtEpochMs: 1_800_000_000_000,
        savedOnLocalDate,
        visitType: "full",
        headphoneName: null,
        payloadJson,
      }),
    ),
  fc
    .tuple(savedVisitIdArbitrary, localDateArbitrary)
    .map(([savedVisitId, savedOnLocalDate]) => ({
      ...storedEntryOf({
        savedVisitId,
        savedAtEpochMs: 1_800_000_000_000,
        savedOnLocalDate,
        visitType: "full",
        headphoneName: "Zorbex",
        payloadJson: "{}",
      }),
      checksum: "00000000",
    })),
);

// ─── List scenarios (CP1, CP2) ──────────────────────────────────────────────────────────────

/** What local storage does in a list scenario. */
export type ListStorage =
  | "robot"
  | "getterThrows"
  | "getterNull"
  | "getterUndefined"
  | "getItemThrows"
  | "unreadableValue"
  | "ready";

/** How writes behave in a list scenario. `full` holds no more characters than at the start. */
export type WriteBehaviour =
  "works" | "setItemThrows" | "removeItemThrows" | "full";

/**
 * A list scenario: what local storage holds and does, the visits already saved (or as many as the
 * house keeps), the unreadable entries among them, and what the visitor types when saving the
 * shown visit twice.
 */
export interface ListScenario {
  /** The visit shown and saved, with the shipped swapped-repeat difference, which the archive saves. */
  readonly shown: DrawnVisit;
  readonly storage: ListStorage;
  readonly writeBehaviour: WriteBehaviour;
  readonly storedVisits: readonly DrawnVisit[];
  readonly storedNames: readonly string[];
  readonly storedTimes: readonly WallTime[];
  readonly atLimit: boolean;
  readonly unreadableEntries: readonly unknown[];
  readonly unreadableValueText: string;
  readonly typedNames: readonly [string, string];
  readonly archiveSeed: number;
  readonly wallTime: WallTime;
  readonly unlistedId: string;
}

export const listScenarioArbitrary: fc.Arbitrary<ListScenario> = fc.record({
  shown: drawnVisitArbitrary(),
  storage: fc.constantFrom<ListStorage>(
    "robot",
    "getterThrows",
    "getterNull",
    "getterUndefined",
    "getItemThrows",
    "unreadableValue",
    "ready",
    "ready",
    "ready",
  ),
  writeBehaviour: fc.constantFrom<WriteBehaviour>(
    "works",
    "works",
    "setItemThrows",
    "removeItemThrows",
    "full",
  ),
  storedVisits: fc.array(drawnVisitArbitrary(), { maxLength: 3 }),
  storedNames: fc.array(typedNameArbitrary, { minLength: 3, maxLength: 3 }),
  storedTimes: fc.array(wallTimeArbitrary, { minLength: 3, maxLength: 3 }),
  atLimit: fc.boolean(),
  unreadableEntries: fc.array(unreadableEntryArbitrary, { maxLength: 3 }),
  unreadableValueText: fc.oneof(
    fc.string(),
    fc.jsonValue().map((value) => JSON.stringify(value) ?? ""),
    fc.constant('{"formatVersion":2,"visits":[]}'),
  ),
  typedNames: fc.tuple(typedNameArbitrary, typedNameArbitrary),
  archiveSeed: seedArbitrary,
  wallTime: wallTimeArbitrary,
  unlistedId: savedVisitIdArbitrary,
});

/** Everything the archive gave in one list scenario, in the order it gave it. */
export interface ListScenarioRun {
  readonly lists: readonly SavedVisitList[];
  readonly outcomes: readonly (SaveOutcome | DeleteOutcome)[];
  /** The tidy form of every name typed or stored in the scenario, without nulls. */
  readonly tidyNames: readonly string[];
}

/** The value a list scenario starts with, under the key, or null for none. */
function scenarioValueText(scenario: ListScenario): string | null {
  if (scenario.storage === "unreadableValue") {
    return scenario.unreadableValueText;
  }
  const visits = scenario.storedVisits;
  const readableCount =
    scenario.atLimit && visits.length > 0
      ? resultPageConfig.savedVisitsMaxCount
      : visits.length;
  const entries: unknown[] = [];
  for (let index = 0; index < readableCount; index += 1) {
    const position = index % visits.length;
    const drawn = visits[position] as DrawnVisit;
    const wallTime = scenario.storedTimes[position] as WallTime;
    entries.push(
      storedEntryOf({
        savedVisitId: (0x10000000 + index).toString(16),
        savedAtEpochMs: wallTime.epochMs,
        savedOnLocalDate: wallTime.localDate,
        visitType: drawn.visit.visitLog.visitType,
        headphoneName: canonicalHeadphoneName(
          scenario.storedNames[position] as string,
        ),
        payloadJson: savedVisitPayloadJson(drawn.visit),
      }),
    );
  }
  entries.push(...scenario.unreadableEntries);
  return entries.length === 0 ? null : storedValueText(entries);
}

/** The total characters of a storage area's keys and values. */
export function storedCharacterCount(
  items: Readonly<Record<string, string>>,
): number {
  return Object.entries(items).reduce(
    (count, [key, value]) => count + key.length + value.length,
    0,
  );
}

/** A storage area for a list scenario, and the function the archive calls to get it. */
function scenarioStorage(scenario: ListScenario): {
  readonly area: FakeStorageArea;
  readonly localStorage: () => StorageArea | null | undefined;
} {
  const valueText = scenarioValueText(scenario);
  const initialItems: Record<string, string> =
    valueText === null ? {} : { [savedVisitsKey]: valueText };
  const area = createFakeStorageArea({
    initialItems,
    getItemThrows: scenario.storage === "getItemThrows",
    setItemThrows: scenario.writeBehaviour === "setItemThrows",
    removeItemThrows: scenario.writeBehaviour === "removeItemThrows",
    ...(scenario.writeBehaviour === "full"
      ? { maxCharacterCount: storedCharacterCount(initialItems) }
      : {}),
  });
  switch (scenario.storage) {
    case "getterThrows":
      return {
        area,
        localStorage: () => {
          throw new DOMException("Storage is blocked.", "SecurityError");
        },
      };
    case "getterNull":
      return { area, localStorage: () => null };
    case "getterUndefined":
      return { area, localStorage: () => undefined };
    default:
      return { area, localStorage: () => area };
  }
}

/** A wall clock that always gives this time. */
export function fixedWallClock(wallTime: WallTime): WallClock {
  return { now: () => wallTime };
}

/**
 * Plays a list scenario: lists, saves the shown visit with the first typed name and again with the
 * second, lists, deletes an unlisted id and the newest listed visit, lists, deletes all and lists.
 */
export function playListScenario(scenario: ListScenario): ListScenarioRun {
  const shown = scenario.shown.visit;
  const { localStorage } = scenarioStorage(scenario);
  const archive: VisitArchive = createVisitArchive({
    localStorage,
    wallClock: fixedWallClock(scenario.wallTime),
    seed: scenario.archiveSeed,
    mode: scenario.storage === "robot" ? "robot" : "keep",
  });
  const lists: SavedVisitList[] = [];
  const outcomes: (SaveOutcome | DeleteOutcome)[] = [];
  lists.push(archive.list());
  outcomes.push(archive.save(shown, scenario.typedNames[0]));
  outcomes.push(archive.save(shown, scenario.typedNames[1]));
  const afterSaves = archive.list();
  lists.push(afterSaves);
  outcomes.push(archive.deleteVisit(scenario.unlistedId));
  const newest = afterSaves.visits[0];
  if (newest !== undefined) {
    outcomes.push(archive.deleteVisit(newest.visit.savedVisitId));
  }
  lists.push(archive.list());
  outcomes.push(archive.deleteAll());
  lists.push(archive.list());
  const tidyNames = [...scenario.typedNames, ...scenario.storedNames]
    .map(canonicalHeadphoneName)
    .filter((name): name is string => name !== null);
  return { lists, outcomes, tidyNames };
}

// ─── Saving through an archive ──────────────────────────────────────────────────────────────

/** One visit to save, with the name typed and the wall clock's time at that moment. */
export interface DrawnSave {
  readonly drawn: DrawnVisit;
  readonly typedName: string;
  readonly wallTime: WallTime;
}

export const drawnSaveArbitrary: fc.Arbitrary<DrawnSave> = fc.record({
  drawn: drawnVisitArbitrary(),
  typedName: typedNameArbitrary,
  wallTime: wallTimeArbitrary,
});

/** A wall clock whose time the test sets before each call. */
export interface SettableWallClock extends WallClock {
  set(wallTime: WallTime): void;
}

export function settableWallClock(start: WallTime): SettableWallClock {
  let current = start;
  return {
    now: () => current,
    set: (wallTime) => {
      current = wallTime;
    },
  };
}

/**
 * Saves each visit through an archive on a working fake storage area, at its own wall time, and
 * gives the area, the archive, and the saved visits as the archive listed them afterwards, in the
 * order of saving.
 */
export function saveThroughArchive(
  saves: readonly DrawnSave[],
  archiveSeed: number,
  initialItems: Readonly<Record<string, string>> = {},
): {
  readonly area: FakeStorageArea;
  readonly archive: VisitArchive;
  readonly clock: SettableWallClock;
  readonly saved: readonly SavedVisit[];
} {
  const area = createFakeStorageArea({ initialItems });
  const clock = settableWallClock(
    saves[0]?.wallTime ?? {
      epochMs: firstDateEpochMs,
      localDate: "2026-01-01",
    },
  );
  const archive = createVisitArchive({
    localStorage: () => area,
    wallClock: clock,
    seed: archiveSeed,
    mode: "keep",
  });
  for (const save of saves) {
    clock.set(save.wallTime);
    archive.save(save.drawn.visit, save.typedName);
  }
  const saved = [...archive.list().visits]
    .reverse()
    .map((listing) => listing.visit);
  return { area, archive, clock, saved };
}

// ─── Stored values ──────────────────────────────────────────────────────────────────────────

/** The seven fields of a stored entry. */
export const storedEntryFieldNames: readonly string[] = Object.freeze([
  "savedVisitId",
  "savedAtEpochMs",
  "savedOnLocalDate",
  "visitType",
  "headphoneName",
  "payloadJson",
  "checksum",
]);

/** A change to the value an archive wrote (CP7). Positions are taken modulo what they index. */
export type StoredValueChange =
  | { readonly kind: "none" }
  | {
      readonly kind: "replaceCharacter";
      readonly at: number;
      readonly character: string;
    }
  | { readonly kind: "removeCharacter"; readonly at: number }
  | {
      readonly kind: "insertCharacter";
      readonly at: number;
      readonly character: string;
    }
  | { readonly kind: "cut"; readonly at: number }
  | {
      readonly kind: "swapEntries";
      readonly first: number;
      readonly second: number;
    }
  | {
      readonly kind: "replaceField";
      readonly entry: number;
      readonly field: string;
      readonly value: unknown;
    }
  | { readonly kind: "formatVersion"; readonly value: unknown }
  | { readonly kind: "replaceWithString"; readonly text: string }
  | { readonly kind: "replaceWithJson"; readonly value: unknown };

/** Characters that matter to JSON and to the fields, and any other. */
const changeCharacter = fc.oneof(
  fc.constantFrom(
    '"',
    "\\",
    "{",
    "}",
    "[",
    "]",
    ",",
    ":",
    "0",
    "1",
    "9",
    "a",
    "f",
    "-",
    " ",
    "e",
    ".",
  ),
  fc.string({ minLength: 1, maxLength: 1 }),
);

/** A value of another type or another value for a field. */
const fieldValue: fc.Arbitrary<unknown> = fc.oneof(
  fc.jsonValue(),
  fc.constantFrom(
    null,
    0,
    -1,
    1.5,
    "",
    "full",
    "full",
    "2026-02-30",
    "ABCDEF12",
    "0000000g",
    true,
  ),
  fc.string(),
  fc.integer(),
);

export const storedValueChangeArbitrary: fc.Arbitrary<StoredValueChange> =
  fc.oneof(
    fc.constant<StoredValueChange>({ kind: "none" }),
    fc.record({
      kind: fc.constant("replaceCharacter" as const),
      at: fc.nat(),
      character: changeCharacter,
    }),
    fc.record({ kind: fc.constant("removeCharacter" as const), at: fc.nat() }),
    fc.record({
      kind: fc.constant("insertCharacter" as const),
      at: fc.nat(),
      character: changeCharacter,
    }),
    fc.record({ kind: fc.constant("cut" as const), at: fc.nat() }),
    fc.record({
      kind: fc.constant("swapEntries" as const),
      first: fc.nat(),
      second: fc.nat(),
    }),
    fc.record({
      kind: fc.constant("replaceField" as const),
      entry: fc.nat(),
      field: fc.constantFrom(...storedEntryFieldNames),
      value: fieldValue,
    }),
    fc.record({
      kind: fc.constant("formatVersion" as const),
      value: fc.oneof(fc.constantFrom(0, 2, "1", null, 1.5), fc.jsonValue()),
    }),
    fc.record({
      kind: fc.constant("replaceWithString" as const),
      text: fc.string(),
    }),
    fc.record({
      kind: fc.constant("replaceWithJson" as const),
      value: fc.jsonValue(),
    }),
  );

/** The parsed value, when it is a plain object holding a list of entries. */
function parsedValue(
  text: string,
): (Record<string, unknown> & { visits: unknown[] }) | null {
  try {
    const value: unknown = JSON.parse(text);
    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      Array.isArray((value as Record<string, unknown>).visits)
    ) {
      return value as Record<string, unknown> & { visits: unknown[] };
    }
  } catch {
    return null;
  }
  return null;
}

/** The value text after a change. A change that cannot apply to this value leaves it as it was. */
export function changedValueText(
  text: string,
  change: StoredValueChange,
): string {
  switch (change.kind) {
    case "none":
      return text;
    case "replaceCharacter": {
      const at = change.at % text.length;
      return text.slice(0, at) + change.character + text.slice(at + 1);
    }
    case "removeCharacter": {
      const at = change.at % text.length;
      return text.slice(0, at) + text.slice(at + 1);
    }
    case "insertCharacter": {
      const at = change.at % (text.length + 1);
      return text.slice(0, at) + change.character + text.slice(at);
    }
    case "cut":
      return text.slice(0, change.at % text.length);
    case "swapEntries": {
      const value = parsedValue(text);
      if (value === null || value.visits.length < 2) {
        return text;
      }
      const visits = [...value.visits];
      const first = change.first % visits.length;
      const second = change.second % visits.length;
      [visits[first], visits[second]] = [visits[second], visits[first]];
      return JSON.stringify({ ...value, visits });
    }
    case "replaceField": {
      const value = parsedValue(text);
      if (value === null || value.visits.length === 0) {
        return text;
      }
      const position = change.entry % value.visits.length;
      const visits = value.visits.map((entry, index) =>
        index === position
          ? {
              ...(entry as Record<string, unknown>),
              [change.field]: change.value,
            }
          : entry,
      );
      return JSON.stringify({ ...value, visits });
    }
    case "formatVersion": {
      const value = parsedValue(text);
      return value === null
        ? text
        : JSON.stringify({ ...value, formatVersion: change.value });
    }
    case "replaceWithString":
      return change.text;
    case "replaceWithJson":
      return JSON.stringify(change.value) ?? "null";
  }
}

/**
 * How many entries a value's list holds when the value can be read as a whole (a plain object,
 * format version exactly 1, and a list of entries), or null for an Unreadable_Value.
 */
export function readableValueEntryCount(text: string): number | null {
  const value = parsedValue(text);
  if (
    value === null ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    value.formatVersion !== savedVisitsFormatVersion
  ) {
    return null;
  }
  return value.visits.length;
}

/** The entries of the value under the key of these items, or null when there is no readable value. */
export function storedEntries(
  items: Readonly<Record<string, string>>,
): unknown[] | null {
  const text = items[savedVisitsKey];
  if (text === undefined) {
    return null;
  }
  return parsedValue(text)?.visits ?? null;
}

// ─── Storage behaviours ─────────────────────────────────────────────────────────────────────

/** What local storage does (CP7). `quota` holds at most this many characters over all keys and values. */
export type StorageBehaviour =
  | { readonly kind: "working" }
  | { readonly kind: "getterThrows" }
  | { readonly kind: "getterNull" }
  | { readonly kind: "getterUndefined" }
  | { readonly kind: "getItemThrows" }
  | { readonly kind: "setItemThrows" }
  | { readonly kind: "quota"; readonly maxCharacterCount: number };

export const storageBehaviourArbitrary: fc.Arbitrary<StorageBehaviour> =
  fc.oneof(
    { arbitrary: fc.constant({ kind: "working" as const }), weight: 3 },
    fc.constant({ kind: "getterThrows" as const }),
    fc.constant({ kind: "getterNull" as const }),
    fc.constant({ kind: "getterUndefined" as const }),
    fc.constant({ kind: "getItemThrows" as const }),
    fc.constant({ kind: "setItemThrows" as const }),
    {
      arbitrary: fc.record({
        kind: fc.constant("quota" as const),
        maxCharacterCount: fc.oneof(
          fc.integer({ min: 0, max: 40_000 }),
          fc.integer({ min: 0, max: 400_000 }),
        ),
      }),
      weight: 2,
    },
  );

/** A fake storage area holding these items and behaving so, and the function the archive calls to get it. */
export function storageWith(
  behaviour: StorageBehaviour,
  initialItems: Readonly<Record<string, string>>,
): {
  readonly area: FakeStorageArea;
  readonly localStorage: () => StorageArea | null | undefined;
} {
  const area = createFakeStorageArea({
    initialItems,
    getItemThrows: behaviour.kind === "getItemThrows",
    setItemThrows: behaviour.kind === "setItemThrows",
    ...(behaviour.kind === "quota"
      ? { maxCharacterCount: behaviour.maxCharacterCount }
      : {}),
  });
  switch (behaviour.kind) {
    case "getterThrows":
      return {
        area,
        localStorage: () => {
          throw new DOMException("Storage is blocked.", "SecurityError");
        },
      };
    case "getterNull":
      return { area, localStorage: () => null };
    case "getterUndefined":
      return { area, localStorage: () => undefined };
    default:
      return { area, localStorage: () => area };
  }
}

/** Keys of local storage other than this product's, and their values. */
export const otherItemsArbitrary: fc.Arbitrary<Record<string, string>> = fc
  .uniqueArray(
    fc.tuple(
      fc.oneof(
        fc.string({ minLength: 1 }),
        fc.constantFrom(
          "did-you-hear-that:saved-visits:v2",
          "did-you-hear-that:saved-visits",
          "theme",
        ),
      ),
      fc.string(),
    ),
    { maxLength: 3, selector: ([key]) => key },
  )
  .map((pairs) =>
    Object.fromEntries(pairs.filter(([key]) => key !== savedVisitsKey)),
  );
