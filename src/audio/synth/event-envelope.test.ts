import { describe, expect, it } from "vitest";
import { ghostSoundConfig } from "../../config/ghost-sound-config";
import type { EventDecay } from "./event-envelope";
import { eventEnvelope } from "./event-envelope";

const { cellar, nursery } = ghostSoundConfig;

const knockDecay: EventDecay = {
  kind: "raisedCosine",
  decayMs: cellar.knockDecayMs,
};
const noteDecay: EventDecay = {
  kind: "note",
  timeConstantMs: nursery.noteDecayTimeConstantMs,
  lengthMs: nursery.noteLengthMs,
  releaseMs: nursery.noteReleaseMs,
};

const shapes = [
  { name: "knock", attackMs: cellar.knockAttackMs, decay: knockDecay },
  { name: "note", attackMs: nursery.noteAttackMs, decay: noteDecay },
] as const;

/** Step for the numerical slopes, in milliseconds. */
const stepMs = 1e-4;

/** Slope just to the left and just to the right of `timeMs`, per millisecond. */
function slopes(
  envelope: (timeMs: number) => number,
  timeMs: number,
): { left: number; right: number } {
  return {
    left: (envelope(timeMs) - envelope(timeMs - stepMs)) / stepMs,
    right: (envelope(timeMs + stepMs) - envelope(timeMs)) / stepMs,
  };
}

describe("eventEnvelope", () => {
  for (const { name, attackMs, decay } of shapes) {
    const envelope = (timeMs: number): number =>
      eventEnvelope(timeMs, attackMs, decay);
    const endMs =
      decay.kind === "note" ? decay.lengthMs : attackMs + decay.decayMs;

    describe(name, () => {
      it("is zero at the start and before it", () => {
        expect(envelope(0)).toBe(0);
        expect(envelope(-5)).toBe(0);
      });

      it("peaks at 1 at the end of the attack", () => {
        expect(envelope(attackMs)).toBe(1);
        for (let timeMs = 0; timeMs <= endMs + 10; timeMs += 0.5) {
          expect(envelope(timeMs)).toBeLessThanOrEqual(1);
          expect(envelope(timeMs)).toBeGreaterThanOrEqual(0);
        }
      });

      it("rises monotonically over the attack", () => {
        for (let timeMs = 0.5; timeMs <= attackMs; timeMs += 0.5) {
          expect(envelope(timeMs)).toBeGreaterThan(envelope(timeMs - 0.5));
        }
      });

      it("has zero slope at the start, at the peak and at the end", () => {
        for (const joinMs of [0, attackMs, endMs]) {
          const { left, right } = slopes(envelope, joinMs);
          expect(Math.abs(left), `left of ${joinMs} ms`).toBeLessThan(1e-3);
          expect(Math.abs(right), `right of ${joinMs} ms`).toBeLessThan(1e-3);
        }
      });

      it("is zero at and after its end", () => {
        expect(envelope(endMs)).toBe(0);
        expect(envelope(endMs + 1)).toBe(0);
        expect(envelope(endMs + 1000)).toBe(0);
      });
    });
  }

  it("joins the note's decay and release with a continuous slope", () => {
    const envelope = (timeMs: number): number =>
      eventEnvelope(timeMs, nursery.noteAttackMs, noteDecay);
    const releaseStartMs = nursery.noteLengthMs - nursery.noteReleaseMs;
    const { left, right } = slopes(envelope, releaseStartMs);
    expect(Math.abs(left - right)).toBeLessThan(1e-5);
  });

  it("decays the note with the configured time constant after the peak", () => {
    const decayPosition = 50 / nursery.noteDecayTimeConstantMs;
    expect(
      eventEnvelope(nursery.noteAttackMs + 50, nursery.noteAttackMs, noteDecay),
    ).toBeCloseTo((1 + decayPosition) * Math.exp(-decayPosition), 12);
  });
});
