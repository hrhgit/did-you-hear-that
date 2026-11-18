// src/session/result-page-types.ts
//
// The interface contract of the result page (result-page design.md, "Interface contract"). Types
// only. src/ui reads every type the result page needs from here, and calls the four functions it
// names: createVisitArchive (create-visit-archive.ts), resultPicture (result-picture.ts),
// findEarlierVisit (find-earlier-visit.ts) and canonicalHeadphoneName
// (canonical-headphone-name.ts). Later specs may add to this file; they never remove, rename or
// change the meaning of what is here (D1).

import type { VisitType } from "../config/hearing-method-config";
import type { GhostSoundId } from "../config/sound-id";
import type {
  Ear,
  SwappedRepeatComparison,
  SwappedRepeatOutcome,
  SwappedRepeatRun,
  VisitEarResult,
  VisitLog,
  VisitRoom,
  VisitSummary,
  VisitUnreliableReason,
} from "./visit-flow-types";

export type {
  Ear,
  GhostSoundId,
  SwappedRepeatComparison,
  SwappedRepeatOutcome,
  SwappedRepeatRun,
  VisitEarResult,
  VisitLog,
  VisitRoom,
  VisitSummary,
  VisitType,
  VisitUnreliableReason,
};

// ─── What the archive is given ───────────────────────────────────────────────────────────

/** A calendar date in the visitor's own time zone, written "YYYY-MM-DD". */
export type LocalDate = string;

/** One reading of the wall clock. */
export interface WallTime {
  /** Milliseconds since 1970-01-01T00:00:00Z, a whole number. */
  readonly epochMs: number;
  /** The visitor's calendar date at that moment. */
  readonly localDate: LocalDate;
}

/** Where the archive reads the date. The page gives `createSystemWallClock()` from `src/config/system-wall-clock.ts`. */
export interface WallClock {
  now(): WallTime;
}

/** The part of the browser's `Storage` the archive uses. `window.localStorage` fits it. */
export interface StorageArea {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * `keep`: saved visits are read from and written to local storage.
 * `robot`: local storage is never touched, not even read, and nothing is saved (visit-flow D15).
 */
export type ArchiveMode = "keep" | "robot";

/** What `createVisitArchive` in `create-visit-archive.ts` takes. */
export interface VisitArchiveOptions {
  /**
   * Returns the page's local storage. The page gives `() => window.localStorage`. The archive
   * calls it inside a `try` in each method, never when it is created, and treats a throw, null or
   * undefined as a browser that gives no local storage.
   */
  readonly localStorage: () => StorageArea | null | undefined;
  /** Gives the date of each save. */
  readonly wallClock: WallClock;
  /** A whole number from 0 to 2³² − 1, drawn once by the page with `crypto.getRandomValues`. Saved visit ids are drawn from it. */
  readonly seed: number;
  /** `robot` when the page is opened in robot mode, otherwise `keep`. */
  readonly mode: ArchiveMode;
}

/** The shape of `createVisitArchive`. It throws a `RangeError` for a seed that is not a whole number from 0 to 2³² − 1. */
export type CreateVisitArchive = (options: VisitArchiveOptions) => VisitArchive;

// ─── The archive ─────────────────────────────────────────────────────────────────────────

/** A visit to save or to draw: what the result snapshot holds. A `ResultSnapshot` fits it. */
export interface VisitToSave {
  readonly visitLog: VisitLog;
  readonly summary: VisitSummary;
  /** The swapped repeats that ran to their end (swapped-repeat design.md). Missing means none. */
  readonly swappedRepeats?: readonly SwappedRepeatRun[];
}

/** The saved visits of this browser. No method throws, whatever local storage does or holds. */
export interface VisitArchive {
  /** The mode it was created with. */
  readonly mode: ArchiveMode;
  /** Today's date from the wall clock, for the picture of a visit that is not saved. */
  today(): LocalDate;
  /** Reads local storage now and lists what it holds. Call it again after every save or delete. */
  list(): SavedVisitList;
  /**
   * Saves a visit with the name the visitor typed for the headphones, which may be empty. The page
   * calls it only when the visitor presses the save control (D10). Called again on this page with
   * the same `visitLog` object, it changes the name of the visit it saved and adds nothing.
   * When the visit now holds swapped repeats that the saved copy lacks, it replaces the saved
   * copy's payload and keeps its id, date and name.
   */
  save(visit: VisitToSave, typedHeadphoneName: string): SaveOutcome;
  /**
   * Whether this visit's saved copy lacks swapped repeats that the visit now holds: true when this
   * page saved the same `visitLog` object before, that saved copy is still listed, and the visit
   * holds a swapped repeat whose run number no repeat of the saved copy has. `save` would then
   * replace the saved copy's payload, so show the save control again while this is true
   * (swapped-repeat Q5). False for a visit this page has not saved, for a saved copy that is no
   * longer listed, in robot mode and whenever local storage cannot be read. Reads local storage
   * now, as `list()` does. Never throws.
   */
  savedCopyLacksRepeats(visit: VisitToSave): boolean;
  /** Deletes one saved visit. */
  deleteVisit(savedVisitId: string): DeleteOutcome;
  /** Deletes every saved visit, including those that could not be read. */
  deleteAll(): DeleteOutcome;
  /**
   * The visit log of a listed visit as JSON text, or null. For the no-headphone replay's data file
   * (brief 09). The page need not offer it to the visitor (D26).
   */
  exportVisitLog(savedVisitId: string): string | null;
}

/** One saved visit. Plain data, frozen. */
export interface SavedVisit {
  /** Eight lowercase hexadecimal digits. */
  readonly savedVisitId: string;
  /** When it was saved, by the wall clock. Shown nowhere: the list's order is the order of saving. */
  readonly savedAtEpochMs: number;
  /** The visitor's date when it was saved. */
  readonly savedOnLocalDate: LocalDate;
  /** The visit type. */
  readonly visitType: VisitType;
  /**
   * The tidy form of the name typed for the headphones, or null for none. It is the visitor's own
   * text: show it as written, in an element of its own, never inside a sentence of the house (D11).
   */
  readonly headphoneName: string | null;
  /** The summary that was shown, as it was saved. It is never computed again (D9). */
  readonly summary: VisitSummary;
  /** The visit log as the visit flow gave it. */
  readonly visitLog: VisitLog;
  /** The quietest level the search could ask for when it was saved: `hearingMethodConfig.floorDb` then. */
  readonly floorDb: number;
  /** The left and right difference that offered the swapped repeat when it was saved. */
  readonly swappedRepeatDifferenceDb: number;
  /** The swapped repeats saved with it, in the order they ended. Empty for a visit saved without one, and for every visit saved before the swapped-repeat spec. */
  readonly swappedRepeats: readonly SwappedRepeatRun[];
}

/**
 * `ready`: local storage could be read. `unavailable`: this browser gives no local storage.
 * `unreadable`: something is saved under the key but it cannot be read as a whole, and only
 * "delete all" works. `off`: robot mode.
 */
export type ArchiveState = "ready" | "unavailable" | "unreadable" | "off";

/** What `list()` gives. */
export interface SavedVisitList {
  readonly state: ArchiveState;
  /** The readable saved visits, newest first. Empty unless `ready`. */
  readonly visits: readonly SavedVisitListing[];
  /** Saved visits that could not be read and are not shown. They stay until "delete all". */
  readonly unreadableCount: number;
  /** Whether `save` can be tried now: `ready`, and fewer visits than the most the house keeps. */
  readonly canSave: boolean;
  /** Whether "delete all" has anything to delete. */
  readonly canDeleteAll: boolean;
  /** The lines to show with the list, in order, from `src/copy`. Empty when there is nothing to say. */
  readonly lines: readonly string[];
}

/** One saved visit in the list, with its labels. */
export interface SavedVisitListing {
  readonly visit: SavedVisit;
  /** Such as "20 November 2026". */
  readonly dateLabel: string;
  /** Such as "Short visit, 3 rooms". */
  readonly visitTypeLabel: string;
  /** The accessible name of its delete control. */
  readonly deleteLabel: string;
}

/** Why a save did not happen. */
export type SaveRefusal =
  | "robotMode"
  | "unavailable"
  | "unreadable"
  | "refused"
  | "full"
  | "tooMany"
  | "nameTooLong";

/** What `save` gives. */
export type SaveOutcome =
  | {
      readonly saved: true;
      /** The visit as `list()` now gives it. */
      readonly savedVisit: SavedVisit;
      /** True when this call only changed the headphone name of a visit saved before. */
      readonly renamed: boolean;
      readonly line: string;
    }
  | {
      readonly saved: false;
      readonly reason: SaveRefusal;
      readonly line: string;
    };

/** Why a delete did not happen. */
export type DeleteRefusal =
  "robotMode" | "unavailable" | "unreadable" | "refused" | "notFound";

/** What `deleteVisit` and `deleteAll` give. */
export type DeleteOutcome =
  | {
      readonly deleted: true;
      /** How many listed visits were deleted: 1, or every one for "delete all". */
      readonly deletedCount: number;
      readonly line: string;
    }
  | {
      readonly deleted: false;
      readonly reason: DeleteRefusal;
      readonly line: string;
    };

/** The shape of `canonicalHeadphoneName`: the tidy form of a typed name, or null when nothing is left. */
export type CanonicalHeadphoneName = (typed: string) => string | null;

/**
 * The shape of `findEarlierVisit` (R20): the newest listed visit saved before the shown one
 * (or the newest of all when `shownSavedVisitId` is null or not listed) whose headphone name is
 * the same as `typedHeadphoneName`, ignoring letter case and spacing; null for an empty name.
 * Returns null until the comparison tasks are built.
 */
export type FindEarlierVisit = (
  list: SavedVisitList,
  typedHeadphoneName: string,
  shownSavedVisitId: string | null,
) => SavedVisit | null;

// ─── The picture ─────────────────────────────────────────────────────────────────────────

/** What `resultPicture` takes. */
export type ResultPictureInput =
  | {
      /** The visit the flow shows in its result stage. */
      readonly kind: "live";
      readonly visit: VisitToSave;
      /** `archive.today()`. */
      readonly localDate: LocalDate;
      /** From `findEarlierVisit`, or null. */
      readonly earlierVisit: SavedVisit | null;
    }
  | {
      /** A visit from the list. */
      readonly kind: "saved";
      readonly savedVisit: SavedVisit;
      /** From `findEarlierVisit`, or null. */
      readonly earlierVisit: SavedVisit | null;
    };

/** The shape of `resultPicture`. A pure function: the same input always gives an equal picture. */
export type ResultPictureOf = (input: ResultPictureInput) => ResultPicture;

/** The state of a wing: the state of its ear's result. */
export type WingState = VisitEarResult["state"];

/** Everything the page draws and says about one visit. Plain data, frozen. */
export interface ResultPicture {
  readonly kind: "live" | "saved";
  readonly visitType: VisitType;
  /** The heading above the picture. */
  readonly heading: string;
  /** Such as "20 November 2026". */
  readonly dateLabel: string;
  /** Such as "Short visit, 3 rooms". */
  readonly visitTypeLabel: string;
  /** One per room of the visit, in visit order: the order of the house, lowest floor first. Never ordered by a result. */
  readonly floors: readonly PictureFloor[];
  /** The rooms of the house this visit did not enter, lowest first. Drawn closed. */
  readonly closedRoomIds: readonly GhostSoundId[];
  /** Such as "You answered 2 of 9 times when I made no sound." Shown above the picture. */
  readonly falseAlarmLine: string;
  /** Shown above the picture when the whole visit is unreliable, otherwise null. */
  readonly visitNotice: PictureNotice | null;
  /** The four statements of wording.md, always. Shown next to the picture, never behind a link, and put in the saved image. */
  readonly limitsStatement: LimitsStatement;
  /** The earlier visit drawn as outlines, or null. Always null until the comparison tasks are built. */
  readonly comparison: PictureComparison | null;
  /** The caption of the saved image. */
  readonly imageCaption: string;
  /** The file name of the saved image, without its extension. */
  readonly imageFileBaseName: string;
}

/** A heading and a line. */
export interface PictureNotice {
  readonly heading: string;
  readonly line: string;
}

/** The limits statement, as `src/copy/limits-statement.ts` holds it. */
export interface LimitsStatement {
  readonly heading: string;
  /**
   * In this order: floors cannot be compared; what can be compared; what this is not and what it
   * has not been checked against; when to see a hearing professional.
   */
  readonly sentences: readonly [string, string, string, string];
}

/** One floor of the picture. */
export interface PictureFloor {
  /** The room of this floor. */
  readonly room: VisitRoom;
  /** Such as "Stairs". */
  readonly roomName: string;
  /** Such as "4 kHz". */
  readonly pitchLabel: string;
  readonly left: PictureWing;
  readonly right: PictureWing;
  /** Right threshold minus left threshold when both are found, otherwise null. Never compared across floors. */
  readonly rightMinusLeftDb: number | null;
  /** Beside the floor: "–", "0 dB", or such as "15 dB quieter on the left". */
  readonly differenceLabel: string;
  /** The difference as a sentence, also part of `description`. */
  readonly differenceLine: string;
  /** The swapped repeat, on the live result only and when the floor offers it; otherwise null. Null also once this floor has a repeat (swapped-repeat Q4). */
  readonly swappedRepeat: SwappedRepeatOffer | null;
  /** This floor's swapped repeat beside its first run, or null when the visit has none for it. */
  readonly repeat: SwappedRepeatComparison | null;
  /**
   * The Floor_Line naming each side whose result is `betterThanFloor`, or `found` at most one
   * `upwardStepDb` above the floor's Search_Floor; null when no side is (audible-start R22). Also
   * the last sentence of `description` when there is one.
   */
  readonly playableFloorLine: string | null;
  /** Everything about this floor in words, for a visitor who cannot see the picture. */
  readonly description: string;
}

/** The offer of the swapped repeat on one floor. */
export interface SwappedRepeatOffer {
  /** The number to give to the flow's `chooseSwappedRepeat`. */
  readonly roomIndex: number;
  readonly line: string;
  readonly buttonLabel: string;
}

/** One wing of a floor. */
export interface PictureWing {
  readonly ear: Ear;
  readonly state: WingState;
  /**
   * How far the light reaches into the wing, from 0 (dark) to 1 (the far wall), or null when the
   * wing is drawn hatched (`unreliable`). Deeper means a quieter sound was caught on this floor.
   * It means nothing across floors (D15, D16).
   */
  readonly lightDepthFraction: number | null;
  /** Beside the wing. */
  readonly line: string;
  /** For an unreliable wing, why, in one line; otherwise null. */
  readonly reasonLine: string | null;
  /** The earlier visit's mark in this wing, or null. Always null until the comparison tasks are built. */
  readonly earlier: EarlierWing | null;
  /**
   * `line` in two parts for the floor's card (added 2026-11-17): the value set large, such as
   * "30 dB quieter", and the words that finish it, such as "than your calibration".
   */
  readonly valueLabel: string;
  readonly valueNote: string;
}

/** The earlier visit's result in one wing. */
export interface EarlierWing {
  readonly state: WingState;
  /** Where the faint outline is drawn, on this floor's scale in the shown visit, or null for no outline. */
  readonly outlineDepthFraction: number | null;
}

/** The earlier visit the outlines come from. */
export interface PictureComparison {
  readonly earlierSavedVisitId: string;
  /** Names the earlier visit's date and says that each visit is relative to its own calibration. */
  readonly line: string;
}
