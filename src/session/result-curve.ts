import type { GhostSoundId } from "../config/sound-id";
import type {
  Ear,
  PictureWing,
  ResultPicture,
  WingState,
} from "./result-page-types";

/** One ear at one pitch on the curve chart (result-curve design.md "Model"). */
export interface CurvePoint {
  readonly ear: Ear;
  readonly mark: WingState;
  /** dB relative to the calibration, for `found` only. */
  readonly levelDb: number | null;
  readonly lowDb: number | null;
  readonly highDb: number | null;
  /** The earlier visit's found level in this wing, or null. */
  readonly earlierDb: number | null;
}

export interface CurveColumn {
  readonly roomId: GhostSoundId;
  readonly pitchLabel: string;
  readonly frequencyHz: number;
  readonly left: CurvePoint;
  readonly right: CurvePoint;
}

export interface ResultCurve {
  /** Lowest pitch first (R1.1). */
  readonly columns: readonly CurveColumn[];
  /** The loudest level drawn, rounded up to 10 dB. */
  readonly topDb: number;
  /** The quietest level drawn, rounded down to 10 dB. */
  readonly bottomDb: number;
  /** At most four grid levels, from the top down (R1.2). */
  readonly gridDb: readonly number[];
  /** Whether any column carries an earlier level (R1.6). */
  readonly hasEarlier: boolean;
}

const gridLineMaxCount = 4;
const emptyTopDb = 0;
const emptyBottomDb = -60;
const gridStepsDb = [10, 20, 30, 40] as const;

function pointOf(wing: PictureWing): CurvePoint {
  const found = wing.state === "found" && wing.levelDb !== undefined;
  return {
    ear: wing.ear,
    mark: wing.state,
    levelDb: found ? (wing.levelDb ?? null) : null,
    lowDb: found ? (wing.range?.lowDb ?? null) : null,
    highDb: found ? (wing.range?.highDb ?? null) : null,
    earlierDb: wing.earlier?.levelDb ?? null,
  };
}

/** Grid levels at the smallest step from `gridStepsDb` that gives at most four lines. */
function gridOf(topDb: number, bottomDb: number): number[] {
  for (const stepDb of gridStepsDb) {
    const levels: number[] = [];
    for (let level = topDb; level >= bottomDb; level -= stepDb) {
      levels.push(level);
    }
    if (levels.length <= gridLineMaxCount) {
      return levels;
    }
  }
  return [topDb, bottomDb];
}

/**
 * The yard chart of a result picture (result-curve R1). Since the redesign of 2026-11-25 it is the
 * result's only picture, so it is always drawn, even with no level found: then only its marks. A pure function of the picture: each point is read from its own wing, and
 * nothing here compares one pitch with another.
 */
export function resultCurve(picture: ResultPicture): ResultCurve {
  const columns = [...picture.floors]
    .sort((a, b) => a.room.frequencyHz - b.room.frequencyHz)
    .map((floor): CurveColumn => ({
      roomId: floor.room.roomId,
      pitchLabel: floor.pitchLabel,
      frequencyHz: floor.room.frequencyHz,
      left: pointOf(floor.left),
      right: pointOf(floor.right),
    }));
  const levels = columns.flatMap((column) =>
    [column.left, column.right].flatMap((point) =>
      [point.levelDb, point.lowDb, point.highDb, point.earlierDb].filter(
        (level): level is number => level !== null,
      ),
    ),
  );
  // With no level to draw, the sky still spans a plain stretch below the calibration.
  let topDb =
    levels.length === 0 ? emptyTopDb : Math.ceil(Math.max(...levels) / 10) * 10;
  let bottomDb =
    levels.length === 0
      ? emptyBottomDb
      : Math.floor(Math.min(...levels) / 10) * 10;
  // At least 20 dB tall, so one or two levels do not fill the chart edge to edge.
  if (topDb - bottomDb < 20) {
    topDb += 10;
    bottomDb = Math.min(bottomDb, topDb - 20);
  }
  return Object.freeze({
    columns: Object.freeze(columns),
    topDb,
    bottomDb,
    gridDb: Object.freeze(gridOf(topDb, bottomDb)),
    hasEarlier: columns.some(
      (column) =>
        column.left.earlierDb !== null || column.right.earlierDb !== null,
    ),
  });
}
