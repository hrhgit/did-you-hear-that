import { describe, expect, it } from "vitest";
import { createManualTimer } from "../config/manual-timer";
import { createLantern } from "./lantern";

const settings = Object.freeze({ cellCount: 3, rechargeMs: 8000 });

function lanternOnManualTimer() {
  const timer = createManualTimer();
  const cameBack: boolean[] = [];
  const lantern = createLantern({
    timer,
    settings,
    cameBack: (wasDark) => {
      cameBack.push(wasDark);
    },
  });
  return { timer, lantern, cameBack };
}

describe("createLantern", () => {
  it("starts full and waits for nothing", () => {
    const { timer, lantern } = lanternOnManualTimer();
    expect(lantern.cells()).toBe(3);
    expect(timer.pendingCount()).toBe(0);
  });

  it("spends one cell for an answer and refuses when dark", () => {
    const { lantern } = lanternOnManualTimer();
    expect(lantern.spend()).toBe(true);
    expect(lantern.spend()).toBe(true);
    expect(lantern.spend()).toBe(true);
    expect(lantern.cells()).toBe(0);
    expect(lantern.spend()).toBe(false);
    expect(lantern.cells()).toBe(0);
  });

  it("gives a caught sound's cell back at once, so a catch costs nothing", () => {
    const { timer, lantern } = lanternOnManualTimer();
    for (let answer = 0; answer < 50; answer += 1) {
      expect(lantern.spend()).toBe(true);
      lantern.giveBack();
      expect(lantern.cells()).toBe(3);
    }
    expect(timer.pendingCount()).toBe(0);
  });

  it("never holds more than a full lantern", () => {
    const { lantern } = lanternOnManualTimer();
    lantern.giveBack();
    expect(lantern.cells()).toBe(3);
  });

  it("brings one cell back after each wait, and says when it was dark", () => {
    const { timer, lantern, cameBack } = lanternOnManualTimer();
    lantern.spend();
    lantern.spend();
    lantern.spend();
    timer.advanceBy(7999);
    expect(lantern.cells()).toBe(0);
    timer.advanceBy(1);
    expect(lantern.cells()).toBe(1);
    expect(cameBack).toEqual([true]);
    timer.advanceBy(8000);
    timer.advanceBy(8000);
    expect(lantern.cells()).toBe(3);
    expect(cameBack).toEqual([true, false, false]);
    expect(timer.pendingCount()).toBe(0);
  });

  it("does not start its wait again when another answer is given", () => {
    const { timer, lantern } = lanternOnManualTimer();
    lantern.spend();
    timer.advanceBy(6000);
    lantern.spend();
    timer.advanceBy(2000);
    expect(lantern.cells()).toBe(2);
  });

  it("lets at most the full lantern and one answer per wait through", () => {
    const { timer, lantern } = lanternOnManualTimer();
    let taken = 0;
    // A visitor who answers every 100 ms for two minutes.
    for (let pressAtMs = 0; pressAtMs < 120_000; pressAtMs += 100) {
      if (lantern.spend()) {
        taken += 1;
      }
      timer.advanceBy(100);
    }
    expect(taken).toBeLessThanOrEqual(3 + 120_000 / 8000);
  });

  it("fills up and stops waiting", () => {
    const { timer, lantern, cameBack } = lanternOnManualTimer();
    lantern.spend();
    lantern.spend();
    lantern.fill();
    expect(lantern.cells()).toBe(3);
    expect(timer.pendingCount()).toBe(0);
    timer.advanceBy(60_000);
    expect(cameBack).toEqual([]);
  });

  it("stops its wait and keeps its cells", () => {
    const { timer, lantern } = lanternOnManualTimer();
    lantern.spend();
    lantern.stop();
    timer.advanceBy(60_000);
    expect(lantern.cells()).toBe(2);
    // The next answer starts the wait again.
    lantern.spend();
    timer.advanceBy(8000);
    expect(lantern.cells()).toBe(2);
  });
});
