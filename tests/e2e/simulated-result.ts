import type { VisitType } from "../../src/config/hearing-method-config";
import { visitFlowConfig } from "../../src/config/visit-flow-config";
import type { VisitToSave } from "../../src/session/result-page-types";
import type { ResultSnapshot } from "../../src/session/visit-flow-types";
import type { ExtremeListenerName } from "../listeners/extreme-listeners";
import type { PsychometricListenerParameters } from "../listeners/psychometric-listener";
import {
  playVisit,
  type VisitorListenerSpec,
  type VisitorSwappedRepeatBehaviour,
} from "../listeners/simulated-visitor";
import { createVisitHarness } from "../properties/visit-flow-harness";

/**
 * A whole visit played in Node by a simulated visitor, on the fake audio backend and the manual
 * timer, up to its result. It is a visit in the one room: as many searches take turns as the
 * shipped site runs together (one-room design.md, D1). The browser tests of the result page hand
 * its log and summary to the page, so the page is drawn from what the visit flow really gives and
 * no sound is ever played.
 */

/** Who walks through the house: a listener with a threshold in each ear, or one of the extremes. */
export type SimulatedVisitor =
  | {
      readonly kind: "thresholds";
      readonly leftDb: number;
      readonly rightDb: number;
    }
  | { readonly kind: "extreme"; readonly name: ExtremeListenerName };

/** The listener behind a simulated visitor. */
export function listenerOf(visitor: SimulatedVisitor): VisitorListenerSpec {
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

/** What the visitor does after the result, when it repeats a floor with the headphones swapped. */
export interface SimulatedRepeat {
  /** The floor it repeats, as the simulated visitor names one. */
  readonly floor: VisitorSwappedRepeatBehaviour["floor"];
  /** Whether it really swaps the earpieces. A visitor who does not is told so by the check. */
  readonly swaps: boolean;
  /** How much quieter the right earpiece plays than the left, in dB. */
  readonly imbalanceDb: number;
}

/** A visit's result after one or more swapped repeats, as the flow hands it back to the page. */
export interface SimulatedRepeatedResult {
  readonly visit: Required<VisitToSave>;
  readonly turnBackLine: string | null;
}

async function playToResult(
  visitType: VisitType,
  visitor: SimulatedVisitor,
  seed: number,
  repeat: SimulatedRepeat | null,
): Promise<ResultSnapshot> {
  const harness = createVisitHarness({
    seed,
    performanceOffsetMs: 4321,
    roomsTogetherMaxCount: visitFlowConfig.roomsTogetherMaxCount,
  });
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
    ...(repeat === null
      ? {}
      : {
          headphones: { imbalanceDb: repeat.imbalanceDb },
          swappedRepeat: {
            floor: repeat.floor,
            swapsOnFirstInstruction: repeat.swaps,
            firstCheckAnswer: "heard",
            pressDelayMaxMs: 400,
            events: [],
            turnsBack: true,
          },
        }),
  });
  const snapshot = harness.flow.snapshot();
  if (run.ending !== "done" || snapshot.stage !== "result") {
    throw new Error(
      `The simulated visit ended in ${snapshot.stage}, not in its result.`,
    );
  }
  return snapshot;
}

/** Plays a visit to its result. Throws if the visit does not reach it. */
export async function simulatedResult(
  visitType: VisitType,
  visitor: SimulatedVisitor,
  seed = 20261120,
): Promise<Pick<ResultSnapshot, "visitLog" | "summary">> {
  const snapshot = await playToResult(visitType, visitor, seed, null);
  return { visitLog: snapshot.visitLog, summary: snapshot.summary };
}

/**
 * Plays a visit to its result, then repeats one floor with the headphones swapped, through the
 * check and the room, and back to the result. Throws if the visit does not get back to its result
 * with the repeat run to its end.
 */
export async function simulatedRepeatedResult(
  visitType: VisitType,
  visitor: SimulatedVisitor,
  repeat: SimulatedRepeat,
  seed = 20261120,
): Promise<SimulatedRepeatedResult> {
  const snapshot = await playToResult(visitType, visitor, seed, repeat);
  if (snapshot.swappedRepeats.length === 0) {
    throw new Error("The simulated visitor ran no swapped repeat to its end.");
  }
  return {
    visit: {
      visitLog: snapshot.visitLog,
      summary: snapshot.summary,
      swappedRepeats: snapshot.swappedRepeats,
    },
    turnBackLine: snapshot.turnBackLine,
  };
}
