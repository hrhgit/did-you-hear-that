import { describe, expect, it } from "vitest";
import { drawUniform } from "./draw-uniform";

describe("drawUniform", () => {
  it("maps one draw linearly onto the range", () => {
    const fixed = (value: number) => ({ seed: 0, next: () => value });
    expect(drawUniform(fixed(0), 20, 40)).toBe(20);
    expect(drawUniform(fixed(0.5), 20, 40)).toBe(30);
    expect(drawUniform(fixed(0.25), -3, 0)).toBe(-2.25);
  });

  it("makes exactly one draw, even for an empty range", () => {
    let calls = 0;
    const random = { seed: 0, next: () => (calls += 1) && 0.5 };
    expect(drawUniform(random, 5, 5)).toBe(5);
    expect(calls).toBe(1);
  });
});
