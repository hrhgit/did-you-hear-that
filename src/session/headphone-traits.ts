import type { HeadphoneTraitsConfig } from "../config/headphone-traits-config";
import { headphoneTraitsConfig } from "../config/headphone-traits-config";
import type { Ear } from "../engine/search-types";
import type { Balance, PitchPair } from "./left-right-balance";
import { estimateBalance } from "./left-right-balance";
import type { OutputDelayEstimate } from "./output-delay";
import { estimateOutputDelay } from "./output-delay";
import type { FoundEdge, QuietCut } from "./quiet-cut";
import { findQuietCut } from "./quiet-cut";
import { judgementOf } from "./rhythm-score";
import type {
  LoggedRoomAttempt,
  ScoredVisitTrial,
  VisitLog,
} from "./visit-flow-types";

export type DelayBand = "quick" | "noticeable" | "long";

export interface DelayTrait extends OutputDelayEstimate {
  /** `delayMs` rounded to `delayRoundingMs`. */
  readonly roundedMs: number;
  readonly band: DelayBand;
  /** How many heard catches it rests on. */
  readonly heardCount: number;
}

/** What one visit says about the headphones at this volume (headphone-traits R3 to R5). */
export interface HeadphoneTraits {
  readonly delay: DelayTrait | null;
  readonly quietCut: QuietCut | null;
  readonly balance: Balance | null;
}

const ears: readonly Ear[] = ["left", "right"];

/** The answer times the delay rests on, from a visit log (design.md "The estimate"). */
export function delayEvidenceOf(
  log: VisitLog,
  settings: Pick<
    HeadphoneTraitsConfig,
    "loudLevelMinDb"
  > = headphoneTraitsConfig,
): { readonly heardMs: number[]; readonly seenMs: number[] } {
  const heardMs: number[] = [];
  for (const trial of log.trials) {
    if (
      trial.status === "scored" &&
      trial.kind === "sound" &&
      trial.outcome === "caught" &&
      trial.responseTimeMs !== null &&
      trial.playedLevelDb >= settings.loudLevelMinDb
    ) {
      heardMs.push(trial.responseTimeMs);
    }
  }
  for (const reminder of log.reminders ?? []) {
    if (
      reminder.status === "scored" &&
      reminder.outcome === "caught" &&
      reminder.responseTimeMs !== null
    ) {
      heardMs.push(reminder.responseTimeMs);
    }
  }
  const seenMs = (log.practice?.trials ?? [])
    .flatMap((trial) =>
      trial.status === "scored" &&
      trial.outcome === "caught" &&
      trial.answeredAtMs !== null
        ? [trial.answeredAtMs - trial.presentedAtMs]
        : [],
    )
    // The first catch of the visit is the visitor learning the keys.
    .slice(1);
  return { heardMs, seenMs };
}

/** The last finished run of each room, by room index. */
function lastFinishedAttempts(log: VisitLog): Map<number, LoggedRoomAttempt> {
  const runs = new Map<number, LoggedRoomAttempt>();
  for (const attempt of log.roomAttempts) {
    if (attempt.ending === "finished" && attempt.result !== null) {
      runs.set(attempt.roomIndex, attempt);
    }
  }
  return runs;
}

function countedSoundTrials(
  log: VisitLog,
  attempt: LoggedRoomAttempt,
  ear: Ear,
): Extract<ScoredVisitTrial, { kind: "sound" }>[] {
  return log.trials.filter(
    (trial): trial is Extract<ScoredVisitTrial, { kind: "sound" }> =>
      trial.status === "scored" &&
      trial.kind === "sound" &&
      trial.roomIndex === attempt.roomIndex &&
      trial.attempt === attempt.attempt &&
      trial.ear === ear,
  );
}

/** The edge of every ear whose search found a level (design.md "The quiet cut"). */
export function foundEdgesOf(log: VisitLog): FoundEdge[] {
  const edges: FoundEdge[] = [];
  for (const [roomIndex, attempt] of lastFinishedAttempts(log)) {
    const room = log.rooms.find(
      (candidate) => candidate.roomIndex === roomIndex,
    );
    if (room === undefined || attempt.result === null) {
      continue;
    }
    for (const ear of ears) {
      if (attempt.result[ear].state !== "found") {
        continue;
      }
      const trials = countedSoundTrials(log, attempt, ear);
      const caught = trials.filter((trial) => trial.outcome === "caught");
      if (caught.length === 0) {
        continue;
      }
      const quietest = caught.reduce((low, trial) =>
        trial.playedLevelDb < low.playedLevelDb ? trial : low,
      );
      const missesBelow = trials.filter(
        (trial) =>
          trial.outcome !== "caught" &&
          trial.playedLevelDb < quietest.playedLevelDb,
      );
      if (missesBelow.length === 0) {
        continue;
      }
      const missDb = Math.max(
        ...missesBelow.map((trial) => trial.playedLevelDb),
      );
      const judgement = judgementOf(quietest);
      edges.push(
        Object.freeze({
          roomIndex,
          frequencyHz: room.frequencyHz,
          ear,
          edgeDb: (quietest.playedLevelDb + missDb) / 2,
          sharp: judgement === "perfect" || judgement === "great",
          floorDb: attempt.searchFloorDb ?? Number.NEGATIVE_INFINITY,
        }),
      );
    }
  }
  return edges;
}

/** The levels both ears found, for each pitch where both did. */
export function pitchPairsOf(log: VisitLog): PitchPair[] {
  const pairs: PitchPair[] = [];
  for (const [roomIndex, attempt] of lastFinishedAttempts(log)) {
    const room = log.rooms.find(
      (candidate) => candidate.roomIndex === roomIndex,
    );
    const result = attempt.result;
    if (
      room !== undefined &&
      result !== null &&
      result.left.state === "found" &&
      result.right.state === "found"
    ) {
      pairs.push({
        frequencyHz: room.frequencyHz,
        leftDb: result.left.thresholdDb,
        rightDb: result.right.thresholdDb,
      });
    }
  }
  return pairs;
}

function bandOf(delayMs: number, settings: HeadphoneTraitsConfig): DelayBand {
  if (delayMs < settings.quickBelowMs) {
    return "quick";
  }
  return delayMs < settings.longFromMs ? "noticeable" : "long";
}

/** The three traits of one visit. A pure function of the log. */
export function headphoneTraitsOf(
  log: VisitLog,
  settings: HeadphoneTraitsConfig = headphoneTraitsConfig,
): HeadphoneTraits {
  const { heardMs, seenMs } = delayEvidenceOf(log, settings);
  const estimate =
    heardMs.length >= settings.delayLoudCatchesMinCount
      ? estimateOutputDelay(heardMs, seenMs, settings)
      : null;
  const delay: DelayTrait | null =
    estimate === null
      ? null
      : Object.freeze({
          ...estimate,
          roundedMs:
            Math.round(estimate.delayMs / settings.delayRoundingMs) *
            settings.delayRoundingMs,
          band: bandOf(estimate.delayMs, settings),
          heardCount: heardMs.length,
        });

  const caughtLevels = log.trials.flatMap((trial) =>
    trial.status === "scored" &&
    trial.kind === "sound" &&
    trial.outcome === "caught"
      ? [trial.playedLevelDb]
      : [],
  );
  const quietestCatchDb =
    caughtLevels.length === 0
      ? Number.POSITIVE_INFINITY
      : Math.min(...caughtLevels);

  return Object.freeze({
    delay,
    quietCut: findQuietCut(foundEdgesOf(log), quietestCatchDb, settings),
    balance: estimateBalance(pitchPairsOf(log), settings),
  });
}
