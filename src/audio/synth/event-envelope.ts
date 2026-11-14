import { raisedCosineRamp } from "./raised-cosine-ramp";

/** The cellar knock's decay: a raised-cosine fall to zero over `decayMs`. */
export interface RaisedCosineDecay {
  readonly kind: "raisedCosine";
  readonly decayMs: number;
}

/**
 * The nursery note's decay: `(1 + t/τ) e^(−t/τ)` after the peak, multiplied by a raised-cosine
 * release over the last `releaseMs` of the note, so that it reaches exactly zero at `lengthMs`
 * (D35). `lengthMs` counts from the start of the attack.
 */
export interface NoteDecay {
  readonly kind: "note";
  readonly timeConstantMs: number;
  readonly lengthMs: number;
  readonly releaseMs: number;
}

export type EventDecay = RaisedCosineDecay | NoteDecay;

/**
 * The envelope of one event at `timeMs` after its start: zero before the start, a raised-cosine
 * rise to 1 over `attackMs`, then the decay. The rise and both decays have zero slope where they
 * meet, and at the start and the end of the event, which keeps their spectra narrow.
 */
export function eventEnvelope(
  timeMs: number,
  attackMs: number,
  decay: EventDecay,
): number {
  if (timeMs <= 0) {
    return 0;
  }
  if (timeMs < attackMs) {
    return raisedCosineRamp(timeMs / attackMs);
  }
  const sinceAttackMs = timeMs - attackMs;
  if (decay.kind === "raisedCosine") {
    return raisedCosineRamp(1 - sinceAttackMs / decay.decayMs);
  }
  if (timeMs >= decay.lengthMs) {
    return 0;
  }
  const decayPosition = sinceAttackMs / decay.timeConstantMs;
  const release = raisedCosineRamp((decay.lengthMs - timeMs) / decay.releaseMs);
  return (1 + decayPosition) * Math.exp(-decayPosition) * release;
}
