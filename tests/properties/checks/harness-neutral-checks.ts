import type { HarnessNeutralCheck } from "./check-types";
import { cp1StepListenersExactCheck } from "./cp1-step-listeners-exact-check";
import { cp10GapMeansCheck } from "./cp10-gap-means-check";
import { cp10GapsInRangeCheck } from "./cp10-gaps-in-range-check";
import { cp2AccurateOrFlaggedCheck } from "./cp2-accurate-or-flagged-check";
import { cp3UsefulForAttentiveCheck } from "./cp3-useful-for-attentive-check";
import { cp4EveryRoomEndsCheck } from "./cp4-every-room-ends-check";
import { cp5LevelsInRangeCheck } from "./cp5-levels-in-range-check";
import { cp7NoSoundShareCheck } from "./cp7-no-sound-share-check";
import { cp8NoSoundUnpredictableCheck } from "./cp8-no-sound-unpredictable-check";
import { cp9SameSeedSameRoomCheck } from "./cp9-same-seed-same-room-check";

/**
 * Every harness-neutral check, in the order the property CLI runs and prints them (D21). These
 * are the checks the comparison counts, and they import nothing spec-only, so this file is
 * copied to the measurement branch as it is.
 */
export const harnessNeutralChecks: readonly HarnessNeutralCheck[] =
  Object.freeze([
    cp1StepListenersExactCheck,
    cp2AccurateOrFlaggedCheck,
    cp3UsefulForAttentiveCheck,
    cp4EveryRoomEndsCheck,
    cp5LevelsInRangeCheck,
    cp7NoSoundShareCheck,
    cp8NoSoundUnpredictableCheck,
    cp9SameSeedSameRoomCheck,
    cp10GapsInRangeCheck,
    cp10GapMeansCheck,
  ]);
