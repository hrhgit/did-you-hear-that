// The measurement of how many sounds a visit misses and how long its replay takes
// (missed-sound-replay design.md, "Measurements", D28). It plays rooms through the shipped engine
// with `playPopulationRooms`, takes them as many at a time as a visit has rooms, and applies the
// replay's selection at each candidate most count and gap. It reports counts and lengths and
// decides nothing: the most count and the gap are the project owner's choice (Q1, Q2). It changes
// no config value. The figures come from the engine alone, with one listener per room, and say
// nothing about real visitors.

import { ghostSoundConfig } from "../../src/config/ghost-sound-config";
import type {
  HearingMethodConfig,
  VisitType,
} from "../../src/config/hearing-method-config";
import type { GhostSoundId } from "../../src/config/sound-id";
import { evenSelectionIndexes } from "../../src/session/even-selection-indexes";
import { visitRooms } from "../../src/session/visit-rooms";
import type { ListenerParameterRange } from "./listener-parameter-arbitraries";
import { playPopulationRooms } from "./play-population-rooms";
import type { RoomRun } from "./search-under-test";
import { specSearchUnderTest } from "./spec-search-under-test";

/** One visit of the measurement: its rooms played by one listener each, in the visit's order. */
export interface MeasuredReplayVisit {
  /** Sound trials over the visit's rooms. */
  readonly soundTrialCount: number;
  /** Sound trials answered with nothing: the sounds the replay plays again. */
  readonly missedCount: number;
  /** Sound trials answered with the other side. */
  readonly wrongSideCount: number;
  /** The room of every missed sound, in the visit's order. */
  readonly missedRoomIds: readonly GhostSoundId[];
}

/** The replay at one most count and one gap, over the visits of one group. */
export interface ReplayLengthRow {
  /** The most sounds one replay plays, or null for no limit. */
  readonly maxCount: number | null;
  readonly gapMs: number;
  /** Visits whose replay is a selection, as a fraction of the group. */
  readonly selectionFraction: number;
  /** The length of the replay in milliseconds, one entry per visit, sorted from short to long. */
  readonly lengthsMs: readonly number[];
}

export interface ReplayLengthMeasurement {
  readonly visitType: VisitType;
  readonly rangeName: string;
  readonly seed: number;
  readonly visits: readonly MeasuredReplayVisit[];
  readonly rows: readonly ReplayLengthRow[];
}

export interface ReplayLengthMeasurementOptions {
  readonly visitType: VisitType;
  readonly range: ListenerParameterRange;
  readonly visitCount: number;
  readonly seed: number;
  readonly settings: HearingMethodConfig;
  /** The candidate most counts; null for no limit. */
  readonly maxCounts: readonly (number | null)[];
  /** The candidate gaps from the end of one sound to the request for the next. */
  readonly gapsMs: readonly number[];
  /** The output stage's scheduling lead, added to every sound. */
  readonly scheduleLeadMs: number;
}

/** A visit's counts from its room runs, in the visit's order of rooms. */
function visitOf(
  runs: readonly RoomRun[],
  roomIds: readonly GhostSoundId[],
): MeasuredReplayVisit {
  let soundTrialCount = 0;
  let wrongSideCount = 0;
  const missedRoomIds: GhostSoundId[] = [];
  runs.forEach((run, index) => {
    const roomId = roomIds[index]!;
    for (const trial of run.trials) {
      if (trial.kind !== "sound") {
        continue;
      }
      soundTrialCount += 1;
      if (trial.response === "none") {
        missedRoomIds.push(roomId);
      } else if (trial.response !== trial.ear) {
        wrongSideCount += 1;
      }
    }
  });
  return Object.freeze({
    soundTrialCount,
    missedCount: missedRoomIds.length,
    wrongSideCount,
    missedRoomIds: Object.freeze(missedRoomIds),
  });
}

/**
 * The length of a replay of these missed sounds: over the sounds it plays, the room sound's
 * duration and the scheduling lead, plus one gap between each two sounds. Renders, pauses, the
 * announcement and the time to read it are not included.
 */
export function replayLengthMs(
  missedRoomIds: readonly GhostSoundId[],
  maxCount: number | null,
  gapMs: number,
  scheduleLeadMs: number,
): number {
  const positions =
    maxCount === null
      ? missedRoomIds.map((_, index) => index)
      : evenSelectionIndexes(missedRoomIds.length, maxCount);
  if (positions.length === 0) {
    return 0;
  }
  const soundsMs = positions.reduce(
    (sum, position) =>
      sum +
      ghostSoundConfig[missedRoomIds[position]!].durationMs +
      scheduleLeadMs,
    0,
  );
  return soundsMs + (positions.length - 1) * gapMs;
}

/**
 * Plays `visitCount` visits of `visitType`, each room by its own listener drawn from `range`, and
 * gives the missed sounds of each visit and the replay's length at every most count and gap.
 * Everything comes from `seed`: `playPopulationRooms` plays `visitCount × rooms` rooms, which are
 * taken as many at a time as the visit has rooms. The same options give equal measurements.
 */
export function measureReplayLength(
  options: ReplayLengthMeasurementOptions,
): ReplayLengthMeasurement {
  const roomIds = visitRooms(options.visitType).map((room) => room.roomId);
  const rooms = playPopulationRooms(specSearchUnderTest, {
    listenerCount: options.visitCount * roomIds.length,
    seed: options.seed,
    settings: options.settings,
    range: options.range,
  });
  const visits: MeasuredReplayVisit[] = [];
  for (let start = 0; start < rooms.length; start += roomIds.length) {
    visits.push(
      visitOf(
        rooms.slice(start, start + roomIds.length).map((room) => room.run),
        roomIds,
      ),
    );
  }
  const rows: ReplayLengthRow[] = [];
  for (const maxCount of options.maxCounts) {
    for (const gapMs of options.gapsMs) {
      const selected = visits.filter(
        (visit) => maxCount !== null && visit.missedCount > maxCount,
      ).length;
      rows.push(
        Object.freeze({
          maxCount,
          gapMs,
          selectionFraction: selected / visits.length,
          lengthsMs: Object.freeze(
            visits
              .map((visit) =>
                replayLengthMs(
                  visit.missedRoomIds,
                  maxCount,
                  gapMs,
                  options.scheduleLeadMs,
                ),
              )
              .sort((first, second) => first - second),
          ),
        }),
      );
    }
  }
  return Object.freeze({
    visitType: options.visitType,
    rangeName: options.range.name,
    seed: options.seed,
    visits: Object.freeze(visits),
    rows: Object.freeze(rows),
  });
}
