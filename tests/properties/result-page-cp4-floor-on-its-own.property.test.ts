import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type {
  ResultPictureInput,
  WallTime,
} from "../../src/session/result-page-types";
import { resultPicture } from "../../src/session/result-picture";
import { visitRooms } from "../../src/session/visit-rooms";
import {
  drawnVisitArbitrary,
  drawnVisitOf,
  roomPlanArbitrary,
  savedFloorMaxDb,
  savedFloorMinDb,
  savedVisitOfDrawn,
  wallTimeArbitrary,
  type DrawnVisit,
  type RoomPlan,
} from "./result-page-arbitraries";

// CP4. A floor is drawn from its own floor alone (Universal; result-page design.md, CP4; R14.1 to
// R14.3). Replacing the ear results, counts and caps of every other floor, while the visit-level
// marking stays the same, leaves the floor as it was; and the floors are in visit order whatever
// the results.

/** Runs (design.md, "Run counts and time"). */
const runs = 500;
const timeoutMs = 120_000;

/** The most rooms of a visit. */
const roomMaxCount = visitRooms("full").length;

function inputOf(
  drawn: DrawnVisit,
  live: boolean,
  wallTime: WallTime,
  floorDb: number,
): ResultPictureInput {
  return live
    ? {
        kind: "live",
        visit: drawn.visit,
        localDate: wallTime.localDate,
        earlierVisit: null,
      }
    : {
        kind: "saved",
        savedVisit: savedVisitOfDrawn(drawn, {
          savedVisitId: "0badf00d",
          wallTime,
          typedName: "Zorbex",
          floorDb,
        }),
        earlierVisit: null,
      };
}

describe("result page CP4. A floor is drawn from its own floor alone (Universal; R14.1 to R14.3)", () => {
  it(
    "gives a floor the same whatever the other floors hold, as long as the visit-level marking is the same",
    () => {
      fc.assert(
        fc.property(
          drawnVisitArbitrary({ anyDifference: true }),
          fc.nat(),
          fc.array(roomPlanArbitrary, {
            minLength: roomMaxCount,
            maxLength: roomMaxCount,
          }),
          fc.boolean(),
          wallTimeArbitrary,
          fc.integer({ min: savedFloorMinDb, max: savedFloorMaxDb }),
          (drawn, floorChoice, replacements, live, wallTime, floorDb) => {
            const { plan } = drawn;
            const kept = floorChoice % plan.rooms.length;
            const replaced = (keepCounts: boolean): DrawnVisit =>
              drawnVisitOf(
                {
                  ...plan,
                  rooms: plan.rooms.map((room, index): RoomPlan => {
                    const replacement = replacements[index] as RoomPlan;
                    if (index === kept) {
                      return room;
                    }
                    return keepCounts
                      ? {
                          ...replacement,
                          noSoundTrialCount: room.noSoundTrialCount,
                          falseAlarmCount: room.falseAlarmCount,
                        }
                      : replacement;
                  }),
                },
                drawn.settings,
              );
            const marked = drawn.visit.summary.visitFalseAlarmRateAboveLimit;
            let other = replaced(false);
            if (other.visit.summary.visitFalseAlarmRateAboveLimit !== marked) {
              other = replaced(true);
            }
            expect(other.visit.summary.visitFalseAlarmRateAboveLimit).toBe(
              marked,
            );

            const first = resultPicture(
              inputOf(drawn, live, wallTime, floorDb),
            );
            const second = resultPicture(
              inputOf(other, live, wallTime, floorDb),
            );
            expect(second.floors[kept]).toEqual(first.floors[kept]);

            const rooms = visitRooms(plan.visitType);
            expect(first.floors.map((floor) => floor.room)).toEqual(rooms);
            expect(second.floors.map((floor) => floor.room)).toEqual(rooms);
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});
