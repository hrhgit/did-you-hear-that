import type { GhostSoundId } from "../config/sound-id";
import type { AnswerSide } from "./room-copy";
import { deepestCatchLabel, pitchLabel, relativeLevelLabel } from "./room-copy";

/**
 * Who makes each sound of the house (one-room design.md, "The creatures"). Each of the five
 * sounds has a creature of its own, which lives on the floor that was that sound's room. In the
 * one room of a visit they take turns, and the visitor learns to tell them apart by ear.
 */
export interface CreatureCopy {
  /** Its own name: "Squeak". */
  readonly name: string;
  /** What it is, inside a sentence: "the bat". */
  readonly kind: string;
  /** Where it lives, inside a sentence: "the attic". */
  readonly home: string;
  /** Its sound in a few words, as a sentence. */
  readonly soundLine: string;
}

export const creatureCopy: Readonly<Record<GhostSoundId, CreatureCopy>> =
  Object.freeze({
    cellar: Object.freeze({
      name: "Thump",
      kind: "the skeleton",
      home: "the cellar",
      soundLine: "Three low knocks.",
    }),
    corridor: Object.freeze({
      name: "Murmur",
      kind: "the ghost",
      home: "the corridor",
      soundLine: "A wavering hum.",
    }),
    nursery: Object.freeze({
      name: "Tink",
      kind: "the black cat",
      home: "the nursery",
      soundLine: "Four small notes of her bell.",
    }),
    stairs: Object.freeze({
      name: "Scritch",
      kind: "the spider",
      home: "the stairs",
      soundLine: "A dry scrape.",
    }),
    attic: Object.freeze({
      name: "Squeak",
      kind: "the bat",
      home: "the attic",
      soundLine: "A thin, high whine.",
    }),
  });

/** How a creature is introduced at the roll call: "Squeak, the bat from the attic. A thin, high whine." */
export function creatureIntroLine(roomId: GhostSoundId): string {
  const { name, kind, home, soundLine } = creatureCopy[roomId];
  return `${name}, ${kind} from ${home}. ${soundLine}`;
}

/** What the visitor reads at the roll call, before anything counts, and when the counting begins. */
export const rollCallCopy = Object.freeze({
  heading: "Meet them",
  lines: Object.freeze([
    "Each one makes its sound once in each ear, loud enough to hear easily.",
    "Answer which side it came from. Nothing counts yet.",
  ]),
  countingLines: Object.freeze([
    "Now it counts. They take turns in no order, and some turns make no sound at all.",
    "The bars beside each one show your quietest catch on each side.",
  ]),
});

/**
 * The label of the ripple of a caught sound at the roll call: "That was Squeak." It is in the
 * past, because the next creature may already be coming in when it is read.
 */
export function rollCallCaughtLine(roomId: GhostSoundId): string {
  return `That was ${creatureCopy[roomId].name}.`;
}

/** A creature's side that did not catch its sound at the roll call. */
export interface RollCallMiss {
  readonly roomId: GhostSoundId;
  readonly side: AnswerSide;
}

function joined(parts: readonly string[]): string {
  if (parts.length <= 1) {
    return parts[0] ?? "";
  }
  if (parts.length === 2) {
    return `${parts[0] ?? ""} and ${parts[1] ?? ""}`;
  }
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1] ?? ""}`;
}

/**
 * The lines of the not-heard notice of the roll call: who was not caught and on which side, what
 * to check, and what each choice does. Throws a `RangeError` for an empty list.
 */
export function rollCallNotHeardLines(
  missed: readonly RollCallMiss[],
): readonly string[] {
  if (missed.length === 0) {
    throw new RangeError("The not-heard lines need at least one miss.");
  }
  const sidesOf = new Map<GhostSoundId, Set<AnswerSide>>();
  for (const { roomId, side } of missed) {
    const sides = sidesOf.get(roomId) ?? new Set<AnswerSide>();
    sides.add(side);
    sidesOf.set(roomId, sides);
  }
  const who = [...sidesOf].map(([roomId, sides]) => {
    const where =
      sides.size > 1 ? "either side" : `your ${[...sides][0] ?? "left"}`;
    return `${creatureCopy[roomId].name} on ${where}`;
  });
  return Object.freeze([
    `Not caught, even a little louder: ${joined(who)}.`,
    "Check that the earpieces are in and that the volume is where you set it.",
    "Start counting goes on anyway; a sound you cannot hear here will show as louder than this house can play. Try again plays those sounds once more.",
  ]);
}

/**
 * What the house says when a creature's sound was caught: who, the side, the pitch and the level.
 * Said only after the answer has been taken.
 */
export function creatureCaughtLine(
  roomId: GhostSoundId,
  side: AnswerSide,
  frequencyHz: number,
  levelDb: number,
): string {
  return `You caught ${creatureCopy[roomId].name} on your ${side}. ${pitchLabel(frequencyHz)}, ${relativeLevelLabel(levelDb)}.`;
}

/**
 * What each creature calls out as it gets away (the game layer, 2026-11-17). It is the creature's
 * own glee and never about the visitor: the house never mocks a missed sound (wording.md).
 */
export const creatureTauntLine: Readonly<Record<GhostSoundId, string>> =
  Object.freeze({
    cellar: "Knock, knock, and off it goes.",
    corridor: "Ooo-ooh, it floats away.",
    nursery: "Tee-hee, it tinkles off.",
    stairs: "Scritch-scritch, and away.",
    attic: "Eek, off it flits.",
  });

/**
 * What the house says when a creature's sound went by unanswered: it got away, and its taunt.
 * Said only once its time to answer is over.
 */
export function creatureSlippedLine(
  roomId: GhostSoundId,
  side: AnswerSide,
): string {
  return `${creatureCopy[roomId].name} got away on your ${side}. ${creatureTauntLine[roomId]}`;
}

/** What the house says when the answer named the other side from the sound's. */
export function creatureOtherSideLine(
  roomId: GhostSoundId,
  side: AnswerSide,
): string {
  return `Other door: ${creatureCopy[roomId].name} was on your ${side}. ${creatureTauntLine[roomId]}`;
}

/**
 * What the house says when a reminder sound is caught: it counts for nothing, so it names no level
 * (the game layer, 2026-11-17).
 */
export function creatureReminderCaughtLine(
  roomId: GhostSoundId,
  side: AnswerSide,
): string {
  return `There's ${creatureCopy[roomId].name}, on your ${side}. Keep listening.`;
}

/** Said when a creature's search is over and it leaves the room: "Squeak has gone back to the attic." */
export function creatureGoneLine(roomId: GhostSoundId): string {
  const { name, home } = creatureCopy[roomId];
  return `${name} has gone back to ${home}.`;
}

function requireCount(count: number, what: string): void {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(
      `${what} must be a whole number from 0 up, but got ${String(count)}.`,
    );
  }
}

/** How many creatures are still in the room: "3 still about". */
export function stillAboutLine(count: number): string {
  requireCount(count, "The creatures still about");
  return count === 0 ? "All gone home" : `${String(count)} still about`;
}

/** What the visitor reads in the one room, apart from what the house says about a sound. */
export const oneRoomCopy = Object.freeze({
  /** The name of the room's picture, for a visitor who cannot see it. */
  sceneLabel:
    "A moonlit yard with Jack the jack-o'-lantern in the middle, and a way in at each side",
  /** The name of the row of creature cards. */
  shelfLabel: "Who is in the room",
  /** On the card of a creature whose search is over. */
  goneLabel: "Gone home",
  /** The marks under the two bars of a card: the quietest catch on each side. */
  sideMarks: Object.freeze({ left: "L", right: "R" }),
});

/** A creature's catches on its card: "4 caught". */
export function creatureCaughtCountLine(count: number): string {
  requireCount(count, "The sounds caught");
  return `${String(count)} caught`;
}

/**
 * A creature's card for a visitor who cannot see it: who it is, where it lives, whether it is
 * still in the room, how many of its sounds were caught, and the quietest catch on each side.
 * The two sides of one creature can be set against each other. Creatures cannot (wording.md).
 */
export function creatureCardLabel(
  roomId: GhostSoundId,
  state: "about" | "gone",
  caughtCount: number,
  deepestCaughtDb: Readonly<Record<AnswerSide, number | null>>,
): string {
  requireCount(caughtCount, "The sounds caught");
  const { name, kind, home } = creatureCopy[roomId];
  const where =
    state === "gone" ? `${kind}, gone back to ${home}` : `${kind} from ${home}`;
  return [
    `${name}, ${where}.`,
    `${creatureCaughtCountLine(caughtCount)}.`,
    `${deepestCatchLabel("left", deepestCaughtDb.left)}.`,
    `${deepestCatchLabel("right", deepestCaughtDb.right)}.`,
  ].join(" ");
}
