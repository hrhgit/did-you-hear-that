import { adaptiveHearingConfig } from "../config/adaptive-hearing-config";
import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../config/hearing-method-config";
import { createAdaptiveEarSearch } from "./adaptive-ear-search";

const settings = { ...hearingMethodConfig, floorDb: -45 };

describe("the adaptive hearing search", () => {
  it("takes smaller downward steps near the edge and ends on a miss played twice", () => {
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
    // 2026-11-25, one missed sound: a first miss is played again, not taken as the result.
    expect(ear.isSearching()).toBe(true);
    expect(ear.next()).toEqual({
      levelDb: missedLevel,
      direction: "ascending",
    });
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
    "plays an initial miss again after a %s catch above it",
    (grade) => {
      const ear = createAdaptiveEarSearch("left", settings);
      ear.record("missed");
      expect(ear.next().levelDb).toBe(-5);
      ear.record("caught", grade);
      expect(ear.next()).toEqual({ levelDb: -10, direction: "ascending" });
      ear.record("missed");
      expect(ear.ending()).toMatchObject({ kind: "found" });
      expect(ear.isSearching()).toBe(false);
    },
  );

  it("goes on down when the missed level is caught on the second try", () => {
    const ear = createAdaptiveEarSearch("left", settings);
    ear.record("caught", "great");
    ear.record("caught", "great");
    expect(ear.next().levelDb).toBe(-20);
    ear.record("missed");
    expect(ear.next().levelDb).toBe(-20);
    ear.record("caught", "great");
    expect(ear.isSearching()).toBe(true);
    expect(ear.next().levelDb).toBeLessThan(-20);
    expect(ear.next().direction).toBe("descending");
  });

  it("ends on one miss when the steering puts the level in the same place", () => {
    const run = (centreDb: number) => {
      const ear = createAdaptiveEarSearch("left", settings);
      const steering = { centreDb, spreadDb: 12 };
      ear.record("caught", "great");
      ear.record("caught", "great");
      expect(ear.next().levelDb).toBe(-20);
      ear.record("missed", undefined, { steering });
      return ear;
    };
    expect(run(-17.5).ending()?.kind).toBe("found");
    // A miss the neighbours do not explain is played again.
    expect(run(-40).isSearching()).toBe(true);
  });

  it("lets steering take the descent past the largest drop before any miss", () => {
    const plain = createAdaptiveEarSearch("left", settings);
    const steered = createAdaptiveEarSearch("left", settings);
    plain.record("caught", "great");
    steered.record("caught", "great", {
      steering: { centreDb: -40, spreadDb: 12 },
    });
    expect(plain.next().levelDb).toBe(-15);
    // Straight to a little above the neighbours' level.
    expect(steered.next()).toEqual({
      levelDb: -40 + adaptiveHearingConfig.steeringLeadDb,
      direction: "descending",
    });
  });

  it("counts only misses within one upward step of the quietest catch towards the ending", () => {
    const search = createAdaptiveEarSearch("left", settings);
    search.record("caught", "perfect");
    for (const levelDb of [-20, -17, -12]) {
      expect(search.next().levelDb).toBe(levelDb);
      search.record("missed");
    }
    // Only -12 lies within one step of the catch at -10, so it is played again.
    expect(search.next()).toEqual({ levelDb: -12, direction: "ascending" });
    search.record("missed");
    expect(search.ending()?.kind).toBe("found");
  });

  it("keeps the minimum drop above the floor when the steering jumps near it", () => {
    const steered = createAdaptiveEarSearch("left", settings);
    steered.record("caught", "perfect", {
      steering: { centreDb: -48, spreadDb: 12 },
    });
    expect(steered.next().levelDb).toBe(
      settings.floorDb + adaptiveHearingConfig.minDropDb,
    );
  });

  it("starts at a level between the floor and the starting level until the first sound is recorded", () => {
    const search = createAdaptiveEarSearch("left", settings);
    search.startAt?.(-31.6);
    expect(search.next()).toEqual({ levelDb: -32, direction: "first" });
    search.startAt?.(0);
    expect(search.next().levelDb).toBe(settings.startingLevelDb);
    search.startAt?.(-100);
    expect(search.next().levelDb).toBe(settings.floorDb);
    // Not just above the floor, where a catch would force a drop below the minimum.
    search.startAt?.(settings.floorDb + 1);
    expect(search.next().levelDb).toBe(
      settings.floorDb + adaptiveHearingConfig.minDropDb,
    );
    search.startAt?.(-30);
    search.record("caught", "perfect");
    const after = search.next();
    search.startAt?.(-40);
    expect(search.next()).toEqual(after);
  });

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
    const afterMiss = (netAnswerMs: number) => {
      const ear = createAdaptiveEarSearch("left", settings);
      ear.record("caught", "perfect", { netAnswerMs, baselineMs: 400 });
      expect(ear.next().levelDb).toBe(-20);
      ear.record("missed");
      return ear.next();
    };

    // The slow answer puts the level nearer the catch, so the gap is probed louder.
    expect(afterMiss(400)).toEqual({ levelDb: -17, direction: "ascending" });
    expect(afterMiss(750)).toEqual({ levelDb: -12, direction: "ascending" });
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
