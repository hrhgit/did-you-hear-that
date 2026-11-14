import type { ThresholdSearchSettings } from "../../../src/engine/search-types";
import {
  playPopulationRooms,
  type PopulationRoom,
} from "../../listeners/play-population-rooms";
import type { SearchUnderTest } from "../../listeners/search-under-test";

/** The rooms of CP8, which CP10 and CP11 reuse (design.md, CP8). */
export const patternPopulationParameters = Object.freeze({
  seed: 20261118,
  roomCount: 2000,
});

const played = new WeakMap<
  SearchUnderTest,
  WeakMap<ThresholdSearchSettings, readonly PopulationRoom[]>
>();

/**
 * The 2000 rooms with Plausible_Range Psychometric_Listeners drawn from seed 20261118 that CP8,
 * the statistical part of CP10 and CP11 measure. The rooms of one search and one settings
 * object are played once per process and shared, because the three checks look at the same
 * rooms.
 */
export function patternPopulation(
  search: SearchUnderTest,
  settings: ThresholdSearchSettings,
): readonly PopulationRoom[] {
  let bySettings = played.get(search);
  if (bySettings === undefined) {
    bySettings = new WeakMap();
    played.set(search, bySettings);
  }
  let rooms = bySettings.get(settings);
  if (rooms === undefined) {
    rooms = playPopulationRooms(search, {
      listenerCount: patternPopulationParameters.roomCount,
      seed: patternPopulationParameters.seed,
      settings,
    });
    bySettings.set(settings, rooms);
  }
  return rooms;
}
