import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { attentiveListenerRange } from "./listener-parameter-arbitraries";
import { measurePopulation } from "./measure-population";
import { specSearchUnderTest } from "./spec-search-under-test";

const measure = (seed: number) =>
  measurePopulation(specSearchUnderTest, {
    listenerCount: 50,
    seed,
    settings: hearingMethodConfig,
  });

describe("measurePopulation (R15.1, R15.3)", () => {
  it("gives equal rows for 50 listeners when run twice with one seed", () => {
    const first = measure(20261120);
    const second = measure(20261120);
    expect(second.rows).toEqual(first.rows);
    expect(second.summary).toEqual(first.summary);
  });

  it("gives other rows for another seed", () => {
    expect(measure(1).rows).not.toEqual(measure(2).rows);
  });

  it("writes one row per ear, in listener order", () => {
    const { rows, search, seed, range } = measure(3);
    expect(search).toBe("spec");
    expect(seed).toBe(3);
    expect(range).toBe("plausible");
    expect(rows).toHaveLength(100);
    rows.forEach((row, index) => {
      expect(row.listener).toBe(Math.floor(index / 2) + 1);
      expect(row.ear).toBe(index % 2 === 0 ? "left" : "right");
    });
  });

  it("gives both ears of a listener the same parameters except the threshold, and the same room", () => {
    const { rows } = measure(4);
    const shared = (row: (typeof rows)[number]) => ({
      listener: row.listener,
      widthDb: row.widthDb,
      lapseFraction: row.lapseFraction,
      falseAlarmFraction: row.falseAlarmFraction,
      wrongSideFraction: row.wrongSideFraction,
      trialCount: row.trialCount,
    });
    for (let index = 0; index < rows.length; index += 2) {
      expect(shared(rows[index + 1])).toEqual(shared(rows[index]));
    }
  });

  it("gives an estimate for found, better than floor and worse than cap only", () => {
    const { rows } = measure(5);
    for (const row of rows) {
      if (row.state === "found") {
        expect(row.estimateDb).toEqual(expect.any(Number));
      } else if (row.state === "betterThanFloor") {
        expect(row.estimateDb).toBe(hearingMethodConfig.floorDb);
      } else if (row.state === "worseThanCap") {
        expect(row.estimateDb).toBe(hearingMethodConfig.capRelativeToAnchorDb);
      } else {
        expect(row).not.toHaveProperty("estimateDb");
      }
    }
  });

  it("sums the accuracy counts to the number of ears and finishes every room", () => {
    const { rows, summary } = measure(6);
    expect(summary.listenerCount).toBe(50);
    expect(summary.earCount).toBe(100);
    expect(
      summary.accurateCount + summary.flaggedCount + summary.wrongCount,
    ).toBe(100);
    expect(summary.accurateCount).toBe(
      rows.filter((row) => row.accuracy === "accurate").length,
    );
    expect(summary.accurateFraction).toBe(summary.accurateCount / 100);
    expect(summary.withinFiveDbCount).toBe(
      rows.filter((row) => row.withinFiveDb).length,
    );
    expect(summary.withinFiveDbFraction).toBe(summary.withinFiveDbCount / 100);
    expect(summary.budgetExceededCount).toBe(0);
    expect(summary.threwCount).toBe(0);
    const trialCounts = rows.map((row) => row.trialCount);
    expect(summary.largestTrialCount).toBe(Math.max(...trialCounts));
    expect(summary.medianTrialCount).toBeGreaterThanOrEqual(
      Math.min(...trialCounts),
    );
    expect(summary.medianTrialCount).toBeLessThanOrEqual(
      summary.largestTrialCount,
    );
  });

  it("counts every found or better-than-floor ear within the original 5 dB as Accurate, and no flagged ear as within", () => {
    // Worse than cap is left out: a true threshold exactly one step below the cap is within the
    // original 5 dB but not Accurate under the grid band (D42).
    const { rows } = measure(8);
    for (const row of rows) {
      if (row.withinFiveDb && row.state !== "worseThanCap") {
        expect(row.accuracy).toBe("accurate");
      }
      if (row.accuracy === "flagged") {
        expect(row.withinFiveDb).toBe(false);
      }
    }
  });

  it("draws from another range when asked", () => {
    const { rows, range } = measurePopulation(specSearchUnderTest, {
      listenerCount: 20,
      seed: 7,
      settings: hearingMethodConfig,
      range: attentiveListenerRange,
    });
    expect(range).toBe("attentive");
    for (const row of rows) {
      expect(row.widthDb).toBeLessThanOrEqual(4);
      expect(row.falseAlarmFraction).toBeLessThanOrEqual(0.02);
    }
  });
});
