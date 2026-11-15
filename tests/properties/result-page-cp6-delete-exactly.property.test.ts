import fc from "fast-check";
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";
import type { VisitArchive } from "../../src/session/result-page-types";
import type { FakeStorageArea } from "../../src/storage/fake-storage-area";
import { savedVisitsKey } from "../../src/storage/saved-visits-key";
import {
  drawnSaveArbitrary,
  otherItemsArbitrary,
  saveThroughArchive,
  savedVisitIdArbitrary,
  seedArbitrary,
  storedEntries,
  storedValueText,
  unreadableEntryArbitrary,
} from "./result-page-arbitraries";

// CP6. Deleting removes exactly what was asked (Universal; result-page design.md, CP6; R6, R10).
// A stored state of saved visits, unreadable entries and other keys of local storage, then
// deletes of listed and unlisted ids and at most one "delete all": each removes exactly what it
// names, and nothing else.

/** Runs (design.md, "Run counts and time"). */
const runs = 300;
const timeoutMs = 120_000;
/** The most visits saved before the deletes. */
const savedMaxCount = 5;
/** The most deletes drawn. */
const deleteMaxCount = 8;

/** An unreadable entry, or an exact copy of the saved entry at `of` (whose id an earlier entry then holds). */
const unreadableArbitrary = fc.oneof(
  unreadableEntryArbitrary.map((entry) => ({ kind: "entry" as const, entry })),
  fc.nat().map((of) => ({ kind: "copy" as const, of })),
);

type DeleteStep =
  | { readonly kind: "listed"; readonly choice: number }
  | {
      readonly kind: "unlisted";
      readonly id: string;
      readonly useUnreadable: boolean;
    }
  | { readonly kind: "all" };

const deleteStepArbitrary: fc.Arbitrary<DeleteStep> = fc.oneof(
  {
    arbitrary: fc.record({
      kind: fc.constant("listed" as const),
      choice: fc.nat(),
    }),
    weight: 3,
  },
  {
    arbitrary: fc.record({
      kind: fc.constant("unlisted" as const),
      id: savedVisitIdArbitrary,
      useUnreadable: fc.boolean(),
    }),
    weight: 2,
  },
  { arbitrary: fc.constant({ kind: "all" as const }), weight: 1 },
);

function idOf(entry: unknown): unknown {
  return typeof entry === "object" && entry !== null && !Array.isArray(entry)
    ? (entry as Record<string, unknown>).savedVisitId
    : undefined;
}

function withoutKey(
  items: Readonly<Record<string, string>>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(items).filter(([key]) => key !== savedVisitsKey),
  );
}

/** Deletes one listed visit and checks that exactly one entry with its id left the value. */
function deleteListed(
  archive: VisitArchive,
  area: FakeStorageArea,
  savedVisitId: string,
): void {
  const before = area.items();
  const entriesBefore = storedEntries(before) ?? [];
  const outcome = archive.deleteVisit(savedVisitId);
  expect(outcome).toMatchObject({ deleted: true, deletedCount: 1 });
  const after = area.items();
  expect(withoutKey(after)).toEqual(withoutKey(before));
  const entriesAfter = storedEntries(after);
  if (entriesBefore.length === 1) {
    expect(Object.hasOwn(after, savedVisitsKey)).toBe(false);
    return;
  }
  expect(entriesAfter).not.toBeNull();
  const remaining = entriesAfter ?? [];
  expect(remaining).toHaveLength(entriesBefore.length - 1);
  const removedAt = entriesBefore.findIndex(
    (entry, position) =>
      idOf(entry) === savedVisitId &&
      isDeepStrictEqual(
        entriesBefore.filter((_entry, index) => index !== position),
        remaining,
      ),
  );
  expect(removedAt).toBeGreaterThanOrEqual(0);
}

describe("result page CP6. Deleting removes exactly what was asked (Universal; R6, R10)", () => {
  it(
    "removes the one listed visit asked for, nothing for an unlisted id, and only the key for delete all",
    () => {
      fc.assert(
        fc.property(
          fc.array(drawnSaveArbitrary, { maxLength: savedMaxCount }),
          fc.array(fc.tuple(unreadableArbitrary, fc.nat()), { maxLength: 3 }),
          otherItemsArbitrary,
          seedArbitrary,
          fc.array(deleteStepArbitrary, { maxLength: deleteMaxCount }),
          fc.boolean(),
          (
            saves,
            unreadables,
            otherItems,
            archiveSeed,
            steps,
            deleteEveryListed,
          ) => {
            const { area: writtenArea } = saveThroughArchive(
              saves,
              archiveSeed,
            );
            const entries = [...(storedEntries(writtenArea.items()) ?? [])];
            for (const [unreadable, at] of unreadables) {
              const entry =
                unreadable.kind === "entry"
                  ? unreadable.entry
                  : entries.length > 0
                    ? entries[unreadable.of % entries.length]
                    : null;
              entries.splice(at % (entries.length + 1), 0, entry);
            }
            const initialItems: Record<string, string> = {
              ...otherItems,
              ...(entries.length > 0
                ? { [savedVisitsKey]: storedValueText(entries) }
                : {}),
            };
            const { area, archive } = saveThroughArchive(
              [],
              (archiveSeed + 1) % 0x100000000,
              initialItems,
            );

            let deletedAll = false;
            for (const step of steps) {
              const list = archive.list();
              expect(list.state).toBe("ready");
              const listedIds = list.visits.map(
                (listing) => listing.visit.savedVisitId,
              );
              if (step.kind === "listed") {
                const id =
                  listedIds[step.choice % Math.max(1, listedIds.length)];
                if (id !== undefined) {
                  deleteListed(archive, area, id);
                }
              } else if (step.kind === "unlisted") {
                const unreadableIds = (storedEntries(area.items()) ?? [])
                  .map(idOf)
                  .filter(
                    (id): id is string =>
                      typeof id === "string" && !listedIds.includes(id),
                  );
                const id =
                  step.useUnreadable && unreadableIds.length > 0
                    ? (unreadableIds[0] as string)
                    : step.id;
                if (listedIds.includes(id)) {
                  continue;
                }
                const before = area.items();
                const outcome = archive.deleteVisit(id);
                expect(outcome).toMatchObject({
                  deleted: false,
                  reason: "notFound",
                });
                expect(area.items()).toEqual(before);
              } else if (!deletedAll) {
                deletedAll = true;
                const before = area.items();
                const outcome = archive.deleteAll();
                expect(outcome).toMatchObject({
                  deleted: true,
                  deletedCount: list.visits.length,
                });
                expect(area.items()).toEqual(withoutKey(before));
              }
            }

            if (deleteEveryListed) {
              for (
                let left = archive.list();
                left.visits.length > 0;
                left = archive.list()
              ) {
                deleteListed(
                  archive,
                  area,
                  (left.visits[0] as { visit: { savedVisitId: string } }).visit
                    .savedVisitId,
                );
              }
              const list = archive.list();
              if (list.unreadableCount === 0) {
                expect(Object.hasOwn(area.items(), savedVisitsKey)).toBe(false);
              }
            }
            expect(withoutKey(area.items())).toEqual(otherItems);
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});
