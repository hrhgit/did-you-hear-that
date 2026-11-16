import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { resultPageCopy } from "../../src/copy/result-page-copy";
import { swappedRepeatCopy } from "../../src/copy/swapped-repeat-copy";
import { canonicalHeadphoneName } from "../../src/session/canonical-headphone-name";
import { createVisitArchive } from "../../src/session/create-visit-archive";
import { findEarlierVisit } from "../../src/session/find-earlier-visit";
import type {
  ResultPicture,
  SavedVisit,
  StorageArea,
  VisitArchive,
  VisitToSave,
} from "../../src/session/result-page-types";
import { resultPicture } from "../../src/session/result-picture";
import {
  parseSavedVisitPayload,
  savedVisitPayloadJson,
} from "../../src/session/saved-visit-payload";
import type { SwappedRepeatRun } from "../../src/session/visit-flow-types";
import { createFakeStorageArea } from "../../src/storage/fake-storage-area";
import { savedVisitsKey } from "../../src/storage/saved-visits-key";
import {
  changedValueText,
  localDateArbitrary,
  seedArbitrary,
  settableWallClock,
  storageBehaviourArbitrary,
  storageWith,
  storedValueChangeArbitrary,
} from "./result-page-arbitraries";
import type { SavedRepeatVisit } from "./swapped-repeat-arbitraries";
import {
  offeredFloorsOf,
  savedRepeatPayloadJson,
  savedRepeatVisitArbitrary,
} from "./swapped-repeat-arbitraries";

// CP11. Saved visits and the earlier visit (Universal; swapped-repeat design.md, CP11; R13).
// Generated: a saved visit with zero to three records on its offered floors, written with or
// without the key, stored values changed as the result page's CP7 changes them, and pairs of
// saved visits with the same headphone name, each with or without records. Then:
// - a visit with records written and read back gives records that deep-equal their JSON round
//   trip; a payload without the key reads with [] and every other field as before this spec; a
//   visit without records is written as before this spec, byte for byte;
// - a payload whose records break a rule of "Checking a payload" is unreadable, and reading never
//   throws on any JSON value in place of the records or of one of their fields;
// - findEarlierVisit and the `comparison` and `earlier` fields of resultPicture are the same
//   whether or not either visit has records;
// - a visit saved, repeated and saved again keeps its id, date and name, reads with its records
//   and gives savedAgainLine, and a save that adds nothing only renames, as before (Q5, decided by
//   the owner on 2026-11-15); `savedCopyLacksRepeats` is true exactly when this page saved the
//   log, its saved copy is listed and the visit holds a record whose run number that copy lacks,
//   false after every save that gives saved: true, false in robot mode, and never throws, also on
//   changed stored values (its sub-question as the owner's coordinator chose it on 2026-11-15; the
//   owner may reverse it).

/**
 * Runs (design.md, "Run counts and time"; Q9, decided by the owner's coordinator on 2026-11-16,
 * at the owner's request).
 */
const runs = 300;
const timeoutMs = 120_000;

/** The names a visitor types in the archive scripts: two names, one of them typed untidily, and none. */
const typedNames = ["Buds", "Big cans", "  buds  ", ""] as const;
/** The most steps of an archive script. */
const scriptMaxStepCount = 10;
/** The wall time of the archive scripts, moved on by each save. */
const scriptStartEpochMs = 1795180800000;
const dayMs = 86_400_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- payloads are changed by hand here
type Json = any;

const roundTrip = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return true;
  }
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

/** The visit to save: with its records when they are written with the key, otherwise without. */
function visitToSave(saved: SavedRepeatVisit): VisitToSave {
  return saved.withKey && saved.records.length > 0
    ? { ...saved.drawn.visit, swappedRepeats: saved.records }
    : saved.drawn.visit;
}

// ─── Records that break a rule ───────────────────────────────────────────────────────────

/** One change to a payload's records that breaks a rule of "Checking a payload", by rule. */
type Breaker = (payload: Json, at: number, roomCount: number) => void;

const outcomes = ["followsEar", "followsEarpiece", "unclear"] as const;

const breakers: readonly (readonly [string, Breaker])[] = [
  ["1: a list that is no array", (payload) => (payload.swappedRepeats = {})],
  [
    "1: a record that is no object",
    (payload) => payload.swappedRepeats.push(null),
  ],
  [
    "1: another format",
    (payload, at) => (payload.swappedRepeats[at].formatVersion = 2),
  ],
  [
    "2: no room of the log",
    (payload, at, roomCount) =>
      (payload.swappedRepeats[at].roomIndex = roomCount),
  ],
  [
    "2: two records of one floor",
    (payload, at) => {
      const runNumbers: number[] = payload.swappedRepeats.map(
        (run: Json) => run.runNumber,
      );
      payload.swappedRepeats.push({
        ...payload.swappedRepeats[at],
        runNumber: Math.max(...runNumbers) + 1,
      });
    },
  ],
  [
    "3: run number 0",
    (payload, at) => (payload.swappedRepeats[at].runNumber = 0),
  ],
  [
    "3: run numbers that do not rise",
    (payload) =>
      payload.swappedRepeats.push({
        ...payload.swappedRepeats.at(-1),
        runNumber: payload.swappedRepeats.at(-1).runNumber,
      }),
  ],
  [
    "4: another calibration",
    (payload, at) => (payload.swappedRepeats[at].calibrationIndex += 1),
  ],
  [
    "5: earpieces as marked",
    (payload, at) =>
      (payload.swappedRepeats[at].earpieceOnEar = {
        left: "left",
        right: "right",
      }),
  ],
  [
    "6: no list of trials",
    (payload, at) => delete payload.swappedRepeats[at].trials,
  ],
  [
    "6: a last swap check heard on the left",
    (payload, at) =>
      (payload.swappedRepeats[at].swapChecks.at(-1).judgement = "notSwapped"),
  ],
  [
    "6: a sound on its own ear's earpiece",
    (payload, at) =>
      payload.swappedRepeats[at].trials.push({
        kind: "sound",
        ear: "left",
        earpiece: "left",
      }),
  ],
  [
    "6: a no-sound trial with an earpiece",
    (payload, at) =>
      payload.swappedRepeats[at].trials.push({
        kind: "noSound",
        earpiece: "right",
      }),
  ],
  [
    "6: an ignored answer on its own side's earpiece",
    (payload, at) =>
      payload.swappedRepeats[at].ignoredAnswers.push({
        side: "right",
        earpiece: "right",
      }),
  ],
  [
    "7: an abandoned attempt",
    (payload, at) => (payload.swappedRepeats[at].attempt.ending = "abandoned"),
  ],
  [
    "8: an unknown state",
    (payload, at) => (payload.swappedRepeats[at].left.state = "loud"),
  ],
  [
    "8: a wrong difference",
    (payload, at) => {
      const run = payload.swappedRepeats[at];
      run.rightMinusLeftDb =
        run.rightMinusLeftDb === null ? 0 : run.rightMinusLeftDb + 5;
    },
  ],
  [
    "9: another first difference",
    (payload, at) => (payload.swappedRepeats[at].firstRightMinusLeftDb += 1),
  ],
  [
    "10: half the limit 0",
    (payload, at) => (payload.swappedRepeats[at].unclearBelowDb = 0),
  ],
  [
    "11: an outcome that does not follow from the record",
    (payload, at) => {
      const run = payload.swappedRepeats[at];
      const index = outcomes.indexOf(run.outcome);
      run.outcome = outcomes[(index + 1) % outcomes.length];
    },
  ],
];

// ─── Pictures with and without records ───────────────────────────────────────────────────

/** What the earlier visit gives a picture: its comparison line and the earlier marks of every floor. */
function earlierPart(picture: ResultPicture) {
  return {
    comparison: picture.comparison,
    earlier: picture.floors.map((floor) => [
      floor.left.earlier,
      floor.right.earlier,
    ]),
  };
}

// ─── Archive scripts ─────────────────────────────────────────────────────────────────────

/** One step of an archive script on the page that shows one live visit. */
type ScriptStep =
  | { readonly kind: "save"; readonly typedName: string }
  | { readonly kind: "addRecord" }
  | { readonly kind: "deleteCopy" }
  | { readonly kind: "deleteAll" };

const scriptStepArbitrary: fc.Arbitrary<ScriptStep> = fc.oneof(
  {
    arbitrary: fc.record({
      kind: fc.constant("save" as const),
      typedName: fc.constantFrom(...typedNames),
    }),
    weight: 3,
  },
  { arbitrary: fc.constant({ kind: "addRecord" as const }), weight: 3 },
  fc.constant({ kind: "deleteCopy" as const }),
  fc.constant({ kind: "deleteAll" as const }),
);

/** The rule of `savedCopyLacksRepeats`, from the archive's own list and the id this page saved the log under. */
function lacksByRule(
  archive: VisitArchive,
  savedVisitId: string | null,
  live: VisitToSave,
): boolean {
  if (savedVisitId === null) {
    return false;
  }
  const list = archive.list();
  const copy =
    list.state === "ready"
      ? list.visits.find(
          (listing) => listing.visit.savedVisitId === savedVisitId,
        )?.visit
      : undefined;
  if (copy === undefined) {
    return false;
  }
  const savedRunNumbers = new Set(
    copy.swappedRepeats.map((run) => run.runNumber),
  );
  return (live.swappedRepeats ?? []).some(
    (run) => !savedRunNumbers.has(run.runNumber),
  );
}

describe("swapped repeat CP11: saved visits and the earlier visit", () => {
  it(
    "writes a visit without records as before, and reads records back deep-equal to their JSON round trip, and a payload without the key with none",
    () => {
      fc.assert(
        fc.property(savedRepeatVisitArbitrary, (saved) => {
          const { visit } = saved.drawn;
          const settings = {
            formatVersion: 1,
            floorDb: hearingMethodConfig.floorDb,
            swappedRepeatDifferenceDb:
              hearingMethodConfig.swappedRepeatDifferenceDb,
          };
          expect(savedVisitPayloadJson(visit)).toBe(
            JSON.stringify({
              ...settings,
              summary: visit.summary,
              visitLog: visit.visitLog,
            }),
          );
          expect(savedVisitPayloadJson({ ...visit, swappedRepeats: [] })).toBe(
            savedVisitPayloadJson(visit),
          );
          expect(roundTrip(saved.records)).toEqual(saved.records);
          expect(offeredFloorsOf(visit)).toEqual(
            expect.arrayContaining(saved.records.map((run) => run.roomIndex)),
          );

          const parsed = parseSavedVisitPayload(
            savedRepeatPayloadJson(saved),
            visit.visitLog.visitType,
          );
          expect(parsed).toEqual({
            ...settings,
            summary: roundTrip(visit.summary),
            visitLog: roundTrip(visit.visitLog),
            swappedRepeats: saved.withKey ? roundTrip(saved.records) : [],
          });
          expect(isDeepFrozen(parsed)).toBe(true);
        }),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );

  it(
    "makes a payload whose records break a rule unreadable, and never throws on any JSON value in their place",
    () => {
      fc.assert(
        fc.property(
          savedRepeatVisitArbitrary.filter(
            (saved) => saved.withKey && saved.records.length > 0,
          ),
          fc.integer({ min: 0, max: breakers.length - 1 }),
          fc.nat(),
          fc.jsonValue(),
          fc.nat(),
          (saved, breakerIndex, at, value, fieldChoice) => {
            const { visit } = saved.drawn;
            const { visitType } = visit.visitLog;
            const text = savedRepeatPayloadJson(saved);
            expect(parseSavedVisitPayload(text, visitType)).not.toBeNull();

            const [, breaker] = breakers[breakerIndex]!;
            const broken: Json = JSON.parse(text);
            breaker(
              broken,
              at % saved.records.length,
              visit.visitLog.rooms.length,
            );
            const brokenText = JSON.stringify(broken);
            expect(() =>
              parseSavedVisitPayload(brokenText, visitType),
            ).not.toThrow();
            expect(parseSavedVisitPayload(brokenText, visitType)).toBeNull();

            const replaced: Json = JSON.parse(text);
            const record = replaced.swappedRepeats[at % saved.records.length];
            const fields = Object.keys(record);
            record[fields[fieldChoice % fields.length]!] = value;
            expect(() =>
              parseSavedVisitPayload(JSON.stringify(replaced), visitType),
            ).not.toThrow();
            const listReplaced: Json = {
              ...JSON.parse(text),
              swappedRepeats: value,
            };
            expect(() =>
              parseSavedVisitPayload(JSON.stringify(listReplaced), visitType),
            ).not.toThrow();
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );

  it(
    "finds the same earlier visit and gives the same comparison and outlines whether or not either visit has records",
    () => {
      fc.assert(
        fc.property(
          savedRepeatVisitArbitrary,
          savedRepeatVisitArbitrary,
          seedArbitrary,
          fc.constantFrom(...typedNames.filter((name) => name.trim() !== "")),
          localDateArbitrary,
          (earlier, shown, archiveSeed, typedName, localDate) => {
            const saveBoth = (withRecords: boolean) => {
              const area = createFakeStorageArea();
              const clock = settableWallClock({
                epochMs: scriptStartEpochMs,
                localDate: "2026-11-20",
              });
              const archive = createVisitArchive({
                localStorage: () => area,
                wallClock: clock,
                seed: archiveSeed,
                mode: "keep",
              });
              const pick = (saved: SavedRepeatVisit) =>
                withRecords ? visitToSave(saved) : saved.drawn.visit;
              const first = archive.save(pick(earlier), typedName);
              clock.set({
                epochMs: scriptStartEpochMs + dayMs,
                localDate: "2026-11-21",
              });
              const second = archive.save(pick(shown), typedName);
              if (!first.saved || !second.saved) {
                throw new Error("Expected both visits to be saved.");
              }
              const list = archive.list();
              return {
                list,
                shownSaved: second.savedVisit,
                found: findEarlierVisit(
                  list,
                  typedName,
                  second.savedVisit.savedVisitId,
                ),
              };
            };
            const withRecords = saveBoth(true);
            const without = saveBoth(false);
            expect(without.found).not.toBeNull();
            expect(withRecords.found?.savedVisitId).toBe(
              without.found?.savedVisitId,
            );
            expect({
              ...withRecords.found,
              swappedRepeats: [],
            }).toEqual(without.found);
            expect(
              withRecords.list.visits.map((listing) => ({
                ...listing,
                visit: { ...listing.visit, swappedRepeats: [] },
              })),
            ).toEqual(without.list.visits);

            const shownVisits: readonly VisitToSave[] = [
              visitToSave(shown),
              shown.drawn.visit,
            ];
            const shownSaved: readonly SavedVisit[] = [
              withRecords.shownSaved,
              without.shownSaved,
            ];
            const earlierVisits = [withRecords.found, without.found];
            const base = earlierPart(
              resultPicture({
                kind: "saved",
                savedVisit: without.shownSaved,
                earlierVisit: without.found,
              }),
            );
            expect(base.comparison).not.toBeNull();
            for (const earlierVisit of earlierVisits) {
              for (const visit of shownVisits) {
                expect(
                  earlierPart(
                    resultPicture({
                      kind: "live",
                      visit,
                      localDate,
                      earlierVisit,
                    }),
                  ),
                ).toEqual(base);
              }
              for (const savedVisit of shownSaved) {
                expect(
                  earlierPart(
                    resultPicture({ kind: "saved", savedVisit, earlierVisit }),
                  ),
                ).toEqual(base);
              }
            }
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );

  it(
    "saves a repeated visit again under its id, date and name, renames otherwise, and says whether the saved copy lags exactly by the rule, never throwing, also on changed stored values and in robot mode",
    () => {
      fc.assert(
        fc.property(
          savedRepeatVisitArbitrary,
          fc.array(scriptStepArbitrary, { maxLength: scriptMaxStepCount }),
          seedArbitrary,
          storedValueChangeArbitrary,
          storageBehaviourArbitrary,
          (saved, steps, archiveSeed, change, behaviour) => {
            const { visit } = saved.drawn;
            const records: readonly SwappedRepeatRun[] = saved.records;
            const workingArea = createFakeStorageArea();
            let currentStorage: () => StorageArea | null | undefined = () =>
              workingArea;
            const clock = settableWallClock({
              epochMs: scriptStartEpochMs,
              localDate: "2026-11-20",
            });
            const archive = createVisitArchive({
              localStorage: () => currentStorage(),
              wallClock: clock,
              seed: archiveSeed,
              mode: "keep",
            });
            const robotStorage = vi.fn((): StorageArea => workingArea);
            const robot = createVisitArchive({
              localStorage: robotStorage,
              wallClock: clock,
              seed: archiveSeed,
              mode: "robot",
            });

            let shownCount = 0;
            let savedVisitId: string | null = null;
            const live = (): VisitToSave => ({
              visitLog: visit.visitLog,
              summary: visit.summary,
              swappedRepeats: records.slice(0, shownCount),
            });
            const listedCopy = (): SavedVisit | undefined =>
              archive
                .list()
                .visits.find(
                  (listing) => listing.visit.savedVisitId === savedVisitId,
                )?.visit;

            steps.forEach((step, index) => {
              switch (step.kind) {
                case "save": {
                  const copy = savedVisitId === null ? undefined : listedCopy();
                  const lacks = lacksByRule(archive, savedVisitId, live());
                  clock.set({
                    epochMs: scriptStartEpochMs + (index + 1) * dayMs,
                    localDate: "2026-11-21",
                  });
                  const outcome = archive.save(live(), step.typedName);
                  expect(outcome.saved).toBe(true);
                  if (!outcome.saved) {
                    return;
                  }
                  const savedVisit = outcome.savedVisit;
                  if (copy !== undefined && lacks) {
                    // Saved again: the same id, date and name, with the records (Q5).
                    expect(outcome.line).toBe(swappedRepeatCopy.savedAgainLine);
                    expect(outcome.renamed).toBe(false);
                    expect(savedVisit).toEqual({
                      ...copy,
                      swappedRepeats: roundTrip(live().swappedRepeats),
                    });
                    expect(savedVisit.summary).toEqual(
                      roundTrip(visit.summary),
                    );
                    expect(savedVisit.visitLog).toEqual(
                      roundTrip(visit.visitLog),
                    );
                  } else if (copy !== undefined) {
                    // Nothing lacking: a rename at most, as before this spec.
                    const renamed =
                      copy.headphoneName !==
                      canonicalHeadphoneName(step.typedName);
                    expect(outcome.renamed).toBe(renamed);
                    expect(outcome.line).toBe(
                      renamed
                        ? resultPageCopy.renamedLine
                        : resultPageCopy.savedLine,
                    );
                    expect(savedVisit).toEqual({
                      ...copy,
                      headphoneName: canonicalHeadphoneName(step.typedName),
                    });
                  } else {
                    // A new saved visit, with the records the visit holds now.
                    expect(outcome.line).toBe(resultPageCopy.savedLine);
                    expect(outcome.renamed).toBe(false);
                    expect(savedVisit.swappedRepeats).toEqual(
                      roundTrip(live().swappedRepeats),
                    );
                  }
                  savedVisitId = savedVisit.savedVisitId;
                  expect(listedCopy()).toEqual(savedVisit);
                  expect(archive.savedCopyLacksRepeats(live())).toBe(false);
                  break;
                }
                case "addRecord":
                  shownCount = Math.min(records.length, shownCount + 1);
                  break;
                case "deleteCopy":
                  if (savedVisitId !== null) {
                    archive.deleteVisit(savedVisitId);
                  }
                  break;
                case "deleteAll":
                  archive.deleteAll();
                  break;
              }
              expect(archive.savedCopyLacksRepeats(live())).toBe(
                lacksByRule(archive, savedVisitId, live()),
              );
              expect(robot.savedCopyLacksRepeats(live())).toBe(false);
              robot.save(live(), "Buds");
              expect(robot.savedCopyLacksRepeats(live())).toBe(false);
            });
            expect(robotStorage).not.toHaveBeenCalled();

            // The stored value changed as the result page's CP7 changes it, under any storage
            // behaviour: the answer never throws and still follows the rule.
            const text = workingArea.items()[savedVisitsKey];
            const changed =
              text === undefined ? null : changedValueText(text, change);
            currentStorage = storageWith(
              behaviour,
              changed === null ? {} : { [savedVisitsKey]: changed },
            ).localStorage;
            shownCount = records.length;
            expect(() => archive.savedCopyLacksRepeats(live())).not.toThrow();
            const answer = archive.savedCopyLacksRepeats(live());
            expect(answer).toBe(lacksByRule(archive, savedVisitId, live()));
            let outcome: ReturnType<VisitArchive["save"]> | null = null;
            expect(() => {
              outcome = archive.save(live(), "Buds");
            }).not.toThrow();
            const done = outcome as ReturnType<VisitArchive["save"]> | null;
            if (done === null) {
              return;
            }
            if (!answer) {
              expect(done.line).not.toBe(swappedRepeatCopy.savedAgainLine);
            } else if (done.saved) {
              expect(done.line).toBe(swappedRepeatCopy.savedAgainLine);
            }
            if (done.saved) {
              expect(archive.savedCopyLacksRepeats(live())).toBe(false);
            }
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});
