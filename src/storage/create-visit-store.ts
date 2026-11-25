import type { VisitType } from "../config/hearing-method-config";
import { entryChecksum } from "./entry-checksum";
import { savedVisitsFormatVersion, savedVisitsKey } from "./saved-visits-key";
import type { StorageArea } from "./storage-area";
import { storageErrorKind } from "./storage-error-kind";
import type {
  StoreEntryFields,
  StoreRead,
  StoreRefusal,
  StoreWrite,
  VisitStore,
} from "./visit-store-types";

/** A JSON object as `JSON.parse` gives it. */
type JsonObject = Record<string, unknown>;

/** A stored value that can be read as a whole: format version 1 and a list of entries. */
type StoredValue = JsonObject & { readonly visits: readonly unknown[] };

/** A readable entry and its place in the value's list. */
interface ReadableEntry {
  readonly position: number;
  readonly fields: StoreEntryFields;
}

/** What local storage holds under the key at the moment of one call. */
type Loaded =
  | { readonly status: "unavailable" }
  | { readonly status: "unreadable" }
  | { readonly status: "empty"; readonly area: StorageArea }
  | {
      readonly status: "value";
      readonly area: StorageArea;
      readonly value: StoredValue;
      readonly readable: readonly ReadableEntry[];
    };

/** The fields of the value the store knows. Every other field is kept as it was. */
const knownValueFields: readonly string[] = Object.freeze([
  "formatVersion",
  "visits",
]);

const visitTypeNames: Readonly<Record<VisitType, true>> = Object.freeze({
  full: true,
});

const savedVisitIdPattern = /^[0-9a-f]{8}$/;
const localDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

const unavailable: Loaded = Object.freeze({ status: "unavailable" });
const done: StoreWrite = Object.freeze({ ok: true });

function refusal(reason: StoreRefusal): StoreWrite {
  return Object.freeze({ ok: false, reason });
}

function isJsonObject(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Whether a text is "YYYY-MM-DD" and a real date of the Gregorian calendar. */
function isCalendarDate(text: string): boolean {
  const match = localDatePattern.exec(text);
  if (match === null) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const monthLengths = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  const monthLength = monthLengths[month - 1];
  return monthLength !== undefined && day >= 1 && day <= monthLength;
}

/**
 * The fields of a stored entry when every rule of "What storage checks" holds, otherwise null.
 * `usedIds` holds the ids of the earlier readable entries.
 */
function readableFields(
  entry: unknown,
  usedIds: ReadonlySet<string>,
): StoreEntryFields | null {
  if (!isJsonObject(entry)) {
    return null;
  }
  const {
    savedVisitId,
    savedAtEpochMs,
    savedOnLocalDate,
    visitType,
    headphoneName,
    payloadJson,
    checksum,
  } = entry;
  if (
    typeof savedVisitId !== "string" ||
    !savedVisitIdPattern.test(savedVisitId) ||
    usedIds.has(savedVisitId) ||
    typeof savedAtEpochMs !== "number" ||
    !Number.isFinite(savedAtEpochMs) ||
    savedAtEpochMs < 0 ||
    typeof savedOnLocalDate !== "string" ||
    !isCalendarDate(savedOnLocalDate) ||
    typeof visitType !== "string" ||
    !Object.hasOwn(visitTypeNames, visitType) ||
    (headphoneName !== null && typeof headphoneName !== "string") ||
    typeof payloadJson !== "string" ||
    typeof checksum !== "string"
  ) {
    return null;
  }
  const fields: StoreEntryFields = Object.freeze({
    savedVisitId,
    savedAtEpochMs,
    savedOnLocalDate,
    visitType: visitType as VisitType,
    headphoneName,
    payloadJson,
  });
  return entryChecksum(fields) === checksum ? fields : null;
}

/** A stored entry: the fields in their stored order, then the checksum. */
function storedEntry(fields: StoreEntryFields): JsonObject {
  return {
    savedVisitId: fields.savedVisitId,
    savedAtEpochMs: fields.savedAtEpochMs,
    savedOnLocalDate: fields.savedOnLocalDate,
    visitType: fields.visitType,
    headphoneName: fields.headphoneName,
    payloadJson: fields.payloadJson,
    checksum: entryChecksum(fields),
  };
}

/** Reads what local storage holds under the key now. Never throws. */
function load(getArea: () => StorageArea | null | undefined): Loaded {
  let area: StorageArea | null | undefined;
  let text: string | null;
  try {
    area = getArea();
    if (area === null || area === undefined) {
      return unavailable;
    }
    text = area.getItem(savedVisitsKey);
  } catch {
    return unavailable;
  }
  if (text === null || text === undefined) {
    return { status: "empty", area };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { status: "unreadable" };
  }
  if (
    !isJsonObject(value) ||
    value.formatVersion !== savedVisitsFormatVersion ||
    !Array.isArray(value.visits)
  ) {
    return { status: "unreadable" };
  }
  const usedIds = new Set<string>();
  const readable: ReadableEntry[] = [];
  value.visits.forEach((entry: unknown, position: number) => {
    const fields = readableFields(entry, usedIds);
    if (fields !== null) {
      usedIds.add(fields.savedVisitId);
      readable.push({ position, fields });
    }
  });
  return {
    status: "value",
    area,
    value: value as StoredValue,
    readable,
  };
}

/** Writes the whole value with one `setItem`. */
function writeValue(area: StorageArea, value: JsonObject): StoreWrite {
  try {
    area.setItem(savedVisitsKey, JSON.stringify(value));
    return done;
  } catch (error) {
    return refusal(storageErrorKind(error));
  }
}

/** Removes the key with one `removeItem`. */
function removeKey(area: StorageArea): StoreWrite {
  try {
    area.removeItem(savedVisitsKey);
    return done;
  } catch {
    return refusal("refused");
  }
}

/** Whether the value has a field the store does not know. */
function hasUnknownField(value: JsonObject): boolean {
  return Object.keys(value).some((key) => !knownValueFields.includes(key));
}

/**
 * The saved visits of this browser under the one key `savedVisitsKey` (result-page design.md,
 * "The Visit_Store"). It keeps one value: the format version and the list of entries in save
 * order, each with a checksum over its fields. It reads the value again at every call and writes
 * the whole new value with one `setItem`, keeping every other entry, readable or not, and every
 * field it does not know as the same JSON value (D5, D6, D7). It calls `getArea` inside a `try` at
 * every method, reads and writes no other key, keeps nothing between calls, and never throws
 * because of anything local storage does or holds.
 */
export function createVisitStore(
  getArea: () => StorageArea | null | undefined,
): VisitStore {
  /** Runs a write on the value as it is now, or gives the reason it cannot. */
  function change(
    act: (loaded: Extract<Loaded, { status: "empty" | "value" }>) => StoreWrite,
  ): StoreWrite {
    const loaded = load(getArea);
    switch (loaded.status) {
      case "unavailable":
        return refusal("unavailable");
      case "unreadable":
        return refusal("unreadable");
      default:
        return act(loaded);
    }
  }

  /** The readable entry with this id, or undefined. */
  function findReadable(
    loaded: Extract<Loaded, { status: "empty" | "value" }>,
    savedVisitId: string,
  ): ReadableEntry | undefined {
    return loaded.status === "value"
      ? loaded.readable.find(
          (entry) => entry.fields.savedVisitId === savedVisitId,
        )
      : undefined;
  }

  return Object.freeze({
    read(): StoreRead {
      const loaded = load(getArea);
      switch (loaded.status) {
        case "unavailable":
          return Object.freeze({ status: "unavailable" });
        case "unreadable":
          return Object.freeze({ status: "unreadable" });
        case "empty":
          return Object.freeze({
            status: "ready",
            entries: Object.freeze([]),
            unreadableCount: 0,
          });
        case "value":
          return Object.freeze({
            status: "ready",
            entries: Object.freeze(
              loaded.readable.map((entry) => entry.fields),
            ),
            unreadableCount:
              loaded.value.visits.length - loaded.readable.length,
          });
      }
    },

    append(fields: StoreEntryFields): StoreWrite {
      const entry = storedEntry(fields);
      if (readableFields(entry, new Set()) === null) {
        // The caller's own fields break a rule of the stored format: a bug, not a storage failure.
        throw new RangeError(
          `An entry to save must meet every rule of the stored format, but got ${JSON.stringify(entry)}.`,
        );
      }
      return change((loaded) => {
        if (loaded.status === "empty") {
          return writeValue(loaded.area, {
            formatVersion: savedVisitsFormatVersion,
            visits: [entry],
          });
        }
        const idTaken = loaded.value.visits.some(
          (stored) =>
            isJsonObject(stored) && stored.savedVisitId === fields.savedVisitId,
        );
        if (idTaken) {
          return refusal("idTaken");
        }
        return writeValue(loaded.area, {
          ...loaded.value,
          visits: [...loaded.value.visits, entry],
        });
      });
    },

    changeName(savedVisitId: string, headphoneName: string | null): StoreWrite {
      return change((loaded) => {
        const found = findReadable(loaded, savedVisitId);
        if (found === undefined || loaded.status !== "value") {
          return refusal("notFound");
        }
        const fields: StoreEntryFields = { ...found.fields, headphoneName };
        const changed = {
          ...(loaded.value.visits[found.position] as JsonObject),
          headphoneName,
          checksum: entryChecksum(fields),
        };
        return writeValue(loaded.area, {
          ...loaded.value,
          visits: loaded.value.visits.map((stored, position) =>
            position === found.position ? changed : stored,
          ),
        });
      });
    },

    changePayload(savedVisitId: string, payloadJson: string): StoreWrite {
      // As changeName, for the payload (swapped-repeat Q5, decided by the owner on 2026-11-15): the
      // entry keeps its id, its dates, its visit type, its name, its place and every field the
      // store does not know; every other entry is kept as read.
      return change((loaded) => {
        const found = findReadable(loaded, savedVisitId);
        if (found === undefined || loaded.status !== "value") {
          return refusal("notFound");
        }
        const fields: StoreEntryFields = { ...found.fields, payloadJson };
        const changed = {
          ...(loaded.value.visits[found.position] as JsonObject),
          payloadJson,
          checksum: entryChecksum(fields),
        };
        return writeValue(loaded.area, {
          ...loaded.value,
          visits: loaded.value.visits.map((stored, position) =>
            position === found.position ? changed : stored,
          ),
        });
      });
    },

    remove(savedVisitId: string): StoreWrite {
      return change((loaded) => {
        const found = findReadable(loaded, savedVisitId);
        if (found === undefined || loaded.status !== "value") {
          return refusal("notFound");
        }
        const visits = loaded.value.visits.filter(
          (_stored, position) => position !== found.position,
        );
        if (visits.length === 0 && !hasUnknownField(loaded.value)) {
          return removeKey(loaded.area);
        }
        return writeValue(loaded.area, { ...loaded.value, visits });
      });
    },

    removeAll(): StoreWrite {
      let area: StorageArea | null | undefined;
      let text: string | null;
      try {
        area = getArea();
        if (area === null || area === undefined) {
          return refusal("unavailable");
        }
        text = area.getItem(savedVisitsKey);
      } catch {
        return refusal("unavailable");
      }
      if (text === null || text === undefined) {
        return done;
      }
      return removeKey(area);
    },
  });
}
