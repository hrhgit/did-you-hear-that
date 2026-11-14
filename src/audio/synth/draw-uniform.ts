import type { RandomSource } from "../../config/seeded-random";

/**
 * Draws one number uniformly from [minimum, maximum) with one call of `random.next()` (D34).
 * When the two are equal it still makes the call, so the number of draws never depends on the
 * configured values.
 */
export function drawUniform(
  random: RandomSource,
  minimum: number,
  maximum: number,
): number {
  return minimum + (maximum - minimum) * random.next();
}
