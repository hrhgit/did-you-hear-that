import type { GhostSoundId } from "../config/sound-id";

/** The name of each room as the visitor reads it on the drawing of the house. */
export const roomNames: Readonly<Record<GhostSoundId, string>> = Object.freeze({
  cellar: "Cellar",
  corridor: "Corridor",
  nursery: "Nursery",
  stairs: "Stairs",
  attic: "Attic",
});

/** The side a sound came from, as the visitor answers it. */
export type AnswerSide = "left" | "right";

/** What the visitor reads while in a room, apart from what the house says about a sound. */
export const roomCopy = Object.freeze({
  /** The name of the picture of the house, for a visitor who cannot see it. */
  houseLabel: "A house of five rooms, one above the other",
  /** The two answers. `hint` is the short word shown in the corner of each half of the screen. */
  answers: Object.freeze({
    left: Object.freeze({ name: "I heard it on my left", hint: "Left" }),
    right: Object.freeze({ name: "I heard it on my right", hint: "Right" }),
  }),
  /** The keys that give each answer, shown beside the hints where there is a keyboard. */
  answerKeys: Object.freeze({ left: "← or A", right: "→ or L" }),
  /** Fixed by wording.md: said after an answer on a trial with no sound. */
  noSoundLine: "I made no sound that time.",
  stopButton: "Stop and leave",
  pauseButton: "Pause",
  goOnButton: "Go on",
});

function requireFrequency(frequencyHz: number): void {
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) {
    throw new RangeError(
      `A pitch must be a positive number of hertz, but got ${String(frequencyHz)}.`,
    );
  }
}

/** A room's pitch as a label: "500 Hz" below 1000 Hz, "1 kHz" or "2.5 kHz" from there up. */
export function pitchLabel(frequencyHz: number): string {
  requireFrequency(frequencyHz);
  if (frequencyHz < 1000) {
    return `${String(Math.round(frequencyHz))} Hz`;
  }
  const kilohertz = Math.round(frequencyHz / 100) / 10;
  return `${String(kilohertz)} kHz`;
}

/**
 * A level as the visitor reads it: always relative to their own calibration (wording.md), in
 * whole decibels. "12 dB quieter than your calibration".
 */
export function relativeLevelLabel(levelDb: number): string {
  if (!Number.isFinite(levelDb)) {
    throw new RangeError(
      `A level must be a finite number of decibels, but got ${String(levelDb)}.`,
    );
  }
  const whole = Math.round(levelDb);
  if (whole === 0) {
    return "as loud as your calibration";
  }
  return `${String(Math.abs(whole))} dB ${whole < 0 ? "quieter" : "louder"} than your calibration`;
}

/** Where the visitor is: "Room 2 of 3". Both numbers are whole, with 1 ≤ number ≤ count. */
export function roomProgressLine(number: number, count: number): string {
  if (
    !Number.isInteger(number) ||
    !Number.isInteger(count) ||
    number < 1 ||
    number > count
  ) {
    throw new RangeError(
      `A room's number must be a whole number from 1 to the number of rooms, but got ${String(number)} of ${String(count)}.`,
    );
  }
  return `Room ${String(number)} of ${String(count)}`;
}

/**
 * What the house says when a sound was caught: the side, the pitch and the level. It is said
 * only after the answer has been taken, beside the ripple.
 */
export function caughtLine(
  side: AnswerSide,
  frequencyHz: number,
  levelDb: number,
): string {
  return `You caught it on your ${side}. ${pitchLabel(frequencyHz)}, ${relativeLevelLabel(levelDb)}.`;
}

/**
 * What the house says when a sound went by unanswered. Said only once its time to answer is
 * over, so it gives nothing away that could still be used (the game layer, 2026-11-16).
 */
export function slippedLine(side: AnswerSide): string {
  return `One went by on your ${side}.`;
}

/** What the house says when the answer named the other side from the sound's. */
export function otherSideLine(side: AnswerSide): string {
  return `That one was on your ${side}.`;
}

/** What the visitor reads about the lantern and the chase inside a room that counts. */
export const chaseCopy = Object.freeze({
  /** Said while the lantern is dark, when no answer is taken and the room waits. */
  lanternDarkLine: "Your lantern is out. Wait for a light to come back.",
  /** Under each depth scale: the way its mark moves as quieter sounds are caught. */
  depthQuieterLabel: "quieter",
});

function requireCount(count: number, what: string): void {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(
      `${what} must be a whole number from 0 up, but got ${String(count)}.`,
    );
  }
}

/** The lantern for a visitor who cannot see it: "Lantern: 2 of 3 lights". */
export function lanternLabel(cells: number, cellCount: number): string {
  requireCount(cells, "The lights of a lantern");
  requireCount(cellCount, "The lights of a full lantern");
  if (cells > cellCount || cellCount === 0) {
    throw new RangeError(
      `A lantern holds from 0 lights to its full count, but got ${String(cells)} of ${String(cellCount)}.`,
    );
  }
  return `Lantern: ${String(cells)} of ${String(cellCount)} lights`;
}

/** The sounds caught in this room: "4 caught". */
export function caughtCountLine(count: number): string {
  requireCount(count, "The sounds caught");
  return `${String(count)} caught`;
}

/** The sounds caught one after the other: "3 in a row". */
export function streakLine(count: number): string {
  requireCount(count, "The sounds caught in a row");
  return `${String(count)} in a row`;
}

/**
 * The quietest sound caught on one side so far, for the depth scale at that side: "Quietest catch
 * on your left: 25 dB quieter than your calibration". `levelDb` is null before the first catch.
 */
export function deepestCatchLabel(
  side: AnswerSide,
  levelDb: number | null,
): string {
  return levelDb === null
    ? `Nothing caught on your ${side} yet`
    : `Quietest catch on your ${side}: ${relativeLevelLabel(levelDb)}`;
}

/** How the house announces each room as the one that comes next. */
const roomIsNext: Readonly<Record<GhostSoundId, string>> = Object.freeze({
  cellar: "The cellar is next",
  corridor: "The corridor is next",
  nursery: "The nursery is next",
  stairs: "The stairs are next",
  attic: "The attic is next",
});

/** What the house says between two rooms, naming the room that comes next. */
export function betweenRoomsLine(nextRoomId: GhostSoundId): string {
  return `This room is quiet now. ${roomIsNext[nextRoomId]}, when you are ready.`;
}
