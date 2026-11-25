import { describe, expect, it } from "vitest";
import type { FoundEdge } from "./quiet-cut";
import { findQuietCut } from "./quiet-cut";

const edge = (
  frequencyHz: number,
  ear: "left" | "right",
  edgeDb: number,
  sharp = true,
): FoundEdge => ({
  roomIndex: 0,
  frequencyHz,
  ear,
  edgeDb,
  sharp,
  floorDb: -60,
});

const piled = [
  edge(500, "left", -32),
  edge(1000, "left", -31),
  edge(2000, "right", -33),
  edge(4000, "right", -30),
  edge(8000, "left", -15),
];

describe("findQuietCut", () => {
  it("finds edges piled up at several pitches", () => {
    const cut = findQuietCut(piled, -32.5);
    expect(cut?.levelDb).toBeCloseTo(-31.5);
    expect(cut?.edges).toHaveLength(4);
  });

  it("is null when something was caught below the pile", () => {
    expect(findQuietCut(piled, -40)).toBeNull();
  });

  it("is null when the edges are spread out", () => {
    expect(
      findQuietCut(
        [
          edge(500, "left", -40),
          edge(1000, "left", -30),
          edge(2000, "left", -20),
          edge(4000, "left", -10),
        ],
        -40,
      ),
    ).toBeNull();
  });

  it("is null with too few pitches or too few sharp edges", () => {
    expect(
      findQuietCut(
        [
          edge(500, "left", -31),
          edge(500, "right", -31),
          edge(1000, "left", -31),
          edge(1000, "right", -31),
        ],
        -31,
      ),
    ).toBeNull();
    expect(
      findQuietCut(
        piled.map((e, i) => ({ ...e, sharp: i === 0 })),
        -33,
      ),
    ).toBeNull();
  });

  it("is null when the pile sits at the floor", () => {
    expect(
      findQuietCut(
        piled.map((e) => ({ ...e, floorDb: -30 })),
        -33,
      ),
    ).toBeNull();
  });
});
