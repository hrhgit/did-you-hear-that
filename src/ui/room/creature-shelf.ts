import type { GhostSoundId } from "../../config/sound-id";
import { drawCreature, setCreatureMood } from "./creature-art";

/** One creature as its card shows it. Plain data: every word comes from `src/copy`. */
export interface ShelfCreature {
  readonly id: GhostSoundId;
  /** Its own name: "Squeak". */
  readonly name: string;
  /**
   * `calling`: it is the one making its sound at the roll call. `about`: its search is under way.
   * `gone`: its search is over and it has gone home.
   */
  readonly state: "calling" | "about" | "gone";
  /** Under its name: its catches, or that it has gone home. Null where nothing counts yet. */
  readonly statusLine: string | null;
  /**
   * The quietest catch on each side, between the loudest sound this creature makes (0) and the
   * quietest it can make (1), or null before the first catch on that side. The two sides of one
   * creature can be set against each other. Creatures cannot, so nothing joins one card to
   * another (wording.md).
   */
  readonly depth: Readonly<Record<"left" | "right", number | null>>;
  /** The card in words, for a visitor who cannot see it. */
  readonly label: string;
}

/** The row of creature cards along the foot of the room. */
export interface CreatureShelf {
  readonly element: HTMLElement;
  /** Shows these creatures, in this order. An empty list hides the row. */
  show(creatures: readonly ShelfCreature[]): void;
  /** Lights a creature's card for a moment: one of its sounds was caught. */
  flash(id: GhostSoundId): void;
}

interface Card {
  readonly element: HTMLElement;
  readonly face: HTMLElement;
  readonly art: HTMLCanvasElement;
  readonly flash: HTMLElement;
  readonly bars: Readonly<Record<"left" | "right", HTMLElement>>;
  readonly name: HTMLElement;
  readonly status: HTMLElement;
}

export function buildCreatureShelf(
  doc: Document,
  copy: {
    /** The name of the row, for a visitor who cannot see it. */
    readonly label: string;
    /** The mark under each of a card's two bars. */
    readonly sideMarks: Readonly<Record<"left" | "right", string>>;
  },
): CreatureShelf {
  const span = (
    className: string,
    children: readonly (Node | string)[] = [],
  ): HTMLElement => {
    const element = doc.createElement("span");
    element.className = className;
    element.append(...children);
    return element;
  };

  const element = doc.createElement("ul");
  element.className = "creature-shelf";
  element.setAttribute("aria-label", copy.label);
  element.hidden = true;

  const cards = new Map<GhostSoundId, Card>();
  let idsShown = "";

  const build = (id: GhostSoundId): Card => {
    const art = drawCreature(doc, id);
    const flash = span("creature-card-flash");
    const bar = (side: "left" | "right"): HTMLElement =>
      span(`creature-bar creature-bar-${side}`, [span("creature-bar-fill")]);
    const bars = { left: bar("left"), right: bar("right") };
    const name = span("creature-name");
    const status = span("creature-status");
    // One picture with one name: the words on the card are all in its label.
    const face = doc.createElement("div");
    face.className = "creature-card-face";
    face.setAttribute("role", "img");
    face.append(
      flash,
      bars.left,
      span("creature-portrait", [art]),
      bars.right,
      span("creature-mark creature-mark-left", [copy.sideMarks.left]),
      name,
      span("creature-mark creature-mark-right", [copy.sideMarks.right]),
      status,
    );
    const item = doc.createElement("li");
    item.className = "creature-card";
    item.dataset.creature = id;
    item.append(face);
    return { element: item, face, art, flash, bars, name, status };
  };

  const setText = (target: HTMLElement, text: string): void => {
    if (target.textContent !== text) {
      target.textContent = text;
    }
  };

  return {
    element,
    show(creatures) {
      element.hidden = creatures.length === 0;
      const ids = creatures.map(({ id }) => id).join(",");
      if (ids !== idsShown) {
        idsShown = ids;
        cards.clear();
        for (const { id } of creatures) {
          cards.set(id, build(id));
        }
        element.replaceChildren(
          ...[...cards.values()].map((card) => card.element),
        );
      }
      for (const creature of creatures) {
        const card = cards.get(creature.id);
        if (card === undefined) {
          continue;
        }
        if (card.element.dataset.state !== creature.state) {
          card.element.dataset.state = creature.state;
        }
        setCreatureMood(
          card.art,
          creature.state === "gone" ? "asleep" : "awake",
        );
        setText(card.name, creature.name);
        setText(card.status, creature.statusLine ?? "");
        if (card.face.getAttribute("aria-label") !== creature.label) {
          card.face.setAttribute("aria-label", creature.label);
        }
        for (const side of ["left", "right"] as const) {
          const depth = creature.depth[side];
          const bar = card.bars[side];
          const caught = depth === null ? "false" : "true";
          if (bar.dataset.caught !== caught) {
            bar.dataset.caught = caught;
          }
          bar.style.setProperty("--creature-depth", String(depth ?? 0));
        }
      }
    },
    flash(id) {
      const card = cards.get(id);
      if (card !== undefined) {
        // A new mark starts its fade from the beginning.
        card.flash.replaceChildren(span("creature-card-glint"));
      }
    },
  };
}
