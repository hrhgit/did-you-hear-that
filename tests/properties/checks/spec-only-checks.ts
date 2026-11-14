import type { SpecOnlyCheck } from "./check-types";
import { cp11EarsMixedCheck } from "./cp11-ears-mixed-check";
import { cp12ExtremeListenerExamplesCheck } from "./cp12-extreme-listener-examples-check";
import { cp12RandomAnswersFlaggedCheck } from "./cp12-random-answers-flagged-check";
import { cp13SettingsValidationCheck } from "./cp13-settings-validation-check";
import { cp4RoomTrialLimitCheck } from "./cp4-room-trial-limit-check";
import { cp6ResultMatchesRecordCheck } from "./cp6-result-matches-record-check";

export { noSoundScheduleReport } from "./no-sound-schedule-report";

/**
 * Every spec-only check (D21, D38). The property CLI loads this module only for the search
 * named "spec", so that the CLI runs unchanged where the spec engine does not exist (D39).
 */
export const specOnlyChecks: readonly SpecOnlyCheck[] = Object.freeze([
  cp4RoomTrialLimitCheck,
  cp6ResultMatchesRecordCheck,
  cp11EarsMixedCheck,
  cp12ExtremeListenerExamplesCheck,
  cp12RandomAnswersFlaggedCheck,
  cp13SettingsValidationCheck,
]);
