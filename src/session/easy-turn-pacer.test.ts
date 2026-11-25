import { describe, expect, it } from "vitest";
import { createEasyTurnPacer } from "./easy-turn-pacer";

const miss = { kind: "counted", sound: true, caught: false } as const;
const catchTurn = { kind: "counted", sound: true, caught: true } as const;
const silent = { kind: "counted", sound: false, caught: false } as const;

describe("createEasyTurnPacer", () => {
  it("wants an easy turn after two of the last three sounds are missed", () => {
    const pacer = createEasyTurnPacer();
    for (const turn of [catchTurn, catchTurn, catchTurn, catchTurn, miss]) {
      pacer.note(turn);
    }
    expect(pacer.wantsEasyTurn()).toBe(false);
    pacer.note(miss);
    expect(pacer.wantsEasyTurn()).toBe(true);
  });

  it("does not count silent turns as misses", () => {
    const pacer = createEasyTurnPacer();
    for (const turn of [
      catchTurn,
      catchTurn,
      catchTurn,
      silent,
      silent,
      miss,
    ]) {
      pacer.note(turn);
    }
    expect(pacer.wantsEasyTurn()).toBe(false);
  });

  it("keeps easy turns apart and under a quarter of the turns", () => {
    const pacer = createEasyTurnPacer();
    for (const turn of [catchTurn, catchTurn, miss, miss]) pacer.note(turn);
    expect(pacer.wantsEasyTurn()).toBe(true);
    pacer.note({ kind: "easy" });
    pacer.note(miss);
    pacer.note(miss);
    expect(pacer.wantsEasyTurn()).toBe(false);
    pacer.note(miss);
    // 1 + 1 easy of 8 + 1 turns is at most a quarter.
    expect(pacer.wantsEasyTurn()).toBe(true);
  });

  it("never has an easy turn at the start", () => {
    const pacer = createEasyTurnPacer();
    pacer.note(miss);
    pacer.note(miss);
    // One easy turn of three would be a third.
    expect(pacer.wantsEasyTurn()).toBe(false);
  });
});
