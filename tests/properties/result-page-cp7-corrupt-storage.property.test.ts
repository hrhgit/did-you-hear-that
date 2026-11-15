import fc from "fast-check";
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";
import { resultPageConfig } from "../../src/config/result-page-config";
import { canonicalHeadphoneName } from "../../src/session/canonical-headphone-name";
import { createVisitArchive } from "../../src/session/create-visit-archive";
import type {
  DeleteOutcome,
  SavedVisit,
  SaveOutcome,
} from "../../src/session/result-page-types";
import { resultPicture } from "../../src/session/result-picture";
import { savedVisitsKey } from "../../src/storage/saved-visits-key";
import {
  changedValueText,
  drawnSaveArbitrary,
  fixedWallClock,
  readableValueEntryCount,
  saveThroughArchive,
  savedVisitIdArbitrary,
  seedArbitrary,
  storageBehaviourArbitrary,
  storageWith,
  storedValueChangeArbitrary,
} from "./result-page-arbitraries";

// CP7. Corrupt or refusing storage never throws and never shows a wrong picture (Universal;
// result-page design.md, CP7; R5, R7). The value an archive wrote, changed in any of the ways of
// "A stored value", under any storage behaviour: no method throws, every listed visit is one that
// was saved, the counts fit the value, a refused or full write changes nothing, and after
// "delete all" on a working area a save succeeds.

/** Runs (design.md, "Run counts and time"). */
const runs = 500;
const timeoutMs = 120_000;
/** The most visits the archive writes before the value is changed. */
const savedMaxCount = 4;

/** Whether a typed name is short enough to be saved once tidied. */
function fitsTheLimit(typedName: string): boolean {
  const tidy = canonicalHeadphoneName(typedName);
  return (
    tidy === null ||
    Array.from(tidy).length <= resultPageConfig.headphoneNameMaxCharacterCount
  );
}

function isRefusedOrFull(outcome: SaveOutcome | DeleteOutcome): boolean {
  if ("saved" in outcome) {
    return (
      !outcome.saved &&
      (outcome.reason === "refused" || outcome.reason === "full")
    );
  }
  return !outcome.deleted && outcome.reason === "refused";
}

describe("result page CP7. Corrupt or refusing storage never throws and never shows a wrong picture (Universal; R5, R7)", () => {
  it(
    "lists only visits that were saved, counts no more entries than the value holds, and writes nothing it was refused",
    () => {
      fc.assert(
        fc.property(
          fc.array(drawnSaveArbitrary, {
            minLength: 1,
            maxLength: savedMaxCount,
          }),
          seedArbitrary,
          storedValueChangeArbitrary,
          storageBehaviourArbitrary,
          drawnSaveArbitrary,
          savedVisitIdArbitrary,
          fc.nat(),
          (
            saves,
            archiveSeed,
            change,
            behaviour,
            nextSave,
            otherId,
            deleteChoice,
          ) => {
            const written = saveThroughArchive(saves, archiveSeed);
            const savedVisits: SavedVisit[] = [...written.saved];
            const text = written.area.items()[savedVisitsKey];
            // Every name drawn for the saves may be too long, and then nothing was written.
            fc.pre(text !== undefined);
            const changed = changedValueText(text, change);
            const { area, localStorage } = storageWith(behaviour, {
              [savedVisitsKey]: changed,
            });
            const archive = createVisitArchive({
              localStorage,
              wallClock: fixedWallClock(nextSave.wallTime),
              seed: (archiveSeed + 1) % 0x100000000,
              mode: "keep",
            });

            const checkList = () => {
              const list = archive.list();
              for (const listing of list.visits) {
                expect(
                  savedVisits.some((saved) =>
                    isDeepStrictEqual(saved, listing.visit),
                  ),
                ).toBe(true);
                resultPicture({
                  kind: "saved",
                  savedVisit: listing.visit,
                  earlierVisit: null,
                });
                archive.exportVisitLog(listing.visit.savedVisitId);
              }
              return list;
            };

            const first = checkList();
            const entryCount = readableValueEntryCount(changed);
            expect(
              first.visits.length + first.unreadableCount,
            ).toBeLessThanOrEqual(entryCount ?? 0);
            if (entryCount === null) {
              expect(first.visits).toHaveLength(0);
              expect(first.unreadableCount).toBe(0);
            }
            archive.today();
            archive.exportVisitLog(otherId);

            const beforeSave = area.items();
            const saved = archive.save(
              nextSave.drawn.visit,
              nextSave.typedName,
            );
            if (isRefusedOrFull(saved)) {
              expect(area.items()).toEqual(beforeSave);
            }
            if (saved.saved) {
              savedVisits.push(saved.savedVisit);
            }
            const second = checkList();
            if (saved.saved) {
              expect(second.visits[0]?.visit).toEqual(saved.savedVisit);
            }

            const target =
              second.visits.length > 0 && deleteChoice % 2 === 0
                ? (second.visits[deleteChoice % second.visits.length]?.visit
                    .savedVisitId ?? otherId)
                : otherId;
            const beforeDelete = area.items();
            const deleted = archive.deleteVisit(target);
            if (isRefusedOrFull(deleted)) {
              expect(area.items()).toEqual(beforeDelete);
            }
            checkList();

            const beforeDeleteAll = area.items();
            const deletedAll = archive.deleteAll();
            if (isRefusedOrFull(deletedAll)) {
              expect(area.items()).toEqual(beforeDeleteAll);
            }
            checkList();

            if (behaviour.kind === "working") {
              expect(deletedAll.deleted).toBe(true);
              const again = archive.save(
                nextSave.drawn.visit,
                fitsTheLimit(nextSave.typedName) ? nextSave.typedName : "",
              );
              expect(again.saved).toBe(true);
              if (again.saved) {
                savedVisits.push(again.savedVisit);
                const last = checkList();
                expect(last.visits.map((listing) => listing.visit)).toEqual([
                  again.savedVisit,
                ]);
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
