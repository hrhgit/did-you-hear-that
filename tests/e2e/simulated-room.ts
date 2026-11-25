import type { VisitType } from "../../src/config/hearing-method-config";
import { visitFlowConfig } from "../../src/config/visit-flow-config";
import type {
  VisitEvent,
  VisitSnapshot,
} from "../../src/session/visit-flow-types";
import {
  playVisit,
  type VisitorSwappedRepeatBehaviour,
} from "../listeners/simulated-visitor";
import { createVisitHarness } from "../properties/visit-flow-harness";
import { listenerOf, type SimulatedVisitor } from "./simulated-result";

/** One thing the page is handed during a visit: a snapshot to show, or an event to react to. */
export type RoomMoment =
  | { readonly kind: "snapshot"; readonly snapshot: VisitSnapshot }
  | { readonly kind: "event"; readonly event: VisitEvent };

/**
 * A whole visit in the one room, played in Node by a simulated visitor on the fake audio backend
 * and the manual timer, with as many searches taking turns as the shipped site runs together
 * (one-room design.md, D1). It gives every snapshot and every event of the real visit flow, in the
 * order a visitor's page is handed them: the events of a step before its snapshot. The visitor
 * hears the missed sounds again before the result. With `swappedRepeat` the visitor goes on from
 * the result into a swapped repeat and comes back. No sound is played to make them.
 * Throws if the visit does not end at its result.
 */
export async function simulatedRoomVisit(
  visitType: VisitType,
  visitor: SimulatedVisitor,
  options: {
    readonly seed?: number;
    readonly swappedRepeat?: VisitorSwappedRepeatBehaviour;
  } = {},
): Promise<readonly RoomMoment[]> {
  const { seed = 20261120, swappedRepeat } = options;
  const harness = createVisitHarness({
    seed,
    performanceOffsetMs: 4321,
    roomsTogetherMaxCount: visitFlowConfig.roomsTogetherMaxCount,
  });
  const moments: RoomMoment[] = [
    { kind: "snapshot", snapshot: harness.flow.snapshot() },
  ];
  harness.flow.onEvent((event) => {
    moments.push({ kind: "event", event });
  });
  harness.flow.subscribe((snapshot) => {
    moments.push({ kind: "snapshot", snapshot });
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
    ...(swappedRepeat === undefined ? {} : { swappedRepeat }),
  });
  if (run.ending !== "done" || run.finalStage !== "result") {
    throw new Error(
      `The simulated visit ended in ${run.finalStage}, not in its result.`,
    );
  }
  return moments;
}
