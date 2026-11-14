import type { Timer, TimerHandle } from "./timer";

/** A timer whose clock moves only when a test calls `advanceBy`. */
export interface ManualTimer extends Timer {
  /**
   * Moves the clock forward by `durationMs`, running every callback that falls due on the way in
   * order of due time, and in scheduling order for equal due times. Callbacks scheduled during
   * the advance run in it too if they fall due in time. A duration that is negative or not
   * finite throws a `RangeError`. If a callback throws, the error leaves `advanceBy` with the
   * clock at that callback's due time, and the timer stays usable.
   */
  advanceBy(durationMs: number): void;
  /** How many callbacks are scheduled and have neither run nor been cleared. */
  pendingCount(): number;
}

interface PendingCallback {
  readonly dueMs: number;
  readonly callback: () => void;
}

function assertValidDuration(kind: string, durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new RangeError(
      `A ${kind} must be a finite number of milliseconds of 0 or more, but got ${String(durationMs)}.`,
    );
  }
}

/**
 * Creates a manual timer whose clock starts at `startMs`, 0 by default. A callback never runs
 * inside `setTimeout`, even with a delay of 0. It runs on the next `advanceBy`, including
 * `advanceBy(0)`.
 *
 * Handles are increasing integers, so a smaller handle was scheduled earlier. That order breaks
 * ties between callbacks with the same due time.
 */
export function createManualTimer(
  options: { startMs?: number } = {},
): ManualTimer {
  const startMs = options.startMs ?? 0;
  if (!Number.isFinite(startMs)) {
    throw new RangeError(
      `A start time must be a finite number, but got ${String(startMs)}.`,
    );
  }

  // A Map iterates in insertion order, which is also handle order.
  const pending = new Map<TimerHandle, PendingCallback>();
  let nowMs = startMs;
  let lastHandle = 0;
  let isAdvancing = false;

  const takeNextDue = (endMs: number): PendingCallback | undefined => {
    let nextHandle: TimerHandle | undefined;
    let next: PendingCallback | undefined;
    for (const [handle, entry] of pending) {
      // Strictly less, so the earliest scheduled entry wins a tie.
      if (next === undefined || entry.dueMs < next.dueMs) {
        nextHandle = handle;
        next = entry;
      }
    }
    if (nextHandle === undefined || next === undefined || next.dueMs > endMs) {
      return undefined;
    }
    pending.delete(nextHandle);
    return next;
  };

  return Object.freeze({
    now: (): number => nowMs,

    setTimeout(callback: () => void, delayMs: number): TimerHandle {
      assertValidDuration("timer delay", delayMs);
      lastHandle += 1;
      const handle = lastHandle as TimerHandle;
      pending.set(handle, { dueMs: nowMs + delayMs, callback });
      return handle;
    },

    clearTimeout(handle: TimerHandle): void {
      pending.delete(handle);
    },

    advanceBy(durationMs: number): void {
      assertValidDuration("duration", durationMs);
      if (isAdvancing) {
        throw new Error(
          "advanceBy cannot be called from inside a timer callback.",
        );
      }
      const endMs = nowMs + durationMs;
      isAdvancing = true;
      try {
        for (
          let next = takeNextDue(endMs);
          next !== undefined;
          next = takeNextDue(endMs)
        ) {
          nowMs = next.dueMs;
          next.callback();
        }
        nowMs = endMs;
      } finally {
        isAdvancing = false;
      }
    },

    pendingCount: (): number => pending.size,
  });
}
