import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { resultPageConfig } from "../../src/config/result-page-config";
import { canonicalHeadphoneName } from "../../src/session/canonical-headphone-name";
import { createVisitArchive } from "../../src/session/create-visit-archive";
import type { VisitLog, WallTime } from "../../src/session/result-page-types";
import { createFakeStorageArea } from "../../src/storage/fake-storage-area";
import { savedVisitsKey } from "../../src/storage/saved-visits-key";
import {
  drawnVisitArbitrary,
  seedArbitrary,
  settableWallClock,
  typedNameArbitrary,
  wallTimeArbitrary,
  type DrawnVisit,
} from "./result-page-arbitraries";

// CP5. What is saved is read back (Universal; result-page design.md, CP5; R4, R5, R6.1, R9,
// R11). Up to 8 saves of drawn visits, some of the same visit log again, with drawn typed names,
// wall times and archive seeds, on a working fake storage area: the list holds exactly what was
// saved, newest first, as it was saved.

/** Runs (design.md, "Run counts and time"). */
const runs = 200;
const timeoutMs = 120_000;
/** The most saves in one run. */
const saveMaxCount = 8;
/** The most distinct visits one run saves. */
const visitMaxCount = 5;

/** What a visit saved so far should look like when it is listed. */
interface ExpectedVisit {
  readonly savedVisitId: string;
  readonly drawn: DrawnVisit;
  readonly firstWallTime: WallTime;
  readonly headphoneName: string | null;
}

function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const saveStepArbitrary = fc.record({
  visitChoice: fc.nat(),
  typedName: typedNameArbitrary,
  wallTime: wallTimeArbitrary,
});

describe("result page CP5. What is saved is read back (Universal; R4, R5, R6.1, R9, R11)", () => {
  it(
    "lists every visit saved, newest first, as it was saved, and nothing else",
    () => {
      fc.assert(
        fc.property(
          fc.array(drawnVisitArbitrary(), {
            minLength: 1,
            maxLength: visitMaxCount,
          }),
          fc.array(saveStepArbitrary, {
            minLength: 1,
            maxLength: saveMaxCount,
          }),
          seedArbitrary,
          seedArbitrary,
          (visits, steps, archiveSeed, secondSeed) => {
            const area = createFakeStorageArea();
            const clock = settableWallClock(
              (steps[0] as { wallTime: WallTime }).wallTime,
            );
            const archive = createVisitArchive({
              localStorage: () => area,
              wallClock: clock,
              seed: archiveSeed,
              mode: "keep",
            });
            const expected: ExpectedVisit[] = [];
            const byLog = new Map<VisitLog, ExpectedVisit>();

            for (const step of steps) {
              const drawn = visits[
                step.visitChoice % visits.length
              ] as DrawnVisit;
              clock.set(step.wallTime);
              const outcome = archive.save(drawn.visit, step.typedName);
              const tidy = canonicalHeadphoneName(step.typedName);
              const before = byLog.get(drawn.visit.visitLog);

              if (
                tidy !== null &&
                Array.from(tidy).length >
                  resultPageConfig.headphoneNameMaxCharacterCount
              ) {
                expect(outcome).toMatchObject({
                  saved: false,
                  reason: "nameTooLong",
                });
              } else {
                expect(outcome.saved).toBe(true);
                if (!outcome.saved) {
                  return;
                }
                if (before === undefined) {
                  expect(outcome.renamed).toBe(false);
                  const added: ExpectedVisit = {
                    savedVisitId: outcome.savedVisit.savedVisitId,
                    drawn,
                    firstWallTime: step.wallTime,
                    headphoneName: tidy,
                  };
                  expected.push(added);
                  byLog.set(drawn.visit.visitLog, added);
                } else {
                  expect(outcome.renamed).toBe(before.headphoneName !== tidy);
                  expect(outcome.savedVisit.savedVisitId).toBe(
                    before.savedVisitId,
                  );
                  const renamed = { ...before, headphoneName: tidy };
                  expected[expected.indexOf(before)] = renamed;
                  byLog.set(drawn.visit.visitLog, renamed);
                }
              }

              const list = archive.list();
              expect(list.state).toBe("ready");
              expect(list.unreadableCount).toBe(0);
              expect(
                list.visits.map((listing) => listing.visit.savedVisitId),
              ).toEqual(
                [...expected].reverse().map((visit) => visit.savedVisitId),
              );
              [...expected].reverse().forEach((visit, index) => {
                const listed = list.visits[index]?.visit;
                expect(listed).toBeDefined();
                if (listed === undefined) {
                  return;
                }
                expect(listed.summary).toEqual(
                  roundTrip(visit.drawn.visit.summary),
                );
                expect(listed.visitLog).toEqual(
                  roundTrip(visit.drawn.visit.visitLog),
                );
                expect(listed.headphoneName).toBe(visit.headphoneName);
                expect(listed.savedAtEpochMs).toBe(visit.firstWallTime.epochMs);
                expect(listed.savedOnLocalDate).toBe(
                  visit.firstWallTime.localDate,
                );
                expect(listed.visitType).toBe(
                  visit.drawn.visit.visitLog.visitType,
                );
                expect(listed.floorDb).toBe(hearingMethodConfig.floorDb);
                expect(listed.swappedRepeatDifferenceDb).toBe(
                  hearingMethodConfig.swappedRepeatDifferenceDb,
                );
              });
              if (outcome.saved) {
                const listing = list.visits.find(
                  (entry) =>
                    entry.visit.savedVisitId ===
                    outcome.savedVisit.savedVisitId,
                );
                expect(outcome.savedVisit).toEqual(listing?.visit);
              }
            }

            const list = archive.list();
            const second = createVisitArchive({
              localStorage: () => area,
              wallClock: clock,
              seed: secondSeed,
              mode: "keep",
            });
            expect(second.list().visits).toEqual(list.visits);
            for (const listing of list.visits) {
              const exported = archive.exportVisitLog(
                listing.visit.savedVisitId,
              );
              expect(exported).not.toBeNull();
              expect(JSON.parse(exported as string)).toEqual(
                listing.visit.visitLog,
              );
            }
            for (const key of Object.keys(area.items())) {
              expect(key).toBe(savedVisitsKey);
            }
            for (const call of area.calls) {
              expect(call.key).toBe(savedVisitsKey);
            }
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});
