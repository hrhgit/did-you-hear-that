import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createVisitArchive } from "../../src/session/create-visit-archive";
import type { StorageArea } from "../../src/session/result-page-types";
import { createFakeStorageArea } from "../../src/storage/fake-storage-area";
import {
  drawnSaveArbitrary,
  fixedWallClock,
  savedVisitIdArbitrary,
  saveThroughArchive,
  seedArbitrary,
  typedNameArbitrary,
  wallTimeArbitrary,
  type DrawnSave,
} from "./result-page-arbitraries";

// CP8. Robot mode touches nothing (Universal; result-page design.md, CP8; R8.3, D13). For any
// sequence of calls to an archive in robot mode, the function that gives local storage is never
// called, every save and delete is refused with `robotMode`, the list is `off` and empty, and
// nothing is exported, even with visits saved in the storage area.

/** Runs (design.md, "Run counts and time"). */
const runs = 200;
const timeoutMs = 120_000;
/** The most calls in one run. */
const callMaxCount = 12;

type RobotCall =
  | { readonly kind: "list" }
  | { readonly kind: "today" }
  | {
      readonly kind: "save";
      readonly visitChoice: number;
      readonly typedName: string;
    }
  | {
      readonly kind: "deleteVisit";
      readonly id: string;
      readonly useStored: boolean;
    }
  | { readonly kind: "deleteAll" }
  | {
      readonly kind: "exportVisitLog";
      readonly id: string;
      readonly useStored: boolean;
    };

const robotCallArbitrary: fc.Arbitrary<RobotCall> = fc.oneof(
  fc.constant({ kind: "list" as const }),
  fc.constant({ kind: "today" as const }),
  fc.record({
    kind: fc.constant("save" as const),
    visitChoice: fc.nat(),
    typedName: typedNameArbitrary,
  }),
  fc.record({
    kind: fc.constant("deleteVisit" as const),
    id: savedVisitIdArbitrary,
    useStored: fc.boolean(),
  }),
  fc.constant({ kind: "deleteAll" as const }),
  fc.record({
    kind: fc.constant("exportVisitLog" as const),
    id: savedVisitIdArbitrary,
    useStored: fc.boolean(),
  }),
);

describe("result page CP8. Robot mode touches nothing (Universal; R8.3)", () => {
  it(
    "never calls for local storage, refuses every save and delete, lists nothing and exports nothing",
    () => {
      fc.assert(
        fc.property(
          fc.array(drawnSaveArbitrary, { minLength: 1, maxLength: 2 }),
          fc.array(robotCallArbitrary, { maxLength: callMaxCount }),
          seedArbitrary,
          wallTimeArbitrary,
          (saves, calls, seed, wallTime) => {
            const written = saveThroughArchive(saves, seed);
            const storedIds = written.saved.map((visit) => visit.savedVisitId);
            const area = createFakeStorageArea({
              initialItems: written.area.items(),
            });
            let storageCalls = 0;
            const localStorage = (): StorageArea => {
              storageCalls += 1;
              return area;
            };
            const archive = createVisitArchive({
              localStorage,
              wallClock: fixedWallClock(wallTime),
              seed,
              mode: "robot",
            });
            expect(archive.mode).toBe("robot");

            for (const call of calls) {
              switch (call.kind) {
                case "list": {
                  const list = archive.list();
                  expect(list.state).toBe("off");
                  expect(list.visits).toEqual([]);
                  expect(list.unreadableCount).toBe(0);
                  expect(list.canSave).toBe(false);
                  expect(list.canDeleteAll).toBe(false);
                  break;
                }
                case "today":
                  expect(archive.today()).toBe(wallTime.localDate);
                  break;
                case "save": {
                  const save = saves[
                    call.visitChoice % saves.length
                  ] as DrawnSave;
                  expect(
                    archive.save(save.drawn.visit, call.typedName),
                  ).toMatchObject({
                    saved: false,
                    reason: "robotMode",
                  });
                  break;
                }
                case "deleteVisit": {
                  const id = call.useStored
                    ? (storedIds[0] ?? call.id)
                    : call.id;
                  expect(archive.deleteVisit(id)).toMatchObject({
                    deleted: false,
                    reason: "robotMode",
                  });
                  break;
                }
                case "deleteAll":
                  expect(archive.deleteAll()).toMatchObject({
                    deleted: false,
                    reason: "robotMode",
                  });
                  break;
                case "exportVisitLog": {
                  const id = call.useStored
                    ? (storedIds[0] ?? call.id)
                    : call.id;
                  expect(archive.exportVisitLog(id)).toBeNull();
                  break;
                }
              }
            }
            expect(archive.list().state).toBe("off");
            expect(storageCalls).toBe(0);
            expect(area.calls).toEqual([]);
            expect(area.items()).toEqual(written.area.items());
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});
