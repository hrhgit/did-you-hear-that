import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../config/hearing-method-config";
import { finalizeEarResult } from "./finalize-ear-result";
import { createQuickEarSearch } from "./quick-ear-search";

const settings = { ...hearingMethodConfig, floorDb: -30 };

describe("the quick hearing search", () => {
  it("keeps a Perfect catch when the next quieter sound is missed", () => {
    const ear = createQuickEarSearch("left", settings);
    ear.record("caught", "perfect");
    ear.record("caught", "perfect");
    ear.record("missed");

    expect(ear.presentations().map(({ levelDb }) => levelDb)).toEqual([
      -10, -20, -30,
    ]);
    expect(ear.ending()).toEqual({ kind: "found", thresholdDb: -20 });
  });

  it("confirms a slower catch at the heard level once", () => {
    const ear = createQuickEarSearch("left", settings);
    ear.record("caught", "perfect");
    ear.record("caught");
    ear.record("missed");
    expect(ear.next().levelDb).toBe(-20);
    ear.record("caught");

    expect(ear.ending()).toEqual({ kind: "found", thresholdDb: -20 });
  });

  it("ends without a level when the one confirmation is missed", () => {
    const ear = createQuickEarSearch("left", settings);
    ear.record("caught");
    ear.record("missed");
    expect(ear.next().levelDb).toBe(-10);
    ear.record("missed");
    expect(
      finalizeEarResult({
        ending: ear.ending()!,
        presentations: ear.presentations(),
        falseAlarmRateAboveLimit: false,
        settings,
      }),
    ).toMatchObject({
      state: "unreliable",
      reasons: ["inconsistentCatch"],
      catchCount: 1,
      missCount: 2,
    });
  });

  it("rises after an initial miss and stops at the first confirmed catch", () => {
    const ear = createQuickEarSearch("right", settings);
    ear.record("missed");
    expect(ear.next().levelDb).toBe(-5);
    ear.record("caught", "perfect");
    expect(ear.ending()).toEqual({ kind: "found", thresholdDb: -5 });
  });

  it("keeps the floor and cap outcomes", () => {
    const hearsFloor = createQuickEarSearch("left", settings);
    hearsFloor.record("caught", "perfect");
    hearsFloor.record("caught", "perfect");
    expect(hearsFloor.next().levelDb).toBe(settings.floorDb);
    hearsFloor.record("caught");
    expect(hearsFloor.next().levelDb).toBe(settings.floorDb);
    hearsFloor.record("caught");
    expect(hearsFloor.ending()).toEqual({ kind: "betterThanFloor" });

    const missesCap = createQuickEarSearch("right", settings);
    for (const levelDb of [-10, -5, 0, 5, 5]) {
      expect(missesCap.next().levelDb).toBe(levelDb);
      missesCap.record("missed");
    }
    expect(missesCap.ending()).toEqual({ kind: "worseThanCap" });
  });
});
