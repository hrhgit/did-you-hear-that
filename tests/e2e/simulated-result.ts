import type { VisitType } from "../../src/config/hearing-method-config";
import type { ResultSnapshot } from "../../src/session/visit-flow-types";
import type { ExtremeListenerName } from "../listeners/extreme-listeners";
import type { PsychometricListenerParameters } from "../listeners/psychometric-listener";
import {
  playVisit,
  type VisitorListenerSpec,
} from "../listeners/simulated-visitor";
import { createVisitHarness } from "../properties/visit-flow-harness";

/**
 * A whole visit played in Node by a simulated visitor, on the fake audio backend and the manual
 * timer, up to its result. The browser tests of the result page hand its log and summary to the
 * page, so the page is drawn from what the visit flow really gives and no sound is ever played.
 */

/** Who walks through the house: a listener with a threshold in each ear, or one of the extremes. */
export type SimulatedVisitor =
  | {
      readonly kind: "thresholds";
      readonly leftDb: number;
      readonly rightDb: number;
    }
  | { readonly kind: "extreme"; readonly name: ExtremeListenerName };

function listenerOf(visitor: SimulatedVisitor): VisitorListenerSpec {
  if (visitor.kind === "extreme") {
    return { kind: "extreme", name: visitor.name, seed: 31 };
  }
  const parameters: PsychometricListenerParameters = {
    trueThresholdDb: { left: visitor.leftDb, right: visitor.rightDb },
    widthDb: 2.5,
    lapseFraction: 0.01,
    falseAlarmFraction: 0.01,
    wrongSideFraction: 0.005,
  };
  return { kind: "psychometric", parameters, seed: 11 };
}

/** Plays a visit to its result. Throws if the visit does not reach it. */
export async function simulatedResult(
  visitType: VisitType,
  visitor: SimulatedVisitor,
  seed = 20261120,
): Promise<Pick<ResultSnapshot, "visitLog" | "summary">> {
  const harness = createVisitHarness({ seed, performanceOffsetMs: 4321 });
  const run = await playVisit(harness, {
    visitType,
    calibrationTargetDb: -22,
    firstHeadphoneCheckAnswer: "left",
    listener: listenerOf(visitor),
    visitorSeed: seed + 1,
    answerDelayMaxMs: 400,
    timeStampModes: ["now"],
    restMaxMs: 200,
    extraPresses: [],
    disturbances: [],
    ending: null,
  });
  const snapshot = harness.flow.snapshot();
  if (run.ending !== "done" || snapshot.stage !== "result") {
    throw new Error(
      `The simulated visit ended in ${snapshot.stage}, not in its result.`,
    );
  }
  return { visitLog: snapshot.visitLog, summary: snapshot.summary };
}
