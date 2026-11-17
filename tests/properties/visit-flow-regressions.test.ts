// Regression cases for counterexamples the visit flow properties find (R22.7, design.md,
// "Counterexamples").
//
// Naming: each case is called `regression <n>: <what went wrong> (<property>, seed <s>)`, with
// <n> counting from 1 in the order the cases were found and <s> the fast-check seed (and path)
// that found it. The case writes out the visitor script, the flow's seed and the clock offset P
// that fast-check printed, plays that one visit on the Visit_Harness with
// `playVisit`, without fast-check, and asserts the property's condition for that visit alone.
//
// The `it.fails` rule: a case is first committed on its own as `it.fails`, which records that the
// flow currently breaks it while keeping `npm test` green. The commit that changes the code turns
// it into an ordinary `it`. A case whose only remedy would change a value from a steering file,
// or the visit limit that awaits the project owner's choice (Q1), stays `it.fails`, with a
// decision in design.md that gives the numbers.

import { describe, expect, it, vi } from "vitest";
import type { ListenerTrial } from "../listeners/listener-types";
import { playVisit, type VisitorScript } from "../listeners/simulated-visitor";
import { answerDelayMaxMs, restMaxMs } from "./visit-flow-arbitraries";
import { checkPausesDiscardAndRepeat } from "./visit-flow-cp7-check";
import { createVisitHarness } from "./visit-flow-harness";
import {
  observeVisit,
  visitStartMs,
  type TimelineEntry,
} from "./visit-flow-timeline";

// The visits render with the worst-case renderers, as in the property files (D26, audio-output D43).
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/**
 * The moments of a visit that say where its device changes fell: each room run's start, its first
 * sound (the first practice sound, audible-start light plan) and its first presented trial
 * (`roomIndex:attempt`), and each device change with the stage it came in.
 */
function roomRunMoments(entries: readonly TimelineEntry[]): string[] {
  const moments: string[] = [];
  const soundedRuns = new Set<string>();
  const presentedRuns = new Set<string>();
  for (const entry of entries) {
    if (entry.kind === "event" && entry.event.kind === "roomStarted") {
      moments.push(
        `roomStarted ${String(entry.event.room.roomIndex)}:${String(entry.event.attempt)}`,
      );
    }
    if (entry.kind === "practicePresented" || entry.kind === "presented") {
      const key = `${String(entry.trial.roomIndex)}:${String(entry.trial.attempt)}`;
      if (!soundedRuns.has(key)) {
        soundedRuns.add(key);
        moments.push(`first sound ${key}`);
      }
    }
    if (entry.kind === "presented") {
      const key = `${String(entry.trial.roomIndex)}:${String(entry.trial.attempt)}`;
      if (!presentedRuns.has(key)) {
        presentedRuns.add(key);
        moments.push(`first trial ${key}`);
      }
    }
    if (entry.kind === "stopReport" && entry.reportKind === "deviceChanged") {
      moments.push(`deviceChanged in ${entry.snapshotBefore.stage}`);
    }
  }
  return moments;
}

describe("visit flow regressions", () => {
  // Found by CP7 with fast-check seed -1594251289, path
  // "40:0:0:3:0:21:0:0:26:5:11:9:3:3:3:3:3:3:3:3:3:3:11:3:1:27:8:8:8:6:3:3:3:3:3:3:3:3:12:4:5:3:4:19:22:3:3:3:17:3:5:8:5:5:6:6:6:11:9:0:2:7:4:4:3:3:2:3:8:8:8:8:8:8:8:8:8:8:8:8:18:8:9:23:27:2:12:2:3:3:2:3:4:4:4:4:4:6:6:6:11:7:11:10:8:9:8:9:12:2:5:6:4:3:2:2:2:2:7:8:2:2:2:11:6:3:2:7:8:7:9:10:9:2:2:10:3:5:8:8:2:2:2:2:2:2:11:4:2:2:2:2:3:5:2:12:3:5:2:2:5:2:13:3:4:6:2:2:2:14:4:2:2:2:5:2:2:15:3:7:2:2:2:2:2:17:2:3:5:2:17:3:5:2:2:19:2:5:2:19:5:2:5:2:23:20:12:2:7:7:4:2:3:5:2:2:10:4:5:4:5:2:11:4:4:7:2:2:2:2:12:5:2:2:2:5:2:2:13:4:5:5:2:14:4:4:5:2:15:4:3:5:2:16:4:5:2:2:18:2:2:5:2:18:6:2:5:2:5:2:23:20:12:2:10:2:2:4:3:3:5:5:5:5:5:5:5:5:5:5:5:5:5:15:8:8:7:7:7".
  // In the counterexample a device change in the third room abandoned attempt 1; the second device
  // change came 0.4 ms after attempt 2 started and before it presented a trial, so the flow
  // abandoned attempt 2 as well and ran attempt 3 (R13.3). CP7 kept the pause of the first device
  // change open until a trial was presented, so it did not count attempt 2 as stopped and expected
  // attempt 2's first trial. The flow was right; the property's bookkeeping was not.
  //
  // This case keeps the script fast-check drew except its listener, which was a drawn function,
  // its calibration and the times of the two device changes. The audible-start Keep_Minimum
  // (−27 dB, D25), the playable floor and the start 10 dB below the anchor moved the calibration
  // from −40 dB to −27 dB and the listener's threshold from −30 dB to −20 dB, above the
  // Search_Floor, which changed the times. The listener here answers the side of every sound at or
  // above −20 dB and nothing otherwise. With it, the third room's first attempt presents its first
  // trial at 240 393 ms; the first device change at 248 000 ms abandons it; attempt 2 runs from
  // 253 870 ms to its first trial at 257 030 ms, so the second device change is set at 255 500 ms,
  // between the two.
  //
  // The practice before each room's counting (audible-start, light plan of 2026-11-16) moved the
  // times again, and a run's first sound is now its first practice sound. With it, the third
  // room's first attempt starts at 284 543 ms and presents its first counted trial at 295 886 ms;
  // the first device change at 304 000 ms (in its counting, as before) abandons it; attempt 2
  // starts at 317 570 ms and would play its first practice sound at 319 570 ms, so the second
  // device change is set at 318 500 ms, after the start and before any sound of attempt 2.
  //
  // The calibration that follows the control (the owner, 2026-11-16) starts at −40 dB and reaches
  // −27 dB in one repeat, which moved the times once more. The third room's first attempt starts at
  // 281 230 ms and presents its first counted trial at 292 573 ms; the first device change is set
  // at 300 700 ms, in its counting; attempt 2 starts at 310 835 ms and would play its first
  // practice sound at 312 835 ms, so the second device change was set at 311 800 ms.
  //
  // The shorter gaps and window of 2026-11-16 (the owner, after playing) moved them again. The
  // third room's first attempt starts at 213 533 ms and presents its first counted trial at
  // 223 893 ms; the first device change is set at 232 000 ms, in its counting; attempt 2 starts at
  // 241 974 ms and would play its first practice sound at 243 974 ms, so the second device change
  // is set at 242 900 ms. The case asserts that order first, so that it cannot quietly stop
  // covering two device changes in a row.
  it("regression 1: a second device change after a new attempt of a room starts and before its first trial (CP7, seed -1594251289)", async () => {
    const script: VisitorScript = {
      visitType: "quick",
      calibrationTargetDb: -27,
      firstHeadphoneCheckAnswer: "left",
      listener: {
        kind: "function",
        respond: (trial: ListenerTrial) =>
          trial.kind === "sound" && trial.levelDb >= -20 ? trial.ear : "none",
      },
      visitorSeed: 4294950317,
      answerDelayMaxMs,
      timeStampModes: ["nan"],
      restMaxMs,
      extraPresses: [],
      disturbances: [
        { atMs: 232_000, kind: "deviceChanged", resumeAfterMs: 0 },
        { atMs: 242_900, kind: "deviceChanged", resumeAfterMs: 0 },
      ],
      ending: null,
    };
    // Calibrated with the hiss repeats, as when the case was found: its times depend on them.
    const harness = createVisitHarness({
      seed: 0,
      performanceOffsetMs: 0,
      music: "reject",
    });
    const timeline = observeVisit(harness);
    const run = await playVisit(timeline.driver, script);

    expect(visitStartMs(timeline.entries)).toBe(0);
    expect(roomRunMoments(timeline.entries)).toEqual([
      "roomStarted 0:1",
      "first sound 0:1",
      "first trial 0:1",
      "roomStarted 1:1",
      "first sound 1:1",
      "first trial 1:1",
      "roomStarted 2:1",
      "first sound 2:1",
      "first trial 2:1",
      "deviceChanged in room",
      "roomStarted 2:2",
      "deviceChanged in room",
      "roomStarted 2:3",
      "first sound 2:3",
      "first trial 2:3",
    ]);
    checkPausesDiscardAndRepeat(harness, timeline.entries, run);
  });
});
