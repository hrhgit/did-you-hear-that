// Regression cases for counterexamples the missed-sound replay's properties find (R17.5,
// design.md, "Counterexamples").
//
// Naming: each case is called `regression <n>: <what went wrong> (<property>, seed <s>)`, with
// <n> counting from 1 in the order the cases were found and <s> the fast-check seed (and path)
// that found it. The case writes out the input fast-check printed (the visit log plan, the most
// count, the replay script or the refusal script), runs that one case without fast-check, and
// asserts the property's condition for it alone.
//
// The `it.fails` rule: a case is first committed on its own as `it.fails`, which records that the
// code currently breaks it while keeping `npm test` green. The commit that changes the code turns
// it into an ordinary `it`. A case that could only be removed by changing a proposed value of Q1
// or Q2, or a steering value, stays `it.fails`, with a decision in design.md that gives the case.
//
// A case where the property was wrong and the code was right is an ordinary `it` from the start,
// because the code passes it: it asserts the corrected condition for the input that showed the
// fault, so that the property cannot slip back to the wrong check.

import { describe, expect, it, vi } from "vitest";
import { missedSoundReplayConfig } from "../../src/config/missed-sound-replay-config";
import { visitFlowConfig } from "../../src/config/visit-flow-config";
import { sideCountLine } from "../../src/copy/replay-lines";
import { replayCounts } from "../../src/session/replay-counts";
import type { VisitLog } from "../../src/session/visit-flow-types";
import type { VisitLogPlan } from "./missed-sound-replay-arbitraries";
import { visitLogOf } from "./missed-sound-replay-arbitraries";
import { createReplayHarness } from "./missed-sound-replay-harness";

vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

const flatTops = (levelDb: number) => ({
  cellar: levelDb,
  corridor: levelDb,
  nursery: levelDb,
  stairs: levelDb,
  attic: levelDb,
});

const emptyRun = { trialCount: 0, seed: 0 };

describe("missed-sound replay regressions", () => {
  it("regression 1: a proceed ignored during a pause was checked after a later resume had ended the pause (CP5, seed -275579165, path 41:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:1:0:2:0:3:1:3:1:0:11:11:11:15:12:10:12:12:12:12:11:12:12:0:0:0:0:0:0:0:0:0:0:0:0:4:3:3:5:2:2:2:2:2:3:3:2:3:2:2:2:2:2:2:2:2:2:2:2:3)", async () => {
    // The property was wrong: it read `canProceed` at the end of the run, after the resume of the
    // script had ended the pause. The stage ignores the proceed while the pause holds (R11.7);
    // `canProceed` is false at that moment, and the replay goes on after the resume.
    const plan: VisitLogPlan = {
      visitType: "quick",
      visitSeed: 0,
      calibrationSettingsDb: [-40],
      freeTops: [flatTops(0)],
      rooms: [
        { abandoned: [], finished: emptyRun },
        { abandoned: [], finished: emptyRun },
        { abandoned: [], finished: { trialCount: 1, seed: 764314074 } },
      ],
      noSoundShareFraction: 0,
      missShareFraction: 0.258,
    };
    const harness = await createReplayHarness({
      log: visitLogOf(plan),
      outputDelayMs: 0,
    });
    expect(harness.controller.plan.sounds).toHaveLength(1);
    await harness.run(
      {
        startTimesMs: [0],
        events: [
          { atMs: 0, action: "interrupted", resumeAfterMs: 1 },
          { atMs: 0, action: "proceed", resumeAfterMs: null },
        ],
        outputDelayMs: 0,
      },
      60_000,
    );
    const proceed = harness.actions.find((action) => action.name === "proceed");
    expect(proceed?.pauseBefore).toBe("interrupted");
    const before = harness.steps
      .filter((step) => step.seq < (proceed?.seq ?? 0))
      .at(-1);
    expect(before?.canProceed).toBe(false);
    expect(harness.stage()).toBe("missedSoundReplay");
    expect(harness.current().view).toMatchObject({
      phase: "finished",
      ending: "allPlayed",
    });
    expect(harness.schedules).toHaveLength(1);
  });

  it("regression 2: two equal logs were compared with -0 in an earlier calibration that a JSON copy writes as 0 (CP6, seed -990610505, path 137:21:0:0:0:0:0:0:0:0:0:1:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0)", async () => {
    // The property was wrong: it compared the harness logs with `toEqual`, which tells -0 from 0.
    // A free top of -0 in a calibration that is not the last survives in the first log and is 0
    // in the JSON copy; the plan never reads it. The logs are equal as JSON values, and the two
    // runs record the same.
    const plan: VisitLogPlan = {
      visitType: "full",
      visitSeed: 0,
      calibrationSettingsDb: [-5, -24, -8],
      freeTops: [flatTops(0), { ...flatTops(0), attic: -0 }, flatTops(0)],
      rooms: Array.from({ length: 5 }, () => ({
        abandoned: [],
        finished: emptyRun,
      })),
      noSoundShareFraction: 0,
      missShareFraction: 0,
    };
    const log = visitLogOf(plan);
    expect(Object.is(log.calibrations[1]?.roomTopLevelDb.attic, -0)).toBe(true);
    const copy = JSON.parse(JSON.stringify(log)) as VisitLog;
    const first = await createReplayHarness({ log, outputDelayMs: 0 });
    const second = await createReplayHarness({ log: copy, outputDelayMs: 0 });
    expect(JSON.parse(JSON.stringify(second.log))).toEqual(
      JSON.parse(JSON.stringify(first.log)),
    );
    const script = { startTimesMs: [0], events: [], outputDelayMs: 0 };
    await first.run(script, 60_000);
    await second.run(script, 60_000);
    expect(second.steps).toEqual(first.steps);
    expect(second.plays).toEqual(first.plays);
    expect(second.events).toEqual(first.events);
  });

  it("regression 3: the reader of the count lines refused the one wrong side written as Once (CP2, seed 838979134, path 0:12:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:1:0:1:0:1:0:2:1:1:1:1:1:1:1:1)", () => {
    // The property was wrong: its reader of the count lines took "Once" as one wrong side and then
    // demanded at least two for the "times" form, which "Once" is not. The line is right: one
    // answer on the other side is written "Once you named the other side." (design.md, "The copy").
    const plan: VisitLogPlan = {
      visitType: "quick",
      visitSeed: 0,
      calibrationSettingsDb: [-17, -6],
      freeTops: [flatTops(0), flatTops(0)],
      rooms: [
        { abandoned: [], finished: emptyRun },
        { abandoned: [], finished: emptyRun },
        { abandoned: [], finished: { trialCount: 3, seed: 0 } },
      ],
      noSoundShareFraction: 0,
      missShareFraction: 0,
    };
    const log = visitLogOf(plan);
    const { right } = replayCounts(log, null);
    expect(right).toEqual({
      madeCount: 3,
      caughtCount: 2,
      wrongSideCount: 1,
      missedCount: 0,
    });
    expect(
      sideCountLine(
        "right",
        right.madeCount,
        right.caughtCount,
        right.wrongSideCount,
      ),
    ).toBe(
      "On your right I made three sounds. You caught two. Once you named the other side.",
    );
  });

  it("regression 4: a first replayed sound refused busy three times while the last room's sound still played ended the replay with soundRefused (task 12 review, no seed)", async () => {
    // Found by reading the code in task 12, not by a property, so there is no fast-check seed.
    // The stage begins at the last answer, while that trial's sound may still play. A quick press
    // on the start control then has the first replayed sound refused busy by the output stage,
    // and before the fix three such refusals ended the replay with a line saying the house could
    // not play the sounds. The refusal script stands in for that output stage. A busy refusal
    // before the first replayed sound has started does not count (R12.3, D9), so the replay goes
    // on and plays every sound.
    const plan: VisitLogPlan = {
      visitType: "quick",
      visitSeed: 0,
      calibrationSettingsDb: [-40],
      freeTops: [flatTops(0)],
      rooms: [
        { abandoned: [], finished: emptyRun },
        { abandoned: [], finished: emptyRun },
        { abandoned: [], finished: { trialCount: 3, seed: 0 } },
      ],
      noSoundShareFraction: 0,
      missShareFraction: 1,
    };
    const busyCount = visitFlowConfig.refusedPlaysInARowMaxCount;
    const harness = await createReplayHarness({
      log: visitLogOf(plan),
      outputDelayMs: 0,
      refusals: Array.from({ length: busyCount }, () => ({
        kind: "refused" as const,
        reason: "busy" as const,
      })),
    });
    const soundCount = harness.controller.plan.sounds.length;
    expect(soundCount).toBeGreaterThan(0);
    await harness.run(
      { startTimesMs: [0], events: [], outputDelayMs: 0 },
      60_000,
    );
    const first = harness.plays.slice(0, busyCount + 1);
    expect(first.map((play) => play.outcome.kind)).toEqual([
      ...Array.from({ length: busyCount }, () => "refused"),
      "scheduled",
    ]);
    expect(first.map((play) => play.atMs - first[0]!.atMs)).toEqual(
      first.map((_, index) => index * missedSoundReplayConfig.replayGapMs),
    );
    expect(new Set(first.map((play) => play.request.levelDb)).size).toBe(1);
    expect(harness.events.map(({ event }) => event.sound.position)).toEqual(
      Array.from({ length: soundCount }, (_, index) => index + 1),
    );
    expect(harness.current().view).toMatchObject({
      phase: "finished",
      ending: "allPlayed",
    });
  });
});
