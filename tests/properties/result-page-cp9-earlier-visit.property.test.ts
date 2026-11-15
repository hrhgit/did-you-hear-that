import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { canonicalHeadphoneName } from "../../src/session/canonical-headphone-name";
import { findEarlierVisit } from "../../src/session/find-earlier-visit";
import { lightDepthFraction } from "../../src/session/light-depth-fraction";
import {
  earlierVisitLine,
  earlierVisitUnreliableLine,
} from "../../src/copy/comparison-lines";
import type {
  ResultPicture,
  SavedVisit,
  SavedVisitList,
} from "../../src/session/result-page-types";
import { resultPicture } from "../../src/session/result-picture";
import type { VisitEarResult } from "../../src/session/visit-flow-types";
import {
  drawnHeadphoneNameArbitrary,
  drawnVisitArbitrary,
  earlierVisitArbitrary,
  pictureInputArbitrary,
  savedVisitIdArbitrary,
  savedVisitOfDrawn,
  wallTimeArbitrary,
  type DrawnHeadphoneName,
} from "./result-page-arbitraries";

// CP9. The earlier visit is the right one (Universal; result-page design.md, CP9; R20). For any
// list of saved visits with drawn names, any typed name and any shown id (listed, unlisted or
// null), findEarlierVisit gives the newest listed visit saved before the shown one with the same
// name, ignoring letter case and spacing, and never the shown visit. In the picture with an earlier
// visit, a wing has an outline mark exactly when the earlier visit entered its room, the outline
// is on the shown floor's own scale and missing exactly for an unreliable earlier ear, outlines
// keep the order of CP3, and the comparison line names the earlier visit. Without an earlier
// visit nothing of the comparison is there.
//
// The names come from `headphoneNameBases`, so whether two names are the same is known from how
// they were drawn, not from the code under test.

/** Runs (design.md, "Run counts and time"). */
const runs = 300;
const timeoutMs = 120_000;

/** The most visits in a drawn list. */
const listedMaxCount = 8;

/** One listed visit: which drawn visit it holds and the name it was saved with. */
interface ListedPlan {
  readonly visitIndex: number;
  readonly name: DrawnHeadphoneName;
}

/** Where the shown visit is: a listed one, an id that is not listed, or not saved. */
type ShownPlan =
  | { readonly kind: "listed"; readonly index: number }
  | { readonly kind: "unlisted"; readonly savedVisitId: string }
  | { readonly kind: "notSaved" };

const listCaseArbitrary = fc
  .tuple(
    fc.array(drawnVisitArbitrary({ anyDifference: true }), {
      minLength: 1,
      maxLength: 3,
    }),
    fc.uniqueArray(savedVisitIdArbitrary, { maxLength: listedMaxCount }),
  )
  .chain(([drawnVisits, ids]) =>
    fc.record({
      drawnVisits: fc.constant(drawnVisits),
      ids: fc.constant(ids),
      listed: fc.array(
        fc.record({
          visitIndex: fc.integer({ min: 0, max: drawnVisits.length - 1 }),
          name: drawnHeadphoneNameArbitrary,
        }),
        { minLength: ids.length, maxLength: ids.length },
      ),
      wallTimes: fc.array(wallTimeArbitrary, {
        minLength: ids.length,
        maxLength: ids.length,
      }),
      typed: drawnHeadphoneNameArbitrary,
      shown: fc.oneof(
        ids.length === 0
          ? fc.constant<ShownPlan>({ kind: "notSaved" })
          : fc
              .integer({ min: 0, max: ids.length - 1 })
              .map((index): ShownPlan => ({ kind: "listed", index })),
        savedVisitIdArbitrary
          .filter((id) => !ids.includes(id))
          .map((savedVisitId): ShownPlan => ({
            kind: "unlisted",
            savedVisitId,
          })),
        fc.constant<ShownPlan>({ kind: "notSaved" }),
      ),
    }),
  );

/** A ready list, newest first, of the drawn visits saved with the drawn names. */
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

/** What the definition gives: the first listed visit after the shown one with the same base name. */
function expectedEarlier(
  visits: readonly SavedVisit[],
  names: readonly DrawnHeadphoneName[],
  typed: DrawnHeadphoneName,
  shownId: string | null,
): SavedVisit | null {
  if (typed.baseIndex === null) {
    return null;
  }
  let start = 0;
  if (shownId !== null) {
    const shownIndex = visits.findIndex(
      (visit) => visit.savedVisitId === shownId,
    );
    start = shownIndex === -1 ? 0 : shownIndex + 1;
  }
  for (let index = start; index < visits.length; index++) {
    if (names[index]?.baseIndex === typed.baseIndex) {
      return visits[index] ?? null;
    }
  }
  return null;
}

/** The picture without its comparison: every `earlier` and `comparison` null. */
function withoutComparison(picture: ResultPicture): unknown {
  return {
    ...picture,
    comparison: null,
    floors: picture.floors.map((floor) => ({
      ...floor,
      left: { ...floor.left, earlier: null },
      right: { ...floor.right, earlier: null },
    })),
  };
}

/** The element at `index`, which the drawing guarantees is there. */
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`No element at ${String(index)}.`);
  }
  return item;
}

function thresholdOf(result: VisitEarResult): number | null {
  return result.state === "found" ? result.thresholdDb : null;
}

describe("result page CP9. The earlier visit is the right one (Universal; R20)", () => {
  it(
    "finds the newest visit saved before the shown one with the same name, and never the shown visit",
    () => {
      fc.assert(
        fc.property(listCaseArbitrary, (drawnCase) => {
          const visits = drawnCase.ids.map((savedVisitId, index) => {
            const plan: ListedPlan = at(drawnCase.listed, index);
            return savedVisitOfDrawn(
              at(drawnCase.drawnVisits, plan.visitIndex),
              {
                savedVisitId,
                wallTime: at(drawnCase.wallTimes, index),
                typedName: plan.name.typed,
                floorDb: hearingMethodConfig.floorDb,
              },
            );
          });
          // The name a visit holds is the tidy form, as the archive stores it.
          visits.forEach((visit, index) => {
            const plan: ListedPlan = at(drawnCase.listed, index);
            expect(visit.headphoneName).toBe(
              canonicalHeadphoneName(plan.name.typed),
            );
            expect(visit.headphoneName === null).toBe(
              plan.name.baseIndex === null,
            );
          });
          const shownId =
            drawnCase.shown.kind === "listed"
              ? (drawnCase.ids[drawnCase.shown.index] ?? null)
              : drawnCase.shown.kind === "unlisted"
                ? drawnCase.shown.savedVisitId
                : null;
          const list = listOf(visits);
          const found = findEarlierVisit(list, drawnCase.typed.typed, shownId);
          expect(found).toBe(
            expectedEarlier(
              visits,
              drawnCase.listed.map((plan) => plan.name),
              drawnCase.typed,
              shownId,
            ),
          );
          if (shownId !== null && found !== null) {
            expect(found.savedVisitId).not.toBe(shownId);
          }
          // The picture with the visit found names it.
          const picture = resultPicture({
            kind: "live",
            visit: at(drawnCase.drawnVisits, 0).visit,
            localDate: "2026-11-20",
            earlierVisit: found,
          });
          expect(picture.comparison?.earlierSavedVisitId ?? null).toBe(
            found?.savedVisitId ?? null,
          );
        }),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );

  it(
    "draws the earlier visit's outlines on the shown floors' own scales, only on shared rooms, and names it",
    () => {
      fc.assert(
        fc.property(
          pictureInputArbitrary,
          earlierVisitArbitrary,
          (drawnInput, earlierVisit) => {
            const withEarlier = resultPicture({
              ...drawnInput.input,
              earlierVisit,
            });
            const without = resultPicture(drawnInput.input);
            const { summary } = drawnInput.drawn.visit;

            // Without an earlier visit nothing of the comparison is there, and an earlier visit
            // changes nothing else.
            expect(without.comparison).toBeNull();
            for (const floor of without.floors) {
              expect(floor.left.earlier).toBeNull();
              expect(floor.right.earlier).toBeNull();
            }
            expect(withoutComparison(withEarlier)).toEqual(without);

            withEarlier.floors.forEach((floor, floorIndex) => {
              const shownRoom = summary.rooms[floorIndex];
              expect(shownRoom).toBeDefined();
              if (shownRoom === undefined) {
                return;
              }
              const scale = {
                searchCapDb: shownRoom.searchCapDb,
                floorDb: drawnInput.floorDb,
              };
              const earlierRoom = earlierVisit.summary.rooms.find(
                (room) => room.room.roomId === floor.room.roomId,
              );
              for (const ear of ["left", "right"] as const) {
                const wing = floor[ear];
                if (earlierRoom === undefined) {
                  expect(wing.earlier).toBeNull();
                  continue;
                }
                const earlierResult = earlierRoom[ear];
                expect(wing.earlier).not.toBeNull();
                expect(wing.earlier?.state).toBe(earlierResult.state);
                expect(wing.earlier?.outlineDepthFraction === null).toBe(
                  earlierResult.state === "unreliable",
                );
                expect(wing.earlier?.outlineDepthFraction).toBe(
                  lightDepthFraction(earlierResult, scale),
                );
                // The light and the outline are on one scale: a quieter or equal earlier
                // threshold is drawn at least as deep as the shown one.
                const shownThreshold = thresholdOf(shownRoom[ear]);
                const earlierThreshold = thresholdOf(earlierResult);
                if (shownThreshold !== null && earlierThreshold !== null) {
                  const light = wing.lightDepthFraction as number;
                  const outline = wing.earlier?.outlineDepthFraction as number;
                  if (earlierThreshold <= shownThreshold) {
                    expect(outline).toBeGreaterThanOrEqual(light);
                  }
                  if (earlierThreshold >= shownThreshold) {
                    expect(outline).toBeLessThanOrEqual(light);
                  }
                }
              }
              // Of two earlier found results on one floor, the lower threshold is at least as deep.
              const leftThreshold =
                earlierRoom === undefined
                  ? null
                  : thresholdOf(earlierRoom.left);
              const rightThreshold =
                earlierRoom === undefined
                  ? null
                  : thresholdOf(earlierRoom.right);
              if (leftThreshold !== null && rightThreshold !== null) {
                const leftOutline = floor.left.earlier
                  ?.outlineDepthFraction as number;
                const rightOutline = floor.right.earlier
                  ?.outlineDepthFraction as number;
                if (leftThreshold <= rightThreshold) {
                  expect(leftOutline).toBeGreaterThanOrEqual(rightOutline);
                }
                if (rightThreshold <= leftThreshold) {
                  expect(rightOutline).toBeGreaterThanOrEqual(leftOutline);
                }
              }
            });

            expect(withEarlier.comparison).toEqual({
              earlierSavedVisitId: earlierVisit.savedVisitId,
              line: earlierVisit.summary.visitFalseAlarmRateAboveLimit
                ? earlierVisitUnreliableLine(earlierVisit.savedOnLocalDate)
                : earlierVisitLine(earlierVisit.savedOnLocalDate),
            });
            if (earlierVisit.summary.visitFalseAlarmRateAboveLimit) {
              for (const floor of withEarlier.floors) {
                expect(floor.left.earlier?.outlineDepthFraction ?? null).toBe(
                  null,
                );
                expect(floor.right.earlier?.outlineDepthFraction ?? null).toBe(
                  null,
                );
              }
            }
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});
