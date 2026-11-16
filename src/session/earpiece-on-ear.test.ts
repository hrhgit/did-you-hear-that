import { describe, expect, it } from "vitest";
import { earpieceOnEar } from "./earpiece-on-ear";
import type { EarpieceArrangement } from "./visit-flow-types";

describe("earpieceOnEar", () => {
  it("puts each earpiece on its own ear as marked", () => {
    expect(earpieceOnEar("asMarked")).toEqual({ left: "left", right: "right" });
  });

  it("puts the left earpiece on the right ear and the right earpiece on the left ear when swapped", () => {
    expect(earpieceOnEar("swapped")).toEqual({ left: "right", right: "left" });
  });

  it("gives a frozen result", () => {
    expect(Object.isFrozen(earpieceOnEar("asMarked"))).toBe(true);
    expect(Object.isFrozen(earpieceOnEar("swapped"))).toBe(true);
  });

  it("throws a RangeError for any other arrangement", () => {
    expect(() => earpieceOnEar("backwards" as EarpieceArrangement)).toThrow(
      RangeError,
    );
  });
});
