/**
 * The time an answer counts at (R7.8, D33): `pressedAtMs` when it is a finite number no later than
 * `nowMs`, and `nowMs` otherwise. A missing, non-finite or future time stamp would put the answer
 * at a moment that did not happen; the timer's time is the latest the press can have been. A pure
 * function.
 */
export function answerTimeMs(
  pressedAtMs: number | undefined,
  nowMs: number,
): number {
  if (
    typeof pressedAtMs === "number" &&
    Number.isFinite(pressedAtMs) &&
    pressedAtMs <= nowMs
  ) {
    return pressedAtMs;
  }
  return nowMs;
}
