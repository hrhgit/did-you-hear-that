import type { Timer, TimerHandle } from "./timer";

/** The timer backed by `performance.now` and the global timer functions. */
export function createSystemTimer(): Timer {
  const nativeHandles = new Map<
    TimerHandle,
    ReturnType<typeof globalThis.setTimeout>
  >();
  let lastHandle = 0;

  return Object.freeze({
    now: (): number => performance.now(),

    setTimeout(callback: () => void, delayMs: number): TimerHandle {
      if (!Number.isFinite(delayMs) || delayMs < 0) {
        throw new RangeError(
          `A timer delay must be a finite number of milliseconds of 0 or more, but got ${String(delayMs)}.`,
        );
      }
      lastHandle += 1;
      const handle = lastHandle as TimerHandle;
      const nativeHandle = globalThis.setTimeout(() => {
        nativeHandles.delete(handle);
        callback();
      }, delayMs);
      nativeHandles.set(handle, nativeHandle);
      return handle;
    },

    clearTimeout(handle: TimerHandle): void {
      const nativeHandle = nativeHandles.get(handle);
      if (nativeHandle === undefined) {
        return;
      }
      nativeHandles.delete(handle);
      globalThis.clearTimeout(nativeHandle);
    },
  });
}
