import { describe, expect, it } from "vitest";
import { soundRulesConfig } from "../../config/sound-rules-config";
import { bandEdges } from "./band-edges";

const width = soundRulesConfig.bandWidthOctaveFraction;

describe("bandEdges", () => {
  it("gives 445.4 to 561.2 Hz for 500 Hz", () => {
    const edges = bandEdges(500, width);
    expect(edges.lowHz).toBe(500 * 2 ** (-1 / 6));
    expect(edges.highHz).toBe(500 * 2 ** (1 / 6));
    expect(edges.lowHz.toFixed(1)).toBe("445.4");
    expect(edges.highHz.toFixed(1)).toBe("561.2");
  });

  it("gives 7127.2 to 8979.7 Hz for 8000 Hz", () => {
    const edges = bandEdges(8000, width);
    expect(edges.lowHz).toBe(8000 * 2 ** (-1 / 6));
    expect(edges.highHz).toBe(8000 * 2 ** (1 / 6));
    expect(edges.lowHz.toFixed(1)).toBe("7127.2");
    expect(edges.highHz.toFixed(1)).toBe("8979.7");
  });

  it("centres the band geometrically", () => {
    const edges = bandEdges(2000, width);
    expect(Math.sqrt(edges.lowHz * edges.highHz)).toBeCloseTo(2000, 9);
    expect(Math.log2(edges.highHz / edges.lowHz)).toBeCloseTo(1 / 3, 12);
  });
});
