import { describe, expect, it, vi } from "vitest";
import type { ScoredVisitTrial } from "../../src/session/visit-flow-types";
import { createVisitHarness } from "../properties/visit-flow-harness";
import type { PsychometricListenerParameters } from "./psychometric-listener";
import { playVisit, type VisitorScript } from "./simulated-visitor";

// Worst-case renders keep the visit quick (visit-flow D26, audio-output D43).
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } =
    await import("../properties/worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** A Step_Listener: catches every sound at or above its threshold on that side, and nothing else. */
const stepListener: PsychometricListenerParameters = Object.freeze({
  trueThresholdDb: Object.freeze({ left: -32, right: -47 }),
  widthDb: 0,
  lapseFraction: 0,
  falseAlarmFraction: 0,
  wrongSideFraction: 0,
});

const script: VisitorScript = Object.freeze({
  visitType: "quick",
  calibrationTargetDb: -20,
  firstHeadphoneCheckAnswer: "left",
  listener: Object.freeze({
    kind: "psychometric",
    parameters: stepListener,
    seed: 7,
  }),
  visitorSeed: 20261205,
  answerDelayMaxMs: 1500,
  timeStampModes: Object.freeze(["now" as const]),
  restMaxMs: 3000,
  extraPresses: Object.freeze([]),
  disturbances: Object.freeze([]),
  ending: null,
});

describe("playVisit", () => {
  it("plays a quick visit with a Step_Listener to the result, catching only sounds at or above its threshold", async () => {
    const harness = createVisitHarness({
      seed: 20261204,
      performanceOffsetMs: 123_456,
    });
    const run = await playVisit(harness, script);

    expect(run.ending).toBe("done");
    expect(run.finalStage).toBe("result");
    expect(run.presentedTrials.length).toBeGreaterThan(0);

    const scored = harness.events.flatMap((recorded) =>
      recorded.event.kind === "trialScored" ? [recorded.event.trial] : [],
    );
    const caught = scored.filter(
      (trial): trial is Extract<ScoredVisitTrial, { kind: "sound" }> =>
        trial.kind === "sound" && trial.outcome === "caught",
    );
    expect(caught.length).toBeGreaterThan(0);
    for (const trial of caught) {
      expect(trial.requestedLevelDb).toBeGreaterThanOrEqual(
        stepListener.trueThresholdDb[trial.ear],
      );
    }
    // A Step_Listener never answers a silence, and names only the side it heard.
    expect(
      scored.filter(
        (trial) =>
          (trial.kind === "noSound" && trial.outcome === "falseAlarm") ||
          (trial.kind === "sound" && trial.outcome === "wrongSide"),
      ),
    ).toEqual([]);
  });
});
