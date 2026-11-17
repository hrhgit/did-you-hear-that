import type { LanternConfig } from "../config/lantern-config";
import { lanternConfig } from "../config/lantern-config";
import type { Timer, TimerHandle } from "../config/timer";

/**
 * The visitor's lantern inside one room (`lanternConfig`). It knows nothing of any sound: it
 * changes only when the visitor answers, when a scored answer is given back, and with time.
 */
export interface Lantern {
  /** The cells of light left, from 0 to `cellCount`. */
  cells(): number;
  /** Spends one cell for an answer. False, with nothing spent, when the lantern is dark. */
  spend(): boolean;
  /** Gives one cell back for a caught sound. Does nothing to a full lantern. */
  giveBack(): void;
  /** Fills the lantern and stops its wait. */
  fill(): void;
  /** Stops the wait for the next cell. The cells stay as they are. */
  stop(): void;
}

export interface LanternOptions {
  readonly timer: Timer;
  /** Called when a cell has come back by itself. `wasDark` is true when it was the first one. */
  readonly cameBack: (wasDark: boolean) => void;
  readonly settings?: LanternConfig;
}

/**
 * Creates a full lantern. While a cell is missing one wait of `rechargeMs` runs, and a cell
 * comes back at its end. The wait is not started again by an answer, so answering fast does not
 * hold the light back.
 */
export function createLantern(options: LanternOptions): Lantern {
  const { timer, cameBack } = options;
  const settings = options.settings ?? lanternConfig;
  let cells = settings.cellCount;
  let handle: TimerHandle | null = null;

  const stopWait = (): void => {
    if (handle !== null) {
      timer.clearTimeout(handle);
      handle = null;
    }
  };

  const wait = (): void => {
    if (handle !== null || cells >= settings.cellCount) {
      return;
    }
    handle = timer.setTimeout(() => {
      handle = null;
      const wasDark = cells === 0;
      cells += 1;
      wait();
      cameBack(wasDark);
    }, settings.rechargeMs);
  };

  return Object.freeze({
    cells: () => cells,
    spend() {
      if (cells === 0) {
        return false;
      }
      cells -= 1;
      wait();
      return true;
    },
    giveBack() {
      if (cells >= settings.cellCount) {
        return;
      }
      cells += 1;
      if (cells >= settings.cellCount) {
        stopWait();
      }
    },
    fill() {
      cells = settings.cellCount;
      stopWait();
    },
    stop: stopWait,
  });
}
