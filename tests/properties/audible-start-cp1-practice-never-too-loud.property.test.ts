import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { roomSearchCapDb } from "../../src/session/room-search-cap";
import { roomSearchFloorDb } from "../../src/session/room-search-floor";
import type { Ear } from "../../src/session/visit-flow-types";
import { visitFlowConfig } from "../../src/config/visit-flow-config";
import { playVisit } from "../listeners/simulated-visitor";
import { visitRunArbitrary } from "./visit-flow-arbitraries";
import { createVisitHarness } from "./visit-flow-harness";

// CP1. Never louder than allowed, never a jump, with the practice part of CP3, nothing below the
// playable floor (audible-start design.md, CP1 and CP3; R12 to R14, R20; brief properties 1 and
// 3). The light plan of 2026-11-16 keeps this one property for the practice and checks it over
// whole visits through the visit flow's harness, quick and full, with every listener the visit
// arbitraries draw. The room runs on the output shell alone and the Repeat_Run, which has no
// practice in the light plan, are not drawn here.
//
// For every room sound the flow asks the output stage to play, practice and search alike:
// - it asks for at most its run's Search_Cap, which is at most `capRelativeToAnchorDb`, and at
//   least its run's Search_Floor;
// - a practice sound is played at the level it asked for, so no limit of the output stage had to
//   step in;
// - on each ear within a run (from one `beginRoom` to the next), each sound asks for and is played
//   at most one `upwardStepDb` above the one before it on that ear, across the practice, every try
//   again and the search.
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Whole visits (design.md, CP1). */
const runs = 50;
const timeoutMs = 120_000;

const { capRelativeToAnchorDb, upwardStepDb } = hearingMethodConfig;
const { practiceStartLevelDb } = visitFlowConfig;

describe("audible-start CP1. Practice is never louder than allowed, never a jump, never below the floor (R12 to R14, R20)", () => {
  it(
    "keeps every practice sound and trial of a room within its run's cap and floor, and each rise on an ear to one upward step",
    async () => {
      let practiceSounds = 0;
      let louderPracticeSounds = 0;
      await fc.assert(
        fc.asyncProperty(visitRunArbitrary(), async (visitRun) => {
          const harness = createVisitHarness({
            seed: visitRun.seed,
            performanceOffsetMs: visitRun.performanceOffsetMs,
            spyOnOutput: true,
          });
          await playVisit(harness, visitRun.script);

          let report: {
            readonly rooms: Readonly<
              Record<
                string,
                { readonly topLevelDb: number; readonly floorLevelDb: number }
              >
            >;
          } | null = null;
          let previous = new Map<Ear, { asked: number; played: number }>();
          for (const call of harness.outputCalls) {
            if (
              call.name === "keepCalibration" &&
              call.outcome.kind === "kept"
            ) {
              report = call.outcome.rangeReport;
            }
            if (call.name === "beginRoom") {
              previous = new Map();
            }
            if (call.name !== "play" || call.stage !== "room") {
              continue;
            }
            const { request, outcome } = call;
            expect(
              report,
              "a room sound before a kept calibration",
            ).not.toBeNull();
            const range = report?.rooms[request.soundId];
            expect(range).toBeDefined();
            if (range === undefined) {
              continue;
            }
            const capDb = roomSearchCapDb(
              range.topLevelDb,
              hearingMethodConfig,
            );
            const floorDb = roomSearchFloorDb(
              range.floorLevelDb,
              hearingMethodConfig,
            );
            const where = `${request.purpose} on ${request.ear} at ${String(call.atMs)}`;
            expect(capDb).toBeLessThanOrEqual(capRelativeToAnchorDb);
            expect(request.levelDb, where).toBeLessThanOrEqual(capDb);
            expect(request.levelDb, where).toBeGreaterThanOrEqual(floorDb);
            if (outcome.kind !== "scheduled") {
              continue;
            }
            if (request.purpose === "practice") {
              practiceSounds += 1;
              if (request.levelDb > Math.min(practiceStartLevelDb, capDb)) {
                louderPracticeSounds += 1;
              }
              expect(outcome.clampLimit, where).toBeNull();
              expect(outcome.playedLevelDb, where).toBe(request.levelDb);
            }
            const before = previous.get(request.ear);
            if (before !== undefined) {
              expect(request.levelDb - before.asked, where).toBeLessThanOrEqual(
                upwardStepDb,
              );
              expect(
                outcome.playedLevelDb - before.played,
                where,
              ).toBeLessThanOrEqual(upwardStepDb);
            }
            previous.set(request.ear, {
              asked: request.levelDb,
              played: outcome.playedLevelDb,
            });
          }
        }),
        { numRuns: runs },
      );
      // Without practice sounds, and without some played a step louder after a miss, the property
      // would say nothing about them.
      expect(practiceSounds).toBeGreaterThan(0);
      expect(louderPracticeSounds).toBeGreaterThan(0);
    },
    timeoutMs,
  );
});
