import type { Ear } from "./output-types";

/**
 * The one place where `left` and `right` become channel indices (D25). Web Audio addresses a
 * channel by its index, so the output graph reads it here and nowhere else uses 0 or 1 for a
 * channel. The Browser_Suite's offline render checks that the left channel comes out first.
 */
export const channelIndex: Readonly<Record<Ear, number>> = Object.freeze({
  left: 0,
  right: 1,
});
