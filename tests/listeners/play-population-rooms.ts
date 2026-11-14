import {
  createSeededRandom,
  type RandomSource,
} from "../../src/config/seeded-random";
import type { ThresholdSearchSettings } from "../../src/engine/search-types";
import {
  drawListenerParameters,
  plausibleListenerRange,
  type ListenerParameterRange,
} from "./listener-parameter-arbitraries";
import {
  createPsychometricListener,
  type PsychometricListenerParameters,
} from "./psychometric-listener";
import {
  generousTrialBudgetCount,
  type RoomRun,
  type SearchUnderTest,
} from "./search-under-test";

/** One listener of a population and the room it played. */
export interface PopulationRoom {
  /** The listener's number in the population, from 1. */
  readonly listener: number;
  readonly parameters: PsychometricListenerParameters;
  readonly run: RoomRun;
}

/** The number of distinct seeds a `RandomSource` accepts: 2^32. */
const seedCount = 2 ** 32;

/** One seed for a room's engine or listener, drawn from the population's source. */
export const drawSeed = (random: RandomSource): number =>
  Math.floor(random.next() * seedCount);

/**
 * Runs one room for each of `listenerCount` Psychometric_Listeners drawn uniformly from a
 * parameter range (D36).
 *
 * Everything comes from one seed. A `RandomSource` made from it gives, for each listener in
 * turn, its six parameters, then its room's engine seed, then its listener seed. The same seed,
 * settings and search therefore give equal rooms.
 */
export function playPopulationRooms(
  search: SearchUnderTest,
  options: {
    listenerCount: number;
    seed: number;
    settings: ThresholdSearchSettings;
    range?: ListenerParameterRange;
    trialBudget?: number;
  },
): readonly PopulationRoom[] {
  const {
    listenerCount,
    seed,
    settings,
    range = plausibleListenerRange,
    trialBudget = generousTrialBudgetCount,
  } = options;
  const population = createSeededRandom(seed);
  const rooms: PopulationRoom[] = [];
  for (let listener = 1; listener <= listenerCount; listener += 1) {
    const parameters = drawListenerParameters(range, settings, population);
    const engineSeed = drawSeed(population);
    const listenerSeed = drawSeed(population);
    const run = search.runRoom({
      seed: engineSeed,
      settings,
      listener: createPsychometricListener(
        parameters,
        createSeededRandom(listenerSeed),
      ),
      trialBudget,
    });
    rooms.push(Object.freeze({ listener, parameters, run }));
  }
  return Object.freeze(rooms);
}
