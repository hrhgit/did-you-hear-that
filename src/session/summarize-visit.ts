import type { HearingMethodConfig } from "../config/hearing-method-config";
import { hearingMethodConfig } from "../config/hearing-method-config";
import type { VisitFlowConfig } from "../config/visit-flow-config";
import { visitFlowConfig } from "../config/visit-flow-config";
import { judgeVisitFalseAlarms } from "./judge-visit-false-alarms";
import type {
  LoggedEarResult,
  LoggedRoomAttempt,
  LoggedRoomResult,
  RoomSummary,
  VisitEarResult,
  VisitLog,
  VisitSummary,
  VisitUnreliableReason,
} from "./visit-flow-types";

/** What `summarizeVisit` reads from the config. */
export type SummarizeVisitSettings = Pick<
  HearingMethodConfig,
  "swappedRepeatDifferenceDb"
> &
  Pick<VisitFlowConfig, "visitFalseAlarmRateUnreliableAboveFraction">;

const shippedSettings: SummarizeVisitSettings = Object.freeze({
  swappedRepeatDifferenceDb: hearingMethodConfig.swappedRepeatDifferenceDb,
  visitFalseAlarmRateUnreliableAboveFraction:
    visitFlowConfig.visitFalseAlarmRateUnreliableAboveFraction,
});

/** A finished attempt, with the result a finished attempt always has. */
type FinishedAttempt = LoggedRoomAttempt & {
  readonly result: LoggedRoomResult;
};

/** The last finished attempt of each room, in visit order. Throws for a room that has none. */
function finishedAttempts(log: VisitLog): readonly FinishedAttempt[] {
  return log.rooms.map((room) => {
    const attempts = log.roomAttempts.filter(
      (attempt): attempt is FinishedAttempt =>
        attempt.roomIndex === room.roomIndex &&
        attempt.ending === "finished" &&
        attempt.result !== null,
    );
    const last = attempts.at(-1);
    if (last === undefined) {
      throw new RangeError(
        `Room ${String(room.roomIndex)} of the visit log has no finished attempt, so the visit cannot be summarized.`,
      );
    }
    return last;
  });
}

/** Whether a decided sound trial of this attempt was played at another level than asked (D23). */
export function levelDiffers(
  log: VisitLog,
  attempt: LoggedRoomAttempt,
): boolean {
  return log.trials.some(
    (trial) =>
      trial.roomIndex === attempt.roomIndex &&
      trial.attempt === attempt.attempt &&
      trial.status === "scored" &&
      trial.kind === "sound" &&
      trial.playedLevelDb !== trial.requestedLevelDb,
  );
}

/** A frozen copy of the search's ear result with this spec's reasons added after its own. */
export function visitEarResult(
  searchResult: LoggedEarResult,
  addedReasons: readonly VisitUnreliableReason[],
): VisitEarResult {
  const counts = {
    presentationCount: searchResult.presentationCount,
    catchCount: searchResult.catchCount,
    wrongSideCount: searchResult.wrongSideCount,
    missCount: searchResult.missCount,
  };
  const searchReasons =
    searchResult.state === "unreliable" ? searchResult.reasons : [];
  const reasons = [...searchReasons, ...addedReasons];
  if (reasons.length > 0) {
    return Object.freeze({
      ...counts,
      state: "unreliable",
      reasons: Object.freeze(reasons),
    });
  }
  switch (searchResult.state) {
    case "found":
      return Object.freeze({
        ...counts,
        state: "found",
        thresholdDb: searchResult.thresholdDb,
      });
    case "betterThanFloor":
      return Object.freeze({ ...counts, state: "betterThanFloor" });
    case "worseThanCap":
      return Object.freeze({ ...counts, state: "worseThanCap" });
    case "unreliable":
      // An unreliable result always has a reason, so `reasons` above was not empty.
      throw new RangeError(
        "An unreliable ear result in the visit log has no reason.",
      );
  }
}

/**
 * The visit summary from the visit log (R18, D17, D23, D24). For each room, in visit order, it
 * takes the room's last finished attempt and gives each ear the search's result, made unreliable
 * with `levelNotAsAsked` when a decided sound trial of the attempt was played at another level
 * than asked, and with `visitFalseAlarmRate` when the pooled false alarm rate of the finished
 * attempts is above the visit limit. Reasons are only added, after the search's own. Abandoned
 * attempts are left out. No room is compared with another. A pure function; the summary is frozen.
 *
 * The shipped visit limit is a proposed value (Q1).
 */
export function summarizeVisit(
  log: VisitLog,
  settings: SummarizeVisitSettings = shippedSettings,
): VisitSummary {
  const attempts = finishedAttempts(log);
  const judgement = judgeVisitFalseAlarms(
    attempts.map((attempt) => attempt.result),
    settings.visitFalseAlarmRateUnreliableAboveFraction,
  );

  const rooms = log.rooms.map((room, position): RoomSummary => {
    const attempt = attempts[position] as FinishedAttempt;
    const addedReasons: VisitUnreliableReason[] = [];
    if (levelDiffers(log, attempt)) {
      addedReasons.push("levelNotAsAsked");
    }
    if (judgement.aboveLimit) {
      addedReasons.push("visitFalseAlarmRate");
    }
    const left = visitEarResult(attempt.result.left, addedReasons);
    const right = visitEarResult(attempt.result.right, addedReasons);
    const rightMinusLeftDb =
      left.state === "found" && right.state === "found"
        ? right.thresholdDb - left.thresholdDb
        : null;
    return Object.freeze({
      room,
      left,
      right,
      searchCapDb: attempt.searchCapDb,
      noSoundTrialCount: attempt.result.noSoundTrialCount,
      falseAlarmCount: attempt.result.falseAlarmCount,
      rightMinusLeftDb,
      swappedRepeatOffered:
        rightMinusLeftDb !== null &&
        Math.abs(rightMinusLeftDb) >= settings.swappedRepeatDifferenceDb,
    });
  });

  return Object.freeze({
    rooms: Object.freeze(rooms),
    pooledNoSoundTrialCount: judgement.pooledNoSoundTrialCount,
    pooledFalseAlarmCount: judgement.pooledFalseAlarmCount,
    pooledFalseAlarmRateFraction: judgement.pooledFalseAlarmRateFraction,
    visitFalseAlarmRateLimitFraction:
      settings.visitFalseAlarmRateUnreliableAboveFraction,
    visitFalseAlarmRateAboveLimit: judgement.aboveLimit,
    ignoredAnswerCount: log.ignoredAnswers.length,
  });
}
