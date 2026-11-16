import type { Ear, EarpieceArrangement } from "./visit-flow-types";

const asMarked: Readonly<Record<Ear, Ear>> = Object.freeze({
  left: "left",
  right: "right",
});

const swapped: Readonly<Record<Ear, Ear>> = Object.freeze({
  left: "right",
  right: "left",
});

/**
 * For each ear, the earpiece on it (swapped-repeat design.md, "Ears, earpieces and the output"):
 * as marked, its own; swapped, the other. Frozen. A pure function.
 */
export function earpieceOnEar(
  arrangement: EarpieceArrangement,
): Readonly<Record<Ear, Ear>> {
  switch (arrangement) {
    case "asMarked":
      return asMarked;
    case "swapped":
      return swapped;
    default:
      throw new RangeError(
        `An earpiece arrangement must be asMarked or swapped, but got ${String(arrangement)}.`,
      );
  }
}
