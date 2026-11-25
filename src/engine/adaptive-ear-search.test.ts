import { adaptiveHearingConfig } from "../config/adaptive-hearing-config";
import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../config/hearing-method-config";
import { createAdaptiveEarSearch } from "./adaptive-ear-search";

const settings = { ...hearingMethodConfig, floorDb: -45 };

describe("the adaptive hearing search", () => {
  it("takes smaller downward steps near the edge and stops on the first miss", () => {
    const ear = createAdaptiveEarSearch("left", settings);
    expect(ear.next().levelDb).toBe(-10);
    ear.record("caught", "perfect");
    const clearLevel = ear.next().levelDb;
    expect(clearLevel).toBeLessThan(-10);
    ear.record("caught", "great");
    const weakLevel = ear.next().levelDb;
    expect(weakLevel).toBe(clearLevel - 5);
    ear.record("caught", "good");
    const missedLevel = ear.next().levelDb;
    expect(missedLevel).toBe(weakLevel - 5);
    ear.record("missed");

    const ending = ear.ending();
    expect(ending?.kind).toBe("found");
    if (ending?.kind === "found") {
      expect(ending.thresholdDb).toBeGreaterThan(missedLevel);
      expect(ending.thresholdDb).toBeLessThan(clearLevel);
    }
    expect(ear.isSearching()).toBe(false);
  });

  it("keeps the finer spacing after a later Perfect answer", () => {
    const ear = createAdaptiveEarSearch("left", settings);
    ear.record("caught", "great");
    expect(ear.next().levelDb).toBe(-15);
    ear.record("caught", "perfect");
    expect(ear.next().levelDb).toBe(-20);
  });

  it("can estimate from several Good answers without waiting for a miss", () => {
    const ear = createAdaptiveEarSearch("left", settings);
    ear.record("caught", "great");
    ear.record("caught", "good");
    ear.record("caught", "good");
    expect(ear.ending()?.kind).toBe("found");
    expect(ear.presentations().map(({ levelDb }) => levelDb)).toEqual([
      -10, -15, -20,
    ]);
  });

  it("descends from the first Good and estimates between the miss and a little above the last Good", () => {
    const ear = createAdaptiveEarSearch("right", settings);
    ear.record("caught", "good");
    expect(ear.next().levelDb).toBe(-15);
    ear.record("caught", "good");
    expect(ear.isSearching()).toBe(true);
    expect(ear.next().levelDb).toBe(-20);
    ear.record("missed");
    const ending = ear.ending();
    expect(ending?.kind).toBe("found");
    if (ending?.kind === "found") {
      expect(ending.thresholdDb).toBeGreaterThanOrEqual(-20);
      // A catch can come a little above the Clear_Threshold (estimateAboveClearMaxDb).
      expect(ending.thresholdDb).toBeLessThanOrEqual(
        -15 + adaptiveHearingConfig.estimateAboveClearMaxDb,
      );
    }
  });

  it.each(["great", "good"] as const)(
    "ends after a %s catch above an initial miss",
    (grade) => {
      const ear = createAdaptiveEarSearch("left", settings);
      ear.record("missed");
      expect(ear.next().levelDb).toBe(-5);
      ear.record("caught", grade);
      expect(ear.ending()).toMatchObject({ kind: "found" });
      expect(ear.isSearching()).toBe(false);
    },
  );

  it("records the playable limits without repeating the floor", () => {
    const floor = createAdaptiveEarSearch("left", {
      ...settings,
      floorDb: -15,
    });
    floor.record("caught", "great");
    floor.record("caught", "perfect");
    expect(floor.ending()?.kind).toBe("betterThanFloor");

    const cap = createAdaptiveEarSearch("right", settings);
    while (cap.isSearching()) {
      cap.record("missed");
    }
    expect(cap.ending()?.kind).toBe("worseThanCap");

    const weak = createAdaptiveEarSearch("right", {
      ...settings,
      floorDb: -15,
    });
    weak.record("caught", "good");
    // 2026-11-25, fine-level-estimate: after a Good, -13 carries more information
    // than the floor. The next Good takes the search to the floor.
    expect(weak.next().levelDb).toBe(-13);
    weak.record("caught", "good");
    expect(weak.next().levelDb).toBe(-15);
    weak.record("caught", "good");
    // 2026-11-25: Good catches only, so the estimate may lie up to
    // estimateAboveClearMaxDb above the floor where the last one came.
    expect(weak.ending()).toEqual({
      kind: "found",
      thresholdDb: -12.5,
      lowDb: -16.3,
      highDb: -7.5,
    });
  });

  it("uses the actual answer time even when the grade and probe levels match", () => {
    const finish = (netAnswerMs: number) => {
      const ear = createAdaptiveEarSearch("left", settings);
      ear.record("caught", "perfect", { netAnswerMs, baselineMs: 400 });
      expect(ear.next().levelDb).toBe(-20);
      ear.record("missed");
      return ear.ending();
    };

    expect(finish(400)).toEqual({
      kind: "found",
      thresholdDb: -12.1,
      lowDb: -21.7,
      highDb: -4.6,
    });
    expect(finish(750)).toEqual({
      kind: "found",
      // The slow answer puts the estimate above the catch, within estimateAboveClearMaxDb.
      thresholdDb: -8.1,
      lowDb: -15.5,
      highDb: -1.1,
    });
  });

  it("uses the same grade evidence when one of the two timings is missing", () => {
    const plain = createAdaptiveEarSearch("left", settings);
    const incomplete = createAdaptiveEarSearch("left", settings);
    plain.record("caught", "perfect");
    incomplete.record("caught", "perfect", { netAnswerMs: 400 });
    expect(incomplete.next()).toEqual(plain.next());
    plain.record("missed");
    incomplete.record("missed");
    expect(incomplete.ending()).toEqual(plain.ending());
  });

  it("uses steering to choose a probe inside the whole-decibel descent window", () => {
    const plain = createAdaptiveEarSearch("left", settings);
    const steered = createAdaptiveEarSearch("left", settings);
    const timing = { netAnswerMs: 750, baselineMs: 400 };
    plain.record("caught", "perfect", timing);
    steered.record("caught", "perfect", {
      ...timing,
      steering: { centreDb: -12, spreadDb: 12 },
    });
    expect(plain.next().levelDb).toBe(-20);
    expect(steered.next().levelDb).toBe(-18);
  });
});
