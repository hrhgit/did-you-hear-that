import type { GhostSoundId } from "../../config/sound-id";
import { drawCreature } from "./creature-art";

/** A side of the room: the doorway a sound came from. */
export type RoomSide = "left" | "right";

/** A creature that stands in the room in plain view, and where. */
export interface RoomFeature {
  readonly id: GhostSoundId;
  /**
   * `centre`: in the middle of the room, which tells no side. Otherwise in the doorway of a side,
   * for a sound that is played again after every answer has been given.
   */
  readonly place: "centre" | RoomSide;
  /** Whether it is making its sound now. Only ever true at the centre. */
  readonly sounding: boolean;
}

/**
 * The picture of the one room: a wall with a doorway at each side, the floor, and the lantern
 * that hangs in the middle. Everything that happens in it is asked for by name. Nothing in it
 * moves by itself except the lantern, which keeps its own time.
 */
export interface RoomScene {
  readonly element: HTMLElement;
  /** The lantern and the two lines beside it. The page fills them. */
  readonly lantern: {
    readonly element: HTMLElement;
    readonly caughtLine: HTMLElement;
    readonly streakLine: HTMLElement;
  };
  /** How much of the lantern's light fills the room, from 0 (out) to 1 (every light). */
  setLight(fraction: number): void;
  /** Who stands in plain view, or null for nobody. The one before leaves in a fade. */
  setFeatured(feature: RoomFeature | null): void;
  /**
   * A caught sound: its creature lunges out of the doorway of its side, lit, with rings; that side
   * of the room glows and the lantern flares (the game layer, 2026-11-17). Every change of
   * brightness is a fade.
   */
  caught(side: RoomSide, id: GhostSoundId): void;
  /**
   * A sound that went by: the outline of its creature flees by the doorway of its side with an
   * afterimage, and that side of the room darkens for a moment.
   */
  slipped(side: RoomSide, id: GhostSoundId): void;
  /** Rings from the doorway of a side, with nobody new in it. */
  rings(side: RoomSide): void;
  /** The creature at the centre hops once. Does nothing when nobody stands there. */
  cheer(): void;
  /** Takes away everything a sound left in the doorways. */
  clear(): void;
}

/** How many rings a sound sends out from its doorway. */
const ringCount = 3;

export function buildRoomScene(doc: Document, sceneLabel: string): RoomScene {
  const make = (
    className: string,
    children: readonly Node[] = [],
  ): HTMLElement => {
    const element = doc.createElement("div");
    element.className = className;
    element.append(...children);
    return element;
  };
  const line = (className: string): HTMLElement => {
    const element = doc.createElement("p");
    element.className = className;
    return element;
  };

  const doorway = (side: RoomSide) => {
    const light = make("room-door-light");
    const stage = make("room-stage");
    return {
      element: make(`room-door room-door-${side}`, [
        make("room-door-opening", [light, stage]),
      ]),
      light,
      stage,
      rings: make(`room-rings room-rings-${side}`),
    };
  };
  const doors = { left: doorway("left"), right: doorway("right") };
  /** The light or shade that washes over one side of the room after a scored sound. */
  const sides = {
    left: make("room-side room-side-left"),
    right: make("room-side room-side-right"),
  };
  const centreStage = make("room-stage room-stage-centre");
  const centre = make("room-centre", [centreStage]);

  // The doorways come before the floor, which covers the foot of their frames.
  const picture = make("room-picture", [
    make("room-wall"),
    doors.left.element,
    doors.right.element,
    make("room-floor"),
    make("room-glow"),
    sides.left,
    sides.right,
    doors.left.rings,
    doors.right.rings,
    centre,
  ]);
  picture.setAttribute("role", "img");
  picture.setAttribute("aria-label", sceneLabel);

  // The lantern stands outside the picture, so that its own name can be read aloud.
  const lantern = make("visit-lantern");
  const caughtLine = line("visit-chase-caught");
  const streakLine = line("visit-chase-streak");
  const flare = make("room-lantern-flare");
  const post = make("room-lantern-post", [
    caughtLine,
    make("room-lantern-hang", [
      make("room-lantern-chain"),
      make("room-lantern-cap"),
      make("room-lantern-body", [flare, lantern]),
      make("room-lantern-foot"),
    ]),
    streakLine,
  ]);

  const element = make("room-scene", [picture, post]);

  let lightShown = "";
  let featured: {
    readonly key: string;
    readonly place: "centre" | RoomSide;
    readonly holder: HTMLElement;
    readonly node: HTMLElement;
  } | null = null;

  const stageOf = (place: "centre" | RoomSide): HTMLElement =>
    place === "centre" ? centreStage : doors[place].stage;

  /** A creature that appears for one sound and is gone again. */
  const sighting = (
    id: GhostSoundId,
    reaction: "caught" | "slipped",
  ): HTMLElement => {
    const node = make("room-sighting", [
      drawCreature(doc, id, reaction === "caught" ? "awake" : "outline"),
    ]);
    node.dataset.creature = id;
    node.dataset.reaction = reaction;
    return node;
  };

  /** Starts a wash over one side: `catch` light in the creature's colour, or `miss` shade. */
  const wash = (
    side: RoomSide,
    kind: "catch" | "miss",
    id: GhostSoundId,
  ): void => {
    const span = doc.createElement("span");
    span.dataset.wash = kind;
    span.dataset.creature = id;
    sides[side].replaceChildren(span);
  };

  const rings = (side: RoomSide): void => {
    doors[side].rings.replaceChildren(
      ...Array.from({ length: ringCount }, (_, index) => {
        const ring = doc.createElement("span");
        ring.className = "room-ring";
        ring.style.setProperty("--room-ring", String(index));
        return ring;
      }),
    );
  };

  return {
    element,
    lantern: { element: lantern, caughtLine, streakLine },
    setLight(fraction) {
      const light = String(Math.min(1, Math.max(0, fraction)));
      if (light !== lightShown) {
        lightShown = light;
        element.style.setProperty("--room-light", light);
      }
    },
    setFeatured(feature) {
      const key = feature === null ? null : `${feature.id}@${feature.place}`;
      if (key !== (featured?.key ?? null)) {
        if (featured !== null) {
          // The one that stood there leaves in a fade and stays, unseen, until its place is
          // taken again.
          featured.node.dataset.leaving = "true";
          featured.node.dataset.sounding = "false";
          featured.holder.replaceChildren(featured.node);
          if (featured.place === "centre") {
            delete centre.dataset.held;
          }
        }
        if (feature === null || key === null) {
          featured = null;
        } else {
          const holder = stageOf(feature.place);
          const node = make("room-figure", [
            make("room-figure-hop", [drawCreature(doc, feature.id)]),
          ]);
          node.dataset.creature = feature.id;
          const leaving = featured?.holder === holder ? [featured.node] : [];
          holder.replaceChildren(...leaving, node);
          if (feature.place === "centre") {
            centre.dataset.held = "true";
          }
          featured = { key, place: feature.place, holder, node };
        }
      }
      if (featured !== null && feature !== null) {
        const sounding = feature.sounding ? "true" : "false";
        if (featured.node.dataset.sounding !== sounding) {
          featured.node.dataset.sounding = sounding;
        }
      }
    },
    caught(side, id) {
      const door = doors[side];
      const light = doc.createElement("span");
      light.dataset.creature = id;
      door.light.replaceChildren(light);
      door.stage.replaceChildren(sighting(id, "caught"));
      rings(side);
      wash(side, "catch", id);
      // A new element starts the flare again from its beginning.
      flare.replaceChildren(doc.createElement("span"));
    },
    slipped(side, id) {
      const door = doors[side];
      door.light.replaceChildren();
      door.rings.replaceChildren();
      // The afterimage is drawn as a sighting is, under a class of its own: it is no sighting.
      const trail = sighting(id, "slipped");
      trail.className = "room-trail";
      trail.setAttribute("aria-hidden", "true");
      door.stage.replaceChildren(trail, sighting(id, "slipped"));
      wash(side, "miss", id);
    },
    rings,
    cheer() {
      if (featured?.place !== "centre") {
        return;
      }
      // A new holder starts the hop again from its beginning.
      const art = featured.node.querySelector(".creature-art");
      if (art !== null) {
        featured.node.replaceChildren(
          make("room-figure-hop room-figure-cheer", [art]),
        );
      }
    },
    clear() {
      for (const side of ["left", "right"] as const) {
        const door = doors[side];
        door.light.replaceChildren();
        door.rings.replaceChildren();
        sides[side].replaceChildren();
        // A creature that stands in a doorway in plain view stays. It leaves with its own fade.
        door.stage.replaceChildren(
          ...(featured?.holder === door.stage ? [featured.node] : []),
        );
      }
    },
  };
}
