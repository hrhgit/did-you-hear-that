import {
  createSeededRandom,
  type RandomSource,
} from "../../../src/config/seeded-random";
import type {
  ThresholdSearchSettings,
  Trial,
} from "../../../src/engine/search-types";
import { createThresholdSearch } from "../../../src/engine/threshold-search";
import type {
  ListenerResponse,
  ListenerTrial,
} from "../../listeners/listener-types";
import { playPopulationRooms } from "../../listeners/play-population-rooms";
import type {
  RoomRun,
  SearchUnderTest,
} from "../../listeners/search-under-test";
import { patternPopulationParameters } from "./pattern-population";

interface RoomSchedule {
  searchTrialCount: number;
  forcedSoundCount: number;
  closingTrialCount: number;
  trialCount: number;
}

const toListenerTrial = (trial: Trial): ListenerTrial =>
  trial.kind === "sound"
    ? { kind: "sound", ear: trial.ear, levelDb: trial.levelDb }
    : { kind: "noSound" };

/**
 * Plays one room of the spec engine with a random source that counts its draws, and works out
 * from the counts which sound trials the share maximum forced (design.md, "The room, step by
 * step"). A sound trial uses the kind draw when it was allowed to be a no-sound trial, the ear
 * draw when both ears were searching, and the gap draw. Both ears were searching at a trial when
 * each ear still has a presentation at or after it.
 */
function playCountedRoom(
  settings: ThresholdSearchSettings,
  seed: number,
  respond: (trial: ListenerTrial) => ListenerResponse,
): RoomSchedule {
  const inner = createSeededRandom(seed);
  let drawCount = 0;
  const random: RandomSource = {
    seed,
    next: () => {
      drawCount += 1;
      return inner.next();
    },
  };
  const search = createThresholdSearch({ settings, random });
  const trials: { trial: Trial; drawCount: number }[] = [];
  let drawsBefore = 0;
  let step = search.current();
  while (step.kind === "trial") {
    trials.push({ trial: step.trial, drawCount: drawCount - drawsBefore });
    drawsBefore = drawCount;
    step = search.respond(respond(toListenerTrial(step.trial)));
  }
  const lastIndex = { left: -1, right: -1 };
  trials.forEach(({ trial }, index) => {
    if (trial.kind === "sound") {
      lastIndex[trial.ear] = index;
    }
  });
  const schedule: RoomSchedule = {
    searchTrialCount: 0,
    forcedSoundCount: 0,
    closingTrialCount: 0,
    trialCount: trials.length,
  };
  trials.forEach(({ trial, drawCount: draws }, index) => {
    if (trial.kind === "noSound" && trial.phase === "closing") {
      schedule.closingTrialCount += 1;
      return;
    }
    schedule.searchTrialCount += 1;
    if (trial.kind === "sound") {
      const bothSearching = index <= Math.min(lastIndex.left, lastIndex.right);
      const kindDrawn = draws - (bothSearching ? 1 : 0) - 1 === 1;
      if (!kindDrawn) {
        schedule.forcedSoundCount += 1;
      }
    }
  });
  return schedule;
}

/**
 * The report CP8 asks for without a limit (design.md, CP8; D8, D9): over the 2000 rooms of
 * CP8, the share of search trials on which the share maximum forced a sound trial, and the
 * share of rooms that needed closing trials. Spec-only, because it reads the engine's draws.
 */
export function noSoundScheduleReport(
  settings: ThresholdSearchSettings,
): Readonly<Record<string, number>> {
  const schedules: RoomSchedule[] = [];
  const countingSearch: SearchUnderTest = {
    name: "spec (draws counted)",
    takesSettings: true,
    takesSeed: true,
    runRoom: (input): RoomRun => {
      schedules.push(
        playCountedRoom(input.settings, input.seed, (trial) =>
          input.listener.respond(trial),
        ),
      );
      const unreported = { state: "unreported" } as const;
      return {
        ending: "finished",
        trials: [],
        ears: { left: unreported, right: unreported },
      };
    },
  };
  playPopulationRooms(countingSearch, {
    listenerCount: patternPopulationParameters.roomCount,
    seed: patternPopulationParameters.seed,
    settings,
  });
  const sum = (field: keyof RoomSchedule) =>
    schedules.reduce((total, schedule) => total + schedule[field], 0);
  return Object.freeze({
    seed: patternPopulationParameters.seed,
    roomCount: schedules.length,
    searchTrialCount: sum("searchTrialCount"),
    forcedSoundShareOfSearchTrials:
      sum("forcedSoundCount") / sum("searchTrialCount"),
    roomsWithClosingTrialsFraction:
      schedules.filter((schedule) => schedule.closingTrialCount > 0).length /
      schedules.length,
    closingTrialShareOfTrials: sum("closingTrialCount") / sum("trialCount"),
  });
}
