import { describe, expect, expectTypeOf, it } from "vitest";
import { hearingMethodConfig } from "../config/hearing-method-config";
import { findEarlierVisit } from "./find-earlier-visit";
import type {
  FindEarlierVisit,
  SavedVisit,
  SavedVisitList,
} from "./result-page-types";
import { summarizeVisit } from "./summarize-visit";
import type { VisitLog } from "./visit-flow-types";
import { visitRooms } from "./visit-rooms";

// Lists written by hand. findEarlierVisit reads only each visit's id, headphone name and the
// anchor of its calibration, so every visit here shares one summary and, but for that anchor, one
// log.

const counts = {
  presentationCount: 12,
  catchCount: 6,
  wrongSideCount: 1,
  missCount: 5,
};
const rooms = visitRooms("full");
const visitLog: VisitLog = {
  formatVersion: 1,
  visitType: "full",
  visitSeed: 42,
  rooms,
  calibrations: [
    {
      calibrationIndex: 0,
      settingDb: -20,
      roomTopLevelDb: {
        cellar: 5,
        corridor: 5,
        nursery: 5,
        stairs: 5,
        attic: 5,
      },
      keptAtMs: 500,
      anchor: "music",
    },
  ],
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
      left: { ...counts, state: "found" as const, thresholdDb: -30 },
      right: { ...counts, state: "found" as const, thresholdDb: -30 },
      noSoundTrialCount: 7,
      falseAlarmCount: 0,
      falseAlarmRateFraction: 0,
      falseAlarmRateAboveLimit: false,
    },
  })),
  trials: [],
  ignoredAnswers: [],
  pauses: [],
  refusedPlays: [],
};
const summary = summarizeVisit(visitLog);

/** The log anchored another way: with the hiss, or matched to the hands before audible-start. */
function logAnchoredWith(anchor: "music" | "hiss" | "hands"): VisitLog {
  return {
    ...visitLog,
    calibrations: visitLog.calibrations.map((calibration) => ({
      calibrationIndex: calibration.calibrationIndex,
      settingDb: calibration.settingDb,
      roomTopLevelDb: calibration.roomTopLevelDb,
      keptAtMs: calibration.keptAtMs,
      ...(anchor === "hands" ? {} : { anchor }),
    })),
  };
}

function savedVisit(
  savedVisitId: string,
  headphoneName: string | null,
  anchor: "music" | "hiss" | "hands" = "music",
): SavedVisit {
  return {
    savedVisitId,
    savedAtEpochMs: 1795180800000,
    savedOnLocalDate: "2026-11-20",
    visitType: "full",
    headphoneName,
    summary,
    visitLog: logAnchoredWith(anchor),
    floorDb: hearingMethodConfig.floorDb,
    swappedRepeatDifferenceDb: hearingMethodConfig.swappedRepeatDifferenceDb,
    swappedRepeats: [],
  };
}

/** A ready list of these visits, given newest first as `list()` gives them. */
function listOf(...visits: SavedVisit[]): SavedVisitList {
  return {
    state: "ready",
    visits: visits.map((visit) => ({
      visit,
      dateLabel: "20 November 2026",
      visitTypeLabel: "Short visit, 3 rooms",
      deleteLabel: "Delete the visit of 20 November 2026, short visit, 3 rooms",
    })),
    unreadableCount: 0,
    canSave: true,
    canDeleteAll: visits.length > 0,
    lines: [],
  };
}

// Newest first: d was saved last, a first.
const d = savedVisit("0000000d", "White earbuds");
const c = savedVisit("0000000c", "Studio cans");
const b = savedVisit("0000000b", "White earbuds");
const unnamed = savedVisit("000000aa", null);
const a = savedVisit("0000000a", "white  EARBUDS");
const list = listOf(d, c, b, unnamed, a);

describe("findEarlierVisit", () => {
  it("has the shape of the contract", () => {
    expectTypeOf(findEarlierVisit).toEqualTypeOf<FindEarlierVisit>();
  });

  it("gives the newest listed visit with the same name for a visit not saved", () => {
    expect(findEarlierVisit(list, "White earbuds", null)).toBe(d);
    expect(findEarlierVisit(list, "Studio cans", null)).toBe(c);
  });

  it("gives the newest visit with the same name saved before the shown one", () => {
    expect(findEarlierVisit(list, "White earbuds", d.savedVisitId)).toBe(b);
    expect(findEarlierVisit(list, "White earbuds", c.savedVisitId)).toBe(b);
    expect(findEarlierVisit(list, "White earbuds", b.savedVisitId)).toBe(a);
  });

  it("never gives the shown visit", () => {
    expect(findEarlierVisit(list, "White earbuds", a.savedVisitId)).toBeNull();
    expect(findEarlierVisit(list, "Studio cans", c.savedVisitId)).toBeNull();
    expect(
      findEarlierVisit(listOf(d), "White earbuds", d.savedVisitId),
    ).toBeNull();
  });

  it("treats a shown id that is not listed as a visit not saved", () => {
    expect(findEarlierVisit(list, "White earbuds", "ffffffff")).toBe(d);
  });

  it("gives null when no listed visit has the name", () => {
    expect(findEarlierVisit(list, "Blue speaker", null)).toBeNull();
    expect(findEarlierVisit(listOf(), "White earbuds", null)).toBeNull();
  });

  it("gives null for an empty name and a name of spacing only", () => {
    for (const typed of ["", " ", "  \t\n ", "\u00a0\u3000", "\u0000\u0007"]) {
      expect(findEarlierVisit(list, typed, null), JSON.stringify(typed)).toBe(
        null,
      );
      expect(findEarlierVisit(list, typed, d.savedVisitId)).toBeNull();
    }
  });

  it("ignores letter case and spacing", () => {
    expect(findEarlierVisit(list, "  WHITE\tearbuds\n", null)).toBe(d);
    expect(findEarlierVisit(list, "white earbuds", b.savedVisitId)).toBe(a);
    expect(findEarlierVisit(list, "studio   CANS", null)).toBe(c);
  });

  it("matches names written with and without combining marks", () => {
    const composed = savedVisit("000000c1", "Caf\u00e9 buds");
    expect(findEarlierVisit(listOf(composed), "Cafe\u0301 buds", null)).toBe(
      composed,
    );
  });

  it("never matches a visit saved with no name", () => {
    expect(findEarlierVisit(listOf(unnamed), "White earbuds", null)).toBeNull();
    expect(findEarlierVisit(listOf(d, unnamed), "", d.savedVisitId)).toBeNull();
  });

  it("does not need the same visit type", () => {
    const longVisit: SavedVisit = {
      ...b,
      savedVisitId: "0000001b",
      visitType: "full",
    };
    expect(
      findEarlierVisit(listOf(d, longVisit), "White earbuds", d.savedVisitId),
    ).toBe(longVisit);
  });

  describe("anchors (audible-start R11.4, D26)", () => {
    const handsOld = savedVisit("000000a1", "White earbuds", "hands");
    const handsOlder = savedVisit("000000a0", "White earbuds", "hands");
    const music = savedVisit("000000b1", "White earbuds", "music");
    const hiss = savedVisit("000000c1", "White earbuds", "hiss");

    it("skips a visit anchored to the hands for a visit not saved, which is never anchored so", () => {
      expect(
        findEarlierVisit(listOf(handsOld, music), "White earbuds", null),
      ).toBe(music);
      expect(
        findEarlierVisit(listOf(handsOld, handsOlder), "White earbuds", null),
      ).toBeNull();
      expect(
        findEarlierVisit(
          listOf(handsOld, handsOlder),
          "White earbuds",
          "ffffffff",
        ),
      ).toBeNull();
    });

    it("skips a visit anchored to the hands for a shown visit anchored with the music or the hiss", () => {
      for (const shown of [
        savedVisit("000000d1", "White earbuds", "music"),
        savedVisit("000000d2", "White earbuds", "hiss"),
      ]) {
        expect(
          findEarlierVisit(
            listOf(shown, handsOld, hiss, handsOlder),
            "White earbuds",
            shown.savedVisitId,
          ),
        ).toBe(hiss);
        expect(
          findEarlierVisit(
            listOf(shown, handsOld),
            "White earbuds",
            shown.savedVisitId,
          ),
        ).toBeNull();
      }
    });

    it("finds a visit anchored to the hands for a shown visit anchored the same way", () => {
      expect(
        findEarlierVisit(
          listOf(handsOld, handsOlder),
          "White earbuds",
          handsOld.savedVisitId,
        ),
      ).toBe(handsOlder);
    });

    it("leaves a visit anchored with the hiss for one anchored with the music to the picture, which draws nothing of it", () => {
      expect(
        findEarlierVisit(
          listOf(music, hiss),
          "White earbuds",
          music.savedVisitId,
        ),
      ).toBe(hiss);
    });
  });

  it("gives null for a list that is not ready, which lists no visits", () => {
    for (const state of ["unavailable", "unreadable", "off"] as const) {
      expect(
        findEarlierVisit(
          { ...listOf(), state, canSave: false },
          "White earbuds",
          null,
        ),
      ).toBeNull();
    }
  });
});
