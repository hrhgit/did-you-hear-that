import { createSeededRandom } from "../../config/seeded-random";
import { ghostSoundIds, type GhostSoundId } from "../../config/sound-id";
import type {
  PictureFloor,
  PictureWing,
  ResultPicture,
} from "../../session/result-page-types";
import { createSketchPen, type SketchPen } from "../house/sketch-pen";
import { svgElement } from "../house/svg-element";
import {
  paintedCreature,
  paintedJack,
  type PaintedImage,
} from "./painted-images";
import {
  laneBox,
  wingEdgeX,
  wingLightBox,
  type ResultLayout,
} from "./result-geometry";

/** What the drawing needs besides the picture. */
export interface ResultSectionOptions {
  /**
   * The seed of the pencil. The yard is drawn from it alone, so it looks the same whatever the
   * picture holds.
   */
  readonly seed: number;
  /** The words beside Jack, under the two halves of the lanes. */
  readonly wingLabels: { readonly left: string; readonly right: string };
  /** Whether the light spreads from the candles as the drawing appears, or is simply there. */
  readonly entering: boolean;
  /** The shape of the picture: tall on a phone, wide on a computer. */
  readonly layout: ResultLayout;
}

/** How far the earlier visit's outline keeps from the edges of its lane. */
const outlineInset = 6;

/** How far above the bottom of its lane a creature stands. */
const creatureFootLift = 3;

/** The clear space a creature keeps from the candle in the middle of the lane. */
const creatureCandleGap = 12;

/** The clear space a creature keeps from the end of its lane. */
const creatureEndGap = 2;

/** How far inside the light a creature stands, as a part of its own width. */
const creatureInsideLightFraction = 0.32;

/** The corner radius of a lane. */
const laneRadius = 18;

/**
 * The half width and half height of the glow around a lane's candle. It stays close to the
 * flame, so that a dark half never looks a little lit.
 */
const haloRadii = { x: 16, y: 24 } as const;

/**
 * Where a lit half's creature stands: just inside the end of its light, kept clear of the candle
 * in the middle and of the end of the lane. The x is its middle.
 */
export function creatureCentreX(
  layout: ResultLayout,
  side: "left" | "right",
  depth: number,
): number {
  const { centreX, creatureSize, wingWidth } = layout;
  const outward = side === "left" ? -1 : 1;
  const nearest = centreX + outward * (creatureSize / 2 + creatureCandleGap);
  const furthest =
    centreX + outward * (wingWidth - creatureSize / 2 - creatureEndGap);
  const inside =
    wingEdgeX(layout, side, depth) -
    outward * creatureSize * creatureInsideLightFraction;
  return side === "left"
    ? Math.max(furthest, Math.min(nearest, inside))
    : Math.min(furthest, Math.max(nearest, inside));
}

/** One half of a lane: its result marks and the outline of an earlier visit. */
function drawWing(
  doc: Document,
  layout: ResultLayout,
  pen: SketchPen,
  roomId: GhostSoundId,
  side: "left" | "right",
  wing: PictureWing,
): SVGElement[] {
  const lane = laneBox(layout, roomId);
  const parts: SVGElement[] = [];
  const depth = wing.lightDepthFraction;

  if (depth === null) {
    // No level can be drawn here: the whole half is hatched and stays unlit.
    const whole = wingLightBox(layout, roomId, side, 1);
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
    const light = wingLightBox(layout, roomId, side, depth);
    parts.push(
      svgElement(doc, "rect", {
        class: "result-light",
        x: light.left,
        y: light.top,
        width: light.right - light.left,
        height: light.bottom - light.top,
        fill: `url(#result-light-${roomId}-${side})`,
      }),
    );
    if (depth < 1) {
      // Where the light ends: one pencil line across the lane.
      const x = wingEdgeX(layout, side, depth);
      parts.push(
        svgElement(doc, "path", {
          class: "result-reach",
          d: pen.line([x, lane.top + 4], [x, lane.bottom - 4]),
        }),
      );
    }
    // The lane's creature, where the light ends: as far as the visitor followed it here.
    const art = placedImage(
      doc,
      paintedCreature(doc, roomId),
      [creatureCentreX(layout, side, depth), lane.bottom - creatureFootLift],
      layout.creatureSize,
    );
    // Facing the candle from either side. The flip sits on a group of its own, under the one
    // that moves as it arrives, so the arrival never undoes it.
    const centre = creatureCentreX(layout, side, depth);
    const facing = svgElement(
      doc,
      "g",
      side === "left"
        ? { transform: `translate(${String(2 * centre)} 0) scale(-1 1)` }
        : {},
      [art],
    );
    parts.push(
      svgElement(
        doc,
        "g",
        { class: "result-creature", "data-creature": roomId },
        [facing],
      ),
    );
  } else if (wing.state === "worseThanCap") {
    // Keep this half dark, with a dash that shows the result was recorded.
    const x = wingEdgeX(layout, side, 0.5);
    const y = (lane.top + lane.bottom) / 2;
    parts.push(
      svgElement(doc, "rect", {
        class: "result-uncaught",
        x: x - 7,
        y: y - 1,
        width: 14,
        height: 2,
        rx: 1,
      }),
    );
  }

  const outlineDepth = wing.earlier?.outlineDepthFraction ?? null;
  if (outlineDepth !== null && outlineDepth > 0) {
    // An earlier visit: three ruled, dashed sides, open towards the candle.
    const x = wingEdgeX(layout, side, outlineDepth);
    const top = lane.top + outlineInset;
    const bottom = lane.bottom - outlineInset;
    parts.push(
      svgElement(doc, "path", {
        class: "result-earlier",
        d: `M${String(layout.centreX)} ${String(top)}L${String(x)} ${String(top)}L${String(x)} ${String(bottom)}L${String(layout.centreX)} ${String(bottom)}`,
      }),
    );
  }

  return parts.map((part) => {
    part.setAttribute("data-side", side);
    part.setAttribute("data-state", wing.state);
    return part;
  });
}

/** A small candle in the middle of a lane: where both halves of its light start. */
function drawCandle(
  doc: Document,
  layout: ResultLayout,
  roomId: GhostSoundId,
): SVGElement {
  const lane = laneBox(layout, roomId);
  const x = layout.centreX;
  const base = lane.bottom - 10;
  const wickY = base - 18;
  return svgElement(doc, "g", { class: "result-candle" }, [
    svgElement(doc, "ellipse", {
      class: "result-halo",
      cx: x,
      cy: wickY - 4,
      rx: haloRadii.x,
      ry: haloRadii.y,
      fill: "url(#result-halo)",
    }),
    svgElement(doc, "rect", {
      class: "result-candle-wax",
      x: x - 4,
      y: wickY,
      width: 8,
      height: base - wickY,
      rx: 2,
    }),
    svgElement(doc, "path", {
      class: "result-candle-flame",
      d: `M${String(x)} ${String(wickY - 13)}C${String(x + 5)} ${String(wickY - 6)} ${String(x + 4)} ${String(wickY - 1)} ${String(x)} ${String(wickY - 1)}C${String(x - 4)} ${String(wickY - 1)} ${String(x - 5)} ${String(wickY - 6)} ${String(x)} ${String(wickY - 13)}Z`,
    }),
  ]);
}

/** The bed of a lane, drawn for every pitch, entered or not. */
function drawLaneBed(
  doc: Document,
  layout: ResultLayout,
  roomId: GhostSoundId,
  entered: boolean,
): SVGElement {
  const lane = laneBox(layout, roomId);
  return svgElement(doc, "rect", {
    class: "result-lane",
    "data-room": roomId,
    "data-state": entered ? "lit" : "closed",
    x: lane.left,
    y: lane.top,
    width: lane.right - lane.left,
    height: lane.bottom - lane.top,
    rx: laneRadius,
  });
}

/** The pitch of a lane, above its middle. */
function drawPitchLabel(
  doc: Document,
  layout: ResultLayout,
  roomId: GhostSoundId,
  label: string,
  entered: boolean,
): SVGElement {
  const text = svgElement(doc, "text", {
    class: "result-pitch",
    "data-state": entered ? "lit" : "closed",
    x: layout.centreX,
    y: laneBox(layout, roomId).top - 8,
    "text-anchor": "middle",
  });
  text.textContent = label;
  return text;
}

/**
 * The light of one half of a lane, in the colour of the lane's creature warmed by candlelight. It
 * lives inside the lane's group, so it takes the creature's colour from there.
 */
function lightGradient(
  doc: Document,
  layout: ResultLayout,
  roomId: GhostSoundId,
  side: "left" | "right",
): SVGElement {
  return svgElement(
    doc,
    "linearGradient",
    {
      id: `result-light-${roomId}-${side}`,
      gradientUnits: "userSpaceOnUse",
      x1: layout.centreX,
      y1: 0,
      x2: wingEdgeX(layout, side, 1),
      y2: 0,
    },
    [
      svgElement(doc, "stop", { class: "result-light-near", offset: 0 }),
      svgElement(doc, "stop", { class: "result-light-far", offset: 1 }),
    ],
  );
}

/** A lane the visit entered: both halves of its light and the candle in the middle. */
function drawFloor(
  doc: Document,
  layout: ResultLayout,
  seed: number,
  floor: PictureFloor,
): SVGElement {
  const roomId = floor.room.roomId;
  // Each lane has a pencil of its own, so one lane's lines do not move when another changes.
  const pen = createSketchPen(
    createSeededRandom(seed + 1 + ghostSoundIds.indexOf(roomId)),
  );
  const wings = [
    ...drawWing(doc, layout, pen, roomId, "left", floor.left),
    ...drawWing(doc, layout, pen, roomId, "right", floor.right),
  ];
  const isCreature = (part: SVGElement): boolean =>
    part.classList.contains("result-creature");
  return svgElement(
    doc,
    "g",
    {
      class: "result-floor",
      "data-room": roomId,
      "data-kind": "entered",
      "data-creature": roomId,
    },
    [
      svgElement(doc, "defs", {}, [
        lightGradient(doc, layout, roomId, "left"),
        lightGradient(doc, layout, roomId, "right"),
      ]),
      svgElement(
        doc,
        "g",
        { "clip-path": `url(#result-lane-${roomId})` },
        wings.filter((part) => !isCreature(part)),
      ),
      drawCandle(doc, layout, roomId),
      // The creatures stand over the candle's glow and may lean past the end of the lane.
      ...wings.filter(isCreature),
    ],
  );
}

/**
 * A painted image placed with its anchor at `anchor`, `width` wide in the units of the drawing.
 * Where nothing could be painted, an empty box of the same size keeps its place.
 */
function placedImage(
  doc: Document,
  image: PaintedImage | null,
  anchor: readonly [number, number],
  width: number,
): SVGElement {
  const aspect = image?.aspect ?? 1;
  const anchorX = image?.anchorX ?? 0.5;
  const anchorY = image?.anchorY ?? 1;
  const height = width * aspect;
  const box = {
    x: anchor[0] - width * anchorX,
    y: anchor[1] - height * anchorY,
    width,
    height,
  };
  if (image === null) {
    return svgElement(doc, "rect", { ...box, fill: "none" });
  }
  const element = svgElement(doc, "image", {
    ...box,
    preserveAspectRatio: "none",
  });
  element.setAttribute("href", image.href);
  return element;
}

/** Jack at the foot of the yard, his candle lit and his sweets at his feet, as the room paints him. */
function drawJack(doc: Document, layout: ResultLayout): SVGElement {
  const { jackFoot, jackSize } = layout;
  const [x, foot] = jackFoot;
  return svgElement(doc, "g", { class: "result-jack" }, [
    svgElement(doc, "ellipse", {
      class: "result-jack-glow",
      cx: x,
      cy: foot - jackSize * 0.45,
      rx: jackSize * 1.3,
      ry: jackSize * 0.8,
      fill: "url(#result-jack-glow)",
    }),
    placedImage(doc, paintedJack(doc), jackFoot, jackSize * 2.4),
  ]);
}

/**
 * Draws the result picture: the moonlit yard of the visit, with one lane for each pitch, the
 * highest at the top, and Jack at the foot. In every lane the visit entered a candle burns in the
 * middle, and its light reaches into the left half and into the right half as far as the picture
 * model says. A half with no level to draw is hatched, a half where nothing was caught has a dash,
 * and a lane the visit did not enter stays empty. Nothing in the drawing joins one lane to
 * another, and no lane carries a scale.
 */
export function drawResultSection(
  doc: Document,
  picture: ResultPicture,
  options: ResultSectionOptions,
): SVGElement {
  const { layout } = options;
  const { viewBox } = layout;
  const definitions = svgElement(doc, "defs", {}, [
    svgElement(
      doc,
      "pattern",
      {
        id: "result-doubt-hatch",
        width: 11,
        height: 11,
        patternUnits: "userSpaceOnUse",
        patternTransform: "rotate(-45)",
      },
      [svgElement(doc, "path", { class: "result-doubt-line", d: "M0 0L0 11" })],
    ),
    svgElement(doc, "radialGradient", { id: "result-halo" }, [
      svgElement(doc, "stop", { class: "result-halo-near", offset: 0 }),
      svgElement(doc, "stop", { class: "result-halo-far", offset: 1 }),
    ]),
    svgElement(doc, "radialGradient", { id: "result-jack-glow" }, [
      svgElement(doc, "stop", { class: "result-jack-glow-near", offset: 0 }),
      svgElement(doc, "stop", { class: "result-jack-glow-far", offset: 1 }),
    ]),
    ...ghostSoundIds.map((roomId) => {
      const lane = laneBox(layout, roomId);
      return svgElement(doc, "clipPath", { id: `result-lane-${roomId}` }, [
        svgElement(doc, "rect", {
          x: lane.left,
          y: lane.top,
          width: lane.right - lane.left,
          height: lane.bottom - lane.top,
          rx: laneRadius,
        }),
      ]);
    }),
  ]);

  const entered = new Map(
    picture.floors.map((floor) => [floor.room.roomId, floor] as const),
  );
  const beds = ghostSoundIds.map((roomId) =>
    drawLaneBed(doc, layout, roomId, entered.has(roomId)),
  );
  const pitches = ghostSoundIds.flatMap((roomId) => {
    const floor = entered.get(roomId);
    return floor === undefined
      ? []
      : [drawPitchLabel(doc, layout, roomId, floor.pitchLabel, true)];
  });
  const floors = ghostSoundIds.map((roomId) => {
    const floor = entered.get(roomId);
    return floor === undefined
      ? svgElement(doc, "g", {
          class: "result-floor",
          "data-room": roomId,
          "data-kind": "closed",
        })
      : drawFloor(doc, layout, options.seed, floor);
  });

  // The line from Jack up through the candles, the way a draughtsman marks a centre.
  const topLane = laneBox(
    layout,
    ghostSoundIds[ghostSoundIds.length - 1] ?? "attic",
  );
  const centre = svgElement(doc, "path", {
    class: "result-centre",
    d: `M${String(layout.centreX)} ${String(topLane.top)}L${String(layout.centreX)} ${String(layout.jackFoot[1] - layout.jackSize)}`,
  });

  const wingLabel = (side: "left" | "right"): SVGElement => {
    const label = svgElement(doc, "text", {
      class: "result-wing-label",
      x: wingEdgeX(layout, side, 0.55),
      y: layout.wingLabelY,
      "text-anchor": "middle",
    });
    label.textContent = options.wingLabels[side];
    return label;
  };

  return svgElement(
    doc,
    "svg",
    {
      class: "result-section",
      viewBox: `${String(viewBox.x)} ${String(viewBox.y)} ${String(viewBox.width)} ${String(viewBox.height)}`,
      preserveAspectRatio: "xMidYMid meet",
      "aria-hidden": "true",
      focusable: "false",
      "data-entering": options.entering ? "true" : "false",
      "data-shape": layout.shape,
    },
    [
      definitions,
      centre,
      ...beds,
      ...pitches,
      ...floors,
      drawJack(doc, layout),
      wingLabel("left"),
      wingLabel("right"),
    ],
  );
}
