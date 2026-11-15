import { describe, expect, it, vi } from "vitest";
import { hearingMethodConfig } from "../config/hearing-method-config";
import { resultPageConfig } from "../config/result-page-config";
import { resultPageCopy } from "../copy/result-page-copy";
import {
  deleteRefusedLine,
  saveRefusedLine,
  unreadableEntriesLine,
} from "../copy/saved-visit-lines";
import { entryChecksum } from "../storage/entry-checksum";
import type { FakeStorageAreaOptions } from "../storage/fake-storage-area";
import { createFakeStorageArea } from "../storage/fake-storage-area";
import { savedVisitsKey } from "../storage/saved-visits-key";
import type { StorageArea } from "../storage/storage-area";
import { createVisitArchive } from "./create-visit-archive";
import type {
  SavedVisit,
  SaveOutcome,
  VisitToSave,
  WallTime,
} from "./result-page-types";
import { summarizeVisit } from "./summarize-visit";
import type { LoggedEarResult, VisitLog } from "./visit-flow-types";
import { visitRooms } from "./visit-rooms";

// Archives on fake storage areas, with a wall clock written here. Visits are made with
// summarizeVisit from hand-built logs; `variant` makes each log a distinct visit.

const counts = {
  presentationCount: 12,
  catchCount: 6,
  wrongSideCount: 1,
  missCount: 5,
};

function found(thresholdDb: number): LoggedEarResult {
  return { ...counts, state: "found", thresholdDb };
}

function visitOf(
  visitType: "quick" | "full" = "quick",
  variant = 0,
): VisitToSave {
  const rooms = visitRooms(visitType);
  const visitLog: VisitLog = {
    formatVersion: 1,
    visitType,
    visitSeed: 42 + variant,
    rooms,
    calibrations: [],
    headphoneChecks: [],
    roomAttempts: rooms.map((room) => ({
      roomIndex: room.roomIndex,
      attempt: 1,
      engineSeed: 1000 + room.roomIndex,
      calibrationIndex: 0,
      searchCapDb: 15,
      startedAtMs: 100000 * room.roomIndex,
      endedAtMs: 100000 * room.roomIndex + 90000,
      ending: "finished" as const,
      result: {
        left: found(-40 + 5 * room.roomIndex),
        right:
          room.roomIndex === 1
            ? { ...counts, state: "betterThanFloor" as const }
            : found(-20),
        noSoundTrialCount: 7,
        falseAlarmCount: room.roomIndex === 0 ? 1 : 0,
        falseAlarmRateFraction: room.roomIndex === 0 ? 1 / 7 : 0,
        falseAlarmRateAboveLimit: false,
      },
    })),
    trials: [],
    ignoredAnswers: [],
    pauses: [],
    refusedPlays: [],
  };
  return { visitLog, summary: summarizeVisit(visitLog) };
}

function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/** A wall clock the test moves by hand. */
function handClock(
  start: WallTime = { epochMs: 1795180800000, localDate: "2026-11-20" },
) {
  let time = start;
  const now = vi.fn(() => time);
  return {
    clock: { now },
    set(next: WallTime) {
      time = next;
    },
  };
}

function setUp(
  options: FakeStorageAreaOptions = {},
  seed = 7,
  mode: "keep" | "robot" = "keep",
) {
  const area = createFakeStorageArea(options);
  const getArea = vi.fn((): StorageArea => area);
  const time = handClock();
  const archive = createVisitArchive({
    localStorage: getArea,
    wallClock: time.clock,
    seed,
    mode,
  });
  return { area, getArea, time, archive };
}

function storedValue(area: ReturnType<typeof createFakeStorageArea>) {
  const text = area.items()[savedVisitsKey];
  return text === undefined ? undefined : JSON.parse(text);
}

function savedVisitOf(outcome: SaveOutcome): SavedVisit {
  if (!outcome.saved) {
    throw new Error(
      `Expected a saved visit, but the save was refused with ${outcome.reason}.`,
    );
  }
  return outcome.savedVisit;
}

describe("createVisitArchive", () => {
  describe("creating it", () => {
    it.each([-1, 2 ** 32, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
      "throws a RangeError for the seed %s",
      (seed) => {
        expect(() =>
          createVisitArchive({
            localStorage: () => createFakeStorageArea(),
            wallClock: handClock().clock,
            seed,
            mode: "keep",
          }),
        ).toThrow(RangeError);
      },
    );

    it("calls neither local storage nor the wall clock when it is created", () => {
      const { getArea, time, area } = setUp();
      expect(getArea).not.toHaveBeenCalled();
      expect(time.clock.now).not.toHaveBeenCalled();
      expect(area.calls).toEqual([]);
    });

    it("keeps the mode it was created with", () => {
      expect(setUp().archive.mode).toBe("keep");
      expect(setUp({}, 7, "robot").archive.mode).toBe("robot");
    });

    it("gives today's date from the wall clock", () => {
      const { archive, time } = setUp();
      expect(archive.today()).toBe("2026-11-20");
      time.set({ epochMs: 1795267200000, localDate: "2026-11-21" });
      expect(archive.today()).toBe("2026-11-21");
    });
  });

  describe("list", () => {
    it("lists nothing, with its line, when nothing is saved", () => {
      const { archive } = setUp();
      expect(archive.list()).toEqual({
        state: "ready",
        visits: [],
        unreadableCount: 0,
        canSave: true,
        canDeleteAll: false,
        lines: [resultPageCopy.noSavedVisitsLine],
      });
    });

    it("lists saved visits newest first with their labels, and says a browser may clear them", () => {
      const { archive } = setUp();
      const quick = savedVisitOf(archive.save(visitOf("quick", 1), "Buds"));
      const full = savedVisitOf(archive.save(visitOf("full", 2), ""));
      const list = archive.list();
      expect(list.state).toBe("ready");
      expect(list.visits.map((listing) => listing.visit)).toEqual([
        full,
        quick,
      ]);
      expect(list.visits[0]).toEqual({
        visit: full,
        dateLabel: "20 November 2026",
        visitTypeLabel: "Long visit, 5 rooms",
        deleteLabel:
          "Delete the visit of 20 November 2026, long visit, 5 rooms",
      });
      expect(list.visits[1]?.visitTypeLabel).toBe("Short visit, 3 rooms");
      expect(list.canSave).toBe(true);
      expect(list.canDeleteAll).toBe(true);
      expect(list.lines).toEqual([resultPageCopy.mayBeClearedLine]);
    });

    it("counts unreadable entries and says so", () => {
      const { archive, area } = setUp();
      archive.save(visitOf("quick", 1), "");
      const value = storedValue(area);
      value.visits.push({ broken: true });
      area.setItem(savedVisitsKey, JSON.stringify(value));
      const list = archive.list();
      expect(list.visits).toHaveLength(1);
      expect(list.unreadableCount).toBe(1);
      expect(list.lines).toEqual([
        unreadableEntriesLine(1),
        resultPageCopy.mayBeClearedLine,
      ]);
    });

    it("counts an entry whose payload does not read as unreadable, and keeps it", () => {
      const fields = {
        savedVisitId: "0000abcd",
        savedAtEpochMs: 1,
        savedOnLocalDate: "2026-11-20",
        visitType: "quick" as const,
        headphoneName: null,
        payloadJson: '{"formatVersion":1}',
      };
      const text = JSON.stringify({
        formatVersion: 1,
        visits: [{ ...fields, checksum: entryChecksum(fields) }],
      });
      const { archive } = setUp({ initialItems: { [savedVisitsKey]: text } });
      expect(archive.list()).toEqual({
        state: "ready",
        visits: [],
        unreadableCount: 1,
        canSave: true,
        canDeleteAll: true,
        lines: [unreadableEntriesLine(1)],
      });
      expect(archive.deleteVisit("0000abcd")).toEqual({
        deleted: false,
        reason: "notFound",
        line: deleteRefusedLine("notFound"),
      });
      expect(archive.exportVisitLog("0000abcd")).toBeNull();
    });

    it("says when as many visits are saved as the house keeps", () => {
      const { archive } = setUp();
      for (
        let variant = 0;
        variant < resultPageConfig.savedVisitsMaxCount;
        variant += 1
      ) {
        expect(archive.save(visitOf("quick", variant), "").saved).toBe(true);
      }
      const list = archive.list();
      expect(list.visits).toHaveLength(resultPageConfig.savedVisitsMaxCount);
      expect(list.canSave).toBe(false);
      expect(list.lines).toEqual([
        saveRefusedLine("tooMany"),
        resultPageCopy.mayBeClearedLine,
      ]);
    });

    it("says when this browser gives no local storage", () => {
      for (const getArea of [
        () => null,
        () => undefined,
        () => {
          throw new DOMException("blocked", "SecurityError");
        },
      ]) {
        const archive = createVisitArchive({
          localStorage: getArea,
          wallClock: handClock().clock,
          seed: 1,
          mode: "keep",
        });
        expect(archive.list()).toEqual({
          state: "unavailable",
          visits: [],
          unreadableCount: 0,
          canSave: false,
          canDeleteAll: false,
          lines: [resultPageCopy.unavailableListLine],
        });
      }
      expect(setUp({ getItemThrows: true }).archive.list().state).toBe(
        "unavailable",
      );
    });

    it("says when what is saved cannot be read as a whole, and only delete all is possible", () => {
      const { archive } = setUp({
        initialItems: { [savedVisitsKey]: "{not json" },
      });
      expect(archive.list()).toEqual({
        state: "unreadable",
        visits: [],
        unreadableCount: 0,
        canSave: false,
        canDeleteAll: true,
        lines: [resultPageCopy.unreadableListLine],
      });
    });

    it("reads local storage at every call", () => {
      const { archive, area } = setUp();
      archive.save(visitOf(), "");
      expect(archive.list().visits).toHaveLength(1);
      area.removeItem(savedVisitsKey);
      expect(archive.list().visits).toHaveLength(0);
    });

    it("gives deeply frozen lists", () => {
      const { archive } = setUp();
      archive.save(visitOf(), "Buds");
      const list = archive.list();
      expect(Object.isFrozen(list)).toBe(true);
      expect(Object.isFrozen(list.visits)).toBe(true);
      expect(Object.isFrozen(list.lines)).toBe(true);
      expect(Object.isFrozen(list.visits[0])).toBe(true);
      expect(Object.isFrozen(list.visits[0]?.visit)).toBe(true);
      expect(Object.isFrozen(list.visits[0]?.visit.summary.rooms[0])).toBe(
        true,
      );
      expect(Object.isFrozen(list.visits[0]?.visit.visitLog.rooms)).toBe(true);
    });
  });

  describe("save", () => {
    it("writes one entry with the wall clock's time and date, the tidy name and the shipped settings", () => {
      const { archive, area } = setUp();
      const visit = visitOf("quick", 3);
      const outcome = archive.save(visit, "  White \t earbuds ");
      const saved = savedVisitOf(outcome);
      expect(outcome).toEqual({
        saved: true,
        savedVisit: saved,
        renamed: false,
        line: resultPageCopy.savedLine,
      });
      expect(saved).toEqual({
        savedVisitId: expect.stringMatching(/^[0-9a-f]{8}$/),
        savedAtEpochMs: 1795180800000,
        savedOnLocalDate: "2026-11-20",
        visitType: "quick",
        headphoneName: "White earbuds",
        summary: roundTrip(visit.summary),
        visitLog: roundTrip(visit.visitLog),
        floorDb: hearingMethodConfig.floorDb,
        swappedRepeatDifferenceDb:
          hearingMethodConfig.swappedRepeatDifferenceDb,
      });
      const value = storedValue(area);
      expect(value.visits).toHaveLength(1);
      expect(JSON.parse(value.visits[0].payloadJson)).toEqual({
        formatVersion: 1,
        floorDb: hearingMethodConfig.floorDb,
        swappedRepeatDifferenceDb:
          hearingMethodConfig.swappedRepeatDifferenceDb,
        summary: roundTrip(visit.summary),
        visitLog: roundTrip(visit.visitLog),
      });
      expect(Object.keys(area.items())).toEqual([savedVisitsKey]);
    });

    it("gives the saved visit as a later list gives it", () => {
      const { archive } = setUp();
      const saved = savedVisitOf(archive.save(visitOf(), "Buds"));
      expect(archive.list().visits[0]?.visit).toEqual(saved);
    });

    it("saves no name for an empty or blank name", () => {
      const { archive } = setUp();
      expect(
        savedVisitOf(archive.save(visitOf("quick", 1), "")).headphoneName,
      ).toBeNull();
      expect(
        savedVisitOf(archive.save(visitOf("quick", 2), " \n\t")).headphoneName,
      ).toBeNull();
    });

    it("draws ids from the seed, so the same seed gives the same ids", () => {
      const first = setUp({}, 99).archive;
      const second = setUp({}, 99).archive;
      const other = setUp({}, 100).archive;
      const idOf = (archive: typeof first) =>
        savedVisitOf(archive.save(visitOf(), "")).savedVisitId;
      const id = idOf(first);
      expect(idOf(second)).toBe(id);
      expect(idOf(other)).not.toBe(id);
    });

    it("draws another id when the one drawn is taken", () => {
      const takenId = savedVisitOf(
        setUp({}, 5).archive.save(visitOf(), ""),
      ).savedVisitId;
      const holder = { savedVisitId: takenId, note: "not readable" };
      const { archive, area } = setUp(
        {
          initialItems: {
            [savedVisitsKey]: JSON.stringify({
              formatVersion: 1,
              visits: [holder],
            }),
          },
        },
        5,
      );
      const saved = savedVisitOf(archive.save(visitOf(), ""));
      expect(saved.savedVisitId).not.toBe(takenId);
      expect(storedValue(area).visits).toEqual([
        holder,
        expect.objectContaining({ savedVisitId: saved.savedVisitId }),
      ]);
    });

    it("changes only the name on a second save of the same log, and adds nothing", () => {
      const { archive, area, time } = setUp();
      const visit = visitOf();
      const first = savedVisitOf(archive.save(visit, "Buds"));
      time.set({ epochMs: 1795267200000, localDate: "2026-11-21" });
      const outcome = archive.save(visit, "Big cans");
      expect(outcome).toEqual({
        saved: true,
        savedVisit: { ...first, headphoneName: "Big cans" },
        renamed: true,
        line: resultPageCopy.renamedLine,
      });
      const list = archive.list();
      expect(list.visits.map((listing) => listing.visit)).toEqual([
        { ...first, headphoneName: "Big cans" },
      ]);
      expect(storedValue(area).visits).toHaveLength(1);
    });

    it("writes nothing on a second save of the same log with the same name", () => {
      const { archive, area } = setUp();
      const visit = visitOf();
      const first = savedVisitOf(archive.save(visit, "Buds"));
      const writesBefore = area.calls.filter(
        (call) => call.method !== "getItem",
      ).length;
      expect(archive.save(visit, "  Buds ")).toEqual({
        saved: true,
        savedVisit: first,
        renamed: false,
        line: resultPageCopy.savedLine,
      });
      expect(
        area.calls.filter((call) => call.method !== "getItem"),
      ).toHaveLength(writesBefore);
    });

    it("adds a new entry when the visit saved before has been deleted", () => {
      const { archive } = setUp();
      const visit = visitOf();
      const first = savedVisitOf(archive.save(visit, "Buds"));
      archive.deleteVisit(first.savedVisitId);
      const again = savedVisitOf(archive.save(visit, "Buds"));
      expect(again.savedVisitId).not.toBe(first.savedVisitId);
      expect(archive.list().visits).toHaveLength(1);
    });

    it("saves an equal visit with another log object as another visit", () => {
      const { archive } = setUp();
      archive.save(visitOf(), "");
      archive.save(visitOf(), "");
      expect(archive.list().visits).toHaveLength(2);
    });

    it("takes a name at the limit and refuses one past it with nameTooLong, writing nothing", () => {
      const { archive, area } = setUp();
      const limit = resultPageConfig.headphoneNameMaxCharacterCount;
      expect(archive.save(visitOf("quick", 1), "🎧".repeat(limit)).saved).toBe(
        true,
      );
      const writes = area.calls.length;
      expect(archive.save(visitOf("quick", 2), "🎧".repeat(limit + 1))).toEqual(
        {
          saved: false,
          reason: "nameTooLong",
          line: saveRefusedLine("nameTooLong"),
        },
      );
      expect(
        archive.save(visitOf("quick", 2), ` ${"a".repeat(limit)}   `).saved,
      ).toBe(true);
      expect(area.calls.slice(writes, writes + 1)).toEqual([
        { method: "getItem", key: savedVisitsKey },
      ]);
    });

    it("refuses a new save with tooMany at the limit, and deletes nothing", () => {
      const { archive, area } = setUp();
      const visits = Array.from(
        { length: resultPageConfig.savedVisitsMaxCount },
        (_, variant) => visitOf("quick", variant),
      );
      for (const visit of visits) {
        archive.save(visit, "");
      }
      const before = area.items();
      expect(archive.save(visitOf("quick", 999), "")).toEqual({
        saved: false,
        reason: "tooMany",
        line: saveRefusedLine("tooMany"),
      });
      expect(area.items()).toEqual(before);
      expect(archive.save(visits[0] as VisitToSave, "Renamed").saved).toBe(
        true,
      );
    });

    it.each<
      [
        string,
        FakeStorageAreaOptions | null,
        "unavailable" | "unreadable" | "refused" | "full",
      ]
    >([
      ["no local storage", null, "unavailable"],
      ["getItem that throws", { getItemThrows: true }, "unavailable"],
      [
        "an unreadable value",
        { initialItems: { [savedVisitsKey]: "[]" } },
        "unreadable",
      ],
      ["setItem that throws", { setItemThrows: true }, "refused"],
      ["a full quota", { maxCharacterCount: 100 }, "full"],
    ])(
      "refuses with %s with its reason and line, and leaves storage as it was",
      (_label, options, reason) => {
        const area = options === null ? null : createFakeStorageArea(options);
        const before = area?.items();
        const archive = createVisitArchive({
          localStorage: () => area,
          wallClock: handClock().clock,
          seed: 3,
          mode: "keep",
        });
        expect(archive.save(visitOf(), "Buds")).toEqual({
          saved: false,
          reason,
          line: saveRefusedLine(reason),
        });
        expect(area?.items()).toEqual(before);
      },
    );

    it("refuses a rename the browser will not write with its reason", () => {
      const area = createFakeStorageArea();
      let refuse = false;
      const archive = createVisitArchive({
        localStorage: () => ({
          getItem: (key) => area.getItem(key),
          setItem: (key, value) => {
            if (refuse) {
              throw new DOMException("full", "QuotaExceededError");
            }
            area.setItem(key, value);
          },
          removeItem: (key) => area.removeItem(key),
        }),
        wallClock: handClock().clock,
        seed: 3,
        mode: "keep",
      });
      const visit = visitOf();
      archive.save(visit, "Buds");
      refuse = true;
      expect(archive.save(visit, "Big cans")).toEqual({
        saved: false,
        reason: "full",
        line: saveRefusedLine("full"),
      });
      expect(archive.list().visits[0]?.visit.headphoneName).toBe("Buds");
    });

    it("keeps the order of saving when the clock is set back", () => {
      const { archive, time } = setUp();
      const first = savedVisitOf(archive.save(visitOf("quick", 1), ""));
      time.set({ epochMs: 1000, localDate: "1970-01-01" });
      const second = savedVisitOf(archive.save(visitOf("quick", 2), ""));
      expect(second.savedAtEpochMs).toBe(1000);
      expect(
        archive.list().visits.map((listing) => listing.visit.savedVisitId),
      ).toEqual([second.savedVisitId, first.savedVisitId]);
    });

    it("saves nothing until save is called", () => {
      const { area } = setUp();
      expect(area.calls).toEqual([]);
    });

    it("throws a RangeError for a visit whose summary does not fit its log, and writes nothing", () => {
      const { archive, area } = setUp();
      const visit = visitOf();
      const broken: VisitToSave = {
        visitLog: visit.visitLog,
        summary: { ...visit.summary, pooledFalseAlarmCount: 99 },
      };
      expect(() => archive.save(broken, "")).toThrow(RangeError);
      expect(area.calls.filter((call) => call.method !== "getItem")).toEqual(
        [],
      );
    });
  });

  describe("deleting", () => {
    it("deletes one listed visit and nothing else", () => {
      const { archive, area } = setUp({ initialItems: { other: "kept" } });
      const first = savedVisitOf(archive.save(visitOf("quick", 1), "A"));
      const second = savedVisitOf(archive.save(visitOf("quick", 2), "B"));
      const otherEntry = storedValue(area).visits[1];
      expect(archive.deleteVisit(first.savedVisitId)).toEqual({
        deleted: true,
        deletedCount: 1,
        line: resultPageCopy.deletedLine,
      });
      expect(archive.list().visits.map((listing) => listing.visit)).toEqual([
        second,
      ]);
      expect(storedValue(area).visits).toEqual([otherEntry]);
      expect(area.items().other).toBe("kept");
    });

    it("removes the key when the last visit is deleted", () => {
      const { archive, area } = setUp();
      const saved = savedVisitOf(archive.save(visitOf(), ""));
      archive.deleteVisit(saved.savedVisitId);
      expect(area.items()).toEqual({});
    });

    it("gives notFound for a visit that is not listed, and writes nothing", () => {
      const { archive, area } = setUp();
      archive.save(visitOf(), "");
      const before = area.items();
      expect(archive.deleteVisit("ffffffff")).toEqual({
        deleted: false,
        reason: "notFound",
        line: deleteRefusedLine("notFound"),
      });
      expect(area.items()).toEqual(before);
    });

    it("deletes every saved visit, readable or not, and counts the listed ones", () => {
      const { archive, area } = setUp({ initialItems: { other: "kept" } });
      archive.save(visitOf("quick", 1), "");
      archive.save(visitOf("quick", 2), "");
      const value = storedValue(area);
      value.visits.push("broken");
      area.setItem(savedVisitsKey, JSON.stringify(value));
      expect(archive.deleteAll()).toEqual({
        deleted: true,
        deletedCount: 2,
        line: resultPageCopy.allDeletedLine,
      });
      expect(area.items()).toEqual({ other: "kept" });
      expect(archive.list().visits).toEqual([]);
    });

    it("deletes a value that cannot be read with delete all, after which a save succeeds", () => {
      const { archive, area } = setUp({
        initialItems: { [savedVisitsKey]: "{not json" },
      });
      expect(archive.deleteVisit("00000001")).toEqual({
        deleted: false,
        reason: "unreadable",
        line: deleteRefusedLine("unreadable"),
      });
      expect(archive.deleteAll()).toEqual({
        deleted: true,
        deletedCount: 0,
        line: resultPageCopy.allDeletedLine,
      });
      expect(area.items()).toEqual({});
      expect(archive.save(visitOf(), "").saved).toBe(true);
    });

    it.each<[string, FakeStorageAreaOptions | null, "unavailable" | "refused"]>(
      [
        ["no local storage", null, "unavailable"],
        ["getItem that throws", { getItemThrows: true }, "unavailable"],
        ["removeItem that throws", { removeItemThrows: true }, "refused"],
      ],
    )(
      "refuses delete all with %s with its reason and line",
      (_label, options, reason) => {
        const area =
          options === null
            ? null
            : createFakeStorageArea({
                ...options,
                initialItems: { [savedVisitsKey]: "{}" },
              });
        const archive = createVisitArchive({
          localStorage: () => area,
          wallClock: handClock().clock,
          seed: 3,
          mode: "keep",
        });
        expect(archive.deleteAll()).toEqual({
          deleted: false,
          reason,
          line: deleteRefusedLine(reason),
        });
      },
    );

    it("refuses to delete one visit when the browser will not write, and keeps it", () => {
      const area = createFakeStorageArea();
      const writer = createVisitArchive({
        localStorage: () => area,
        wallClock: handClock().clock,
        seed: 3,
        mode: "keep",
      });
      const first = savedVisitOf(writer.save(visitOf("quick", 1), ""));
      writer.save(visitOf("quick", 2), "");
      const before = area.items();
      const refusing = createVisitArchive({
        localStorage: () => ({
          getItem: (key) => area.getItem(key),
          setItem: () => {
            throw new DOMException("full", "QuotaExceededError");
          },
          removeItem: (key) => area.removeItem(key),
        }),
        wallClock: handClock().clock,
        seed: 4,
        mode: "keep",
      });
      expect(refusing.deleteVisit(first.savedVisitId)).toEqual({
        deleted: false,
        reason: "refused",
        line: deleteRefusedLine("refused"),
      });
      expect(area.items()).toEqual(before);
    });

    it("refuses to delete one visit when there is no local storage", () => {
      const archive = createVisitArchive({
        localStorage: () => null,
        wallClock: handClock().clock,
        seed: 3,
        mode: "keep",
      });
      expect(archive.deleteVisit("00000001")).toEqual({
        deleted: false,
        reason: "unavailable",
        line: deleteRefusedLine("unavailable"),
      });
    });
  });

  describe("exportVisitLog", () => {
    it("gives the JSON text of a listed visit's log", () => {
      const { archive } = setUp();
      const visit = visitOf("full", 4);
      const saved = savedVisitOf(archive.save(visit, ""));
      const exported = archive.exportVisitLog(saved.savedVisitId);
      expect(exported).not.toBeNull();
      expect(JSON.parse(exported as string)).toEqual(roundTrip(visit.visitLog));
    });

    it("gives null for a visit that is not listed", () => {
      const { archive } = setUp();
      expect(archive.exportVisitLog("00000001")).toBeNull();
    });
  });

  describe("another archive on the same storage", () => {
    it("lists the same visits", () => {
      const { archive, area } = setUp({}, 11);
      archive.save(visitOf("quick", 1), "A");
      archive.save(visitOf("full", 2), "B");
      const other = createVisitArchive({
        localStorage: () => area,
        wallClock: handClock().clock,
        seed: 12,
        mode: "keep",
      });
      expect(other.list()).toEqual(archive.list());
    });
  });

  describe("robot mode", () => {
    it("never calls the function that gives local storage, lists nothing, refuses everything and exports nothing", () => {
      const { archive, getArea, area } = setUp({}, 7, "robot");
      expect(archive.list()).toEqual({
        state: "off",
        visits: [],
        unreadableCount: 0,
        canSave: false,
        canDeleteAll: false,
        lines: [resultPageCopy.robotModeLine],
      });
      expect(archive.save(visitOf(), "Buds")).toEqual({
        saved: false,
        reason: "robotMode",
        line: saveRefusedLine("robotMode"),
      });
      expect(archive.deleteVisit("00000001")).toEqual({
        deleted: false,
        reason: "robotMode",
        line: deleteRefusedLine("robotMode"),
      });
      expect(archive.deleteAll()).toEqual({
        deleted: false,
        reason: "robotMode",
        line: deleteRefusedLine("robotMode"),
      });
      expect(archive.exportVisitLog("00000001")).toBeNull();
      expect(getArea).not.toHaveBeenCalled();
      expect(area.calls).toEqual([]);
    });

    it("still throws a RangeError for a bad seed", () => {
      expect(() =>
        createVisitArchive({
          localStorage: () => null,
          wallClock: handClock().clock,
          seed: -1,
          mode: "robot",
        }),
      ).toThrow(RangeError);
    });
  });

  describe("a storage function that throws", () => {
    it("makes no method throw", () => {
      const archive = createVisitArchive({
        localStorage: () => {
          throw new DOMException("The operation is insecure.", "SecurityError");
        },
        wallClock: handClock().clock,
        seed: 1,
        mode: "keep",
      });
      expect(() => archive.list()).not.toThrow();
      expect(() => archive.save(visitOf(), "Buds")).not.toThrow();
      expect(() => archive.deleteVisit("00000001")).not.toThrow();
      expect(() => archive.deleteAll()).not.toThrow();
      expect(() => archive.exportVisitLog("00000001")).not.toThrow();
      expect(() => archive.today()).not.toThrow();
      expect(archive.save(visitOf(), "Buds")).toEqual({
        saved: false,
        reason: "unavailable",
        line: saveRefusedLine("unavailable"),
      });
    });

    it("makes no method throw when the area's own methods throw", () => {
      const throwing: StorageArea = {
        getItem: () => {
          throw new Error("get");
        },
        setItem: () => {
          throw new Error("set");
        },
        removeItem: () => {
          throw new Error("remove");
        },
      };
      const archive = createVisitArchive({
        localStorage: () => throwing,
        wallClock: handClock().clock,
        seed: 1,
        mode: "keep",
      });
      expect(() => archive.list()).not.toThrow();
      expect(() => archive.save(visitOf(), "")).not.toThrow();
      expect(() => archive.deleteVisit("00000001")).not.toThrow();
      expect(() => archive.deleteAll()).not.toThrow();
      expect(() => archive.exportVisitLog("00000001")).not.toThrow();
    });
  });
});
