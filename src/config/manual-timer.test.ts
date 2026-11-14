import { describe, expect, it } from "vitest";
import { createManualTimer } from "./manual-timer";
import type { TimerHandle } from "./timer";

describe("createManualTimer", () => {
  describe("start time", () => {
    it("starts at 0 by default", () => {
      expect(createManualTimer().now()).toBe(0);
    });

    it("starts at the given time", () => {
      expect(createManualTimer({ startMs: 1234.5 }).now()).toBe(1234.5);
    });

    it("does not move without an advance", () => {
      const timer = createManualTimer({ startMs: 10 });
      timer.setTimeout(() => {}, 5);
      expect(timer.now()).toBe(10);
    });

    it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
      "throws a RangeError for the start time %s",
      (startMs) => {
        expect(() => createManualTimer({ startMs })).toThrow(RangeError);
      },
    );
  });

  describe("advanceBy", () => {
    it("reports the start of the advance plus the duration when it returns", () => {
      const timer = createManualTimer({ startMs: 100 });
      timer.setTimeout(() => {}, 30);
      timer.advanceBy(50);
      expect(timer.now()).toBe(150);
      timer.advanceBy(0);
      expect(timer.now()).toBe(150);
      timer.advanceBy(7.25);
      expect(timer.now()).toBe(157.25);
    });

    it("runs callbacks in order of due time", () => {
      const timer = createManualTimer();
      const order: string[] = [];
      timer.setTimeout(() => order.push("third"), 300);
      timer.setTimeout(() => order.push("first"), 100);
      timer.setTimeout(() => order.push("second"), 200);
      timer.advanceBy(1000);
      expect(order).toEqual(["first", "second", "third"]);
    });

    it("runs callbacks with equal due times in the order they were scheduled", () => {
      const timer = createManualTimer();
      const order: number[] = [];
      for (let index = 0; index < 5; index += 1) {
        timer.setTimeout(() => order.push(index), 50);
      }
      timer.advanceBy(50);
      expect(order).toEqual([0, 1, 2, 3, 4]);
    });

    it("runs a callback due exactly at the end of the advance and none due after it", () => {
      const timer = createManualTimer();
      const ran: string[] = [];
      timer.setTimeout(() => ran.push("at end"), 100);
      timer.setTimeout(() => ran.push("after end"), 101);
      timer.advanceBy(100);
      expect(ran).toEqual(["at end"]);
      expect(timer.pendingCount()).toBe(1);
      timer.advanceBy(1);
      expect(ran).toEqual(["at end", "after end"]);
    });

    it("reports the due time of a callback from now() while it runs", () => {
      const timer = createManualTimer({ startMs: 1000 });
      const seenMs: number[] = [];
      timer.setTimeout(() => seenMs.push(timer.now()), 250);
      timer.setTimeout(() => seenMs.push(timer.now()), 40);
      timer.advanceBy(500);
      expect(seenMs).toEqual([1040, 1250]);
      expect(timer.now()).toBe(1500);
    });

    it("runs a callback scheduled during the advance if it falls due within it", () => {
      const timer = createManualTimer();
      const ran: Array<[string, number]> = [];
      timer.setTimeout(() => {
        ran.push(["outer", timer.now()]);
        timer.setTimeout(() => ran.push(["inner", timer.now()]), 30);
        timer.setTimeout(() => ran.push(["too late", timer.now()]), 500);
      }, 20);
      timer.advanceBy(100);
      expect(ran).toEqual([
        ["outer", 20],
        ["inner", 50],
      ]);
      expect(timer.pendingCount()).toBe(1);
    });

    it("orders a callback scheduled during the advance among the callbacks already pending", () => {
      const timer = createManualTimer();
      const order: string[] = [];
      timer.setTimeout(() => {
        order.push("a at 10");
        timer.setTimeout(() => order.push("c at 20, scheduled later"), 10);
      }, 10);
      timer.setTimeout(() => order.push("b at 20"), 20);
      timer.setTimeout(() => order.push("d at 30"), 30);
      timer.advanceBy(30);
      expect(order).toEqual([
        "a at 10",
        "b at 20",
        "c at 20, scheduled later",
        "d at 30",
      ]);
    });

    it("rejects a call from inside a callback and keeps the clock consistent", () => {
      const timer = createManualTimer();
      let innerError: unknown;
      timer.setTimeout(() => {
        try {
          timer.advanceBy(10);
        } catch (error) {
          innerError = error;
        }
      }, 5);
      timer.advanceBy(20);
      expect(innerError).toBeInstanceOf(Error);
      expect(timer.now()).toBe(20);
    });
  });

  describe("zero delay", () => {
    it("never runs a callback synchronously inside setTimeout", () => {
      const timer = createManualTimer();
      let ran = false;
      timer.setTimeout(() => {
        ran = true;
      }, 0);
      expect(ran).toBe(false);
      expect(timer.pendingCount()).toBe(1);
    });

    it("runs a zero-delay callback on the next advance, including advanceBy(0)", () => {
      const timer = createManualTimer({ startMs: 5 });
      const seenMs: number[] = [];
      timer.setTimeout(() => seenMs.push(timer.now()), 0);
      timer.advanceBy(0);
      expect(seenMs).toEqual([5]);
      expect(timer.pendingCount()).toBe(0);
    });

    it("runs a zero-delay callback scheduled from a callback within the same advance", () => {
      const timer = createManualTimer();
      const seenMs: number[] = [];
      timer.setTimeout(() => {
        timer.setTimeout(() => seenMs.push(timer.now()), 0);
      }, 10);
      timer.advanceBy(10);
      expect(seenMs).toEqual([10]);
    });
  });

  describe("clearTimeout", () => {
    it("stops a pending callback from running", () => {
      const timer = createManualTimer();
      const ran: string[] = [];
      const cleared = timer.setTimeout(() => ran.push("cleared"), 10);
      timer.setTimeout(() => ran.push("kept"), 10);
      timer.clearTimeout(cleared);
      expect(timer.pendingCount()).toBe(1);
      timer.advanceBy(100);
      expect(ran).toEqual(["kept"]);
    });

    it("stops a pending callback when cleared by an earlier callback in the same advance", () => {
      const timer = createManualTimer();
      const ran: string[] = [];
      let later: TimerHandle | undefined;
      timer.setTimeout(() => {
        ran.push("earlier");
        if (later !== undefined) {
          timer.clearTimeout(later);
        }
      }, 10);
      later = timer.setTimeout(() => ran.push("later"), 20);
      timer.advanceBy(100);
      expect(ran).toEqual(["earlier"]);
    });

    it("does nothing for a handle that has already run", () => {
      const timer = createManualTimer();
      const handle = timer.setTimeout(() => {}, 10);
      timer.setTimeout(() => {}, 50);
      timer.advanceBy(10);
      timer.clearTimeout(handle);
      expect(timer.pendingCount()).toBe(1);
    });

    it("does nothing for a handle that has already been cleared", () => {
      const timer = createManualTimer();
      const handle = timer.setTimeout(() => {}, 10);
      timer.setTimeout(() => {}, 10);
      timer.clearTimeout(handle);
      timer.clearTimeout(handle);
      expect(timer.pendingCount()).toBe(1);
    });

    it("does nothing for an unknown handle", () => {
      const timer = createManualTimer();
      timer.setTimeout(() => {}, 10);
      timer.clearTimeout(999 as TimerHandle);
      timer.clearTimeout(-1 as TimerHandle);
      expect(timer.pendingCount()).toBe(1);
    });
  });

  describe("pendingCount", () => {
    it("counts callbacks that have neither run nor been cleared", () => {
      const timer = createManualTimer();
      expect(timer.pendingCount()).toBe(0);
      const first = timer.setTimeout(() => {}, 10);
      timer.setTimeout(() => {}, 20);
      timer.setTimeout(() => {}, 30);
      expect(timer.pendingCount()).toBe(3);
      timer.clearTimeout(first);
      expect(timer.pendingCount()).toBe(2);
      timer.advanceBy(20);
      expect(timer.pendingCount()).toBe(1);
      timer.advanceBy(10);
      expect(timer.pendingCount()).toBe(0);
    });
  });

  describe("validation", () => {
    it.each([
      -1,
      -0.001,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ])(
      "throws a RangeError from setTimeout for the delay %s and schedules nothing",
      (delayMs) => {
        const timer = createManualTimer();
        expect(() => timer.setTimeout(() => {}, delayMs)).toThrow(RangeError);
        expect(timer.pendingCount()).toBe(0);
      },
    );

    it.each([
      -1,
      -0.001,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ])(
      "throws a RangeError from advanceBy for the duration %s and keeps the clock",
      (durationMs) => {
        const timer = createManualTimer({ startMs: 10 });
        let ran = false;
        timer.setTimeout(() => {
          ran = true;
        }, 0);
        expect(() => timer.advanceBy(durationMs)).toThrow(RangeError);
        expect(timer.now()).toBe(10);
        expect(ran).toBe(false);
        expect(timer.pendingCount()).toBe(1);
      },
    );
  });

  describe("a callback that throws", () => {
    it("lets the error leave advanceBy and stays usable", () => {
      const timer = createManualTimer();
      const ran: string[] = [];
      timer.setTimeout(() => {
        throw new Error("boom");
      }, 10);
      timer.setTimeout(() => ran.push("after the error"), 20);

      expect(() => timer.advanceBy(100)).toThrow("boom");
      expect(timer.now()).toBe(10);
      expect(timer.pendingCount()).toBe(1);

      timer.advanceBy(90);
      expect(ran).toEqual(["after the error"]);
      expect(timer.now()).toBe(100);
      expect(timer.pendingCount()).toBe(0);

      timer.setTimeout(() => ran.push("scheduled afterwards"), 5);
      timer.advanceBy(5);
      expect(ran).toEqual(["after the error", "scheduled afterwards"]);
    });
  });

  it("hands out a distinct handle for every call", () => {
    const timer = createManualTimer();
    const handles = new Set<TimerHandle>();
    for (let index = 0; index < 20; index += 1) {
      handles.add(timer.setTimeout(() => {}, index));
    }
    expect(handles.size).toBe(20);
  });
});
