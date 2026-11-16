import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { findEarlierVisit } from "../../src/session/find-earlier-visit";
import type {
  SavedVisit,
  SavedVisitList,
} from "../../src/session/result-page-types";
import { resultPicture } from "../../src/session/result-picture";
import {
  parseSavedVisitPayload,
  savedVisitPayloadJson,
} from "../../src/session/saved-visit-payload";
import type { CalibrationAnchor } from "../../src/session/visit-flow-types";
import {
  drawnAnchorArbitrary,
  drawnVisitArbitrary,
  savedVisitIdArbitrary,
  savedVisitOfDrawn,
  wallTimeArbitrary,
  type DrawnAnchor,
  type DrawnVisit,
} from "./result-page-arbitraries";

// audible-start CP10 (design.md, "Correctness properties"; R11), its anchor and payload parts. A
// payload written before audible-start, whose calibrations have no anchor, reads with no anchor
// and everything else as it reads today; a payload with an anchor of music or hiss round-trips;
// a payload with any other anchor is unreadable and never throws; `resultPicture` gives earlier
// marks only between floors whose anchors were set the same way, and `comparison` null when no
// floor has one; `findEarlierVisit` never gives a visit anchored to the hands for a live visit or
// for a saved visit anchored with the music or the hiss. Task 8 adds the floor's parts and task 18
// the Floor_Line's.
//
// The kinds are known from how the visits were drawn, not from the code under test: every drawn
// log has one calibration, from which every floor's result comes.

/** Runs of each part (design.md, "Correctness properties", CP10). */
const runs = 300;
const timeoutMs = 120_000;

/** The Anchor_Kind a drawn anchor gives. */
const kindOf = (anchor: DrawnAnchor): CalibrationAnchor =>
  anchor === "absent" ? "hands" : anchor;

/** A visit with any anchor and any summary settings, for the picture and the earlier visit. */
const anyAnchorVisit = drawnVisitArbitrary({
  anyDifference: true,
  anchor: drawnAnchorArbitrary,
});

/** A visit with any anchor and the shipped difference, which the archive saves with it. */
const anyAnchorSavedVisit = drawnVisitArbitrary({
  anchor: drawnAnchorArbitrary,
});

/** Anything a payload's anchor may hold that is not `music` or `hiss`. */
const brokenAnchorArbitrary: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom<unknown>(
    "hands",
    "loading",
    "Music",
    "HISS",
    " music",
    "",
    null,
    true,
    0,
    [],
    {},
    ["music"],
  ),
  fc.string().filter((text) => text !== "music" && text !== "hiss"),
  fc.double(),
);

function savedOf(
  drawn: DrawnVisit,
  savedVisitId: string,
  wallTime: { readonly epochMs: number; readonly localDate: string },
  typedName: string,
): SavedVisit {
  return savedVisitOfDrawn(drawn, {
    savedVisitId,
    wallTime,
    typedName,
    floorDb: hearingMethodConfig.floorDb,
  });
}

function listOf(visits: readonly SavedVisit[]): SavedVisitList {
  return {
    state: "ready",
    visits: visits.map((visit) => ({
      visit,
      dateLabel: "",
      visitTypeLabel: "",
      deleteLabel: "",
    })),
    unreadableCount: 0,
    canSave: true,
    canDeleteAll: visits.length > 0,
    lines: [],
  };
}

describe("audible-start CP10. Saved visits and anchors (Universal; R11)", () => {
  it(
    "reads a payload from before audible-start as it is, round-trips the anchors music and hiss, and finds every other anchor unreadable without throwing",
    () => {
      fc.assert(
        fc.property(
          anyAnchorSavedVisit,
          brokenAnchorArbitrary,
          fc.nat(),
          (drawn, brokenAnchor, position) => {
            const { visit } = drawn;
            const json = savedVisitPayloadJson(visit);
            const parsed = parseSavedVisitPayload(
              json,
              visit.visitLog.visitType,
            );
            expect(parsed).not.toBeNull();
            // Read back exactly as written, whatever the anchor: absent stays absent.
            expect(parsed?.visitLog).toEqual(
              JSON.parse(JSON.stringify(visit.visitLog)),
            );
            expect(parsed?.summary).toEqual(
              JSON.parse(JSON.stringify(visit.summary)),
            );
            const calibration = parsed?.visitLog.calibrations[0];
            if (drawn.plan.anchor === "absent") {
              expect(Object.hasOwn(calibration ?? {}, "anchor")).toBe(false);
            } else {
              expect(calibration?.anchor).toBe(drawn.plan.anchor);
            }

            // One calibration with an anchor that is neither music nor hiss: unreadable.
            const payload = JSON.parse(json);
            const calibrations = payload.visitLog.calibrations as Record<
              string,
              unknown
            >[];
            const index = position % calibrations.length;
            calibrations[index] = {
              ...calibrations[index],
              anchor: brokenAnchor,
            };
            let broken: unknown = "not read";
            expect(() => {
              broken = parseSavedVisitPayload(
                JSON.stringify(payload),
                visit.visitLog.visitType,
              );
            }).not.toThrow();
            expect(broken).toBeNull();
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );

  it(
    "gives earlier marks only between floors anchored the same way, and no comparison without one",
    () => {
      fc.assert(
        fc.property(
          anyAnchorVisit,
          anyAnchorVisit,
          fc.boolean(),
          savedVisitIdArbitrary,
          savedVisitIdArbitrary,
          wallTimeArbitrary,
          (shownDrawn, earlierDrawn, live, shownId, earlierId, wallTime) => {
            const earlierVisit = savedOf(
              earlierDrawn,
              earlierId,
              wallTime,
              "White earbuds",
            );
            const picture = resultPicture(
              live
                ? {
                    kind: "live",
                    visit: shownDrawn.visit,
                    localDate: wallTime.localDate,
                    earlierVisit,
                  }
                : {
                    kind: "saved",
                    savedVisit: savedOf(
                      shownDrawn,
                      shownId,
                      wallTime,
                      "White earbuds",
                    ),
                    earlierVisit,
                  },
            );
            const sameKind =
              kindOf(shownDrawn.plan.anchor) ===
              kindOf(earlierDrawn.plan.anchor);
            let marked = 0;
            for (const floor of picture.floors) {
              const sharedRoom = earlierVisit.summary.rooms.some(
                (room) => room.room.roomId === floor.room.roomId,
              );
              const expectMark = sameKind && sharedRoom;
              expect(floor.left.earlier !== null).toBe(expectMark);
              expect(floor.right.earlier !== null).toBe(expectMark);
              if (expectMark) {
                marked += 1;
              }
            }
            expect(picture.comparison === null).toBe(marked === 0);
            if (picture.comparison !== null) {
              expect(picture.comparison.earlierSavedVisitId).toBe(
                earlierVisit.savedVisitId,
              );
            }
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );

  it(
    "never finds a visit anchored to the hands for a live visit, or for a saved visit anchored with the music or the hiss",
    () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              drawn: anyAnchorVisit,
              named: fc.boolean(),
              wallTime: wallTimeArbitrary,
            }),
            { minLength: 1, maxLength: 6 },
          ),
          fc.uniqueArray(savedVisitIdArbitrary, { minLength: 6, maxLength: 6 }),
          fc.oneof(
            fc.constant<number | null>(null),
            fc.integer({ min: 0, max: 5 }),
          ),
          (entries, ids, shownPosition) => {
            const visits = entries.map((entry, index) =>
              savedOf(
                entry.drawn,
                ids[index] ?? "00000000",
                entry.wallTime,
                entry.named ? "White earbuds" : "Blue headphones",
              ),
            );
            const shownIndex =
              shownPosition === null || shownPosition >= visits.length
                ? null
                : shownPosition;
            const shownId =
              shownIndex === null
                ? null
                : (visits[shownIndex]?.savedVisitId ?? null);
            const found = findEarlierVisit(
              listOf(visits),
              "White earbuds",
              shownId,
            );
            const kinds = entries.map((entry) =>
              kindOf(entry.drawn.plan.anchor),
            );
            const shownKind = shownIndex === null ? null : kinds[shownIndex];
            if (found !== null) {
              const foundIndex = visits.indexOf(found);
              expect(foundIndex).toBeGreaterThan(shownIndex ?? -1);
              if (kinds[foundIndex] === "hands") {
                expect(shownKind).toBe("hands");
              }
            }
            // What the rule gives, worked out from the drawing: the newest visit saved before the
            // shown one with the name, skipping the hands unless the shown visit is anchored so.
            const expected =
              visits.find(
                (_visit, index) =>
                  index > (shownIndex ?? -1) &&
                  entries[index]?.named === true &&
                  (kinds[index] !== "hands" || shownKind === "hands"),
              ) ?? null;
            expect(found).toBe(expected);
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});
