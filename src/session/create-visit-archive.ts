import { resultPageConfig } from "../config/result-page-config";
import { createSeededRandom } from "../config/seeded-random";
import { resultPageCopy } from "../copy/result-page-copy";
import {
  deleteRefusedLine,
  deleteVisitLabel,
  saveRefusedLine,
  unreadableEntriesLine,
  visitDateLabel,
  visitTypeLabel,
} from "../copy/saved-visit-lines";
import { createVisitStore } from "../storage/create-visit-store";
import type {
  StoreEntryFields,
  StoreRefusal,
  VisitStore,
} from "../storage/visit-store-types";
import { canonicalHeadphoneName } from "./canonical-headphone-name";
import type {
  ArchiveState,
  DeleteOutcome,
  DeleteRefusal,
  LocalDate,
  SavedVisit,
  SavedVisitList,
  SavedVisitListing,
  SaveOutcome,
  SaveRefusal,
  SwappedRepeatRun,
  VisitArchive,
  VisitArchiveOptions,
  VisitLog,
  VisitToSave,
} from "./result-page-types";
import type { SavedVisitPayload } from "./saved-visit-payload";
import {
  parseSavedVisitPayload,
  savedVisitPayloadJson,
} from "./saved-visit-payload";

/** A saved visit's swapped repeats until task 13 of the swapped-repeat spec reads them from the payload. */
const noSwappedRepeats: readonly SwappedRepeatRun[] = Object.freeze([]);

/** Saved visit ids are eight hexadecimal digits: a whole number below 2³². A format, not a tunable number. */
const savedVisitIdRange = 0x100000000;
const savedVisitIdDigitCount = 8;

/** What local storage holds now, as the archive reads it, before labels are added. */
type ArchiveRead =
  | {
      readonly state: "ready";
      /** The readable saved visits in save order, oldest first. */
      readonly visits: readonly SavedVisit[];
      readonly unreadableCount: number;
    }
  | { readonly state: "unavailable" | "unreadable" | "off" };

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}

/** A saved visit from its envelope fields and its payload, frozen. The payload is frozen already. */
function savedVisitOf(
  fields: StoreEntryFields,
  payload: SavedVisitPayload,
): SavedVisit {
  return Object.freeze({
    savedVisitId: fields.savedVisitId,
    savedAtEpochMs: fields.savedAtEpochMs,
    savedOnLocalDate: fields.savedOnLocalDate,
    visitType: fields.visitType,
    headphoneName: fields.headphoneName,
    summary: payload.summary,
    visitLog: payload.visitLog,
    floorDb: payload.floorDb,
    swappedRepeatDifferenceDb: payload.swappedRepeatDifferenceDb,
    swappedRepeats: noSwappedRepeats,
  });
}

function listingOf(visit: SavedVisit): SavedVisitListing {
  const roomCount = visit.summary.rooms.length;
  return Object.freeze({
    visit,
    dateLabel: visitDateLabel(visit.savedOnLocalDate),
    visitTypeLabel: visitTypeLabel(visit.visitType, roomCount),
    deleteLabel: deleteVisitLabel(
      visit.savedOnLocalDate,
      visit.visitType,
      roomCount,
    ),
  });
}

function codePointCount(text: string): number {
  return Array.from(text).length;
}

function saveRefused(reason: SaveRefusal): SaveOutcome {
  return Object.freeze({
    saved: false,
    reason,
    line: saveRefusedLine(reason),
  });
}

function deleteRefused(reason: DeleteRefusal): DeleteOutcome {
  return Object.freeze({
    deleted: false,
    reason,
    line: deleteRefusedLine(reason),
  });
}

/**
 * A store refusal as a save refusal. `notFound` and `idTaken` do not reach here: the archive
 * draws a new id for `idTaken`, and adds a new entry when a visit to rename has gone.
 */
function saveRefusalOf(reason: StoreRefusal): SaveRefusal {
  switch (reason) {
    case "unavailable":
    case "unreadable":
    case "refused":
    case "full":
      return reason;
    default:
      return "refused";
  }
}

/**
 * A store refusal as a delete refusal. A full quota on a delete, which only a browser could
 * report while the value shrinks, is told as `refused`.
 */
function deleteRefusalOf(reason: StoreRefusal): DeleteRefusal {
  switch (reason) {
    case "unavailable":
    case "unreadable":
    case "refused":
    case "notFound":
      return reason;
    default:
      return "refused";
  }
}

/**
 * The saved visits of this browser (result-page design.md, "The archive", D3). It is created once
 * for the page and is independent of the visit flow. It touches local storage only inside its
 * methods, only through `options.localStorage`, called again inside a `try` at each method by the
 * store, and keeps no list between calls (D5): `list` reads local storage at that moment. Saved
 * visit ids come from the seed, dates from the injected wall clock, and the order of the list is
 * the order of saving (D14). A visit is saved only when `save` is called (D10). In robot mode it
 * never calls `options.localStorage`, lists nothing and refuses every save and delete (D13). No
 * method throws because of anything local storage does or holds. Throws a `RangeError` for a seed
 * that is not a whole number from 0 to 2³² − 1.
 */
export function createVisitArchive(options: VisitArchiveOptions): VisitArchive {
  const random = createSeededRandom(options.seed);
  const { wallClock, mode } = options;
  const store: VisitStore | null =
    mode === "robot" ? null : createVisitStore(() => options.localStorage());
  /** The id each visit log was saved under on this page. */
  const savedIds = new WeakMap<VisitLog, string>();

  function read(): ArchiveRead {
    if (store === null) {
      return { state: "off" };
    }
    const stored = store.read();
    if (stored.status !== "ready") {
      return { state: stored.status };
    }
    const visits: SavedVisit[] = [];
    let unreadableCount = stored.unreadableCount;
    for (const fields of stored.entries) {
      const payload = parseSavedVisitPayload(
        fields.payloadJson,
        fields.visitType,
      );
      if (payload === null) {
        unreadableCount += 1;
      } else {
        visits.push(savedVisitOf(fields, payload));
      }
    }
    return { state: "ready", visits, unreadableCount };
  }

  function emptyList(state: ArchiveState, line: string): SavedVisitList {
    return deepFreeze({
      state,
      visits: [],
      unreadableCount: 0,
      canSave: false,
      canDeleteAll: state === "unreadable",
      lines: [line],
    });
  }

  function listOf(current: ArchiveRead): SavedVisitList {
    switch (current.state) {
      case "off":
        return emptyList("off", resultPageCopy.robotModeLine);
      case "unavailable":
        return emptyList("unavailable", resultPageCopy.unavailableListLine);
      case "unreadable":
        return emptyList("unreadable", resultPageCopy.unreadableListLine);
      case "ready":
        break;
    }
    const { visits, unreadableCount } = current;
    const canSave = visits.length < resultPageConfig.savedVisitsMaxCount;
    const lines: string[] = [];
    if (visits.length === 0 && unreadableCount === 0) {
      lines.push(resultPageCopy.noSavedVisitsLine);
    }
    if (unreadableCount > 0) {
      lines.push(unreadableEntriesLine(unreadableCount));
    }
    if (!canSave) {
      lines.push(saveRefusedLine("tooMany"));
    }
    if (visits.length > 0) {
      lines.push(resultPageCopy.mayBeClearedLine);
    }
    return deepFreeze({
      state: "ready",
      visits: [...visits].reverse().map(listingOf),
      unreadableCount,
      canSave,
      canDeleteAll: visits.length + unreadableCount > 0,
      lines,
    });
  }

  function listedVisit(savedVisitId: string): SavedVisit | undefined {
    const current = read();
    return current.state === "ready"
      ? current.visits.find((visit) => visit.savedVisitId === savedVisitId)
      : undefined;
  }

  function drawSavedVisitId(): string {
    return Math.floor(random.next() * savedVisitIdRange)
      .toString(16)
      .padStart(savedVisitIdDigitCount, "0");
  }

  /** Changes the name of a visit saved before on this page, or gives null when it is no longer listed. */
  function rename(
    savedVisitId: string,
    headphoneName: string | null,
    activeStore: VisitStore,
  ): SaveOutcome | null {
    const current = read();
    if (current.state !== "ready") {
      return null;
    }
    const listed = current.visits.find(
      (visit) => visit.savedVisitId === savedVisitId,
    );
    if (listed === undefined) {
      return null;
    }
    if (listed.headphoneName === headphoneName) {
      return Object.freeze({
        saved: true,
        savedVisit: listed,
        renamed: false,
        line: resultPageCopy.savedLine,
      });
    }
    const written = activeStore.changeName(savedVisitId, headphoneName);
    if (!written.ok) {
      return written.reason === "notFound"
        ? null
        : saveRefused(saveRefusalOf(written.reason));
    }
    return Object.freeze({
      saved: true,
      savedVisit: Object.freeze({ ...listed, headphoneName }),
      renamed: true,
      line: resultPageCopy.renamedLine,
    });
  }

  return Object.freeze({
    mode,

    today(): LocalDate {
      return wallClock.now().localDate;
    },

    list(): SavedVisitList {
      return listOf(read());
    },

    save(visit: VisitToSave, typedHeadphoneName: string): SaveOutcome {
      if (store === null) {
        return saveRefused("robotMode");
      }
      const headphoneName = canonicalHeadphoneName(typedHeadphoneName);
      if (
        headphoneName !== null &&
        codePointCount(headphoneName) >
          resultPageConfig.headphoneNameMaxCharacterCount
      ) {
        return saveRefused("nameTooLong");
      }

      const savedBefore = savedIds.get(visit.visitLog);
      if (savedBefore !== undefined) {
        const renamed = rename(savedBefore, headphoneName, store);
        if (renamed !== null) {
          return renamed;
        }
      }

      const payloadJson = savedVisitPayloadJson(visit);
      const visitType = visit.visitLog.visitType;
      const payload = parseSavedVisitPayload(payloadJson, visitType);
      if (payload === null) {
        // The visit given breaks a rule of a saved visit, so it would never be listed: a bug of
        // the caller, not a failure of storage.
        throw new RangeError(
          "A visit to save must have a visit log and a summary that meet every rule of a saved visit.",
        );
      }

      const current = listOf(read());
      if (current.state === "unavailable" || current.state === "unreadable") {
        return saveRefused(current.state);
      }
      if (!current.canSave) {
        return saveRefused("tooMany");
      }

      const time = wallClock.now();
      for (;;) {
        const fields: StoreEntryFields = {
          savedVisitId: drawSavedVisitId(),
          savedAtEpochMs: time.epochMs,
          savedOnLocalDate: time.localDate,
          visitType,
          headphoneName,
          payloadJson,
        };
        const written = store.append(fields);
        if (written.ok) {
          savedIds.set(visit.visitLog, fields.savedVisitId);
          return Object.freeze({
            saved: true,
            savedVisit: savedVisitOf(fields, payload),
            renamed: false,
            line: resultPageCopy.savedLine,
          });
        }
        if (written.reason !== "idTaken") {
          return saveRefused(saveRefusalOf(written.reason));
        }
      }
    },

    // No saved copy holds a swapped repeat yet, so none lacks one. Task 15 of the swapped-repeat
    // spec builds the answer (swapped-repeat R1.6, R13.9).
    savedCopyLacksRepeats(): boolean {
      return false;
    },

    deleteVisit(savedVisitId: string): DeleteOutcome {
      if (store === null) {
        return deleteRefused("robotMode");
      }
      const current = read();
      if (current.state === "unavailable" || current.state === "unreadable") {
        return deleteRefused(current.state);
      }
      if (
        current.state !== "ready" ||
        !current.visits.some((visit) => visit.savedVisitId === savedVisitId)
      ) {
        return deleteRefused("notFound");
      }
      const written = store.remove(savedVisitId);
      if (!written.ok) {
        return deleteRefused(deleteRefusalOf(written.reason));
      }
      return Object.freeze({
        deleted: true,
        deletedCount: 1,
        line: resultPageCopy.deletedLine,
      });
    },

    deleteAll(): DeleteOutcome {
      if (store === null) {
        return deleteRefused("robotMode");
      }
      const current = read();
      const listedCount = current.state === "ready" ? current.visits.length : 0;
      const written = store.removeAll();
      if (!written.ok) {
        return deleteRefused(deleteRefusalOf(written.reason));
      }
      return Object.freeze({
        deleted: true,
        deletedCount: listedCount,
        line: resultPageCopy.allDeletedLine,
      });
    },

    exportVisitLog(savedVisitId: string): string | null {
      if (store === null) {
        return null;
      }
      const listed = listedVisit(savedVisitId);
      return listed === undefined ? null : JSON.stringify(listed.visitLog);
    },
  });
}
