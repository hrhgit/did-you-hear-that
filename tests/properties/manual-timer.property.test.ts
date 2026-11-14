import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createManualTimer } from "../../src/config/manual-timer";
import type { TimerHandle } from "../../src/config/timer";

type Operation =
  | { readonly kind: "schedule"; readonly delayMs: number }
  | { readonly kind: "clear"; readonly pick: number }
  | { readonly kind: "advance"; readonly durationMs: number };

/**
 * A delay or duration from 0 to `maxMs`. Half the draws come from a few round values, so that
 * equal due times, which test the tie order, come up in most runs.
 */
const milliseconds = (maxMs: number): fc.Arbitrary<number> =>
  fc.oneof(fc.integer({ min: 0, max: maxMs }), fc.constantFrom(0, 10, 50, 100));

const operation: fc.Arbitrary<Operation> = fc.oneof(
  fc.record({
    kind: fc.constant("schedule" as const),
    delayMs: milliseconds(10000),
  }),
  fc.record({
    kind: fc.constant("clear" as const),
    pick: fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }),
  }),
  fc.record({
    kind: fc.constant("advance" as const),
    durationMs: milliseconds(5000),
  }),
);

interface Scheduled {
  readonly handle: TimerHandle;
  readonly order: number;
  readonly dueMs: number;
  cleared: boolean;
  runCount: number;
}

interface Run {
  readonly entry: Scheduled;
  readonly nowMs: number;
}

/** Longer than any delay, so a final advance of this size runs everything still pending. */
const flushMs = 20000;

describe("manual timer properties", () => {
  // Property 5 (R9.4 to R9.8, R9.11).
  it("runs callbacks once, in due order, at their due time, and never after a clear", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100000, max: 100000 }),
        fc.array(operation, { maxLength: 200 }),
        (startMs, operations) => {
          const timer = createManualTimer({ startMs });
          const scheduled: Scheduled[] = [];
          const runs: Run[] = [];

          const expectedPendingCount = (): number =>
            scheduled.filter((entry) => !entry.cleared && entry.runCount === 0)
              .length;

          const advance = (durationMs: number): void => {
            const advanceStartMs = timer.now();
            timer.advanceBy(durationMs);
            const endMs = advanceStartMs + durationMs;
            expect(timer.now()).toBe(endMs);
            for (const entry of scheduled) {
              if (entry.cleared) {
                continue;
              }
              // Due by now means it has run. Not yet due means it has not.
              expect(entry.runCount).toBe(entry.dueMs <= endMs ? 1 : 0);
            }
          };

          for (const step of [
            ...operations,
            { kind: "advance", durationMs: flushMs } as const,
          ]) {
            if (step.kind === "schedule") {
              const dueMs = timer.now() + step.delayMs;
              const order = scheduled.length;
              let entry: Scheduled | undefined;
              const handle = timer.setTimeout(() => {
                if (entry === undefined) {
                  throw new Error("ran synchronously inside setTimeout");
                }
                entry.runCount += 1;
                runs.push({ entry, nowMs: timer.now() });
              }, step.delayMs);
              entry = { handle, order, dueMs, cleared: false, runCount: 0 };
              scheduled.push(entry);
            } else if (step.kind === "clear") {
              if (scheduled.length > 0) {
                const entry =
                  scheduled[Math.floor(step.pick * scheduled.length)];
                // Clearing an entry that already ran or was cleared must change nothing.
                if (entry.runCount === 0) {
                  entry.cleared = true;
                }
                timer.clearTimeout(entry.handle);
              }
            } else {
              advance(step.durationMs);
            }
            expect(timer.pendingCount()).toBe(expectedPendingCount());
          }

          for (const entry of scheduled) {
            expect(entry.runCount).toBe(entry.cleared ? 0 : 1);
          }
          for (const run of runs) {
            expect(run.nowMs).toBe(run.entry.dueMs);
          }
          for (let index = 1; index < runs.length; index += 1) {
            const previous = runs[index - 1].entry;
            const current = runs[index].entry;
            expect(current.dueMs).toBeGreaterThanOrEqual(previous.dueMs);
            if (current.dueMs === previous.dueMs) {
              expect(current.order).toBeGreaterThan(previous.order);
            }
          }
          expect(timer.pendingCount()).toBe(0);
        },
      ),
    );
  });

  // Property 6 (R9.6).
  it("runs a whole chain of callbacks that each schedule the next in one advance", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100000, max: 100000 }),
        fc.array(fc.integer({ min: 0, max: 1000 }), {
          minLength: 1,
          maxLength: 50,
        }),
        (startMs, delaysMs) => {
          const timer = createManualTimer({ startMs });
          const seenMs: number[] = [];

          const scheduleLink = (index: number): void => {
            timer.setTimeout(() => {
              seenMs.push(timer.now());
              if (index + 1 < delaysMs.length) {
                scheduleLink(index + 1);
              }
            }, delaysMs[index]);
          };
          scheduleLink(0);

          const totalMs = delaysMs.reduce((sum, delayMs) => sum + delayMs, 0);
          timer.advanceBy(totalMs);

          let dueMs = startMs;
          const expectedMs = delaysMs.map((delayMs) => (dueMs += delayMs));
          expect(seenMs).toEqual(expectedMs);
          expect(timer.now()).toBe(startMs + totalMs);
          expect(timer.pendingCount()).toBe(0);
        },
      ),
    );
  });
});
