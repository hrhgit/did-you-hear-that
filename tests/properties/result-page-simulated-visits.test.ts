import { describe, expect, it, vi } from "vitest";
import type { VisitType } from "../../src/config/hearing-method-config";
import { limitsStatement } from "../../src/copy/limits-statement";
import { createVisitArchive } from "../../src/session/create-visit-archive";
import type { SavedVisit } from "../../src/session/result-page-types";
import { resultPicture } from "../../src/session/result-picture";
import type { ResultSnapshot } from "../../src/session/visit-flow-types";
import { createFakeStorageArea } from "../../src/storage/fake-storage-area";
import { savedVisitsKey } from "../../src/storage/saved-visits-key";
import type { PsychometricListenerParameters } from "../listeners/psychometric-listener";
import { playVisit, type VisitorScript } from "../listeners/simulated-visitor";
import { answerDelayMaxMs, restMaxMs } from "./visit-flow-arbitraries";
import { createVisitHarness } from "./visit-flow-harness";
import { fixedWallClock } from "./result-page-arbitraries";

// A quick and a full visit played to the result through the visit flow's harness and simulated
// visitor, with fixed seeds and the worst-case renderers (result-page design.md, "Testing
// strategy"; tasks.md task 10), each saved through an archive on a fake storage area, listed back
// as it was given, exported, and drawn as a live and as a saved picture. The lengths of the stored
// value after the two saves are recorded in design.md under "Measured sizes".
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

const timeoutMs = 120_000;

/** A listener from the Plausible_Range (threshold-search D17), as in the visit flow's simulated visits. */
const plausibleListener: PsychometricListenerParameters = Object.freeze({
  trueThresholdDb: Object.freeze({ left: -12, right: -41.3 }),
  widthDb: 5.5,
  lapseFraction: 0.06,
  falseAlarmFraction: 0.12,
  wrongSideFraction: 0.04,
});

const listenerSeed = 12;
const visitorSeed = 20261208;
const performanceOffsetMs = 654_321;
const archiveSeed = 20261209;

const flowSeed: Readonly<Record<VisitType, number>> = Object.freeze({
  quick: 20261206,
  full: 20261207,
});

const scriptFor = (visitType: VisitType): VisitorScript => ({
  visitType,
  calibrationTargetDb: -22,
  firstHeadphoneCheckAnswer: "right",
  listener: {
    kind: "psychometric",
    parameters: plausibleListener,
    seed: listenerSeed,
  },
  visitorSeed,
  answerDelayMaxMs,
  timeStampModes: ["now", "earlier", "missing", "nan", "future"],
  restMaxMs,
  extraPresses: [],
  disturbances: [],
  ending: null,
});

async function playToResult(visitType: VisitType): Promise<ResultSnapshot> {
  const harness = createVisitHarness({
    seed: flowSeed[visitType],
    performanceOffsetMs,
  });
  const run = await playVisit(harness, scriptFor(visitType));
  expect(run.ending).toBe("done");
  const snapshot = harness.flow.snapshot();
  if (snapshot.stage !== "result") {
    throw new Error(`The visit ended in ${snapshot.stage}.`);
  }
  return snapshot;
}

function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("result page: simulated visits saved and read back", () => {
  it(
    "saves a quick and a full visit, lists them back as they were given, exports their logs and draws both kinds of picture",
    async () => {
      const quick = await playToResult("quick");
      const full = await playToResult("full");

      const area = createFakeStorageArea();
      const wallClock = fixedWallClock({
        epochMs: 1_795_180_800_000,
        localDate: "2026-11-20",
      });
      const archive = createVisitArchive({
        localStorage: () => area,
        wallClock,
        seed: archiveSeed,
        mode: "keep",
      });

      const storedLengths: number[] = [];
      const savedIds: string[] = [];
      for (const [snapshot, typedName] of [
        [quick, "White earbuds"],
        [full, ""],
      ] as const) {
        const outcome = archive.save(snapshot, typedName);
        expect(outcome.saved).toBe(true);
        if (!outcome.saved) {
          return;
        }
        savedIds.push(outcome.savedVisit.savedVisitId);
        storedLengths.push(area.items()[savedVisitsKey]?.length ?? 0);
      }
      expect(storedLengths[1]).toBeGreaterThan(storedLengths[0] ?? 0);
      expect(Object.keys(area.items())).toEqual([savedVisitsKey]);

      const list = archive.list();
      expect(list.state).toBe("ready");
      expect(list.unreadableCount).toBe(0);
      expect(list.visits.map((listing) => listing.visit.savedVisitId)).toEqual(
        [...savedIds].reverse(),
      );

      for (const [snapshot, savedVisitId] of [
        [quick, savedIds[0]],
        [full, savedIds[1]],
      ] as const) {
        const listing = list.visits.find(
          (entry) => entry.visit.savedVisitId === savedVisitId,
        );
        expect(listing).toBeDefined();
        const savedVisit = listing?.visit as SavedVisit;
        expect(savedVisit.visitLog).toEqual(roundTrip(snapshot.visitLog));
        expect(savedVisit.summary).toEqual(roundTrip(snapshot.summary));
        expect(savedVisit.visitType).toBe(snapshot.visitLog.visitType);

        const exported = archive.exportVisitLog(savedVisit.savedVisitId);
        expect(exported).not.toBeNull();
        expect(JSON.parse(exported as string)).toEqual(
          roundTrip(snapshot.visitLog),
        );

        const live = resultPicture({
          kind: "live",
          visit: snapshot,
          localDate: archive.today(),
          earlierVisit: null,
        });
        const saved = resultPicture({
          kind: "saved",
          savedVisit,
          earlierVisit: null,
        });
        for (const picture of [live, saved]) {
          expect(picture.floors.map((floor) => floor.room)).toEqual(
            snapshot.visitLog.rooms,
          );
          expect(picture.limitsStatement).toBe(limitsStatement);
          expect(picture.comparison).toBeNull();
          expect(picture.dateLabel).toBe("20 November 2026");
        }
        expect(saved.floors.map((floor) => floor.swappedRepeat)).toEqual(
          saved.floors.map(() => null),
        );
        expect(
          saved.floors.map((floor) => ({ ...floor, swappedRepeat: null })),
        ).toEqual(
          live.floors.map((floor) => ({ ...floor, swappedRepeat: null })),
        );
        expect(saved.kind).toBe("saved");
        expect(live.kind).toBe("live");
      }
    },
    timeoutMs,
  );
});
