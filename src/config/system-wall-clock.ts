/** Writes a whole number of at least `width` digits, with leading zeros. */
function zeroPadded(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/**
 * The wall clock of the page: `Date.now()` and the local calendar date of that moment
 * (result-page design.md, "`src/config/system-wall-clock.ts`"). The only code of the result page
 * that reads a clock. Its return type fits `WallClock` of `src/session/result-page-types.ts`.
 */
export function createSystemWallClock(): {
  now(): { readonly epochMs: number; readonly localDate: string };
} {
  return Object.freeze({
    now(): { readonly epochMs: number; readonly localDate: string } {
      const epochMs = Date.now();
      const moment = new Date(epochMs);
      const localDate = `${zeroPadded(moment.getFullYear(), 4)}-${zeroPadded(moment.getMonth() + 1, 2)}-${zeroPadded(moment.getDate(), 2)}`;
      return Object.freeze({ epochMs, localDate });
    },
  });
}
