import fc from "fast-check";
import { describe, expect, it } from "vitest";

// Property 1 (R4.3): proves that Vitest and fast-check work together.
describe("fast-check setup", () => {
  it("reversing an integer array twice gives an equal array", () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (values) => {
        const twiceReversed = [...values].reverse().reverse();
        expect(twiceReversed).toEqual(values);
      }),
    );
  });
});
