import fc from "fast-check";
import type { ThresholdSearchSettings } from "../../../src/engine/search-types";
import type { SearchUnderTest } from "../../listeners/search-under-test";
import { checkThat } from "./check-that";
import type { HarnessNeutralUniversalCheck } from "./check-types";
import { NotCheckableError } from "./not-checkable-error";
import { roomInputArbitrary, runInputRoom } from "./room-input-arbitrary";

/**
 * CP10. Gaps do not depend on the trial (Universal; R3.6), the universal part: every gap is a
 * whole number of milliseconds from `gapBetweenTrialsMinMs` to `gapBetweenTrialsMaxMs`. The
 * statistical part, which compares mean gaps, is a separate check (task 9).
 */
export const cp10GapsInRangeCheck: HarnessNeutralUniversalCheck = Object.freeze(
  {
    id: "CP10",
    part: "gaps in range",
    title: "Gaps do not depend on the trial",
    requirements: ["R3.6"],
    kind: "universal",
    harnessNeutral: true,
    notCheckableReason: () => undefined,
    parameters: { numRuns: 200 },
    property: (
      search: SearchUnderTest,
      settingsArbitrary: fc.Arbitrary<ThresholdSearchSettings>,
    ) =>
      fc.property(roomInputArbitrary(settingsArbitrary), (input) => {
        const { gapBetweenTrialsMinMs, gapBetweenTrialsMaxMs } = input.settings;
        for (const [index, trial] of runInputRoom(
          search,
          input,
        ).trials.entries()) {
          const where = `trial ${String(index + 1)}`;
          const gapMs = trial.gapBeforeMs;
          if (gapMs === undefined) {
            throw new NotCheckableError(
              `${where}: the search does not report the gap before a trial`,
            );
          }
          checkThat(
            Number.isInteger(gapMs) &&
              gapMs >= gapBetweenTrialsMinMs &&
              gapMs <= gapBetweenTrialsMaxMs,
            () =>
              `${where}: gap ${String(gapMs)} ms is not a whole number from ${String(gapBetweenTrialsMinMs)} to ${String(gapBetweenTrialsMaxMs)}`,
          );
        }
      }),
  },
);
