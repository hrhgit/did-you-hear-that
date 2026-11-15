import type { GhostSoundId } from "../../config/sound-id";
import type { Point } from "./sketch-pen";

/**
 * Where everything in the cross-section sits, in the units of the drawing. The house is one room
 * wide and five rooms tall: the cellar below the ground line, then the corridor, the nursery, the
 * stairs and the attic under the roof. These numbers place lines on a drawing. None of them
 * affects sound, timing or scoring.
 *
 * The view box is the part of the drawing that must always be seen: the house, the measuring line
 * at its left and the room names at its right. The ground line runs on past both sides of it.
 */
export const houseViewBox = Object.freeze({
  x: 108,
  y: 50,
  width: 592,
  height: 880,
});

/** The inside of one room: its bounding box, its outline and where its lamp hangs. */
export interface RoomGeometry {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  /** The room's inner outline, clockwise from the bottom left. */
  readonly outline: readonly Point[];
  /** Where the lamp's cord meets the ceiling. */
  readonly lampAnchor: Point;
  /** Length of the cord, from the ceiling to the top of the shade. */
  readonly lampCordLength: number;
}

export const houseWalls = Object.freeze({
  outerLeft: 180,
  outerRight: 540,
  innerLeft: 192,
  innerRight: 528,
  /** Top of the ground slab, which is also the ground outside. */
  groundY: 742,
  /** Underside of the cellar's footing. */
  footingY: 902,
  ridge: [360, 78] as Point,
  ridgeInner: [360, 96] as Point,
  eaveLeft: [150, 232] as Point,
  eaveRight: [570, 232] as Point,
  /** Height at which the inner face of the roof meets the inner face of each wall. */
  roofMeetsWallY: 219,
});

function rectangle(
  top: number,
  bottom: number,
  lampX: number,
  lampCordLength: number,
): RoomGeometry {
  const { innerLeft: left, innerRight: right } = houseWalls;
  return Object.freeze({
    left,
    right,
    top,
    bottom,
    outline: Object.freeze([
      [left, bottom],
      [left, top],
      [right, top],
      [right, bottom],
    ] as Point[]),
    lampAnchor: [lampX, top] as Point,
    lampCordLength,
  });
}

/** Rooms by code name. Each floor slab is 10 units thick and sits under its room. */
export const roomGeometry: Readonly<Record<GhostSoundId, RoomGeometry>> =
  Object.freeze({
    cellar: rectangle(752, 890, 318, 30),
    corridor: rectangle(600, 740, 398, 30),
    nursery: rectangle(450, 590, 348, 30),
    stairs: rectangle(300, 440, 250, 30),
    attic: Object.freeze({
      left: houseWalls.innerLeft,
      right: houseWalls.innerRight,
      top: houseWalls.ridgeInner[1],
      bottom: 290,
      outline: Object.freeze([
        [houseWalls.innerLeft, 290],
        [houseWalls.innerLeft, houseWalls.roofMeetsWallY],
        houseWalls.ridgeInner,
        [houseWalls.innerRight, houseWalls.roofMeetsWallY],
        [houseWalls.innerRight, 290],
      ] as Point[]),
      // The attic lamp hangs from the tie beam, not from the ridge.
      lampAnchor: [322, 204] as Point,
      lampCordLength: 22,
    }),
  });

/** Height of the tie beam across the attic. */
export const atticTieBeamY = 200;
