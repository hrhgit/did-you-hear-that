import { describe, expect, it, vi } from "vitest";
import type { VisitType } from "../../src/config/hearing-method-config";
import { summarizeVisit } from "../../src/session/summarize-visit";
import type { ResultSnapshot } from "../../src/session/visit-flow-types";
import type { ExtremeListenerName } from "../listeners/extreme-listeners";
import type { PsychometricListenerParameters } from "../listeners/psychometric-listener";
import {
  playVisit,
  type VisitorListenerSpec,
  type VisitorScript,
} from "../listeners/simulated-visitor";
import { answerDelayMaxMs, restMaxMs } from "./visit-flow-arbitraries";
import { createVisitHarness } from "./visit-flow-harness";

// Quick and full visits played to the result (visit-flow R22.3, tasks.md task 9), with fixed
// seeds and the worst-case renderers (D26).
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

const timeoutMs = 120_000;

/** A listener from the Attentive_Range (threshold-search D17). */
const attentiveListener: PsychometricListenerParameters = Object.freeze({
  trueThresholdDb: Object.freeze({ left: -35.4, right: -22.8 }),
  widthDb: 2.5,
  lapseFraction: 0.01,
  falseAlarmFraction: 0.01,
  wrongSideFraction: 0.005,
});

/** A listener from the Plausible_Range (threshold-search D17). */
const plausibleListener: PsychometricListenerParameters = Object.freeze({
  trueThresholdDb: Object.freeze({ left: -12, right: -41.3 }),
  widthDb: 5.5,
  lapseFraction: 0.06,
  falseAlarmFraction: 0.12,
  wrongSideFraction: 0.04,
});

const extremeNames: readonly ExtremeListenerName[] = [
  "alwaysAnswers",
  "neverAnswers",
  "answersAtRandom",
  "alwaysAnswersWrongSide",
  "alwaysPressesLeft",
];

const listeners: readonly {
  readonly name: string;
  readonly spec: VisitorListenerSpec;
}[] = [
  {
    name: "an Attentive_Range listener",
    spec: { kind: "psychometric", parameters: attentiveListener, seed: 11 },
  },
  {
    name: "a Plausible_Range listener",
    spec: { kind: "psychometric", parameters: plausibleListener, seed: 12 },
  },
  ...extremeNames.map((name, index) => ({
    name: `the Extreme_Listener ${name}`,
    spec: { kind: "extreme" as const, name, seed: 21 + index },
  })),
];

const visitTypes: readonly VisitType[] = ["quick", "full"];

const flowSeed: Readonly<Record<VisitType, number>> = Object.freeze({
  quick: 20261206,
  full: 20261207,
});

const scriptFor = (
  visitType: VisitType,
  listener: VisitorListenerSpec,
): VisitorScript => ({
  visitType,
  calibrationTargetDb: -22,
  firstHeadphoneCheckAnswer: "right",
  listener,
  visitorSeed: 20261208,
  answerDelayMaxMs,
  timeStampModes: ["now", "earlier", "missing", "nan", "future"],
  restMaxMs,
  extraPresses: [],
  disturbances: [],
  ending: null,
});

async function playToResult(
  visitType: VisitType,
  listener: VisitorListenerSpec,
): Promise<ResultSnapshot> {
  const harness = createVisitHarness({
    seed: flowSeed[visitType],
    performanceOffsetMs: 654_321,
  });
  const run = await playVisit(harness, scriptFor(visitType, listener));
  expect(run.ending).toBe("done");
  const snapshot = harness.flow.snapshot();
  expect(snapshot.stage).toBe("result");
  if (snapshot.stage !== "result") {
    throw new Error(`The visit ended in ${snapshot.stage}.`);
  }
  const { visitLog, summary } = snapshot;
  expect(visitLog.visitType).toBe(visitType);
  visitLog.rooms.forEach((room) => {
    const attempts = visitLog.roomAttempts.filter(
      (attempt) => attempt.roomIndex === room.roomIndex,
    );
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.ending).toBe("finished");
  });
  expect(summary).toEqual(summarizeVisit(visitLog));
  return snapshot;
}

describe("visit flow: simulated visits to the result (R22.3)", () => {
  for (const visitType of visitTypes) {
    describe(`a ${visitType} visit`, () => {
      for (const { name, spec } of listeners) {
        it(
          `reaches the result with ${name}, with one finished run per room and the summary of its log`,
          async () => {
            const { summary } = await playToResult(visitType, spec);
            if (spec.kind !== "extreme") {
              return;
            }
            if (spec.name === "neverAnswers") {
              for (const room of summary.rooms) {
                expect(room.left.state).toBe("worseThanCap");
                expect(room.right.state).toBe("worseThanCap");
              }
            }
            if (
              spec.name === "answersAtRandom" ||
              spec.name === "alwaysAnswers"
            ) {
              expect(summary.visitFalseAlarmRateAboveLimit).toBe(true);
            }
          },
          timeoutMs,
        );
      }
    });
  }
});
