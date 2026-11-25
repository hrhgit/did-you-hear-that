/**
 * The headphone rows of the result page (headphone-traits R6): what one visit says about the
 * headphones at this volume. One short row each; the reason behind it in small text.
 */
export const headphoneTraitsCopy = Object.freeze({
  heading: "Your headphones",
  delayLabel: "Delay",
  quietCutLabel: "Quietest",
  balanceLabel: "Balance",
  delayBands: Object.freeze({
    quick: "quick",
    noticeable: "noticeable",
    long: "long, as on most wireless",
  }),
  /** Under the delay, when the beat waited for the sound as the visitor played. */
  delayEasedNote: "The beat was timed to it as you played.",
  quietCutNote:
    "The same edge at every pitch points to the headphones or the system.",
  balanceEvenLine: "Even",
  balanceOffsetNote:
    "About the same at every pitch, which points to the headphones or a balance setting.",
});

function requireFinite(value: number, what: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(
      `${what} must be a finite number, but got ${String(value)}.`,
    );
  }
}

/** "About 140 ms, noticeable", or "Quick" when it rounds to nothing. */
export function delayLine(
  roundedMs: number,
  band: keyof typeof headphoneTraitsCopy.delayBands,
): string {
  requireFinite(roundedMs, "The delay");
  if (Math.round(roundedMs) <= 0) {
    return "Quick";
  }
  return `About ${String(Math.max(0, Math.round(roundedMs)))} ms, ${headphoneTraitsCopy.delayBands[band]}`;
}

/** "Nothing below about 37 dB under your calibration". */
export function quietCutLine(levelDb: number): string {
  requireFinite(levelDb, "The cut");
  const whole = Math.round(levelDb);
  return whole < 0
    ? `Nothing below about ${String(-whole)} dB under your calibration`
    : `Nothing below about your calibration`;
}

/**
 * "Right side needed about 6 dB more". Not "quieter": the floors already use "quieter on the left"
 * for the side that caught quieter sounds.
 */
export function balanceOffsetLine(
  quieterSide: "left" | "right",
  offsetDb: number,
): string {
  requireFinite(offsetDb, "The offset");
  const side = quieterSide === "left" ? "Left" : "Right";
  return `${side} side needed about ${String(Math.round(offsetDb))} dB more`;
}
