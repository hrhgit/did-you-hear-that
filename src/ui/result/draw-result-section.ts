import { createSeededRandom } from "../../config/seeded-random";
import { ghostSoundIds, type GhostSoundId } from "../../config/sound-id";
import type {
  PictureFloor,
  PictureWing,
  ResultPicture,
} from "../../session/result-page-types";
import {
  cutShapes,
  drawLamp,
  drawLevelNote,
  earthMarks,
  pathData,
  shellLines,
} from "../house/draw-house-section";
import { houseWalls, roomGeometry } from "../house/house-geometry";
import {
  createSketchPen,
  type Point,
  type SketchPen,
} from "../house/sketch-pen";
import { svgElement } from "../house/svg-element";
import { drawCreature } from "../room/creature-art";
import {
  atticTieBeamEnds,
  ceilingYAt,
  houseCentreX,
  resultLampOf,
  resultViewBox,
  wingBox,
  wingEdgeX,
  wingLabelY,
  wingLightBox,
} from "./result-geometry";

/** What the drawing needs besides the picture. */
export interface ResultSectionOptions {
  /**
   * The seed of the pencil. The shell of the house is drawn from it alone, so it looks the same
   * whatever the picture holds.
   */
  readonly seed: number;
  /** The words under the two wings. */
  readonly wingLabels: { readonly left: string; readonly right: string };
  /** Whether the light spreads from the lamps as the drawing appears, or is simply there. */
  readonly entering: boolean;
}

/** How far the earlier visit's outline keeps from the floor and the ceiling of its room. */
const outlineInset = 7;

/** The side of the square a creature is drawn in, in the units of the drawing. */
const creatureSize = 54;

/** How far down its square a creature's feet are: its drawings stand at 104 of 120. */
const creatureFeetFraction = 104 / 120;

/** The clear space a creature keeps from the lamp's cord in the middle of the room. */
const creatureLampGap = 6;

/** The clear space a creature keeps from a wall. */
const creatureWallGap = 2;

/** How far inside the light a creature stands, as a part of its own width. */
const creatureInsideLightFraction = 0.32;

/**
 * The half width and half height of the glow around a lamp's bulb. It stays close to the bulb, so
 * that a dark wing never looks a little lit, and its top stays under the ceiling, so that no
 * floor's shapes reach into the floor above (a test measures their boxes).
 */
const haloRadii = { x: 22, y: 30 } as const;

/** The height of the pool of light on a lit wing's floor. It rises from the floor, never below. */
const poolHeight = 18;

/** Where the bulb of a room's lamp is on the result: as `drawLamp` places it. */
function bulbOf(roomId: GhostSoundId): Point {
  const lamp = resultLampOf(roomId);
  return [houseCentreX, lamp.anchor[1] + lamp.cordLength + 14];
}

/**
 * Where a lit wing's creature stands: just inside the end of its light, on the floor, kept clear
 * of the lamp in the middle and of the wall. The x is its middle.
 */
export function creatureCentreX(side: "left" | "right", depth: number): number {
  const toWall = side === "left" ? -1 : 1;
  const nearest = houseCentreX + toWall * (creatureSize / 2 + creatureLampGap);
  const furthest =
    (side === "left" ? houseWalls.innerLeft : houseWalls.innerRight) -
    toWall * (creatureSize / 2 + creatureWallGap);
  const inside =
    wingEdgeX(side, depth) -
    toWall * creatureSize * creatureInsideLightFraction;
  return side === "left"
    ? Math.max(furthest, Math.min(nearest, inside))
    : Math.min(furthest, Math.max(nearest, inside));
}

/** One wing: its light, its hatching, its end line and the outline of an earlier visit. */
function drawWing(
  doc: Document,
  pen: SketchPen,
  roomId: GhostSoundId,
  side: "left" | "right",
  wing: PictureWing,
): SVGElement[] {
  const room = roomGeometry[roomId];
  const parts: SVGElement[] = [];
  const depth = wing.lightDepthFraction;

  if (depth === null) {
    // No level can be drawn here: the whole wing is hatched and stays unlit.
    const whole = wingBox(roomId, side);
    parts.push(
      svgElement(doc, "rect", {
        class: "result-doubt",
        x: whole.left,
        y: whole.top,
        width: whole.right - whole.left,
        height: whole.bottom - whole.top,
        fill: "url(#result-doubt-hatch)",
      }),
    );
  } else if (depth > 0) {
    const light = wingLightBox(roomId, side, depth);
    parts.push(
      svgElement(doc, "rect", {
        class: "result-light",
        x: light.left,
        y: light.top,
        width: light.right - light.left,
        height: light.bottom - light.top,
        fill: `url(#result-light-${side})`,
      }),
      // The pool the light leaves on the floor, as wide as the light: half an ellipse on the floor.
      svgElement(doc, "path", {
        class: "result-pool",
        d: `M${String(light.left)} ${String(room.bottom)}A${String((light.right - light.left) / 2)} ${String(poolHeight)} 0 0 1 ${String(light.right)} ${String(room.bottom)}Z`,
        fill: "url(#result-pool)",
      }),
    );
    if (depth < 1) {
      // Where the light ends: one pencil line from the ceiling to the floor.
      const x = wingEdgeX(side, depth);
      parts.push(
        svgElement(doc, "path", {
          class: "result-reach",
          d: pen.line([x, ceilingYAt(roomId, x)], [x, room.bottom]),
        }),
      );
    }
  }

  if (depth !== null && depth > 0) {
    // The creature of the room, where the light ends: as far as the visitor followed it here.
    const art = drawCreature(doc, roomId, "awake");
    art.setAttribute(
      "x",
      String(creatureCentreX(side, depth) - creatureSize / 2),
    );
    art.setAttribute(
      "y",
      String(room.bottom - creatureSize * creatureFeetFraction),
    );
    // In the units of the drawing. Chrome sizes an inner drawing by its attributes alone; the
    // inline style keeps a browser that reads the size from styles from taking the page's 100%.
    art.setAttribute("width", String(creatureSize));
    art.setAttribute("height", String(creatureSize));
    art.style.width = `${String(creatureSize)}px`;
    art.style.height = `${String(creatureSize)}px`;
    // In a group of its own, which can move as it arrives: an inner drawing cannot.
    parts.push(
      svgElement(
        doc,
        "g",
        { class: "result-creature", "data-creature": roomId },
        [art],
      ),
    );
  }

  const outlineDepth = wing.earlier?.outlineDepthFraction ?? null;
  if (outlineDepth !== null && outlineDepth > 0) {
    // An earlier visit: three ruled, dashed sides, open towards the lamp.
    const x = wingEdgeX(side, outlineDepth);
    const points: Point[] = [
      [houseCentreX, ceilingYAt(roomId, houseCentreX) + outlineInset],
      [x, ceilingYAt(roomId, x) + outlineInset],
      [x, room.bottom - outlineInset],
      [houseCentreX, room.bottom - outlineInset],
    ];
    parts.push(
      svgElement(doc, "path", {
        class: "result-earlier",
        d: pathData(points, false),
      }),
    );
  }

  return parts.map((part) => {
    part.setAttribute("data-side", side);
    part.setAttribute("data-state", wing.state);
    return part;
  });
}

/** A room the visit entered: both wings, the line between them and the lamp in the middle. */
function drawFloor(
  doc: Document,
  seed: number,
  floor: PictureFloor,
): SVGElement {
  const roomId = floor.room.roomId;
  const room = roomGeometry[roomId];
  // Each floor has a pencil of its own, so one floor's lines do not move when another changes.
  const pen = createSketchPen(
    createSeededRandom(seed + 1 + ghostSoundIds.indexOf(roomId)),
  );
  const lamp = resultLampOf(roomId);
  const lampBottom = lamp.anchor[1] + lamp.cordLength + 22;
  const bulb = bulbOf(roomId);
  const children: SVGElement[] = [
    svgElement(doc, "g", { "clip-path": `url(#result-room-${roomId})` }, [
      // The glow around the bulb: no deeper than the lamp itself, so it says nothing of a level.
      svgElement(doc, "ellipse", {
        class: "result-halo",
        cx: bulb[0],
        cy: bulb[1],
        rx: haloRadii.x,
        ry: haloRadii.y,
        fill: "url(#result-halo)",
      }),
      ...drawWing(doc, pen, roomId, "left", floor.left),
      ...drawWing(doc, pen, roomId, "right", floor.right),
    ]),
    // The line between the two wings, drawn the way a draughtsman marks a centre.
    svgElement(doc, "path", {
      class: "result-centre",
      d: `M${houseCentreX} ${lampBottom}L${houseCentreX} ${room.bottom}`,
    }),
  ];
  if (roomId === "attic") {
    const [from, to] = atticTieBeamEnds();
    children.push(
      svgElement(doc, "path", { class: "house-ink", d: pen.line(from, to) }),
    );
  }
  children.push(
    drawLamp(doc, { lampAnchor: lamp.anchor, lampCordLength: lamp.cordLength }),
  );
  return svgElement(
    doc,
    "g",
    { class: "result-floor", "data-room": roomId, "data-kind": "entered" },
    children,
  );
}

/**
 * Draws the result picture: the cross-section of the house, with one lamp in the middle of every
 * room the visit entered. Its light reaches into the left wing and into the right wing as far as
 * the picture model says. A wing with no level to draw is hatched, a wing where nothing was
 * caught stays dark, and a room the visit did not enter stays empty. Nothing in the drawing
 * joins one floor to another, and no floor carries a scale.
 */
export function drawResultSection(
  doc: Document,
  picture: ResultPicture,
  options: ResultSectionOptions,
): SVGElement {
  const pen = createSketchPen(createSeededRandom(options.seed));
  const gradient = (side: "left" | "right"): SVGElement =>
    svgElement(
      doc,
      "linearGradient",
      {
        id: `result-light-${side}`,
        gradientUnits: "userSpaceOnUse",
        x1: houseCentreX,
        y1: 0,
        x2: side === "left" ? houseWalls.innerLeft : houseWalls.innerRight,
        y2: 0,
      },
      [
        svgElement(doc, "stop", { class: "result-light-near", offset: 0 }),
        svgElement(doc, "stop", { class: "result-light-far", offset: 1 }),
      ],
    );
  const definitions = svgElement(doc, "defs", {}, [
    svgElement(
      doc,
      "pattern",
      {
        id: "result-cut-hatch",
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
    // Wider and slanted the other way than the cut walls, so the two are never mistaken.
    svgElement(
      doc,
      "pattern",
      {
        id: "result-doubt-hatch",
        width: 13,
        height: 13,
        patternUnits: "userSpaceOnUse",
        patternTransform: "rotate(-45)",
      },
      [svgElement(doc, "path", { class: "result-doubt-line", d: "M0 0L0 13" })],
    ),
    gradient("left"),
    gradient("right"),
    svgElement(doc, "radialGradient", { id: "result-halo" }, [
      svgElement(doc, "stop", { class: "result-halo-near", offset: 0 }),
      svgElement(doc, "stop", { class: "result-halo-far", offset: 1 }),
    ]),
    // Centred on the middle of the floor and squeezed to the half ellipse: brightest on the floor.
    svgElement(
      doc,
      "radialGradient",
      {
        id: "result-pool",
        cx: 0.5,
        cy: 1,
        r: 1,
        gradientTransform: "matrix(0.5 0 0 1 0.25 0)",
      },
      [
        svgElement(doc, "stop", { class: "result-pool-near", offset: 0 }),
        svgElement(doc, "stop", { class: "result-pool-far", offset: 1 }),
      ],
    ),
    ...ghostSoundIds.map((roomId) =>
      svgElement(doc, "clipPath", { id: `result-room-${roomId}` }, [
        svgElement(doc, "path", {
          d: pathData(roomGeometry[roomId].outline, true),
        }),
      ]),
    ),
  ]);

  // The shell and the room names come from the first pencil, in a fixed order.
  const earth = svgElement(doc, "path", {
    class: "house-ink house-earth",
    d: earthMarks(pen),
  });
  const shell = svgElement(doc, "path", {
    class: "house-ink house-shell",
    d: shellLines(pen),
  });
  const entered = new Map(
    picture.floors.map((floor) => [floor.room.roomId, floor] as const),
  );
  const notes = ghostSoundIds.map((roomId) => {
    const note = drawLevelNote(doc, pen, roomId);
    note.setAttribute("data-state", entered.has(roomId) ? "lit" : "closed");
    return note;
  });

  const floors = ghostSoundIds.map((roomId) => {
    const floor = entered.get(roomId);
    return floor === undefined
      ? svgElement(doc, "g", {
          class: "result-floor",
          "data-room": roomId,
          "data-kind": "closed",
        })
      : drawFloor(doc, options.seed, floor);
  });

  const wingLabel = (side: "left" | "right"): SVGElement => {
    const label = svgElement(doc, "text", {
      class: "result-wing-label",
      x: wingEdgeX(side, 0.5),
      y: wingLabelY,
      "text-anchor": "middle",
    });
    label.textContent = options.wingLabels[side];
    return label;
  };

  return svgElement(
    doc,
    "svg",
    {
      class: "house-section result-section",
      viewBox: `${resultViewBox.x} ${resultViewBox.y} ${resultViewBox.width} ${resultViewBox.height}`,
      preserveAspectRatio: "xMidYMid meet",
      "aria-hidden": "true",
      focusable: "false",
      "data-entering": options.entering ? "true" : "false",
    },
    [
      definitions,
      earth,
      ...floors,
      svgElement(doc, "path", {
        class: "house-cut",
        d: cutShapes(),
        fill: "url(#result-cut-hatch)",
      }),
      shell,
      ...notes,
      wingLabel("left"),
      wingLabel("right"),
    ],
  );
}
