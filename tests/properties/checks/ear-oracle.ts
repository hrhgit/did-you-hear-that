// An independent re-derivation of a room's result from its trial records (design.md, CP6).
//
// It is written from requirements.md, not from the engine's modules. Apart from the types it
// shares only `atLeastFraction` and `atMostFraction`, so that the oracle and the engine judge a
// share exactly at a limit the same way (D29). Where the engine keeps running tallies, the oracle
// recounts from the list of presentations every time, so a slip in either shows up as a
// disagreement.

import {
  atLeastFraction,
  atMostFraction,
} from "../../../src/engine/fraction-comparisons";
import type {
  Direction,
  Ear,
  EarResult,
  SoundOutcome,
  ThresholdSearchSettings,
  TrialRecord,
  UnreliableReason,
} from "../../../src/engine/search-types";

export interface OraclePresentation {
  readonly trialNumber: number;
  readonly levelDb: number;
  readonly direction: Direction;
  readonly outcome: SoundOutcome;
}

export type OracleEnding =
  | { readonly kind: "found"; readonly thresholdDb: number }
  | { readonly kind: "betterThanFloor" }
  | { readonly kind: "worseThanCap" }
  | { readonly kind: "trialLimit" };

export interface OracleEarReplay {
  readonly presentations: readonly OraclePresentation[];
  /** Undefined when the records end before any ending rule applies. */
  readonly ending: OracleEnding | undefined;
  /** The trial number of the presentation that ended the ear, if it ended. */
  readonly endingTrialNumber: number | undefined;
  /** Every way the records differ from what the requirements prescribe. Empty when they agree. */
  readonly mismatches: readonly string[];
}

export interface OracleRoom {
  readonly left: EarResult | undefined;
  readonly right: EarResult | undefined;
  readonly noSoundTrialCount: number;
  readonly falseAlarmCount: number;
  readonly falseAlarmRateFraction: number;
  readonly falseAlarmRateAboveLimit: boolean;
  readonly mismatches: readonly string[];
}

/** R4.2 to R4.4: the outcome a response to a sound trial for `ear` must have. */
function soundOutcomeOf(ear: Ear, response: string): SoundOutcome {
  if (response === "none") {
    return "missed";
  }
  return response === ear ? "caught" : "wrongSide";
}

/** R6.2, R6.5, R7.1, R7.2 and R8.1, applied after the latest presentation, in the order of R7.3. */
function endingAfter(
  presentations: readonly OraclePresentation[],
  settings: ThresholdSearchSettings,
): OracleEnding | undefined {
  const latest = presentations[presentations.length - 1];
  const caught = (presentation: OraclePresentation): boolean =>
    presentation.outcome === "caught";

  // R6.2: the ascending presentations at a level meet the rule, counting `extra` more catches.
  const meetsFoundRule = (levelDb: number, extra: number): boolean => {
    const ascendingHere = presentations.filter(
      (presentation) =>
        presentation.direction === "ascending" &&
        presentation.levelDb === levelDb,
    );
    const catches = ascendingHere.filter(caught).length + extra;
    return (
      catches >= settings.thresholdCatchesMinCount &&
      atLeastFraction(
        catches,
        ascendingHere.length + extra,
        settings.thresholdCatchShareMinFraction,
      )
    );
  };

  if (latest.direction === "ascending" && meetsFoundRule(latest.levelDb, 0)) {
    // R6.5: below the cap, the level one upward step lower must not be still open.
    const quieterDb = latest.levelDb - settings.upwardStepDb;
    const quieterStillOpen =
      latest.levelDb < settings.capRelativeToAnchorDb &&
      quieterDb > settings.floorDb &&
      meetsFoundRule(quieterDb, 1);
    if (!quieterStillOpen) {
      return { kind: "found", thresholdDb: latest.levelDb };
    }
  }

  if (latest.levelDb === settings.floorDb) {
    const atFloor = presentations.filter(
      (presentation) => presentation.levelDb === settings.floorDb,
    );
    const catches = atFloor.filter(caught).length;
    if (
      catches >= settings.floorCatchesForBetterThanFloorCount &&
      atLeastFraction(
        catches,
        atFloor.length,
        settings.thresholdCatchShareMinFraction,
      )
    ) {
      return { kind: "betterThanFloor" };
    }
  }

  if (
    latest.direction === "ascending" &&
    latest.levelDb === settings.capRelativeToAnchorDb
  ) {
    const notCaughtAtCap = presentations.filter(
      (presentation) =>
        presentation.direction === "ascending" &&
        presentation.levelDb === settings.capRelativeToAnchorDb &&
        !caught(presentation),
    ).length;
    if (notCaughtAtCap >= settings.capMissesForWorseThanCapCount) {
      return { kind: "worseThanCap" };
    }
  }

  if (presentations.length >= settings.trialLimitPerEarPerRoomCount) {
    return { kind: "trialLimit" };
  }
  return undefined;
}

/**
 * Replays one ear's presentations from a room's records. For each presentation it checks the
 * level and direction that R5 and D2 prescribe after the previous one, the outcome that R4
 * prescribes for its response, and that nothing is presented after the ear ended.
 */
export function replayEar(
  ear: Ear,
  records: readonly TrialRecord[],
  settings: ThresholdSearchSettings,
): OracleEarReplay {
  const presentations: OraclePresentation[] = [];
  const mismatches: string[] = [];
  let expectedLevelDb = settings.startingLevelDb;
  let expectedDirection: Direction = "first";
  let ending: OracleEnding | undefined;
  let endingTrialNumber: number | undefined;

  for (const record of records) {
    if (record.trial.kind !== "sound" || record.trial.ear !== ear) {
      continue;
    }
    const { trial } = record;
    const where = `${ear} trial ${String(trial.trialNumber)}`;
    if (ending !== undefined) {
      mismatches.push(
        `${where}: presented after the ear ended at trial ${String(endingTrialNumber)}`,
      );
      continue;
    }
    if (trial.levelDb !== expectedLevelDb) {
      mismatches.push(
        `${where}: level ${String(trial.levelDb)}, expected ${String(expectedLevelDb)}`,
      );
    }
    if (trial.direction !== expectedDirection) {
      mismatches.push(
        `${where}: direction ${trial.direction}, expected ${expectedDirection}`,
      );
    }
    const outcome = soundOutcomeOf(ear, record.response);
    if (record.outcome !== outcome) {
      mismatches.push(
        `${where}: outcome ${record.outcome} for response ${record.response}, expected ${outcome}`,
      );
    }
    presentations.push({
      trialNumber: trial.trialNumber,
      levelDb: trial.levelDb,
      direction: trial.direction,
      outcome,
    });

    ending = endingAfter(presentations, settings);
    if (ending !== undefined) {
      endingTrialNumber = trial.trialNumber;
    } else if (outcome === "caught") {
      // R5.2 and D2: one downward step, held at the floor, and the next presentation descends.
      expectedLevelDb = Math.max(
        settings.floorDb,
        trial.levelDb - settings.downwardStepDb,
      );
      expectedDirection = "descending";
    } else {
      // R5.3 and D2: one upward step, held at the cap, and the next presentation ascends.
      expectedLevelDb = Math.min(
        settings.capRelativeToAnchorDb,
        trial.levelDb + settings.upwardStepDb,
      );
      expectedDirection = "ascending";
    }
  }

  return { presentations, ending, endingTrialNumber, mismatches };
}

/** R8 and R11.2: the final state of an ear, its reasons and its counts. */
function earResultOf(
  replay: OracleEarReplay,
  falseAlarmRateAboveLimit: boolean,
  settings: ThresholdSearchSettings,
): EarResult | undefined {
  const { ending, presentations } = replay;
  if (ending === undefined) {
    return undefined;
  }
  const counts = {
    presentationCount: presentations.length,
    catchCount: presentations.filter((p) => p.outcome === "caught").length,
    wrongSideCount: presentations.filter((p) => p.outcome === "wrongSide")
      .length,
    missCount: presentations.filter((p) => p.outcome === "missed").length,
  };

  const reasons: UnreliableReason[] = [];
  if (ending.kind === "trialLimit") {
    reasons.push("trialLimit");
  }
  // R8.2 and R8.3: a catch at least the margin below the found level, or below the cap.
  const referenceDb =
    ending.kind === "found"
      ? ending.thresholdDb
      : ending.kind === "worseThanCap"
        ? settings.capRelativeToAnchorDb
        : undefined;
  if (
    referenceDb !== undefined &&
    presentations.some(
      (p) =>
        p.outcome === "caught" &&
        referenceDb - p.levelDb >= settings.inconsistentCatchMarginDb,
    )
  ) {
    reasons.push("inconsistentCatch");
  }
  if (falseAlarmRateAboveLimit) {
    reasons.push("falseAlarmRate");
  }

  if (reasons.length > 0) {
    return { ...counts, state: "unreliable", reasons };
  }
  switch (ending.kind) {
    case "found":
      return { ...counts, state: "found", thresholdDb: ending.thresholdDb };
    case "betterThanFloor":
      return { ...counts, state: "betterThanFloor" };
    case "worseThanCap":
      return { ...counts, state: "worseThanCap" };
  }
  return undefined;
}

/**
 * Replays a whole room from its records: both ears, the trial numbering (R3.5), the no-sound
 * outcomes (R4.5, R4.6), the phase of each no-sound trial (R9.1, R9.3), the false alarm count
 * and rate (R11.3) and each ear's final result (R8, R11.2). A room whose records end with an ear
 * still searching gets `undefined` for that ear and a mismatch.
 */
export function replayRoom(
  records: readonly TrialRecord[],
  settings: ThresholdSearchSettings,
): OracleRoom {
  const mismatches: string[] = [];
  const left = replayEar("left", records, settings);
  const right = replayEar("right", records, settings);
  mismatches.push(...left.mismatches, ...right.mismatches);

  const bothEndedBy = Math.max(
    left.endingTrialNumber ?? Number.POSITIVE_INFINITY,
    right.endingTrialNumber ?? Number.POSITIVE_INFINITY,
  );
  let noSoundTrialCount = 0;
  let falseAlarmCount = 0;
  records.forEach((record, index) => {
    const { trial } = record;
    if (trial.trialNumber !== index + 1) {
      mismatches.push(
        `record ${String(index + 1)}: trial number ${String(trial.trialNumber)}`,
      );
    }
    if (trial.kind !== "noSound") {
      return;
    }
    noSoundTrialCount += 1;
    const outcome = record.response === "none" ? "noResponse" : "falseAlarm";
    if (outcome === "falseAlarm") {
      falseAlarmCount += 1;
    }
    if (record.outcome !== outcome) {
      mismatches.push(
        `no-sound trial ${String(trial.trialNumber)}: outcome ${record.outcome} for response ${record.response}, expected ${outcome}`,
      );
    }
    const expectedPhase =
      trial.trialNumber > bothEndedBy ? "closing" : "search";
    if (trial.phase !== expectedPhase) {
      mismatches.push(
        `no-sound trial ${String(trial.trialNumber)}: phase ${trial.phase}, expected ${expectedPhase}`,
      );
    }
    // R9.3: a closing trial is added only while the share is below its minimum.
    if (
      expectedPhase === "closing" &&
      atLeastFraction(
        noSoundTrialCount - 1,
        index,
        settings.noSoundTrialShareMinFraction,
      )
    ) {
      mismatches.push(
        `no-sound trial ${String(trial.trialNumber)}: a closing trial after the share reached its minimum`,
      );
    }
  });
  // R9.3 and R10.3: the room finishes once both ears have ended and the share is in range.
  if (
    records.length > 0 &&
    bothEndedBy !== Number.POSITIVE_INFINITY &&
    !atLeastFraction(
      noSoundTrialCount,
      records.length,
      settings.noSoundTrialShareMinFraction,
    )
  ) {
    mismatches.push(
      "the records end with the no-sound share below its minimum",
    );
  }
  for (const [ear, replay] of [
    ["left", left],
    ["right", right],
  ] as const) {
    if (replay.ending === undefined) {
      mismatches.push(`${ear}: the records end while the ear is searching`);
    }
  }

  const falseAlarmRateFraction =
    noSoundTrialCount > 0 ? falseAlarmCount / noSoundTrialCount : 0;
  // R8.4 and D7: strictly above the limit, and never in a room without no-sound trials.
  const falseAlarmRateAboveLimit =
    noSoundTrialCount > 0 &&
    !atMostFraction(
      falseAlarmCount,
      noSoundTrialCount,
      settings.falseAlarmRateUnreliableAboveFraction,
    );

  return {
    left: earResultOf(left, falseAlarmRateAboveLimit, settings),
    right: earResultOf(right, falseAlarmRateAboveLimit, settings),
    noSoundTrialCount,
    falseAlarmCount,
    falseAlarmRateFraction,
    falseAlarmRateAboveLimit,
    mismatches,
  };
}
