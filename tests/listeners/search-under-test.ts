// The interface through which the checks drive a search (design.md, `SearchUnderTest` and the
// checks; D21). It depends on no engine module apart from the settings type, so the same checks can
// run against any version of the search.

import type { ThresholdSearchSettings } from "../../src/engine/search-types";
import type {
  ListenerEar,
  ListenerResponse,
  SimulatedListener,
} from "./listener-types";

export interface SearchUnderTest {
  /** "spec" or "no-spec". */
  readonly name: string;
  readonly takesSettings: boolean;
  readonly takesSeed: boolean;
  runRoom(input: {
    seed: number;
    settings: ThresholdSearchSettings;
    listener: SimulatedListener;
    /** The harness stops a run that asks for more trials than this. */
    trialBudget: number;
  }): RoomRun;
}

export interface RoomRun {
  readonly ending: "finished" | "budgetExceeded" | "threw";
  readonly error?: string;
  /** Every trial that was answered, in order. */
  readonly trials: readonly RunTrial[];
  readonly ears: Readonly<Record<ListenerEar, RunEarResult>>;
  readonly falseAlarmRateFraction?: number;
}

export interface RunTrial {
  readonly kind: "sound" | "noSound";
  readonly ear?: ListenerEar;
  readonly levelDb?: number;
  readonly gapBeforeMs?: number;
  readonly response: ListenerResponse;
}

export type RunEarResult =
  | { readonly state: "found"; readonly thresholdDb: number }
  | { readonly state: "betterThanFloor" | "worseThanCap" | "unreliable" }
  | { readonly state: "unreported" };

/**
 * The trial budget the harness-neutral checks and the population measure give a room. It is far
 * above any room a search that ends within its trial limit can need, and only stops a search
 * that would otherwise never end (D36).
 */
export const generousTrialBudgetCount = 1000;
