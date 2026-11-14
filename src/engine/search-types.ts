import type { HearingMethodConfig } from "../config/hearing-method-config";

export type Ear = "left" | "right";
/** Named to avoid the DOM's global `Response`. */
export type VisitorResponse = Ear | "none";
export type Direction = "first" | "descending" | "ascending";
export type SoundOutcome = "caught" | "wrongSide" | "missed";
export type NoSoundOutcome = "falseAlarm" | "noResponse";

export type ThresholdSearchSettings = Pick<
  HearingMethodConfig,
  | "downwardStepDb"
  | "upwardStepDb"
  | "startingLevelDb"
  | "capRelativeToAnchorDb"
  | "floorDb"
  | "gapBetweenTrialsMinMs"
  | "gapBetweenTrialsMaxMs"
  | "noSoundTrialShareMinFraction"
  | "noSoundTrialShareMaxFraction"
  | "noSoundTrialProbabilityFraction"
  | "falseAlarmRateUnreliableAboveFraction"
  | "trialLimitPerEarPerRoomCount"
  | "thresholdCatchesMinCount"
  | "thresholdCatchShareMinFraction"
  | "floorCatchesForBetterThanFloorCount"
  | "capMissesForWorseThanCapCount"
  | "inconsistentCatchMarginDb"
>;

export interface SoundTrial {
  readonly kind: "sound";
  readonly trialNumber: number;
  readonly ear: Ear;
  readonly levelDb: number;
  readonly direction: Direction;
  readonly gapBeforeMs: number;
}

export interface NoSoundTrial {
  readonly kind: "noSound";
  readonly trialNumber: number;
  readonly phase: "search" | "closing";
  readonly gapBeforeMs: number;
}

export type Trial = SoundTrial | NoSoundTrial;

export type TrialRecord =
  | {
      readonly trial: SoundTrial;
      readonly response: VisitorResponse;
      readonly outcome: SoundOutcome;
    }
  | {
      readonly trial: NoSoundTrial;
      readonly response: VisitorResponse;
      readonly outcome: NoSoundOutcome;
    };

export type UnreliableReason =
  "trialLimit" | "inconsistentCatch" | "falseAlarmRate";

export interface EarCounts {
  readonly presentationCount: number;
  readonly catchCount: number;
  readonly wrongSideCount: number;
  /** Sound trials answered with "none". Wrong-side answers are counted in wrongSideCount only. */
  readonly missCount: number;
}

export type EarResult =
  | (EarCounts & { readonly state: "found"; readonly thresholdDb: number })
  | (EarCounts & { readonly state: "betterThanFloor" })
  | (EarCounts & { readonly state: "worseThanCap" })
  | (EarCounts & {
      readonly state: "unreliable";
      readonly reasons: readonly UnreliableReason[];
    });

export interface RoomResult {
  readonly left: EarResult;
  readonly right: EarResult;
  readonly noSoundTrialCount: number;
  readonly falseAlarmCount: number;
  /** falseAlarmCount / noSoundTrialCount, or 0 when the room had no no-sound trial. */
  readonly falseAlarmRateFraction: number;
  readonly falseAlarmRateAboveLimit: boolean;
  readonly trials: readonly TrialRecord[];
}

export type SearchStep =
  | { readonly kind: "trial"; readonly trial: Trial }
  | { readonly kind: "finished"; readonly result: RoomResult };

export interface ThresholdSearch {
  /** The trial waiting for a response, or the result. Has no effect and may be called any number of times. */
  current(): SearchStep;
  /** Records the response to the waiting trial and returns the next step. */
  respond(response: VisitorResponse): SearchStep;
}
