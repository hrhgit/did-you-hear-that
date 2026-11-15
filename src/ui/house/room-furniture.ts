import type { GhostSoundId } from "../../config/sound-id";
import { atticTieBeamY, houseWalls, roomGeometry } from "./house-geometry";
import type { Point, SketchPen } from "./sketch-pen";

/** What stands in one room: pencil lines as path data, and a few small round details. */
export interface Furniture {
  readonly lines: string;
  readonly dots: readonly { readonly at: Point; readonly radius: number }[];
}

/** A door seen from the front, with its knob. Returns the door's lines and the knob. */
function door(
  pen: SketchPen,
  left: number,
  floorY: number,
): { lines: string; knob: { at: Point; radius: number } } {
  const right = left + 44;
  const top = floorY - 92;
  return {
    lines:
      pen.through([
        [left, floorY],
        [left, top],
        [right, top],
        [right, floorY],
      ]) + pen.box(left + 8, top + 10, right - 8, top + 44),
    knob: { at: [right - 8, floorY - 44], radius: 2 },
  };
}

function cellar(pen: SketchPen): Furniture {
  const floorY = roomGeometry.cellar.bottom;
  // A bricked-up arch in the back wall, two barrels, and steps up to the right.
  const arch = `M205 ${floorY}L205 812A35 35 0 0 1 275 812L275 ${floorY}`;
  const barrel = (left: number): string => {
    const right = left + 40;
    const top = floorY - 58;
    return (
      `M${left} ${floorY}Q${left - 7} ${floorY - 29} ${left} ${top}` +
      `L${right} ${top}Q${right + 7} ${floorY - 29} ${right} ${floorY}` +
      pen.line([left - 3, floorY - 42], [right + 3, floorY - 42]) +
      pen.line([left - 3, floorY - 16], [right + 3, floorY - 16])
    );
  };
  const steps = pen.through([
    [456, floorY],
    [456, floorY - 22],
    [480, floorY - 22],
    [480, floorY - 44],
    [504, floorY - 44],
    [504, floorY - 66],
    [houseWalls.innerRight, floorY - 66],
  ]);
  return {
    lines:
      arch +
      pen.line([222, 842], [258, 842]) +
      pen.line([214, 866], [266, 866]) +
      barrel(346) +
      barrel(394) +
      steps,
    dots: [],
  };
}

function corridor(pen: SketchPen): Furniture {
  const floorY = roomGeometry.corridor.bottom;
  const doors = [212, 300, 456].map((left) => door(pen, left, floorY));
  return {
    lines:
      doors.map((each) => each.lines).join("") +
      // A picture between the doors and a runner along the floor.
      pen.box(368, 652, 406, 688) +
      pen.box(374, 658, 400, 682) +
      pen.line([200, floorY - 4], [520, floorY - 4]),
    dots: doors.map((each) => each.knob),
  };
}

function nursery(pen: SketchPen): Furniture {
  const floorY = roomGeometry.nursery.bottom;
  const ceilingY = roomGeometry.nursery.top;
  let crib = pen.box(222, floorY - 46, 300, floorY - 6);
  for (let x = 232; x < 300; x += 10) {
    crib += pen.line([x, floorY - 46], [x, floorY - 6]);
  }
  crib +=
    pen.line([222, floorY - 62], [222, floorY]) +
    pen.line([300, floorY - 52], [300, floorY]);
  // A mobile over the crib, a window, and a music box on a shelf.
  const mobile =
    pen.line([262, ceilingY], [262, ceilingY + 30]) +
    pen.line([244, ceilingY + 30], [280, ceilingY + 30]) +
    pen.line([246, ceilingY + 30], [246, ceilingY + 44]) +
    pen.line([262, ceilingY + 30], [262, ceilingY + 50]) +
    pen.line([278, ceilingY + 30], [278, ceilingY + 42]);
  const windowFrame =
    pen.box(410, 474, 478, 546) +
    pen.line([444, 474], [444, 546]) +
    pen.line([410, 510], [478, 510]);
  const shelf =
    pen.line([324, 552], [384, 552]) +
    pen.box(342, 536, 366, 552) +
    pen.through([
      [366, 544],
      [374, 544],
      [374, 538],
    ]);
  return {
    lines: crib + mobile + windowFrame + shelf,
    dots: [
      { at: [246, ceilingY + 47], radius: 3 },
      { at: [262, ceilingY + 53], radius: 3 },
      { at: [278, ceilingY + 45], radius: 3 },
    ],
  };
}

function stairs(pen: SketchPen): Furniture {
  const floorY = roomGeometry.stairs.bottom;
  const ceilingY = roomGeometry.stairs.top;
  const run = 36;
  const rise = 20;
  const points: Point[] = [[236, floorY]];
  let balusters = "";
  for (let step = 0; step < 7; step += 1) {
    const x = 236 + step * run;
    const y = floorY - (step + 1) * rise;
    points.push([x, y], [x + run, y]);
    if (y - 44 > ceilingY) {
      balusters += pen.line([x + 4, y], [x + 4, y - 44]);
    }
  }
  // The handrail runs parallel to the steps and stops where it meets the ceiling.
  const railSlope = rise / run;
  const railStart: Point = [232, floorY - 62];
  const railEndX = railStart[0] + (railStart[1] - ceilingY) / railSlope;
  return {
    lines:
      pen.through(points) +
      balusters +
      pen.line(railStart, [railEndX, ceilingY]) +
      pen.line([railStart[0], railStart[1]], [railStart[0], floorY]) +
      // A cupboard under the stairs.
      pen.box(452, floorY - 78, 492, floorY),
    dots: [{ at: [460, floorY - 38], radius: 2 }],
  };
}

function attic(pen: SketchPen): Furniture {
  const floorY = roomGeometry.attic.bottom;
  // The tie beam reaches from one side of the roof to the other.
  const slope =
    (houseWalls.roofMeetsWallY - houseWalls.ridgeInner[1]) /
    (houseWalls.ridgeInner[0] - houseWalls.innerLeft);
  const halfBeam = (atticTieBeamY - houseWalls.ridgeInner[1]) / slope;
  const beamLeft = houseWalls.ridgeInner[0] - halfBeam;
  const beamRight = houseWalls.ridgeInner[0] + halfBeam;
  const beam =
    pen.line([beamLeft, atticTieBeamY], [beamRight, atticTieBeamY]) +
    pen.line(
      [beamLeft + 5, atticTieBeamY + 5],
      [beamRight - 5, atticTieBeamY + 5],
    );
  const roundWindow =
    "M342 152A18 18 0 1 0 378 152A18 18 0 1 0 342 152" +
    pen.line([360, 134], [360, 170]) +
    pen.line([342, 152], [378, 152]);
  const trunk =
    pen.box(410, floorY - 36, 480, floorY) +
    pen.line([410, floorY - 26], [480, floorY - 26]) +
    pen.box(440, floorY - 30, 450, floorY - 20);
  const boxes =
    pen.box(216, floorY - 30, 262, floorY) +
    pen.box(224, floorY - 54, 254, floorY - 30);
  return { lines: beam + roundWindow + trunk + boxes, dots: [] };
}

/** Draws what stands in a room. */
export function drawFurniture(roomId: GhostSoundId, pen: SketchPen): Furniture {
  switch (roomId) {
    case "cellar":
      return cellar(pen);
    case "corridor":
      return corridor(pen);
    case "nursery":
      return nursery(pen);
    case "stairs":
      return stairs(pen);
    case "attic":
      return attic(pen);
  }
}
