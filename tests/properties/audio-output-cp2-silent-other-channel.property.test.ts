import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { preparePlayback } from "../../src/audio/output/prepare-playback";
import {
  materializeRequest,
  oneEarArbitrary,
  requestSpecArbitrary,
  wildBufferSpecArbitrary,
} from "./output-arbitraries";

/** Runs (design.md, Correctness properties). */
const runs = 300;

describe("audio output CP2. The other ear is silent (Universal; R6.1, R20.2; brief property 2)", () => {
  it("fills the other channel of every one-ear playback with exact +0, as long as the played one", () => {
    fc.assert(
      fc.property(
        requestSpecArbitrary({
          buffer: wildBufferSpecArbitrary,
          earChoice: oneEarArbitrary,
        }),
        (spec) => {
          const result = preparePlayback(materializeRequest(spec));
          if (result.kind === "refused") {
            return;
          }
          const [played, other] =
            spec.earChoice === "left"
              ? [result.left, result.right]
              : [result.right, result.left];
          expect(other.length).toBe(played.length);
          expect(other).not.toBe(played);
          const notZero = other.findIndex((sample) => !Object.is(sample, 0));
          expect(notZero).toBe(-1);
        },
      ),
      { numRuns: runs },
    );
  }, 120_000);
});
