import { ghostSoundConfig } from "../../config/ghost-sound-config";
import type { RandomSource } from "../../config/seeded-random";
import type { GhostSoundId } from "../../config/sound-id";
import { ghostSoundIds } from "../../config/sound-id";
import { pitchLabel, roomNames } from "../../copy/room-copy";
import {
  houseViewBox,
  houseWalls,
  roomGeometry,
  type RoomGeometry,
} from "./house-geometry";
import { drawFurniture } from "./room-furniture";
import { createSketchPen, type Point, type SketchPen } from "./sketch-pen";
import { svgElement } from "./svg-element";

/**
 * How a room is drawn. `dark` is a room still ahead, `lit` is the room the visitor is in,
 * `visited` keeps a low glow, and `closed` is a room this visit does not enter.
 */
export type RoomState = "dark" | "lit" | "visited" | "closed";

export type RoomStates = Readonly<Record<GhostSoundId, RoomState>>;

/** The drawing of the house and the handles the rest of the interface needs. */
export interface HouseSection {
  readonly element: SVGElement;
  /** Changes how each room is drawn. Nothing else about the drawing ever changes. */
  setRoomStates(states: RoomStates): void;
  /** The lamp of a room, hung from its anchor, so ambient motion can let it sway. */
  lampOf(roomId: GhostSoundId): SVGElement;
  /** A thin strip under one corridor door, for the shadow that sometimes passes there. */
  readonly doorGap: SVGElement;
}

const lampShadeHeight = 11;

function pathData(points: readonly Point[], close: boolean): string {
  const body = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x} ${y}`)
    .join("");
  return close ? `${body}Z` : body;
}

/** Where the bulb of a room's lamp hangs. */
function bulbOf(room: RoomGeometry): Point {
  return [
    room.lampAnchor[0],
    room.lampAnchor[1] + room.lampCordLength + lampShadeHeight + 3,
  ];
}

/** Everything that is cut through by the section: walls, floors and roof, as closed shapes. */
function cutShapes(): string {
  const w = houseWalls;
  const box = (
    left: number,
    top: number,
    right: number,
    bottom: number,
  ): string =>
    pathData(
      [
        [left, top],
        [right, top],
        [right, bottom],
        [left, bottom],
      ],
      true,
    );
  const roof = pathData(
    [w.eaveLeft, w.ridge, w.eaveRight, [555, 239], w.ridgeInner, [165, 239]],
    true,
  );
  const slabs = (["attic", "stairs", "nursery"] as const)
    .map((id) =>
      box(
        w.innerLeft,
        roomGeometry[id].bottom,
        w.innerRight,
        roomGeometry[id].bottom + 10,
      ),
    )
    .join("");
  return (
    roof +
    box(w.outerLeft, w.roofMeetsWallY, w.innerLeft, w.groundY) +
    box(w.innerRight, w.roofMeetsWallY, w.outerRight, w.groundY) +
    slabs +
    // The ground slab, the thicker cellar walls and the footing.
    box(w.innerLeft, roomGeometry.corridor.bottom, w.innerRight, 752) +
    box(174, w.groundY, w.innerLeft, w.footingY) +
    box(w.innerRight, w.groundY, 546, w.footingY) +
    box(w.innerLeft, roomGeometry.cellar.bottom, w.innerRight, w.footingY)
  );
}

/** The pencil lines of the shell: roof, walls, floors, chimney and the ground outside. */
function shellLines(pen: SketchPen): string {
  const w = houseWalls;
  let lines =
    pen.through([w.eaveLeft, w.ridge, w.eaveRight]) +
    pen.through([[165, 239], w.ridgeInner, [555, 239]]) +
    pen.line(w.eaveLeft, [165, 239]) +
    pen.line(w.eaveRight, [555, 239]) +
    pen.line([w.outerLeft, 236], [w.outerLeft, w.groundY]) +
    pen.line([w.outerRight, 236], [w.outerRight, w.groundY]) +
    pen.line([w.innerLeft, w.roofMeetsWallY], [w.innerLeft, 890]) +
    pen.line([w.innerRight, w.roofMeetsWallY], [w.innerRight, 890]) +
    pen.through([
      [174, w.groundY],
      [174, w.footingY],
      [546, w.footingY],
      [546, w.groundY],
    ]) +
    // The chimney on the right slope.
    pen.through([
      [452, 145],
      [452, 112],
      [478, 112],
      [478, 164],
    ]) +
    pen.line([447, 112], [483, 112]) +
    // The ground on both sides.
    pen.line([4, w.groundY], [174, w.groundY]) +
    pen.line([546, w.groundY], [716, w.groundY]);
  for (const id of ghostSoundIds) {
    const bottom = roomGeometry[id].bottom;
    const under = id === "corridor" ? 752 : bottom + 10;
    lines += pen.line([w.innerLeft, bottom], [w.innerRight, bottom]);
    if (id !== "cellar") {
      lines += pen.line([w.innerLeft, under], [w.innerRight, under]);
    }
  }
  return lines;
}

/** The draughtsman's sign for earth: groups of three short slanted strokes under the ground. */
function earthMarks(pen: SketchPen): string {
  let marks = "";
  const groupAt = (x: number, y: number): void => {
    for (let stroke = 0; stroke < 3; stroke += 1) {
      const left = x + stroke * 7;
      marks += pen.line([left, y + 16], [left + 12, y + 4]);
    }
  };
  for (const x of [18, 70, 122, 566, 618, 670]) {
    groupAt(x, houseWalls.groundY);
  }
  for (const y of [790, 850]) {
    groupAt(138, y);
    groupAt(556, y);
  }
  return marks;
}

function drawLamp(doc: Document, room: RoomGeometry): SVGElement {
  const [x, y] = room.lampAnchor;
  const shadeTop = y + room.lampCordLength;
  const shadeBottom = shadeTop + lampShadeHeight;
  const bulb = bulbOf(room);
  const lamp = svgElement(doc, "g", { class: "house-lamp" }, [
    svgElement(doc, "path", {
      class: "house-ink",
      d: `M${x} ${y}L${x} ${shadeTop}M${x - 4} ${shadeTop}L${x + 4} ${shadeTop}L${x + 12} ${shadeBottom}L${x - 12} ${shadeBottom}Z`,
    }),
    svgElement(doc, "circle", {
      class: "house-bulb",
      cx: bulb[0],
      cy: bulb[1],
      r: 3.5,
    }),
  ]);
  // The lamp swings around the point where its cord meets the ceiling.
  lamp.style.transformOrigin = `${x}px ${y}px`;
  return lamp;
}

/** The room's name and pitch, set beside the house on a short leader line. */
function drawLevelNote(
  doc: Document,
  pen: SketchPen,
  roomId: GhostSoundId,
): SVGElement {
  const room = roomGeometry[roomId];
  const y = roomId === "attic" ? 250 : (room.top + room.bottom) / 2;
  const name = svgElement(doc, "text", {
    class: "house-note-name",
    x: 578,
    y: y + 2,
  });
  name.textContent = roomNames[roomId];
  const pitch = svgElement(doc, "text", {
    class: "house-note-pitch",
    x: 578,
    y: y + 24,
  });
  pitch.textContent = pitchLabel(ghostSoundConfig[roomId].centreHz);
  return svgElement(
    doc,
    "g",
    { class: "house-note", "data-room": roomId, "data-state": "dark" },
    [
      svgElement(doc, "path", {
        class: "house-ink",
        d: pen.line([548, y - 4], [570, y - 4]),
      }),
      name,
      pitch,
    ],
  );
}

/** One segment of the measuring line at the left, as tall as its room. */
function drawClimbSegment(
  doc: Document,
  pen: SketchPen,
  roomId: GhostSoundId,
): SVGElement {
  const room = roomGeometry[roomId];
  const x = 128;
  return svgElement(
    doc,
    "path",
    {
      class: "house-climb",
      "data-room": roomId,
      "data-state": "dark",
      d:
        pen.line([x, room.bottom], [x, room.top]) +
        pen.line([x - 7, room.bottom], [x + 7, room.bottom]) +
        pen.line([x - 7, room.top], [x + 7, room.top]),
    },
    [],
  );
}

/**
 * Draws the cross-section of the house: five rooms, one above the other, cut through like an
 * architect's section. The random source only shapes the pencil lines. The drawing knows the
 * state of each room and nothing about any sound.
 */
export function drawHouseSection(
  doc: Document,
  random: RandomSource,
): HouseSection {
  const pen = createSketchPen(random);
  const definitions = svgElement(doc, "defs", {}, [
    svgElement(
      doc,
      "pattern",
      {
        id: "house-hatch",
        width: 7,
        height: 7,
        patternUnits: "userSpaceOnUse",
        patternTransform: "rotate(45)",
      },
      [
        svgElement(doc, "rect", {
          class: "house-cut-fill",
          width: 7,
          height: 7,
        }),
        svgElement(doc, "path", { class: "house-cut-hatch", d: "M0 0L0 7" }),
      ],
    ),
  ]);

  const rooms = new Map<GhostSoundId, SVGElement>();
  const lamps = new Map<GhostSoundId, SVGElement>();
  const notes: SVGElement[] = [];
  const climb: SVGElement[] = [];
  const roomGroups: SVGElement[] = [];
  let doorGap: SVGElement | null = null;

  for (const roomId of ghostSoundIds) {
    const room = roomGeometry[roomId];
    const bulb = bulbOf(room);
    const gradientId = `house-light-${roomId}`;
    definitions.append(
      svgElement(
        doc,
        "radialGradient",
        {
          id: gradientId,
          gradientUnits: "userSpaceOnUse",
          cx: bulb[0],
          cy: bulb[1],
          r: 270,
        },
        [
          svgElement(doc, "stop", { class: "house-light-near", offset: 0 }),
          svgElement(doc, "stop", { class: "house-light-mid", offset: 0.42 }),
          svgElement(doc, "stop", { class: "house-light-far", offset: 1 }),
        ],
      ),
    );
    const furniture = drawFurniture(roomId, pen);
    const lamp = drawLamp(doc, room);
    const children: SVGElement[] = [
      svgElement(doc, "path", {
        class: "house-light",
        d: pathData(room.outline, true),
        fill: `url(#${gradientId})`,
      }),
      svgElement(doc, "path", { class: "house-ink", d: furniture.lines }),
      ...furniture.dots.map((dot) =>
        svgElement(doc, "circle", {
          class: "house-ink",
          cx: dot.at[0],
          cy: dot.at[1],
          r: dot.radius,
        }),
      ),
    ];
    if (roomId === "corridor") {
      doorGap = svgElement(doc, "rect", {
        class: "house-door-gap",
        x: 458,
        y: room.bottom - 3,
        width: 40,
        height: 3,
      });
      children.push(doorGap);
    }
    children.push(lamp);
    const group = svgElement(
      doc,
      "g",
      { class: "house-room", "data-room": roomId, "data-state": "dark" },
      children,
    );
    rooms.set(roomId, group);
    lamps.set(roomId, lamp);
    roomGroups.push(group);
    notes.push(drawLevelNote(doc, pen, roomId));
    climb.push(drawClimbSegment(doc, pen, roomId));
  }
  if (doorGap === null) {
    throw new Error("The corridor was not drawn.");
  }

  const element = svgElement(
    doc,
    "svg",
    {
      class: "house-section",
      viewBox: `${houseViewBox.x} ${houseViewBox.y} ${houseViewBox.width} ${houseViewBox.height}`,
      preserveAspectRatio: "xMidYMid meet",
      "aria-hidden": "true",
      focusable: "false",
    },
    [
      definitions,
      svgElement(doc, "path", {
        class: "house-ink house-earth",
        d: earthMarks(pen),
      }),
      ...roomGroups,
      svgElement(doc, "path", {
        class: "house-cut",
        d: cutShapes(),
        fill: "url(#house-hatch)",
      }),
      svgElement(doc, "path", {
        class: "house-ink house-shell",
        d: shellLines(pen),
      }),
      ...notes,
      ...climb,
    ],
  );

  const setRoomStates = (states: RoomStates): void => {
    for (const marked of [...roomGroups, ...notes, ...climb]) {
      const roomId = marked.getAttribute("data-room") as GhostSoundId;
      marked.setAttribute("data-state", states[roomId]);
    }
  };

  return {
    element,
    setRoomStates,
    lampOf: (roomId) => {
      const lamp = lamps.get(roomId);
      if (lamp === undefined) {
        throw new RangeError(`There is no room named ${roomId}.`);
      }
      return lamp;
    },
    doorGap,
  };
}
