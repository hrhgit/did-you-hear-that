import fc from "fast-check";
import type { ThresholdSearchSettings } from "../../../src/engine/search-types";
import { generousTrialBudgetCount } from "../../listeners/search-under-test";
import type {
  RoomRun,
  SearchUnderTest,
} from "../../listeners/search-under-test";
import { responderArbitrary, type Responder } from "./responder-arbitrary";

/** The inputs of CP4, shared by CP5, CP6, CP7 and CP9: settings, an engine seed and a responder. */
export interface RoomInput {
  readonly settings: ThresholdSearchSettings;
  readonly seed: number;
  readonly responder: Responder;
}

/** Room inputs whose settings come from `settings` and whose listeners fit those settings. */
export const roomInputArbitrary = (
  settings: fc.Arbitrary<ThresholdSearchSettings>,
): fc.Arbitrary<RoomInput> =>
  settings.chain((chosen) =>
    fc.record({
      settings: fc.constant(chosen),
      seed: fc.integer({ min: 0, max: 2 ** 32 - 1 }),
      responder: responderArbitrary(chosen),
    }),
  );

/** Plays one room of `search` with a fresh listener from the input's responder. */
export const runInputRoom = (
  search: SearchUnderTest,
  input: RoomInput,
): RoomRun =>
  search.runRoom({
    seed: input.seed,
    settings: input.settings,
    listener: input.responder.createListener(),
    trialBudget: generousTrialBudgetCount,
  });
