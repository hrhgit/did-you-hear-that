/**
 * Identifies one scheduled callback. Branded so that a plain number or a native timer handle
 * cannot be passed by mistake. The handle type is the same in the browser and in Node.
 */
export type TimerHandle = number & { readonly __brand: "TimerHandle" };

/**
 * How code reads time and waits, injected so that it never touches the clock directly.
 * Production code gets the system timer and tests get the manual timer, so a whole visit can
 * run instantly and deterministically.
 */
export interface Timer {
  /** Milliseconds from a monotonic clock. Only differences are meaningful. */
  now(): number;
  /**
   * Runs `callback` once, `delayMs` milliseconds from now. A delay that is negative or not
   * finite throws a `RangeError`.
   */
  setTimeout(callback: () => void, delayMs: number): TimerHandle;
  /** Cancels a pending callback. A handle that already ran, was cleared or is unknown is ignored. */
  clearTimeout(handle: TimerHandle): void;
}
