# Design: result page

## Overview

The result page is the picture the visitor leaves with: the cross-section of the house, lit on every floor as far as each ear caught a sound there. This spec builds everything that picture needs except the drawing. The project owner draws the page by hand in `src/ui` from one pure model, and calls one session object for saved visits.

```
   src/ui  (built by hand by the owner against result-page-types.ts)
     │  resultPicture(input)          createVisitArchive(options) → archive
     │  findEarlierVisit(list, name, shownId)    archive.list / save / deleteVisit / deleteAll
     │  canonicalHeadphoneName(typed)            archive.today / exportVisitLog
     ▼                                                    ▲ ResultPicture, SavedVisitList, outcomes
  ┌──────────────────────── src/session ──────────────────┴─────────────────────────────────┐
  │  result-picture.ts      pure: VisitSummary (+ an earlier SavedVisit) → ResultPicture     │
  │    └── light-depth-fraction.ts   pure: one ear result on its floor's own scale → depth   │
  │  create-visit-archive.ts  save, list, delete, export; wall clock and seed injected       │
  │    ├── saved-visit-payload.ts    payload JSON in and out, with its checks                │
  │    └── canonical-headphone-name.ts                                                       │
  │  find-earlier-visit.ts  pure (comparison tasks)                                          │
  └──────────┬───────────────────────────────────────┬────────────────────────────────────────┘
             │ envelope + payload text               │ every visitor-facing string
             ▼                                       ▼
   src/storage  createVisitStore               src/copy  limits-statement.ts, result-page-copy.ts,
     one key, one value, checksum per entry      result-lines.ts, saved-visit-lines.ts,
     local storage only, never throws            comparison-lines.ts (comparison tasks)
```

The design rests on five choices.

- **The page draws a model, never a summary.** `resultPicture` turns a visit summary into frozen plain data: for every floor and wing its state, how far the light reaches, its line, the left and right difference or the dash, and the swapped repeat offer; above the picture the false alarm line and, when the visit is marked, a notice; and the limits statement, always. Every sentence in it comes from `src/copy`. The owner draws what the model says and adds no string.
- **Depth of light is honest on one floor and means nothing across floors.** A wing's depth is the place of its threshold on its own floor's range, from the floor's own loudest playable level to the quietest playable level. Deeper means a quieter sound was caught on that floor. Each floor is computed from its own summary alone, and nothing in the model spans floors except the false alarm counts. The picture still shows five depths one above the other, and that shape is put to the owner (Q2).
- **Storage keeps envelopes and opaque payloads.** `src/storage` may import only `config`, so it cannot know the visit log. It keeps one value under one versioned key, a list of entries, each with a checksum over all its fields. The session puts the visit log and the summary, as JSON text, in each entry's payload, and checks it on the way out. A corrupt entry is kept as it was and not shown. Nothing throws and nothing wrong is shown.
- **A saved visit is the visit log, the summary as shown, and the settings it was drawn with.** The log is the flow's own record, unchanged, so the no-headphone replay can take it from storage. The summary is not computed again on reading, so a later change of the summary code, or the owner's choice of the visit limit (visit-flow Q1), never changes an old picture.
- **Comparison is separable.** The earlier visit is found by a pure function in its own file, and the model's outline fields are null until the comparison tasks fill them. Leaving those tasks out removes nothing else.

## Sources

- `docs/briefs/06-result-page.md`.
- `.kiro/steering/`: `product.md` (what the result may claim, the experience rules, no server, no comparison between visitors), `wording.md` (the banned words, the four statements, the exemption of the limits statement, "quieter" and "louder", depth of light), `hearing-method.md` (the four end states, "quieter than this house can whisper", the 15 dB difference), `structure.md` (module rules, naming, strings in `src/copy`, numbers in `src/config`), `tech.md` (local storage only, injected time and randomness, browsers), `audio-safety.md` (rule 9: no sudden full-screen flashes, which the owner's drawing keeps).
- `docs/architecture.md`: storage under a versioned key, the visit log as the one source; open question 3 (whether the calibration anchor repeats well enough for "this visit against last visit" to mean anything).
- `docs/roadmap.md`: comparison with past visits is cut second; the copy hook arrives with this spec.
- `.kiro/specs/visit-flow/`: the contract `src/session/visit-flow-types.ts` (`ResultSnapshot`, `VisitSummary`, `RoomSummary`, `VisitEarResult`, `VisitLog`), D1 (the contract only grows), D13 (stop on the result silences and keeps it), D15 (the flow stores nothing; robot mode must save nothing), D17 (the visit-level rule), D24 (the swapped-repeat spec may narrow when the repeat is offered), Q1 to Q4.
- The code: `src/config/hearing-method-config.ts`, `visit-flow-config.ts`, `banned-terms.ts`, `sound-id.ts`, `seeded-random.ts`, `system-timer.ts`; `src/session/summarize-visit.ts`, `judge-visit-false-alarms.ts`, `visit-rooms.ts`, `README.md`; `src/storage/README.md` (empty module); `src/copy/` (every file, above all `room-copy.ts` for `roomNames`, `pitchLabel` and `relativeLevelLabel`, and `find-banned-terms.ts`); `tools/check-copy.ts`, `tools/run-copy-check.ts`, `tools/lint/module-dependencies.js`, `tools/lint/source-restriction-configs.js`; `.kiro/hooks/render-check-on-synth-save.json` and `tests/render-check-hook.test.ts`; `docs/experiments/hook-catches.md`.
- Read only: `src/ui/house/` (one room wide, five rooms tall, the room states `dark`, `lit`, `visited`, `closed`, and a measuring line at the left as tall as each room) and `src/ui/visit/` (the result stage is still a stand-in notice; every string comes from `src/copy`).
- MDN, "Storage quotas and eviction criteria", https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria, read on the day this spec was written: browsers store up to 5 MiB of local storage per origin and throw `QuotaExceededError` beyond it; quotas apply to a whole origin even when it serves several sites; Safari deletes data created by script for an origin with no user interaction in the last seven days of browser use when tracking prevention is on.

No measurement was made for this design. The size of a saved visit is estimated in "The stored format" and measured by task 10.

## Files

Created:

```
src/session/
  result-page-types.ts                 the Contract_File: types only (task 1, R1)
  result-page-types.test.ts            type-level checks against the visit-flow contract and the DOM
  result-page-types-match.test.ts      type-level checks against copy, storage and config (tasks 2, 5, 6 and 8)
  light-depth-fraction.ts              lightDepthFraction: one wing's depth (R13)
  light-depth-fraction.test.ts
  result-picture.ts                    resultPicture: the Result_Picture (R12 to R17)
  result-picture.test.ts
  canonical-headphone-name.ts          canonicalHeadphoneName, sameHeadphoneNameKey (R9, R20)
  canonical-headphone-name.test.ts
  saved-visit-payload.ts               savedVisitPayloadJson, parseSavedVisitPayload (R5.5, R11)
  saved-visit-payload.test.ts
  create-visit-archive.ts              createVisitArchive (R8 to R10)
  create-visit-archive.test.ts
  find-earlier-visit.ts                findEarlierVisit (comparison, R20)
  find-earlier-visit.test.ts

src/storage/
  storage-area.ts                      StorageArea: the part of Storage the store uses
  saved-visits-key.ts                  the Storage_Key and the format version
  visit-store-types.ts                 StoreEntryFields, StoreRead, StoreWrite, VisitStore
  entry-checksum.ts                    entryChecksum: FNV-1a over an entry's fields (D6)
  entry-checksum.test.ts
  storage-error-kind.ts                storageErrorKind: full or refused (D8)
  storage-error-kind.test.ts
  fake-storage-area.ts                 createFakeStorageArea: in memory, with every failure (tests)
  fake-storage-area.test.ts
  create-visit-store.ts                createVisitStore (R4 to R7)
  create-visit-store.test.ts

src/config/
  result-page-config.ts                resultPageConfig (R2)
  result-page-config.test.ts
  system-wall-clock.ts                 createSystemWallClock (R3.3)
  system-wall-clock.test.ts

src/copy/
  limits-statement.ts                  limitsStatement: the exempt constants (R17)
  limits-statement.test.ts
  result-page-copy.ts                  resultPageCopy: every fixed string of the page (R18)
  result-lines.ts                      every sentence about a floor, a wing and the false alarms (R18)
  saved-visit-lines.ts                 dates, visit types, the image, saving and deleting (R18)
  result-copy.test.ts
  comparison-lines.ts                  comparisonCopy, earlierVisitLine, earlierVisitUnreliableLine (comparison)

tools/
  copy-check-streams.ts                copyCheckStreams: where each line of the check goes in hook mode
  copy-check-streams.test.ts

.kiro/hooks/
  copy-check-on-copy-save.json         the Copy_Hook (R19)

tests/
  copy-check-hook.test.ts              the hook file against this design

tests/properties/
  result-page-arbitraries.ts           visits, summaries, earlier visits, stored values, storage behaviours
  result-page-text.ts                  every string of a picture, a list and an outcome; the allowed forms
  result-page-cp1-safe-wording.property.test.ts
  result-page-cp2-no-floor-compared.property.test.ts
  result-page-cp3-depth-on-one-floor.property.test.ts
  result-page-cp4-floor-on-its-own.property.test.ts
  result-page-cp5-saved-is-read-back.property.test.ts
  result-page-cp6-delete-exactly.property.test.ts
  result-page-cp7-corrupt-storage.property.test.ts
  result-page-cp8-robot-mode.property.test.ts
  result-page-cp9-earlier-visit.property.test.ts     (comparison)
  result-page-simulated-visits.test.ts                a quick and a full visit saved and read back
  result-page-regressions.test.ts
```

Changed: `src/config/banned-terms.ts` and its test (an added export, `limitsStatementAllowedTerms`); `tools/run-copy-check.ts` and its test (an added option, `exemptions`); `tools/check-copy.ts` (the exemption and hook mode); the READMEs of `src/storage/`, `src/session/`, `src/copy/`, `src/config/`, `tools/` and `tests/properties/`.

Not changed: everything under `src/ui/`, `tests/e2e/`, `tests/properties/screen-leak/`, `.kiro/steering/`, `src/engine/`, `src/audio/`; `index.html`, `listen.html`, `src/main.ts`, the root `README.md`; `src/session/visit-flow-types.ts` and every other visit-flow file; every existing value in `src/config`; `package.json` and `package-lock.json`; `.kiro/hooks/render-check-on-synth-save.json`; every lint rule.

## Interface contract

This is the complete content of `src/session/result-page-types.ts`. Task 1 writes it, with no statement that runs, before anything else, so that the owner can build the page from it at once. `src/ui` imports these types from this file and the four functions it names from their files, and nothing else for the result page. Changes after task 1 only add (D1).

### How the interface uses it

```ts
// In the page's entry, once, beside createVisitFlow:
const archive = createVisitArchive({
  localStorage: () => window.localStorage,          // may throw; the archive catches it
  wallClock: createSystemWallClock(),               // src/config/system-wall-clock.ts
  seed: drawSeedWithCrypto(),
  mode: robotFlagInAddress ? "robot" : "keep",      // the robot spec decides the flag
});

// When the flow shows its result stage:
function drawResult(snapshot: ResultSnapshot, typedName: string, shownId: string | null) {
  const list = archive.list();
  const earlierVisit = findEarlierVisit(list, typedName, shownId);   // once comparison is built; without it, give null
  const picture = resultPicture({
    kind: "live",
    visit: snapshot,                                 // a ResultSnapshot is a VisitToSave
    localDate: archive.today(),
    earlierVisit,
  });
  draw(picture, list);                               // the owner's drawing
}

// Inside the save control's handler:
const outcome = archive.save(snapshot, nameInput.value);
showLine(outcome.line);                              // and redraw with archive.list()

// A floor's swapped repeat button:
button.onclick = () => flow.chooseSwappedRepeat(floor.swappedRepeat!.roomIndex);
```

`resultPicture` is pure and cheap, so the page may call it again on every input change. `list()` reads local storage each time it is called, so the page calls it after every save or delete and when the result appears. After a live visit has been saved, the page gives the saved id as `shownId`, so that the visit is not its own earlier visit.

### The file

```ts
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
  VisitEarResult,
  VisitLog,
  VisitRoom,
  VisitSummary,
  VisitUnreliableReason,
} from "./visit-flow-types";

export type {
  Ear,
  GhostSoundId,
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
   */
  save(visit: VisitToSave, typedHeadphoneName: string): SaveOutcome;
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
  /** The swapped repeat, on the live result only and when the floor offers it; otherwise null. */
  readonly swappedRepeat: SwappedRepeatOffer | null;
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
```

### The functions the page calls

| Function | File | Shape | Task |
|---|---|---|---|
| `createVisitArchive` | `src/session/create-visit-archive.ts` | `CreateVisitArchive` | 8 |
| `resultPicture` | `src/session/result-picture.ts` | `ResultPictureOf` | 7 (outlines in 12) |
| `canonicalHeadphoneName` | `src/session/canonical-headphone-name.ts` | `CanonicalHeadphoneName` | 8 |
| `findEarlierVisit` | `src/session/find-earlier-visit.ts` | `FindEarlierVisit` | 12 (comparison) |
| `createSystemWallClock` | `src/config/system-wall-clock.ts` | `() => { now(): { readonly epochMs: number; readonly localDate: string } }`, which fits `WallClock` | 2 |

If the comparison tasks are left out, `src/session/find-earlier-visit.ts` does not exist, and the page gives `earlierVisit: null`. Nothing else changes.

The page reads its constants from `src/copy` (`resultPageCopy`, `limitsStatement`, and `comparisonCopy` once comparison is built) and the input limit of the name field from `resultPageConfig.headphoneNameMaxCharacterCount`. Every other string comes in the picture, the list or an outcome. The back control on the result is the existing `leavingCopy.backButton` ("Back to the front door").

### The visit flow's contract does not grow

Nothing is added to `src/session/visit-flow-types.ts` (D2). The result stage's `ResultSnapshot` holds `visitLog` and `summary`, which are a `VisitToSave`. `chooseSwappedRepeat(roomIndex)` already opens the swapped repeat for a floor whose summary offers it, and `RoomSummary.swappedRepeatOffered` already says which. `backToFrontDoor` leaves the result. `stop` on the result silences and keeps the result on screen (visit-flow D13), so saving stays possible after it. The swapped repeat itself, and what the result shows after it, belong to the swapped-repeat spec.

## Config

### `src/config/result-page-config.ts`

```ts
/**
 * The numbers the result page adds (result-page design.md, "Config"). None of them changes a
 * sound, a wait or a decision about an answer. Every field name ends in its unit.
 */
export interface ResultPageConfig {
  /**
   * PROPOSED, NOT APPROVED (result-page design.md, D15 and Q1). How far the light reaches into a
   * wing, as a fraction of the wing, for a threshold found at its floor's own loudest playable
   * level (the floor's searchCapDb).
   */
  readonly foundLightDepthAtCapFraction: number;
  /**
   * PROPOSED, NOT APPROVED (D15, Q1). The same, for a threshold found at the quietest playable
   * level (hearingMethodConfig.floorDb).
   */
  readonly foundLightDepthAtFloorFraction: number;
  /** Brief 06: "Better than floor: light to the far wall". */
  readonly betterThanFloorLightDepthFraction: number;
  /** Brief 06: "Worse than cap: the wing stays dark". */
  readonly worseThanCapLightDepthFraction: number;
  /** PROPOSED, NOT APPROVED (D12, Q4). The most saved visits the house keeps in one browser. */
  readonly savedVisitsMaxCount: number;
  /**
   * PROPOSED, NOT APPROVED (D11, Q5). The longest name a visitor may give the headphones, in
   * Unicode code points after the name is tidied.
   */
  readonly headphoneNameMaxCharacterCount: number;
}

export const resultPageConfig: ResultPageConfig = deepFreeze({
  // D15, Q1: proposed by this spec. Awaits the owner's choice.
  foundLightDepthAtCapFraction: 0.1,
  // D15, Q1: proposed by this spec. Awaits the owner's choice.
  foundLightDepthAtFloorFraction: 0.9,
  // Brief 06
  betterThanFloorLightDepthFraction: 1,
  // Brief 06
  worseThanCapLightDepthFraction: 0,
  // D12, Q4: proposed by this spec. Awaits the owner's choice.
  savedVisitsMaxCount: 20,
  // D11, Q5: proposed by this spec. Awaits the owner's choice.
  headphoneNameMaxCharacterCount: 40,
});
```

The file has its own `deepFreeze`, as `visit-flow-config.ts` does. The test checks the six values, that every field name ends in `Fraction` or `Count`, that the object is deeply frozen, that `0 = worseThanCap < atCap < atFloor < betterThanFloor = 1`, and that both counts are positive whole numbers. A test named for Q1, Q4 and Q5 checks the four proposed values with a message saying that they are proposals and that changing them is the project owner's choice.

| Field | Value | Status |
|---|---|---|
| `foundLightDepthAtCapFraction` | 0.1 | PROPOSED, NOT APPROVED (Q1) |
| `foundLightDepthAtFloorFraction` | 0.9 | PROPOSED, NOT APPROVED (Q1) |
| `betterThanFloorLightDepthFraction` | 1 | From brief 06 ("light to the far wall") |
| `worseThanCapLightDepthFraction` | 0 | From brief 06 ("the wing stays dark") |
| `savedVisitsMaxCount` | 20 | PROPOSED, NOT APPROVED (Q4) |
| `headphoneNameMaxCharacterCount` | 40 | PROPOSED, NOT APPROVED (Q5) |

No other product number is added. The Storage_Key and the format version are names of a data format, not tunable numbers, and live in `src/storage/saved-visits-key.ts`. The run counts and the time budget of the property files are test settings, stated in "Run counts and time" and listed as Q7.

### `src/config/banned-terms.ts`

One export is added and nothing is changed:

```ts
/**
 * The only banned terms the fixed limits statement may use, and only in the negative
 * (wording.md, "One exception"). The copy check allows them in the strings of the export
 * `limitsStatement` of `src/copy/limits-statement.ts` and nowhere else.
 */
export const limitsStatementAllowedTerms: readonly string[] = Object.freeze([
  "diagnosis",
  "clinical",
]);
```

The test adds: frozen; every allowed term is in `bannedTerms`.

### `src/config/system-wall-clock.ts`

```ts
/** The wall clock of the page: `Date.now()` and the local calendar date of that moment. */
export function createSystemWallClock(): {
  now(): { readonly epochMs: number; readonly localDate: string };
}
```

`now()` reads `Date.now()` once, makes a `Date` of it, and writes `getFullYear()`, `getMonth() + 1` and `getDate()` as `YYYY-MM-DD` with zero padding. It is the only code of this spec that reads a clock. `src/config` may read the clock (the lint table in `tools/lint/source-restriction-configs.js`), as `system-timer.ts` does. Its test sets the system time with Vitest's fake timers and checks a date before and after midnight in the test's own time zone, and the padding of single-digit months and days. `result-page-types-match.test.ts` checks that its return type is assignable to the contract's `WallClock`.

## The stored format

### Key and value

The Storage_Key is `did-you-hear-that:saved-visits:v1`. A site on `github.io` shares its origin, and with it its local storage and its 5 MiB, with every other project page of the same account (MDN, see Sources), so the key carries the product's name. The `v1` names the format of the value. A later format that cannot be read by this code uses a new key, so this code never misreads it and never touches it.

```json
{
  "formatVersion": 1,
  "visits": [
    {
      "savedVisitId": "3f9a0c11",
      "savedAtEpochMs": 1795180800000,
      "savedOnLocalDate": "2026-11-20",
      "visitType": "full",
      "headphoneName": "White earbuds",
      "payloadJson": "{\"formatVersion\":1,\"floorDb\":-70,\"swappedRepeatDifferenceDb\":15,\"summary\":{…},\"visitLog\":{…}}",
      "checksum": "9b2e61d0"
    }
  ]
}
```

`visits` is in the order of saving, oldest first. The list the page sees is the reverse.

### What storage checks

`src/storage` imports only `config` (`tools/lint/module-dependencies.js`), so it cannot know the visit log or the summary. It treats `payloadJson` as text (D4). An entry is readable when:

- it is a plain object;
- `savedVisitId` is eight lowercase hexadecimal digits and not used by an earlier readable entry;
- `savedAtEpochMs` is a finite number of 0 or more;
- `savedOnLocalDate` is `YYYY-MM-DD` and a real calendar date;
- `visitType` is `quick` or `full`;
- `headphoneName` is null or a string;
- `payloadJson` is a string;
- `checksum` equals `entryChecksum` of the six fields above (D6).

Fields an entry has beyond these are ignored and kept. Every entry that is not readable is an Unreadable_Entry: kept as the same JSON value, counted, not shown.

The value as a whole is an Unreadable_Value when it is not JSON, not a plain object, its `formatVersion` is not exactly 1, or `visits` is not an array (D7). That covers a value of another version under this key.

### The checksum

`entryChecksum(fields)` is the 32-bit FNV-1a hash (offset basis 2166136261, prime 16777619, with `Math.imul`) over the UTF-16 code units of `JSON.stringify([savedVisitId, savedAtEpochMs, savedOnLocalDate, visitType, headphoneName, payloadJson])`, written as eight lowercase hexadecimal digits. It is not a security measure: anyone who edits local storage by hand can compute it again. It makes accidental damage, a cut-off write or a hand edit that forgets it visible as an Unreadable_Entry, so that a changed entry is never shown as if it were the visit that was saved (CP7). The hash constants are those of the FNV-1a definition and are not tunable, so they stay in `entry-checksum.ts`.

### Sizes

Not measured for this design. An estimate from the visit-flow spec's "How long the rooms take" (Plausible listeners: 30 trials per room as the median, and 42 or more for the slowest tenth) and about 350 characters of JSON per logged trial, plus about 10 percent for the escaping of `payloadJson`: a quick visit holds 90 to 130 trials, about 35 to 50 KB; a full visit 150 to 210 trials, about 60 to 80 KB. Twenty full visits would take up to about 1.6 MB of the 5 MiB of the origin. Task 10 measures a simulated quick and full visit and records the sizes here, under "Measured sizes".

### Measured sizes

Measured by task 10 on 2026-11-15 in `tests/properties/result-page-simulated-visits.test.ts`: a quick visit and then a full visit played to the result through the visit flow's harness and simulated visitor, with the worst-case renderers, and saved one after the other through one archive on a fake storage area. The listener is the Plausible_Range listener of the visit flow's simulated visits (true thresholds −12 dB left and −41.3 dB right, width 5.5 dB, lapses 0.06, false alarms 0.12, wrong side 0.04) with listener seed 12; the flow seeds are 20261206 (quick) and 20261207 (full), the visitor seed 20261208, the clock offset P 654321 ms and the archive seed 20261209. The quick visit was saved with the name "White earbuds" and the full visit with none.

| | Quick visit | Full visit |
|---|---|---|
| Logged trials | 104 | 144 |
| Ignored answers | 13 | 18 |
| Visit log, JSON characters | 41157 | 57249 |
| Summary, JSON characters | 1438 | 2225 |
| Length of the stored value after this save | 48220 | 115391 |
| The visit's own share of the stored value | 48220 | 67171 |

The lengths are JavaScript string lengths, in UTF-16 code units, which for this ASCII text are characters. A logged trial took 366 characters of JSON on average, and 411 once escaped inside `payloadJson`, so the escaping adds about 12 percent.

The estimate under "Sizes" holds for these two visits: the quick visit's 104 trials and about 48 thousand characters lie inside its estimated 90 to 130 trials and 35 to 50 KB, and the full visit's 67 thousand characters lie inside its estimated 60 to 80 KB, although its 144 trials are a few below the estimated 150 to 210. The estimate's 350 characters per trial is about 15 percent low. At the measured 411 characters per trial a full visit of 210 trials, the slowest tenth, would take about 94 thousand characters, above the estimate's 80 KB.

What this means for Q4, whose options stay open and whose proposed `savedVisitsMaxCount` of 20 is unchanged: 20 full visits take about 1.3 million characters at this visit's size and up to about 1.9 million for the slowest tenth. That is inside 5 MiB of the origin whether a browser counts a character as one byte or as two, but on a `github.io` origin the owner's other project pages share the same quota. 10 visits would take about 0.7 to 0.9 million characters. 50 visits would take about 3.4 to 4.7 million characters: beyond 5 MiB for a browser that counts two bytes a character, and close to it for one that counts one, so `full` would often come before `tooMany`. These figures come from one simulated listener and seeds; a visit with more pauses, device changes or ignored answers is larger.

### The Visit_Store

```ts
// src/storage/visit-store-types.ts
export interface StoreEntryFields {
  readonly savedVisitId: string;
  readonly savedAtEpochMs: number;
  readonly savedOnLocalDate: string;
  readonly visitType: VisitType;
  readonly headphoneName: string | null;
  readonly payloadJson: string;
}

export type StoreRead =
  | { readonly status: "ready"; readonly entries: readonly StoreEntryFields[]; readonly unreadableCount: number }
  | { readonly status: "unavailable" }
  | { readonly status: "unreadable" };

export type StoreRefusal = "unavailable" | "unreadable" | "refused" | "full" | "notFound" | "idTaken";
export type StoreWrite = { readonly ok: true } | { readonly ok: false; readonly reason: StoreRefusal };

export interface VisitStore {
  /** The readable entries in save order and the number of unreadable ones. */
  read(): StoreRead;
  /** Adds an entry at the end. `idTaken` when its id is in the value. */
  append(fields: StoreEntryFields): StoreWrite;
  /** Gives one entry a new headphone name and a new checksum. */
  changeName(savedVisitId: string, headphoneName: string | null): StoreWrite;
  /** Removes one entry; removes the key when nothing else is left. */
  remove(savedVisitId: string): StoreWrite;
  /** Removes the key, readable or not. */
  removeAll(): StoreWrite;
}

// src/storage/create-visit-store.ts
export function createVisitStore(getArea: () => StorageArea | null | undefined): VisitStore;
```

`StorageArea` in `src/storage/storage-area.ts` has the same three methods as the contract's; `result-page-types-match.test.ts` checks that the two are equal. Every method of the store:

1. calls `getArea()` inside a `try`; a throw, null or undefined gives `unavailable`;
2. calls `getItem(key)` inside a `try`; a throw gives `unavailable`;
3. parses the value (null is an empty `ready` list);
4. for a write, builds the new value from the raw values it read: every untouched entry is the same JSON value, every unknown field of the value is kept, the changed entry is rebuilt from its fields with a new checksum and keeps its unknown fields;
5. writes it with one `setItem(key, JSON.stringify(value))` inside a `try`, or one `removeItem(key)` when the new value would hold no entry and no unknown field, or for `removeAll`;
6. maps a throw with `storageErrorKind`: `full` or `refused`.

The store keeps nothing between calls, so each method acts on what local storage holds at that moment. Two tabs that save at the same instant can still overwrite one another's entry; reading just before writing makes that window as short as the page can make it, and it is accepted (D5).

| What local storage does or holds | `read` | `append`, `changeName`, `remove` | `removeAll` |
|---|---|---|---|
| `localStorage` getter throws (blocked storage), gives null or undefined | `unavailable` | `unavailable` | `unavailable` |
| `getItem` throws | `unavailable` | `unavailable` | `unavailable` |
| Nothing under the key | `ready`, no entries | `append` writes; the others `notFound` | `ok`, nothing to remove |
| An Unreadable_Value | `unreadable` | `unreadable`, nothing written | removes the key |
| A value with Unreadable_Entries | `ready`, readable entries, `unreadableCount` | works; unreadable entries kept as they were | removes the key |
| `setItem` throws `QuotaExceededError` (or Firefox's `NS_ERROR_DOM_QUOTA_REACHED`, or code 22 or 1014) | | `full`; the old value stays | |
| `setItem` or `removeItem` throws anything else (such as `SecurityError`) | | `refused`; the old value stays | `refused` |

`storageErrorKind(error)` is `full` when the error's `name` is `QuotaExceededError` or `NS_ERROR_DOM_QUOTA_REACHED`, or its `code` is 22 or 1014, and `refused` for anything else, including values that are not errors.

`createFakeStorageArea(options)` in `src/storage/fake-storage-area.ts` is an in-memory `StorageArea` for tests in `src/storage`, `src/session` and `tests/`. Its options: a size limit in characters over all keys and values, beyond which `setItem` throws a `DOMException` named `QuotaExceededError`; `setItem` throws a `DOMException` named `SecurityError`; `getItem` throws; and a starting map of keys and values. It records every call. The getter that throws, or returns null, is a function the test writes.

## The saved visit and the visit log

A Saved_Visit is the envelope above plus a payload:

```ts
// The payload, as savedVisitPayloadJson writes it and parseSavedVisitPayload reads it.
{
  formatVersion: 1,
  floorDb: number,                    // hearingMethodConfig.floorDb when saved
  swappedRepeatDifferenceDb: number,  // hearingMethodConfig.swappedRepeatDifferenceDb when saved
  summary: VisitSummary,              // exactly what the result showed
  visitLog: VisitLog,                 // exactly what the flow recorded
}
```

How it relates to the visit log (D9):

- The visit log is the flow's one record of the visit (visit-flow R10). It is stored unchanged. The visit log is plain data that survives `JSON.stringify` and `JSON.parse` unchanged (visit-flow R10.7), so the log read back deep-equals the log saved.
- The summary is stored as it was shown, not computed again on reading. `summarizeVisit` is a pure function of the log and the settings, so it could be; but the settings include the visit limit, which awaits the owner's choice (visit-flow Q1), and the swapped-repeat spec may narrow when the repeat is offered (visit-flow D24). Computing it again would let a later change redraw an old visit differently from how it was seen, or reject it. The stored summary keeps its own `visitFalseAlarmRateLimitFraction`.
- `floorDb` is stored because the depth of light depends on it (R13.5) and it may change after the first listening session (`hearing-method.md`, "Known limits").
- The no-headphone replay plays back "a visit log stored in the repository as a data file", and "the log comes from the storage module's export" (brief 09). `exportVisitLog(id)` gives the stored log as JSON text for that. The replay spec validates the file against the engine itself (its brief: "A tool validates a visit log file"); this spec only checks that a stored log has the right version, visit type and rooms.
- A stopped visit has no log to save (visit-flow R14.5); only a visit that reached the result can be saved. Robot mode saves nothing (visit-flow D15, R8.3).

### Checking a payload

`parseSavedVisitPayload(payloadJson, envelopeVisitType)` returns the frozen payload or null. It never throws. It returns null unless every rule holds:

1. The text is JSON, a plain object, with `formatVersion` exactly 1, `floorDb` finite, `swappedRepeatDifferenceDb` finite and above 0, and `summary` and `visitLog` plain objects.
2. `visitLog.formatVersion` is 1; `visitLog.visitType` is `quick` or `full` and equals the envelope's; `visitLog.visitSeed` is a whole number from 0 to 2³² − 1; `visitLog.rooms` is a non-empty array of rooms, each with `roomIndex` equal to its position, a `roomId` among `ghostSoundIds` used once, and a finite positive `frequencyHz`; `calibrations`, `headphoneChecks`, `roomAttempts`, `trials`, `ignoredAnswers`, `pauses` and `refusedPlays` are arrays.
3. `summary.rooms` has one entry per room of the log, and each entry's `room` deep-equals the log's room at the same position.
4. In each room summary: `searchCapDb` is finite; `noSoundTrialCount` and `falseAlarmCount` are whole numbers with 0 ≤ false alarms ≤ no-sound trials; `left` and `right` are ear results: `state` one of the four; `presentationCount`, `catchCount`, `wrongSideCount` and `missCount` whole numbers of 0 or more; `found` has a finite `thresholdDb`; `unreliable` has a non-empty `reasons` array of known `VisitUnreliableReason` values with no repeat.
5. `rightMinusLeftDb` is `right.thresholdDb − left.thresholdDb` when both ears are `found`, and null otherwise.
6. `swappedRepeatOffered` is a boolean, and when true, `rightMinusLeftDb` is not null and its size is at least the payload's `swappedRepeatDifferenceDb`. The converse is not required, so that a narrower offer of a later spec still reads.
7. `pooledNoSoundTrialCount` and `pooledFalseAlarmCount` are the sums over the rooms; `pooledFalseAlarmRateFraction` is their quotient, or 0 without no-sound trials; `visitFalseAlarmRateLimitFraction` is finite, above 0 and at most 1; `visitFalseAlarmRateAboveLimit` equals `judgeVisitFalseAlarms(rooms, limit).aboveLimit`; and when it is true, every ear is `unreliable` with `visitFalseAlarmRate` as its last reason.
8. `ignoredAnswerCount` is a whole number of 0 or more.

These rules are the invariants `summarizeVisit` gives every summary (visit-flow R17, R18), so every summary the flow produces meets them, and a summary that breaks one would draw a picture that disagrees with itself. The list of known reasons is the `VisitUnreliableReason` union; a type test checks that the parser's list covers it exactly, so a reason added later (visit-flow Q2) must be added here in the same change.

`savedVisitPayloadJson(visit, settings)` writes `JSON.stringify` of the payload, with `settings` defaulting to the shipped `hearingMethodConfig`.

## The archive (`create-visit-archive.ts`)

`createVisitArchive(options)` checks the seed, makes a `RandomSource` with `createSeededRandom(seed)`, a `VisitStore` over `options.localStorage`, and a `WeakMap` from visit log objects to the ids they were saved under on this page. In robot mode it makes no store at all.

```
list():
  robot              → { state: off, visits: [], unreadableCount: 0, canSave: false, canDeleteAll: false, lines: [robotModeLine] }
  read = store.read()
  unavailable        → state unavailable, lines [unavailableListLine]
  unreadable         → state unreadable, canDeleteAll true, lines [unreadableListLine]
  ready:
    for each entry, in save order: payload = parseSavedVisitPayload(entry.payloadJson, entry.visitType)
      null → unreadable += 1
      else → a SavedVisit of the envelope fields and the payload, deep-frozen
    visits    = the SavedVisits, newest first, each with visitDateLabel, visitTypeLabel, deleteVisitLabel
    unreadableCount = read.unreadableCount + the payloads that did not parse
    canSave   = visits.length < savedVisitsMaxCount
    canDeleteAll = visits.length + unreadableCount > 0
    lines     = [noSavedVisitsLine] when both are 0;
                + unreadableEntriesLine(unreadableCount) when it is above 0;
                + saveRefusedLine("tooMany") when canSave is false;
                + mayBeClearedLine when any visit is listed

save(visit, typed):
  robot → refused robotMode
  name = canonicalHeadphoneName(typed); if its code points > headphoneNameMaxCharacterCount → nameTooLong
  id = savedIds.get(visit.visitLog)
  if id is listed now:
    same name → saved, renamed false, nothing written
    else store.changeName(id, name) → saved, renamed true, or the store's reason
  current = list(); state unavailable or unreadable → that reason; canSave false → tooMany
  time = wallClock.now()
  repeat: id = eight hex digits of floor(random.next() × 2³²)
          result = store.append({ id, time.epochMs, time.localDate, visit.visitLog.visitType, name,
                                  savedVisitPayloadJson(visit) })
          until result is not idTaken
  ok → savedIds.set(visit.visitLog, id); saved, renamed false, with the SavedVisit list() now gives
  else → the store's reason
  Every outcome carries its line from src/copy.

deleteVisit(id):  robot → robotMode; else store.remove(id) → deleted 1, or the store's reason
deleteAll():      robot → robotMode; count = what list() shows; store.removeAll() → deleted count, or the reason
exportVisitLog(id): robot → null; the listed visit's JSON.stringify(visitLog), or null
today():          wallClock.now().localDate
```

Every method runs inside a `try` around everything it does with the store, so that no error of the browser leaves the archive (R7.5). An error thrown by the archive's own code is a bug and is not caught; the properties are there to find it. The archive keeps no list between calls (D5).

`canonicalHeadphoneName(typed)` normalises to Unicode NFC, replaces every run of white space and control characters with one space, and trims; an empty result is null. `sameHeadphoneNameKey(typed)` is the tidy name in lower case (`toLowerCase`, which does not depend on the browser's language), or null. The stored name keeps the visitor's letter case.

## The picture model

### `resultPicture(input)`

```
source  = live:  { summary: input.visit.summary, visitType: input.visit.visitLog.visitType,
                   floorDb: hearingMethodConfig.floorDb, localDate: input.localDate, live: true }
          saved: { summary, visitType, floorDb, localDate: savedOnLocalDate of input.savedVisit, live: false }
roomCount = summary.rooms.length
for each room summary R, in the summary's order:
  scale = { searchCapDb: R.searchCapDb, floorDb }
  wing(ear) = { ear, state: R[ear].state,
                lightDepthFraction: lightDepthFraction(R[ear], scale),
                line: wingLine(words(R[ear])),
                reasonLine: unreliable ? unreliableReasonLine(R[ear].reasons[0]) : null,
                earlier: null }                                  (outlines: see "Comparison")
  floor = { room: R.room, roomName: roomNames[R.room.roomId], pitchLabel: pitchLabel(R.room.frequencyHz),
            left: wing(left), right: wing(right), rightMinusLeftDb: R.rightMinusLeftDb,
            differenceLabel: differenceLabel(R.rightMinusLeftDb),
            differenceLine: differenceLine(R.rightMinusLeftDb),
            swappedRepeat: live and R.swappedRepeatOffered
                           ? { roomIndex: R.room.roomIndex, line: swappedRepeatLine(R.rightMinusLeftDb),
                               buttonLabel: resultPageCopy.swappedRepeatButton } : null,
            description: floorDescription(R.room.roomId, R.room.frequencyHz, words(R.left), words(R.right),
                                          R.rightMinusLeftDb) }
picture = { kind, visitType, heading: resultPageCopy.heading,
            dateLabel: visitDateLabel(localDate), visitTypeLabel: visitTypeLabel(visitType, roomCount),
            floors, closedRoomIds: ghostSoundIds not among the floors' room ids,
            falseAlarmLine: falseAlarmLine(summary.pooledFalseAlarmCount, summary.pooledNoSoundTrialCount),
            visitNotice: summary.visitFalseAlarmRateAboveLimit
                         ? { heading: resultPageCopy.visitNoticeHeading,
                             line: visitNoticeLine(summary.visitFalseAlarmRateLimitFraction) } : null,
            limitsStatement,                                     (the constant itself)
            comparison: null,                                    (see "Comparison")
            imageCaption: imageCaption(localDate, visitType, roomCount),
            imageFileBaseName: imageFileBaseName(localDate) }
deep-freeze and return
```

`words(result)` is the copy's `WingWords`: `{ state, thresholdDb: found ? thresholdDb : null, reasons: unreliable ? reasons : [] }`.

### How far the light reaches

`lightDepthFraction(result, scale, settings = resultPageConfig)`:

```
found:            span     = scale.searchCapDb − scale.floorDb
                  position = span > 0 ? clamp((scale.searchCapDb − result.thresholdDb) / span, 0, 1) : 1
                  depth    = foundLightDepthAtCapFraction
                             + (foundLightDepthAtFloorFraction − foundLightDepthAtCapFraction) × position
betterThanFloor:  betterThanFloorLightDepthFraction   (1, the far wall)
worseThanCap:     worseThanCapLightDepthFraction      (0, dark)
unreliable:       null                                (hatched)
```

The fraction is a share of the wing's width. 1 is the wing's far wall, as the brief's "light to the far wall" says; where the light enters the wing, and so where 0 lies, is the owner's drawing to decide.

With the proposed values (Q1), a floor whose loudest playable level is 15 dB above the calibration and the quietest playable level of 70 dB below it gives:

| Threshold, relative to calibration | +15 dB (the floor's loudest) | 0 dB | −25 dB | −50 dB | −70 dB (the quietest) |
|---|---|---|---|---|---|
| Depth | 0.10 | 0.24 | 0.48 | 0.71 | 0.90 |

A floor whose loudest is 0 dB, because the calibration left its sound less room (the headphone check's "rooms short" line), puts −25 dB at 0.39. Each 5 dB step moves the light by 0.8 × 5 / 85 ≈ 4.7 percent of the wing on the first example floor and 0.8 × 5 / 70 ≈ 5.7 percent on the second.

What it means (D15):

- **On one floor, deeper means quieter.** Both wings of a floor share its `searchCapDb` (one per room attempt) and the `floorDb`, so on one floor a deeper wing caught a quieter sound and equal thresholds give equal depths (CP3). That is the comparison `wording.md` allows: left against right on one floor.
- **The states sit in order.** A wing that caught the quietest sound the house plays (better than floor) is deeper than any found wing; a found wing is deeper than a dark one, even when its threshold is the floor's loudest, so that "found at the loudest" is not drawn as "not caught" (the gap of 0.1 at each end).
- **The scale is the floor's own.** The shallow end is the loudest level the house could play on this floor in this visit, not one figure for the house. A floor's light says how far into its own range a sound was caught, so the same depth on two floors does not mean the same level, and the same level on two floors whose loudest differs does not give the same depth. In the common case, when every room can reach the anchor cap, the scales coincide, so this alone does not keep floors apart (Q2).
- **It depends on nothing else.** No other floor, no count and no visit type enters a wing's depth (CP3, CP4).

### How the picture keeps floors apart

`product.md` says floors are never compared, and `wording.md` that headphones differ at every pitch. The model does what data can (D16):

- Every floor is computed from its own room summary alone; a floor of the picture is unchanged whatever the other floors hold, as long as the visit-level marking is the same (CP4). The only fields made from more than one floor are the false alarm counts and the visit notice, which are about answers to silence and not about any floor's level (D17, Q3).
- Floors are in the order of the house and never ordered by a result. No field holds a sum, a mean, a rank, a lowest or a highest over floors, and there is no overall number.
- Every string of a floor names only that floor's room and pitch. No string outside a floor names a room or a pitch. No string uses a word of comparison across floors (CP2).
- The limits statement, whose first sentence says floors cannot be compared, is in every picture (CP1).

What only the drawing can do is the owner's. This design suggests, and does not require: no line, curve or gradient that joins the ends of the light from floor to floor; no ticks or level numbers on the measuring line at the left of the house, which is as tall as each room and could be read as a level axis; the limits statement beside the picture at every size; and in the saved image the statement in full. The remaining conflict is Q2.

## The copy

Every string below is the full wording. The owner can review it here. The copy files import only `src/config` and other files of `src/copy` (`roomNames`, `pitchLabel` and `relativeLevelLabel` from `room-copy.ts`, `siteTitle` from `site-title.ts`). Every function throws a `RangeError` for a value that does not fit, as the existing copy functions do. No function takes or returns the visitor's headphone name (D11).

### `src/copy/limits-statement.ts`

```ts
/**
 * The four statements that wording.md requires next to the result picture, written once. The
 * only strings that may use "diagnosis" and "clinical", and only in the negative (wording.md,
 * "One exception"; banned-terms.ts, limitsStatementAllowedTerms).
 */
export const limitsStatement = Object.freeze({
  heading: "What this picture can tell you",
  sentences: Object.freeze([
    "Headphones differ at every pitch, so floors cannot be compared with each other.",
    "What can be compared is your left against your right on one floor, and this visit against your own later visits with the same headphones.",
    "This is not a diagnosis, and it has not been checked against clinical equipment.",
    "See a hearing professional if a difference between your left and your right is still there after you swap the headphones, if your hearing changes suddenly, or if ringing in your ears does not go away.",
  ]) as readonly [string, string, string, string],
});
```

The four sentences follow points 1 to 4 of "What the result page must always say" in `wording.md`, in its order. Its test checks the four sentences and their order, that each Exempt_Term in them comes after the word "not" in the same sentence, that no other banned term appears, and that the object and its array are frozen.

### `src/copy/result-page-copy.ts`

```ts
export const resultPageCopy = Object.freeze({
  heading: "The quietest sounds you caught",
  leftLabel: "Left",
  rightLabel: "Right",
  differenceHeading: "Left and right",
  visitNoticeHeading: "This whole visit is unreliable",
  swappedRepeatButton: "Swap the headphones and visit this room again",
  savePictureButton: "Save picture",
  pictureNotSavedLine: "The picture could not be saved just now. Try again.",
  headphoneNameLabel: "Name your headphones. You may leave this empty.",
  saveButton: "Save this visit in this browser",
  notSavedLine: "This visit is not saved. If you leave without saving it, nothing from it is kept.",
  savedLine: "Saved in this browser. Nothing has left it.",
  renamedLine: "The name of the headphones was changed.",
  mayBeClearedLine: "A browser can clear what is saved in it on its own, so a saved visit may not stay forever.",
  savedVisitsHeading: "Visits saved in this browser",
  noSavedVisitsLine: "No visits are saved in this browser.",
  headphonesLabel: "Headphones",
  unnamedHeadphonesLabel: "Not named",
  showButton: "Show its picture",
  backToThisVisitButton: "Back to this visit",
  deleteButton: "Delete",
  deleteAllButton: "Delete all saved visits",
  deleteAllQuestion: "Delete every saved visit? This cannot be undone.",
  deleteAllConfirmButton: "Delete them all",
  deleteAllCancelButton: "Keep them",
  deletedLine: "The visit was deleted.",
  allDeletedLine: "Every saved visit was deleted.",
  unavailableListLine: "This browser does not let the house keep visits, so none can be saved or shown here.",
  unreadableListLine: "The visits saved in this browser could not be read. Delete them all to save new ones.",
  robotModeLine: "Robot mode keeps nothing in this browser.",
});
```

`headphonesLabel` is shown before the visitor's own name, in an element of its own; `unnamedHeadphonesLabel` stands in for a visit saved without one.

### `src/copy/result-lines.ts`

```ts
export type WingStateName = "found" | "betterThanFloor" | "worseThanCap" | "unreliable";
export type UnreliableReasonName =
  | "trialLimit" | "inconsistentCatch" | "falseAlarmRate" | "levelNotAsAsked" | "visitFalseAlarmRate";
/** What the copy needs about one wing. `thresholdDb` only for found; `reasons` only for unreliable. */
export interface WingWords {
  readonly state: WingStateName;
  readonly thresholdDb: number | null;
  readonly reasons: readonly UnreliableReasonName[];
}

export function falseAlarmLine(falseAlarmCount: number, noSoundTrialCount: number): string;
export function visitNoticeLine(limitFraction: number): string;
export function wingLine(wing: WingWords): string;
export function unreliableReasonLine(reason: UnreliableReasonName): string;
export function differenceLabel(rightMinusLeftDb: number | null): string;
export function differenceLine(rightMinusLeftDb: number | null): string;
export function swappedRepeatLine(rightMinusLeftDb: number): string;
export function floorDescription(
  roomId: GhostSoundId, frequencyHz: number, left: WingWords, right: WingWords,
  rightMinusLeftDb: number | null,
): string;
```

`result-page-types-match.test.ts` checks that `WingStateName` equals `WingState` and `UnreliableReasonName` equals `VisitUnreliableReason`. Decibels are rounded to whole numbers for every line, as `relativeLevelLabel` does; a size is the absolute value of the rounded number.

| Function and input | Output |
|---|---|
| `falseAlarmLine(f, n)`, n ≥ 2 | `You answered {f} of {n} times when I made no sound.` |
| `falseAlarmLine(0, 1)` | `I made no sound once, and you did not answer.` |
| `falseAlarmLine(1, 1)` | `I made no sound once, and you answered.` |
| `falseAlarmLine(0, 0)` | `I made a sound every time on this visit.` |
| `visitNoticeLine(l)` | `You answered more than {p} percent of the times I made no sound, so this visit cannot show what you caught. Walk through the house again, and answer only when you hear something.` where {p} is 100 × l to one decimal place, without a trailing ".0" (0.2 gives "20") |
| `wingLine` found, t | `The quietest sound you caught here was {relativeLevelLabel(t)}.` For −35: "The quietest sound you caught here was 35 dB quieter than your calibration." |
| `wingLine` betterThanFloor | `Quieter than this house can whisper.` |
| `wingLine` worseThanCap | `You did not catch the loudest sound the house may play here.` |
| `wingLine` unreliable | `This room should be visited again.` |
| `unreliableReasonLine("trialLimit")` | `Your answers here had not settled when the house ran out of tries.` |
| `unreliableReasonLine("inconsistentCatch")` | `One catch here did not fit with your other answers.` |
| `unreliableReasonLine("falseAlarmRate")` | `In this room you often answered when I made no sound.` |
| `unreliableReasonLine("levelNotAsAsked")` | `A sound here was not played at the level the house asked for.` |
| `unreliableReasonLine("visitFalseAlarmRate")` | `On this visit you often answered when I made no sound.` |
| `differenceLabel(null)` | `–` (an en dash) |
| `differenceLabel(d)`, d rounds to 0 | `0 dB` |
| `differenceLabel(d)`, d > 0 | `{d} dB quieter on the left` |
| `differenceLabel(d)`, d < 0 | `{−d} dB quieter on the right` |
| `differenceLine(null)` | `There is no left and right difference to show here, because one side has no level.` |
| `differenceLine(d)`, d rounds to 0 | `On this floor you caught the same level on your left and on your right.` |
| `differenceLine(d)`, d > 0 | `On this floor you caught a sound {d} dB quieter on your left than on your right.` |
| `differenceLine(d)`, d < 0 | `On this floor you caught a sound {−d} dB quieter on your right than on your left.` |
| `swappedRepeatLine(d)` | `Your left and right are {size of d} dB apart here. Swap the headphones, so that the left earpiece is on your right ear, and visit this room again. That helps tell whether the difference stays with your ears or moves with the headphones.` |
| `floorDescription(...)` | `{room name}, {pitch}. Left: {wingLine(left)}{ reason line if any} Right: {wingLine(right)}{ reason line if any} {differenceLine}` |

`rightMinusLeftDb` is right minus left, so a positive value means the right needed a louder sound and the quieter sound was caught on the left. The wording names the side the sound was caught on and never the ear or the earpiece that is responsible, because only the swapped repeat can tell those apart (D19).

An example of `floorDescription`: "Stairs, 4 kHz. Left: The quietest sound you caught here was 35 dB quieter than your calibration. Right: This room should be visited again. One catch here did not fit with your other answers. There is no left and right difference to show here, because one side has no level."

### `src/copy/saved-visit-lines.ts`

```ts
export type SaveRefusalName =
  "robotMode" | "unavailable" | "unreadable" | "refused" | "full" | "tooMany" | "nameTooLong";
export type DeleteRefusalName = "robotMode" | "unavailable" | "unreadable" | "refused" | "notFound";

export function visitDateLabel(localDate: string): string;
export function visitTypeLabel(visitType: VisitType, roomCount: number): string;
export function imageCaption(localDate: string, visitType: VisitType, roomCount: number): string;
export function imageFileBaseName(localDate: string): string;
export function deleteVisitLabel(localDate: string, visitType: VisitType, roomCount: number): string;
export function saveRefusedLine(
  reason: SaveRefusalName,
  settings?: Pick<ResultPageConfig, "savedVisitsMaxCount" | "headphoneNameMaxCharacterCount">,
): string;
export function deleteRefusedLine(reason: DeleteRefusalName): string;
export function unreadableEntriesLine(count: number): string;
```

`result-page-types-match.test.ts` checks that the two refusal names equal `SaveRefusal` and `DeleteRefusal`. Dates are read from the `YYYY-MM-DD` text with English month names written out, without `Date` and without the browser's language, so that the output is the same everywhere (D30).

| Function and input | Output |
|---|---|
| `visitDateLabel("2026-11-20")` | `20 November 2026` (no leading zero on the day) |
| `visitTypeLabel("quick", 3)` | `Short visit, 3 rooms` |
| `visitTypeLabel("full", 5)` | `Long visit, 5 rooms` |
| `visitTypeLabel(t, 1)` | `Short visit, 1 room` or `Long visit, 1 room` |
| `imageCaption("2026-11-20", "quick", 3)` | `Did You Hear That? A first listen on 20 November 2026. Short visit, 3 rooms.` |
| `imageFileBaseName("2026-11-20")` | `did-you-hear-that-2026-11-20` |
| `deleteVisitLabel("2026-11-20", "full", 5)` | `Delete the visit of 20 November 2026, long visit, 5 rooms` |
| `saveRefusedLine("robotMode")` | `Robot mode keeps nothing in this browser.` |
| `saveRefusedLine("unavailable")` | `This browser does not let the house save visits. The picture stays here until you leave the page.` |
| `saveRefusedLine("unreadable")` | `The visits already saved in this browser could not be read. Delete them all, then save again.` |
| `saveRefusedLine("refused")` | `This browser would not save the visit. The picture stays here until you leave the page.` |
| `saveRefusedLine("full")` | `This browser has no room left to save the visit. Delete a saved visit, then save again.` |
| `saveRefusedLine("tooMany")` | `{savedVisitsMaxCount} visits are saved, as many as the house keeps. Delete one, then save again.` |
| `saveRefusedLine("nameTooLong")` | `The name can have up to {headphoneNameMaxCharacterCount} characters.` |
| `deleteRefusedLine("robotMode")` | `Robot mode keeps nothing in this browser.` |
| `deleteRefusedLine("unavailable")` | `This browser does not let the house delete saved visits just now.` |
| `deleteRefusedLine("unreadable")` | `The saved visits could not be read, so one cannot be deleted on its own. Delete them all instead.` |
| `deleteRefusedLine("refused")` | `This browser would not delete the visit just now. Try again.` |
| `deleteRefusedLine("notFound")` | `That visit is no longer saved in this browser.` |
| `unreadableEntriesLine(1)` | `1 saved visit could not be read and is not shown. Deleting all saved visits removes it.` |
| `unreadableEntriesLine(n)`, n ≥ 2 | `{n} saved visits could not be read and are not shown. Deleting all saved visits removes them.` |

Visit types are named "short" and "long" with their number of rooms, not by minutes, so the labels stay true whatever the owner decides about the length of the visits (visit-flow Q3) and if the roadmap's third cut leaves the long visit with three rooms (D22).

### `src/copy/comparison-lines.ts` (comparison tasks)

```ts
export const comparisonCopy = Object.freeze({
  headphoneNameHint:
    "Give the same name on a later visit, and this visit is drawn there as faint outlines.",
  noEarlierVisitLine:
    "No earlier visit with headphones of this name is saved in this browser.",
});
export function earlierVisitLine(localDate: string): string;
export function earlierVisitUnreliableLine(localDate: string): string;
```

| Function | Output |
|---|---|
| `earlierVisitLine("2026-11-12")` | `The faint outlines are your visit of 12 November 2026 with headphones of the same name. Each visit is relative to its own calibration.` |
| `earlierVisitUnreliableLine("2026-11-12")` | `Your visit of 12 November 2026 with headphones of the same name was unreliable as a whole, so it has no outlines.` |

The page shows `headphoneNameHint` under the name field and `noEarlierVisitLine` when a name is typed and `findEarlierVisit` gives null. Both belong to the comparison tasks, so that cutting comparison leaves no line about outlines.

### The copy tests

`src/copy/result-copy.test.ts`, in the form of `house-copy.test.ts`: every string reachable from the exports of `result-page-copy.ts`, `result-lines.ts` and `saved-visit-lines.ts` (and later `comparison-lines.ts`) is non-empty, trimmed and free of banned terms; every function gives the outputs of the tables above; every function's output for representative inputs (every state, every reason, differences of −40, −15, −0.4, 0, 0.4, 15 and 40, counts 0 to 3 and 9 and 21, limits 0.15, 0.2, 0.25 and 0.125, dates at the ends of months and years, every refusal) is free of banned terms; every level is followed by "than your calibration"; bad inputs throw a `RangeError` (a negative or non-whole count, false alarms above no-sound trials, a limit outside (0, 1], a date that is not a calendar date, a non-finite difference, a room count below 1).

## The copy check and its one exemption

`runCopyCheck` takes a new option:

```ts
export interface CopyCheckExemption {
  /** The file, relative to rootDir, such as "src/copy/limits-statement.ts". */
  readonly file: string;
  /** The export whose strings, at any depth, are exempt. */
  readonly exportName: string;
  /** The terms allowed there. Every other banned term is still reported. */
  readonly allowedTerms: readonly string[];
}
// CopyCheckOptions gains: exemptions?: readonly CopyCheckExemption[]   (default: none)
```

For a string whose file and export path match an exemption (the path is the export name, or starts with it followed by `.` or `[`), the allowed terms are left out of the terms it is checked against. Nothing else changes in the check. When it reports, the summary line says how many strings an exemption applied to. `tools/check-copy.ts` gives one exemption: `src/copy/limits-statement.ts`, `limitsStatement`, `limitsStatementAllowedTerms`. The exemption names one export, so a banned term added anywhere else, including another export of the same file, is still reported (D23). `run-copy-check.test.ts` adds: an exempt export may use an allowed term; it may not use another banned term; another export of the same file may not use the allowed term; an exemption for a file that does not exist changes nothing.

## The copy hook

`.kiro/hooks/copy-check-on-copy-save.json`:

```json
{
  "version": "v1",
  "hooks": [
    {
      "name": "Copy check on copy save",
      "description": "Checks every string exported from src/copy against the banned terms of wording.md, with the one exemption of the limits statement. Findings go to the agent. See .kiro/specs/result-page/design.md.",
      "trigger": "PostFileSave",
      "matcher": "(^|/)src/copy/.+\\.ts$",
      "action": { "type": "command", "command": "npm run --silent check:copy -- --hook" },
      "timeout": 60
    }
  ]
}
```

The form is that of `render-check-on-synth-save.json`: one v1 standalone file, one `PostFileSave` hook, a command action, no confirmation step. The matcher takes every TypeScript file under `src/copy/`, absolute or relative, and uses no regular expression feature that the Rust `regex` crate lacks.

Hook mode, `--hook`, runs the same check. `copyCheckStreams(result, hookMode)` in `tools/copy-check-streams.ts` decides where its lines go: without `--hook`, every line on standard output, as now; with `--hook`, every line on standard error when the check found a banned term and the exit code is 1, so that Kiro gives the findings to the agent, as the render tool's hook mode does, and one line on standard output otherwise. It does not read standard input: the whole check takes a few seconds and needs no changed path.

`tests/copy-check-hook.test.ts`, in the form of `tests/render-check-hook.test.ts`: one v1 hook with the name, trigger, command and timeout above; no confirmation and not turned off; exactly the keys of the render hook; the matcher takes `src/copy/result-lines.ts`, `src/copy/result-copy.test.ts`, `src/copy/nested/x.ts` and an absolute path under `src/copy/`, and not `src/config/banned-terms.ts`, `src/copy/README.md`, `docs/src/copy.ts`, `mysrc/copy/x.ts` or `src/copyx/x.ts`; no lookaround, backreference, possessive quantifier or atomic group.

What the hook does not do (D24): it checks exported strings, not the output of functions, which `check:copy` counts and does not call. The output of every function is checked by `result-copy.test.ts` and by CP1 under `npm test`. Saving `src/config/banned-terms.ts` does not run it, because the brief names `src/copy/` only. Whether its findings reach the agent in a headless CLI session has not been seen: `docs/experiments/hook-catches.md` records that the render hook fired there and that its findings did not come back to the agent.

## Comparison with an earlier visit

These are tasks 12 and 13. They add `find-earlier-visit.ts`, `comparison-lines.ts` and CP9, and add the outline step to `result-picture.ts`. Before them the picture's `comparison` and every wing's `earlier` are null.

`findEarlierVisit(list, typed, shownId)`:

```
key = sameHeadphoneNameKey(typed); null → null
start = the position of shownId in list.visits plus 1, or 0 when shownId is null or not listed
return the first of list.visits[start…] whose headphone name has the key, or null
```

`list.visits` is newest first, so this is the most recent visit saved before the shown one. Visits with no name never match. The visit type need not be the same: floors are matched by room.

The outline step of `resultPicture`, when `earlierVisit` is not null:

```
for each floor F of the shown visit:
  E = the earlier visit's room summary with the same roomId, or none
  for each ear: earlier = E ? { state: E[ear].state,
                                outlineDepthFraction: lightDepthFraction(E[ear], F's scale) } : null
comparison = { earlierSavedVisitId,
               line: earlierVisit.summary.visitFalseAlarmRateAboveLimit
                     ? earlierVisitUnreliableLine(earlier date) : earlierVisitLine(earlier date) }
```

`lightDepthFraction` gives null for an unreliable ear, so an unreliable earlier wing has no outline, and every wing of an earlier visit that was marked as a whole has none. The outline is placed on the shown floor's own scale, the shown `searchCapDb` and the shown `floorDb`, so that in one wing the light and the outline answer the same question: deeper means quieter on this floor (D25). An earlier threshold outside the shown scale is held at its end. No sentence compares the two visits: the line names the earlier visit's date and says that each visit is relative to its own calibration, because whether the hand-rubbing anchor repeats well enough between visits is open (`docs/architecture.md`, open question 3).

## Error handling

| Situation | Behaviour |
|---|---|
| A seed that is not a whole number from 0 to 2³² − 1 | `createVisitArchive` throws a `RangeError` (R8.2) |
| Local storage blocked, missing, or its getter throws | `list` gives `unavailable` with its line; `save` and the deletes give `unavailable`; nothing throws (R7.1) |
| `setItem` throws a full quota | `full`, with its line; the stored value is as it was (R7.2, R7.3) |
| `setItem` or `removeItem` throws anything else | `refused`, with its line; the stored value is as it was |
| The value under the key is not JSON, has another shape or another version | `unreadable`: nothing listed, saving and single deletes refused, "delete all" removes it (R7.4, D7) |
| An entry with a bad field or a checksum that does not match | Not listed; counted; kept as it was until "delete all" (R5.3, D6) |
| A payload that is not JSON, of another version, or breaks a rule of "Checking a payload" | Not listed; counted; kept as it was (R5.5) |
| Two entries with the same id | The first is read; the later one is unreadable |
| A name longer than the limit after tidying | `nameTooLong`, nothing written (R9.4) |
| As many readable visits as the limit | `tooMany`, nothing written, nothing deleted (R9.5, D12) |
| A drawn id already in the value | Another id is drawn (R9.7) |
| A second save of the same visit log on the page | The name changes if it differs; nothing is added (R9.3) |
| `deleteVisit` with an id that is not listed | `notFound`, nothing written (R6.5) |
| Robot mode | Local storage is never called; every save and delete is refused with `robotMode` (R8.3) |
| A copy function given a value that does not fit | `RangeError`, as the existing copy functions do. The picture and the archive never give one for a summary that meets "Checking a payload" |
| A bug in the archive's own code | Not caught, so that the properties find it |

## Correctness properties

Every property is universal: fast-check with a new random seed on every run (R21.3). None is statistical, so none has fixed seeds or measured limits. The brief's two properties are CP1 and CP2.

The **arbitraries** (`tests/properties/result-page-arbitraries.ts`) draw:

- **A visit**: a visit type; its rooms from `visitRooms`; one calibration; for each room one finished attempt, sometimes after an abandoned one, with a `searchCapDb` on the 5 dB grid from `floorDb + 5` to `capRelativeToAnchorDb`; an ear result for each ear in any of the four states, with a threshold on the grid from `floorDb` to that cap, any search reasons in the search's order, and counts; no-sound trials from 0 to 13 and false alarms from 0 to that; sometimes one decided sound trial played at another level than asked (so that `levelNotAsAsked` appears); 0 to 40 ignored answers. Its summary is `summarizeVisit(log, settings)` with a visit limit drawn from 0.05 to 0.30 and, for the picture properties, a swapped-repeat difference from 5 to 30 dB; the storage properties use the shipped difference, because the archive saves the shipped one. Building the summary with the real function gives every invariant it has, including the visit-level marking, and every combination the brief names: states, differences and false alarm rates.
- **A picture input**: live, or saved with a `floorDb` from −80 to −40, a local date from 2026-01-01 to 2030-12-31, and an earlier visit or none (the earlier visit only once tasks 12 and 13 are built).
- **A typed name**: empty, spaces only, a short name, the same name in other letter case and spacing, names with line breaks, tabs, control characters and combining marks, names at the limit and one past it, and names made of banned words (which are the visitor's text and never reach a sentence).
- **A stored value**: what an archive wrote, then changed: one character replaced, removed or inserted at any place; cut off at any length; two entries swapped; one field of one entry replaced by another type or value; the format version changed; the whole value replaced by any string or any JSON.
- **A storage behaviour**: working; the getter throws, gives null or undefined; `getItem` throws; `setItem` throws `SecurityError`; a quota of any size from 0 up.

`tests/properties/result-page-text.ts` collects the generated text of a picture, a list and an outcome, each string with its place, and holds the allowed forms and word lists of CP1 and CP2. Generated text is every field the contract describes as something to show or say: the picture's `heading`, `dateLabel`, `visitTypeLabel`, `falseAlarmLine`, `visitNotice`, `limitsStatement`, `comparison.line`, `imageCaption` and `imageFileBaseName`; each floor's `roomName`, `pitchLabel`, `differenceLabel`, `differenceLine`, `swappedRepeat.line`, `swappedRepeat.buttonLabel` and `description`; each wing's `line` and `reasonLine`; the list's `lines` and each listing's labels; each outcome's `line`. Code values (`kind`, `state`, `ear`, room ids, saved visit ids) and the visitor's own data (`headphoneName`, the summary, the log) are not generated text.

**CP1. Safe wording** (1000 runs; R12.4, R16, R17, R18; brief property "Safe wording"). For any picture input, and for any list state, unreadable count and refusal, take the generated text of the picture, the list and the outcomes, and every string exported from the copy files of this spec:
- no string except the four sentences of `limitsStatement` holds a banned term (`findBannedTerms` with `bannedTerms`); those four hold none but `diagnosis` and `clinical`;
- `picture.limitsStatement` is the constant `limitsStatement`, the same object;
- every match of `\d+ dB` is followed by " quieter than your calibration", " louder than your calibration", " quieter on the left", " quieter on the right", " quieter on your left than on your right", " quieter on your right than on your left" or " apart here", or is the whole string "0 dB";
- no string holds a word about accuracy: accurate, accuracy, precise, precision, exact, exactly, validated, verified, guaranteed, certain;
- no string is empty or starts or ends with white space;
- no generated string holds a typed name (the drawn names are chosen so that they cannot occur in the copy by chance).

**CP2. No text compares floors** (1000 runs; R14; brief property "The picture never orders or connects floors"). For the same inputs:
- every string of a floor (room name, pitch label, wing lines, reason lines, difference label and line, swapped-repeat line, description) names no room of `roomNames` and no pitch label other than its own;
- no string outside the floors names a room or a pitch label, except the limits statement, which names neither;
- after the allowed forms are removed ("{n} dB quieter than your calibration", "{n} dB louder than your calibration", "as loud as your calibration", "Quieter than this house can whisper", "{n} dB quieter on the left" and "on the right", "{n} dB quieter on your left than on your right" and the reverse, "more than {p} percent of the times I made no sound", "The quietest sounds you caught", "The quietest sound you caught here", "the loudest sound the house may play here", "as many as the house keeps"), no string other than the limits statement holds any of: than, more, less, fewer, most, least, better, worse, best, worst, higher, lower, highest, lowest, deeper, shallower, deepest, quieter, louder, quietest, loudest, average, mean, median, total, overall, sum, combined, altogether, together, rank, ranked, compare, compared, comparison, floors;
- every number in a floor's strings is a number of its pitch label, the size of a rounded threshold of one of its own found ears, or the size of its own rounded difference; every number in the other strings is a pooled count of the summary, the visit limit in percent, a number of a date shown (day, year, and in the file name the month), the number of rooms of a visit shown, the unreadable count, or a count of `resultPageConfig`;
- the floors are in the summary's order, which is the order of the house, whatever the results.

**CP3. Depth is honest on one floor** (1000 runs; R13). For any `floorDb` from −80 to −40, any `searchCapDb` from `floorDb − 10` to 15, and any two ear results:
- a found depth lies from `foundLightDepthAtCapFraction` to `foundLightDepthAtFloorFraction`; better than floor gives 1; worse than cap 0; unreliable null;
- of two found results on the same scale, the one with the lower threshold has a depth at least as deep, and strictly deeper when both thresholds lie inside the scale and the scale's span is above 0;
- better than floor is deeper than any found depth, and any found depth is deeper than worse than cap;
- equal results on the same scale give equal depths, so the two wings of one floor are drawn on one scale;
- in a picture, every wing's depth equals `lightDepthFraction` of its own ear result on its own floor's scale with the input's `floorDb`.

**CP4. A floor is drawn from its own floor alone** (500 runs; R14.1 to R14.3). For any visit and any floor f of its picture: replacing the ear results, counts and caps of every other floor, while keeping the visit-level marking and the pooled counts' effect on it the same, leaves floor f of the new picture deep-equal to floor f of the first; and the floors of any picture are in visit order, whatever the results.

**CP5. What is saved is read back** (200 runs; R4, R5, R6.1, R9, R11). For any sequence of up to 8 saves of drawn visits with drawn typed names, wall times and archive seeds, on a working fake storage area, with some saves repeated with the same visit log:
- after each save, `list()` is `ready` and lists exactly the visits saved so far, newest first, one per distinct visit log;
- each listed visit's `summary` and `visitLog` deep-equal `JSON.parse(JSON.stringify(...))` of what was given; its `headphoneName` is the tidy name of the last name saved for it; its date and time are the wall clock's at its first save; its `floorDb` and `swappedRepeatDifferenceDb` are the shipped values;
- the `savedVisit` of each successful outcome deep-equals the listing that follows;
- a second archive created on the same storage area with another seed lists the same visits;
- `exportVisitLog(id)` parses to the listed visit's log;
- the storage area holds no key but the Storage_Key.

**CP6. Deleting removes exactly what was asked** (300 runs; R6, R10). For any stored state made of saved visits, Unreadable_Entries and other keys in the storage area, and any sequence of `deleteVisit` with listed and unlisted ids and at most one `deleteAll`:
- `deleteVisit` of a listed id removes that visit and no other: the other entries' JSON values, readable or not, and every other key are unchanged;
- `deleteVisit` of an unlisted id reports `notFound` and changes nothing;
- `deleteAll` removes the Storage_Key and no other key, and reports the number of visits listed before it;
- when every visit has been deleted one by one and no Unreadable_Entry is left, the Storage_Key is gone.

**CP7. Corrupt or refusing storage never throws and never shows a wrong picture** (500 runs; R5, R7). For any stored value from the arbitraries, built from visits an archive saved, and any storage behaviour:
- no method of the archive throws, and `resultPicture` of every listed visit does not throw;
- every listed visit deep-equals one of the visits that was saved; none is a changed one;
- the unreadable count plus the listed count is at most the number of entries the value's `visits` array holds, and is 0 for an Unreadable_Value;
- a save or delete reported as `refused` or `full` leaves the storage area's content exactly as it was;
- after `deleteAll` on a working area, whatever it held, a save succeeds and is listed.

**CP8. Robot mode touches nothing** (200 runs; R8.3). For any sequence of calls to an archive in robot mode: the function that gives local storage is never called; every save and delete is refused with `robotMode`; `list()` is `off` with no visits; `exportVisitLog` gives null.

**CP9. The earlier visit is the right one** (300 runs; R20; comparison tasks). For any list of saved visits with drawn names, any typed name and any shown id (listed, unlisted or null):
- `findEarlierVisit` gives the newest listed visit saved before the shown one with the same name ignoring letter case and spacing, and null when there is none or the name is empty; never the shown visit;
- in the picture with that earlier visit, a wing has `earlier` exactly when the earlier visit has the same room; its outline is null exactly when the earlier ear is unreliable; otherwise it equals `lightDepthFraction` of the earlier ear result on the shown floor's scale;
- the outlines are monotone in the same way as CP3: of two earlier found results, the lower threshold gives an outline at least as deep;
- `comparison` names the earlier visit's id, and its line is `earlierVisitUnreliableLine` exactly when the earlier visit was marked as a whole;
- with `earlierVisit: null` the picture equals the picture before the comparison tasks: every `earlier` and `comparison` null.

Once tasks 12 and 13 are built, CP1 and CP2 also draw an earlier visit or none.

The other checks are examples: each pure helper, the config values, the copy outputs of the tables, the store's rows of the failure table one by one, the archive's lines and outcomes, the hook file, the copy check's exemption, and `result-page-simulated-visits.test.ts`, which plays a quick and a full visit through the visit flow's harness and simulated visitor to the result, saves each through an archive on a fake storage area, lists it back deep-equal and draws its picture.

## Testing strategy

### Fake storage, wall clock and visits

The properties and unit tests use `createFakeStorageArea` from `src/storage/fake-storage-area.ts` and a wall clock written in the test (`{ now: () => ({ epochMs, localDate }) }`) that moves as the test says. No test touches a real local storage. `result-page-simulated-visits.test.ts` uses `tests/properties/visit-flow-harness.ts` and `tests/listeners/simulated-visitor.ts` with the worst-case renderers through `vi.mock`, as the visit flow's simulated visits do, so that its visit logs are real ones.

### Run counts and time

| Property | Runs |
|---|---|
| CP1 | 1000 |
| CP2 | 1000 |
| CP3 | 1000 |
| CP4 | 500 |
| CP5 | 200 |
| CP6 | 300 |
| CP7 | 500 |
| CP8 | 200 |
| CP9 | 300 |

The property files of this spec must take at most 30 seconds together on the project machine (proposed, Q7). The pictures and the archive are pure or work on an in-memory map, so the estimate is a few seconds. Tasks 9, 10 and 13 run `npm test` three times and write the time of each file here. If the files take more than 30 seconds together, the task stops and reports the times to the owner; it changes no run count.

Times of task 13: to be written by that task. The times of tasks 9 and 10 follow.

Times of task 9. Three runs of `npm test` on 2026-11-15, with the files of tasks 1 to 9 present, gave these times per property file, in ms, as Vitest's JSON reporter gives them (the sum of the file's test durations, without the file's import):

| File | Run 1 | Run 2 | Run 3 |
|---|---|---|---|
| CP1 | 5147 | 5849 | 5782 |
| CP2 | 4599 | 5409 | 5142 |
| CP3 | 325 | 280 | 273 |
| CP4 | 188 | 194 | 225 |
| Together | 10259 | 11732 | 11422 |

`result-page-regressions.test.ts` holds one `it.todo` and took 0 ms. Every run was under the 30 second budget (proposed, Q7). CP3's 1000 runs are two properties of 1000 runs each: the depth on any scale, and the depth of every wing of a picture.

Times of task 10. Three runs of `npm test` on 2026-11-15, with the files of tasks 1 to 10 present, measured the same way, in ms:

| File | Run 1 | Run 2 | Run 3 |
|---|---|---|---|
| CP1 | 5595 | 5840 | 6865 |
| CP2 | 4230 | 4810 | 5297 |
| CP3 | 291 | 258 | 368 |
| CP4 | 196 | 236 | 222 |
| CP5 | 1415 | 1182 | 1335 |
| CP6 | 893 | 1062 | 1224 |
| CP7 | 1662 | 1378 | 1359 |
| CP8 | 143 | 180 | 263 |
| Together, CP1 to CP8 | 14425 | 14946 | 16933 |
| `result-page-simulated-visits.test.ts` | 279 | 244 | 294 |
| Together, with the simulated visits | 14704 | 15190 | 17227 |

Every run was under the 30 second budget (proposed, Q7), so no run count was questioned. The whole of `npm test` took 46.9, 48.3 and 55.2 seconds in these runs.

### Counterexamples

A counterexample becomes a named case in `tests/properties/result-page-regressions.test.ts`, `regression <n>: <what went wrong> (<property>, seed <s>)`, with the case written out, first with `it.fails`. The task that finds it stops there and reports it, so that the case and the fix go in separate commits, as the earlier specs do. A case that could only be removed by changing a proposed value (Q1, Q4, Q5) or a steering value stays an expected break, with a decision giving the case.

### Requirement coverage

| Requirement | Checked by |
|---|---|
| R1 | Task 1; `result-page-types.test.ts`; `result-page-types-match.test.ts`; `npm run typecheck`; review of the contract against "Interface contract" |
| R2 | `result-page-config.test.ts`; the final task's search for numbers |
| R3 | `system-wall-clock.test.ts`; `npm run lint` (no clock read in `src/session`); CP5 (order of saving); `create-visit-archive.test.ts` with a clock set back |
| R4 | `create-visit-store.test.ts` (the format, the key); CP5 (no other key); CP6 |
| R5 | `create-visit-store.test.ts`; `saved-visit-payload.test.ts` (each rule of "Checking a payload"); CP5; CP7 |
| R6 | `create-visit-store.test.ts`; CP6 |
| R7 | `create-visit-store.test.ts` (each row of the failure table); `storage-error-kind.test.ts`; `entry-checksum.test.ts`; CP7 |
| R8 | `create-visit-archive.test.ts`; CP8 |
| R9 | `create-visit-archive.test.ts`; `canonical-headphone-name.test.ts`; CP5 |
| R10 | `create-visit-archive.test.ts`; CP6 |
| R11 | `saved-visit-payload.test.ts`; `result-page-simulated-visits.test.ts`; CP5 |
| R12 | `result-picture.test.ts`; CP1; CP4 |
| R13 | `light-depth-fraction.test.ts`; CP3 |
| R14 | CP2; CP4; `result-picture.test.ts` |
| R15 | `result-picture.test.ts`; `result-copy.test.ts`; CP2 |
| R16 | `result-picture.test.ts`; `result-copy.test.ts`; CP1 |
| R17 | `limits-statement.test.ts`; `run-copy-check.test.ts`; `npm run check:copy`; CP1 |
| R18 | `result-copy.test.ts`; `result-page-types-match.test.ts`; CP1; CP2 |
| R19 | `copy-check-hook.test.ts`; `copy-check-streams.test.ts` |
| R20 | `find-earlier-visit.test.ts`; `result-picture.test.ts` (outlines); CP9 |
| R21 | The property files; the regression file; the times under "Run counts and time" |
| R22 | CP1 and CP3 over every visit limit from 0.05 to 0.30; the section "Whatever the owner chooses in visit-flow Q1 to Q4" |
| R23 | The final task's `git status` and search |

## How the design serves the steering

| Rule | How |
|---|---|
| product, what the result may claim | Only left against right on one floor (the difference, the shared scale of one floor) and this visit against a later one with the same headphones (outlines). No floor is compared with another, no visitor with another, and nothing is called a verdict |
| product, no accounts, no server, no analytics | Local storage only, under one key; nothing is sent; the page's privacy line stays true |
| product, follow what happened without headphones | Every wing has a line and every floor a description; the saved image carries the statement |
| wording, banned words | CP1 over every string the model and the archive give; the check over every exported constant; the hook on every save of a copy file |
| wording, the one exception | One export, two terms, in the negative, enforced by the check and its test (D23) |
| wording, "quieter" and "louder", depth of light | Wing lines say quieter and louder, numbers are labelled relative to the visitor's calibration, and the light's depth means a quieter sound caught on that floor |
| wording, the four statements | In every picture (CP1); next to the picture and in the image is the owner's layout |
| wording, nothing about accuracy | No accuracy word anywhere (CP1); "unreliable" is said of the answers, not of the product |
| wording, tone | Short, calm lines; nothing mocks a miss; the false alarm line states counts |
| hearing-method, the four states | Found with its number, better than floor with "Quieter than this house can whisper." and no number, worse than cap plainly and no number, unreliable hatched with the reason |
| hearing-method, false alarm rate reported | Above the picture, always; the notice when above the visit limit |
| hearing-method, the 15 dB difference | Read from the summary's offer; this spec adds no rule |
| structure | `src/storage` imports only `config`; `src/ui` needs only `session`, `copy` and `config`; numbers in `src/config`; every string in `src/copy`; `Db`, `Fraction`, `Count`, `Ms` endings; `left` and `right` |
| tech | Static; local storage only; time and randomness injected; runs under Node; no runtime dependency |
| audio-safety | The result page plays nothing. Rule 9 (no sudden full-screen flashes) applies to the owner's drawing; nothing in the model asks for a flash |

No number or rule from a steering file is changed or loosened by this spec.

## Whatever the owner chooses in visit-flow Q1 to Q4

These four questions stay open. The result page works for every answer.

- **Q1, the visit limit (proposed 0.2, not approved).** The page reads whether the visit is marked and the limit from the summary itself. The notice names the limit the summary was judged by, so a saved visit keeps its own. Changing the value changes no code here. CP1 and CP3 run over limits from 0.05 to 0.30.
- **Q2, constant pressing.** The page says nothing about answers outside every window. If the owner adds a rule that marks a visit, it adds a reason to `VisitUnreliableReason`; the copy then needs one line for it in `unreliableReasonLine`, and `parseSavedVisitPayload` its name, which the type tests make sure of. Nothing else changes.
- **Q3, the length of the visits.** The labels name visit types by their number of rooms, not by minutes (D22).
- **Q4, a device change mid-room.** Each floor is drawn on its own scale, from the cap of its own last finished attempt, so a floor measured after a new calibration is drawn correctly whichever way the owner decides.

## What the owner builds

Outside this spec's tasks, by hand: everything under `src/ui/`, `index.html`, `src/main.ts` and the CSS; the drawing of the lit cross-section, with the wings, the hatching, the outlines and the closed rooms; the layout at phone and desktop sizes, with the limits statement next to the picture and never behind a link; input handling, including the name field, the confirmation of "delete all" with the copy's question and buttons, and calling `archive.list()` again after each change; turning the picture into an image file for "Save picture", with the caption and the limits statement in it, named with `imageFileBaseName` and an extension; replacing the stand-in notice of the result stage in `src/ui/visit/screen-of-snapshot.ts`; the browser tests in `tests/e2e/`. The "Done when" line about rendering every combination without overlap at phone and desktop sizes is the owner's. The model gives every combination: `tests/properties/result-page-arbitraries.ts` can feed the owner's drawing tests if the owner wants.

## Questions for the project owner

None of these is decided here. Every new number of this spec is a proposal awaiting the owner's choice, and the proposed values are in `src/config/result-page-config.ts` marked `PROPOSED, NOT APPROVED`. The visit-level false alarm limit of 0.2 is still proposed, not approved, and visit-flow Q1 to Q4 are still open; "Whatever the owner chooses in visit-flow Q1 to Q4" shows that the page works for each answer.

**Q1. How the depth of light follows from a level.** Proposed: on each floor, a found threshold at the floor's own loudest playable level (`searchCapDb`) lights 0.1 of the wing (`foundLightDepthAtCapFraction`), one at the quietest playable level (`floorDb`) lights 0.9 (`foundLightDepthAtFloorFraction`), and the light is linear in decibels between them; better than floor reaches the far wall (1) and worse than cap stays dark (0), as the brief says ("How far the light reaches", D15). Options and what each costs:

| Option | What it gives | What it costs |
|---|---|---|
| **The proposal: each floor's own range, 0.1 to 0.9** | Deeper means quieter on that floor; a found wing never looks dark and never reaches the far wall; a floor whose loudest is lower is drawn on its own range | Equal depths on two floors do not mean equal levels, which is the intent but may puzzle a careful reader; each 5 dB step is about 4.7 percent of a wing (about 7 px on a 150 px wing of a phone) |
| One range for every floor, from the anchor cap (`capRelativeToAnchorDb`, 15 dB) to `floorDb` | Equal levels give equal depths on every floor | Invites reading the floors against one another, which `product.md` forbids; a floor whose loudest is below the anchor cap can never light its shallow end, so its range looks cut off |
| Other ends, such as 0.05 and 0.95, or 0.2 and 0.8 | Wider ends give finer steps; narrower ends set "found at the loudest" further apart from dark and "found at the quietest" from the far wall | 0.05 to 0.95: a wing that caught only the loudest sound is barely lit. 0.2 to 0.8: each step is 3.5 percent of a wing |
| Light by the left and right difference only (see Q2) | Draws only what may be compared | Departs from the brief's picture; outlines of an earlier visit would show its difference, not its levels |

**Q2. The picture's shape can invite comparing floors.** This is a conflict between the brief and the steering that this spec does not settle. The brief's picture lights five floors, one above the other, each as deep as that ear caught a sound there. `product.md` says floors are never compared, and `wording.md` that headphones differ at every pitch, so floors cannot be compared. Five depths stacked by pitch form, at a glance, a chart of level against pitch, the kind of chart `wording.md` keeps out of the text by banning its name; a screenshot will be read that way whatever the text says. The model keeps floors apart as far as data can (D16): no field spans floors, each floor has its own scale, no text compares floors, and the limits statement is always there. But on most visits every room reaches the anchor cap, the floors' scales coincide, and the depths line up. Options:

- (a) Keep the brief's picture, with the model as designed and the drawing suggestions of "How the picture keeps floors apart" (no joining line, nothing on the measuring line, the statement beside the picture). Cost: the shape remains; the limits statement carries the warning.
- (b) Keep the picture and make each floor's range visible, for example a faint mark at each wing's own shallow end, so that a reader sees that the floors' scales are their own. Cost: more to draw; on most visits the marks line up and say little.
- (c) Light each floor by left against right only (the option of Q1's last row). Cost: departs from the brief, and the outlines of an earlier visit change meaning.
- (d) Change the steering or the brief. That is the owner's to do.

A related point for the owner's drawing: the measuring line at the left of the house in `src/ui/house/draw-house-section.ts` is as tall as each room. Ticks or numbers on it would read as a level axis.

**Q3. The pooled false alarm line and "no overall number".** The brief asks both for "the false alarm rate in words ('You answered 2 of 9 times when I made no sound')" above the picture and that floors are never summed and there is no overall number. Nine no-sound trials are more than one room has (about 7), so the brief's example pools the rooms, as the visit summary does. This design reads "no overall number" as no number about hearing made from several floors; the pooled false alarm count is about answers to silence and is what the visit-level rule judges (D17). Options: (a) the pooled line, as designed; (b) one line per floor beside it instead, from each room summary's own counts, which the model could add without removing anything; (c) both. Cost of (b) and (c): more text beside each floor on a phone, and per-floor counts of 0 to 13 say little on their own.

**Q4. How many saved visits, and what happens at the limit.** Proposed: `savedVisitsMaxCount` 20, and a save beyond it is refused with a line asking the visitor to delete one (D12). Estimated size: up to about 80 KB per full visit, so 20 take up to about 1.6 MB of the origin's 5 MiB, which a `github.io` origin shares with the owner's other project pages ("Sizes"; task 10 measures it). Options: 10 (about 0.8 MB at most; a weekly visitor fills it in ten weeks), 20, or 50 (about 4 MB at most, close to the quota, so `full` becomes likely first). Instead of refusing: delete the oldest automatically. Cost: a visit the visitor kept as the one to compare against may disappear without a word.

**Q5. How long a headphone name may be.** Proposed: `headphoneNameMaxCharacterCount` 40 code points after tidying (D11). Options: 24 (fits one line on a 360 px phone at the page's text size, but cuts model names such as "Sony WH-1000XM5 left cup repaired"), 40, or 80 (any name, but long names wrap in the list and in the image). The page can set the name field's input limit from the same value.

**Q6. Saving by the visitor's press or by itself.** Proposed: the visit is saved only when the visitor presses "Save this visit in this browser" (D10). Options: (a) by press, as designed: nothing is kept unless asked, which matches the front door's "Nothing you do here leaves this browser" and a visitor on a shared computer; the cost is that a visitor who leaves without pressing has nothing to compare against next time, and the page says so (`notSavedLine`). (b) Saved on reaching the result, with the name added afterwards (`save` again changes the name). Cost: a visit is kept without the visitor asking, which the page must say at once, and a shared computer keeps every visit until someone deletes it. (c) Ask once, on reaching the result. Cost: one more step on the most important screen.

**Q7. The run counts and the time budget of this spec's properties.** Proposed: the run counts of "Run counts and time" and a budget of 30 seconds for this spec's property files together on the project machine. These are test settings, not product numbers, so they are not in `src/config`. If the files take longer, the task stops and reports the times; it does not lower a count.

## Decisions

Each point below was open in the brief, the steering, the visit-flow spec or the code, and is settled here without being able to ask, except where a question above leaves it to the owner.

**D1. The contract is one file of types, and it only grows.** The page is built by hand while the rest is written, so it needs something fixed to build against: one file with every type the page may call or read, written first and with no behaviour, as visit-flow D1 does for the flow. It imports only from `src/config` and the visit flow's contract, which both exist before task 1. So that it needs nothing that does not exist yet, it defines its own `WallClock` and `StorageArea`; `createSystemWallClock` and `src/storage`'s `StorageArea` are written later to fit them, and type tests check that they do, as `ear-types-match.test.ts` checks the two `Ear` types. Later changes add fields, types and methods; they never remove or rename.

**D2. The visit flow's contract does not grow.** The result stage already gives the log and the summary, the summary already says which floor offers the swapped repeat, and `chooseSwappedRepeat(roomIndex)` already opens it. Saving needs nothing from the flow but those, and the archive is a separate object (D3). So nothing is added to `visit-flow-types.ts`. Should a later task find otherwise, the addition is written in this design first and only adds, as visit-flow D1 requires.

**D3. Saved visits are a session object of their own, not part of the flow.** `src/ui` may not import `src/storage`, so the page needs `src/session` to reach it. Putting save and list into the visit flow would tie them to the result stage, but the front door may want to list or delete visits, the no-headphone replay may want to export one, and a saved visit's picture is drawn with no flow at all. So `createVisitArchive` is created once for the page beside `createVisitFlow`, and `resultPicture` is a pure function of either a live result or a saved visit.

**D4. Storage keeps an envelope and an opaque payload.** `src/storage` may import only `config`. It cannot import the visit log's types, and copying them into `config` would make two sources of one format. So storage checks only what it owns (id, times, date, visit type, name, checksum) and keeps the payload as text. The session writes and checks the payload, because the session owns the visit log and the summary.

**D5. One key, one value, read just before every write, one write per change.** A single value under a single key makes every change one `setItem`, which either replaces the whole value or leaves it as it was. Reading again just before writing means two tabs only overwrite each other when they save within the same moment; that window is accepted rather than adding a lock that local storage does not offer. The archive keeps no copy of the list between calls, so it never acts on a stale one.

**D6. Every entry carries a checksum, and a changed entry is kept and not shown.** The brief asks that broken storage show no wrong picture. Shape checks alone cannot see a changed threshold that still has the right type. A 32-bit FNV-1a hash over all of an entry's fields makes almost every accidental change visible. An entry that does not check is kept as it was, counted, and removed only by "delete all", so nothing the visitor saved is thrown away without the visitor asking. The hash is not a protection against a deliberate edit, and the design does not call it one.

**D7. A value that cannot be read as a whole is never overwritten by a save.** Writing a new value over it would delete whatever it held, which might be readable by a later version of the page or by hand. So the archive lists nothing, refuses saves and single deletes with a line that says why, and "delete all" is the one way out. A value of another format version under this key is treated the same way; a later format that this code cannot read uses a new key (`…:v2`), which this code never touches.

**D8. Storage failures have three names.** `unavailable` (no local storage, or it cannot be read), `full` (the quota) and `refused` (any other write error, such as a security setting). The visitor can act on `full` by deleting a visit, and on the others only by using another browser, so the lines differ. Browsers name the quota error differently, so `storageErrorKind` accepts the names and codes Chrome, Safari and Firefox use and calls everything else `refused`.

**D9. A saved visit is the log unchanged, the summary as shown, and the settings it was drawn with.** The log is the one record (architecture, visit flow). The summary is kept and not computed again, so that a later change of the summary code or of the visit limit (visit-flow Q1) cannot change an old picture or make it unreadable. `floorDb` and the swapped-repeat difference are kept because the depth and the payload checks depend on them. The payload checks are the summary's own invariants and a light check of the log; checking a log against the engine is the no-headphone replay spec's.

**D10. A visit is saved when the visitor presses save.** The front door promises that nothing leaves the browser, and keeping a record of someone's listening without asking sits badly with that on a shared computer. The brief says the visit "is saved", not when. The page says that an unsaved visit is not kept. Q6 gives the other options.

**D11. The headphone name is the visitor's own text and never part of a sentence.** It is tidied (NFC, one space for any run of white space or control characters, trimmed) and kept in the visitor's letter case; two names match ignoring letter case. An empty name is no name and never matches, because unnamed headphones may be different headphones. The name never goes into a string the copy builds, so a name made of banned words cannot put one into the house's voice, and CP1 can check every sentence the house says. The page shows it in an element of its own after `headphonesLabel`. Its length limit is proposed (Q5).

**D12. At the limit of saved visits, a save is refused rather than the oldest deleted.** Deleting without asking could remove the visit the visitor keeps for comparison. The limit is proposed (Q4).

**D13. Robot mode neither writes nor reads local storage.** Visit-flow D15 says robot mode saves nothing. Reading would also put the owner's own saved visits, and their outlines, on the robot's screenshots. So in robot mode the archive never calls the storage function, and every save and delete gives a plain line. The robot spec decides how the page knows it is in robot mode.

**D14. Ids come from the injected seed, dates from the injected wall clock, and order from the order of saving.** `src/session` may not read a clock or `Math.random`. The wall clock lives in `src/config`, where `system-timer.ts` already reads the clock. The order of saving is the array's order, not the wall time, so a clock set back cannot make a new visit look earlier, and `savedAtEpochMs` is kept but shown nowhere.

**D15. The depth of light is a place on the floor's own range.** The brief: deeper light means a quieter sound was caught. Of the ways to turn a threshold into a depth, this one uses the floor's own loudest playable level as the shallow end, so that "dark" means the floor's own loudest was not caught and the light is honest on that floor, and holds 0.1 at each end so that the four states can always be told apart. The numbers are proposed (Q1).

**D16. The model keeps floors apart; the drawing is the owner's; the remaining conflict is a question.** The model has no field across floors except the false alarm counts, computes each floor alone (CP4), orders floors by the house, and its text never compares floors (CP2). What a drawing of five stacked depths suggests cannot be settled in data, so it is Q2, with options.

**D17. The pooled false alarm line is about answers to silence.** It counts the no-sound trials and false alarms of every finished room, as the visit summary does, because that is what the visit-level rule judges (visit-flow D17) and what the brief's example counts. It says nothing about any floor's level. Q3 asks whether the owner reads "no overall number" the same way.

**D18. An unreliable wing has one line and one reason.** The brief asks for a line saying the room should be visited again. The reason line gives the first of the ear's reasons, which is the search's own when it has one, because that is what went wrong in this room. When the whole visit is marked, the notice above the picture says why, and every wing's reason line says the same in short.

**D19. The difference is told by side, not by ear.** "15 dB quieter on the left" names where the quieter sound was caught. Saying that the left ear hears better would claim what only the swapped repeat can tell, and could be wrong when the headphones differ. A dash stands where either wing has no number, as the brief says; whole decibels, as every other level line.

**D20. Only the live result offers the swapped repeat.** The repeat runs in the visit flow with the visit's calibration (brief 08: "Calibration is not repeated"), so a saved visit, whose calibration is gone, cannot offer it. Its floors still show their difference.

**D21. The session builds every line of the model through the copy.** The page then has nothing to word, and CP1 and CP2 can check the whole of what the page shows from the model alone. The copy defines its own names for states and reasons, because it may import only `config`, and type tests check that they equal the session's.

**D22. Visit types are named by their number of rooms.** "Short visit, 3 rooms" and "Long visit, 5 rooms" stay true whatever the owner decides about the 3 and 7 minutes (visit-flow Q3) and if the roadmap's third cut gives the long visit three rooms.

**D23. The exemption names one export and two terms.** `wording.md` exempts the limits statement's sentences from the check and allows "diagnosis" and "clinical" in the negative. The check is told one file, one export and the two terms from `src/config`; every other banned term is still checked there, and the two terms anywhere else are still reported. The test of the statement checks the negative.

**D24. The hook runs the copy check in hook mode on every save under `src/copy/`.** It has the render hook's form. Findings go to standard error with exit code 1, as the render tool does, which is how Kiro gives them to the agent. It checks exported strings only; the output of functions is checked by `npm test` (the copy test and CP1), which takes longer than a check on every save should. It does not watch `banned-terms.ts`, because the brief names `src/copy/`. That its findings reach the agent in a headless CLI session has not been seen (`docs/experiments/hook-catches.md`), and nothing here claims it. Showing the hook catch a bad change is not a task here: it needs a session started after the hook exists, as the ghost-sounds spec found.

**D25. The earlier visit is the latest one saved before with the same name, drawn on the shown floor's scale.** `wording.md` allows comparing this visit with the visitor's own later visits with the same headphones; the name is the only sign of "the same headphones" the page has. The outline uses the shown floor's scale so that light and outline in one wing answer one question. Floors match by room, so a short visit can be compared with a long one on the rooms they share. No sentence says that a floor got better or worse, because each visit is relative to its own calibration and whether the anchor repeats is open (architecture, open question 3).

**D26. The archive can export a saved visit's log.** Brief 09 takes its recorded visit from "the storage module's export". The archive gives the stored log as JSON text; the page need not show a control for it, and the replay spec decides how the owner gets the file.

**D27. The page says that a browser can clear saved visits.** Browsers may delete local storage on their own; Safari does so for script-written data of a site the visitor has not touched in seven days of browser use when tracking prevention is on (MDN, see Sources). A visitor who returns after a month may find nothing to compare against. `mayBeClearedLine` says so plainly whenever a visit is listed. Asking the browser for persistent storage would need the Storage API beyond local storage and, in Firefox, a prompt; it is not done.

**D28. Every property is universal, with stated run counts and a time budget.** Nothing here is statistical, so no seed is fixed. If the files exceed the budget, the task stops and reports the times; no count is lowered (Q7).

**D29. What the tasks touch, and how they are committed.** The tasks create and change only the files listed in "Files", never `src/ui/`, `tests/e2e/`, `tests/properties/screen-leak/`, `index.html`, `listen.html`, `src/main.ts`, the root `README.md` or `.kiro/steering/`. They do not commit. A separate run makes one commit per task with a one-line message, so anything a task must record (measured sizes, property times, a counterexample) is written in this design or a README, never in a commit message body.

**D30. Dates are local calendar dates, written in English by the copy.** The visitor's "20 November" is the date where the visitor is. The wall clock writes it as `YYYY-MM-DD` once, at saving; the copy turns it into words without `Date` or the browser's language, so the tests give the same text on every machine and the interface stays in English (`product.md`).
