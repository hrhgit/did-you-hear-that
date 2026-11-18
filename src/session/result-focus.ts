import type { GhostSoundId } from "../config/sound-id";
import {
  closeLine,
  focusHeading,
  focusLine,
  focusPointKindOrder,
  focusPointLine,
  resultFocusCopy,
  type FocusPointKindName,
  type FocusPointWords,
} from "../copy/result-focus-copy";
import type {
  Ear,
  PictureFloor,
  ResultPicture,
  VisitSummary,
} from "./result-page-types";
import type { RoomSummary } from "./visit-flow-types";

/**
 * What the result page puts first (the focus of the result, decided by the owner on 2026-11-17):
 * the visit notice when the whole visit is unreliable; otherwise the floors that stand out, each
 * for one reason of its own left and right; otherwise a line saying that none did. It sits beside
 * the picture model rather than in it, as the score of the chase does, because it looks at every
 * floor. It never compares, ranks or sums floors: a floor stands out by its own two sides alone,
 * floors that stand out are named one by one, and the kinds are ordered, never the floors by a
 * level.
 */

export type FocusPointKind = FocusPointKindName;

/** One floor that stands out. */
export interface ResultFocusPoint {
  readonly kind: FocusPointKind;
  readonly roomId: GhostSoundId;
  readonly roomIndex: number;
  /** Such as "Stairs". */
  readonly roomName: string;
  /** Such as "4 kHz". */
  readonly pitchLabel: string;
  readonly line: string;
}

/** The card at the head of the result. Plain data, frozen. */
export interface ResultFocus {
  /** `walkAgain`: the visit notice. `close`: no floor stands out. Otherwise the most pressing kind. */
  readonly kind: "walkAgain" | "close" | FocusPointKind;
  readonly heading: string;
  readonly line: string;
  /** The floors that stand out, the most pressing kind first and, within a kind, from the top of the house down, as the page lists floors. */
  readonly points: readonly ResultFocusPoint[];
}

export interface ResultFocusInput {
  readonly picture: ResultPicture;
  /** The summary the picture was drawn from. */
  readonly summary: VisitSummary;
  /** The visit's quietest level, for a floor recorded before it had a search floor of its own. */
  readonly floorDb: number;
  /** The left and right difference that offers the swapped repeat, as in force for this visit. */
  readonly swappedRepeatDifferenceDb: number;
  /** Whether the visit shown is the one that has just ended and is not saved yet. */
  readonly canStillSave: boolean;
}

const sides: readonly Ear[] = ["left", "right"];

/** Why one floor stands out, by its own room summary and its swapped repeat alone, or null. */
function pointWords(
  floor: PictureFloor,
  room: RoomSummary,
  floorDb: number,
  limitDb: number,
): FocusPointWords | null {
  if (floor.repeat !== null) {
    switch (floor.repeat.outcome) {
      case "followsEar":
        return { kind: "followsEar" };
      case "followsEarpiece":
        return { kind: "followsEarpiece" };
      case "unclear":
        return { kind: "repeatUnclear" };
    }
  }
  const dark = sides.filter((ear) => room[ear].state === "worseThanCap");
  if (dark.length > 0) {
    return { kind: "dark", sides: dark };
  }
  const unsettled = sides.filter((ear) => room[ear].state === "unreliable");
  if (unsettled.length > 0) {
    return { kind: "unsettled", sides: unsettled };
  }
  if (room.rightMinusLeftDb !== null) {
    return Math.abs(room.rightMinusLeftDb) >= limitDb
      ? {
          kind: "farApart",
          rightMinusLeftDb: room.rightMinusLeftDb,
          atLeast: false,
        }
      : null;
  }
  // One side quieter than the house can whisper and the other found: the gap is at least how far
  // the found side lies above the floor's quietest playable level.
  const { left, right } = room;
  const quietest = room.searchFloorDb ?? floorDb;
  if (left.state === "betterThanFloor" && right.state === "found") {
    const gapDb = right.thresholdDb - quietest;
    return gapDb >= limitDb
      ? { kind: "farApart", rightMinusLeftDb: gapDb, atLeast: true }
      : null;
  }
  if (right.state === "betterThanFloor" && left.state === "found") {
    const gapDb = left.thresholdDb - quietest;
    return gapDb >= limitDb
      ? { kind: "farApart", rightMinusLeftDb: -gapDb, atLeast: true }
      : null;
  }
  return null;
}

/** The card at the head of a visit's result. A pure function of its input. */
export function resultFocus(input: ResultFocusInput): ResultFocus {
  const { picture, summary, floorDb, swappedRepeatDifferenceDb, canStillSave } =
    input;
  if (picture.visitNotice !== null) {
    return Object.freeze({
      kind: "walkAgain",
      heading: picture.visitNotice.heading,
      line: picture.visitNotice.line,
      points: Object.freeze([]),
    });
  }

  const found: {
    readonly point: ResultFocusPoint;
    readonly words: FocusPointWords;
  }[] = [];
  // From the top of the house down, as the page lists the floors.
  for (const floor of [...picture.floors].reverse()) {
    const room = summary.rooms.find(
      (candidate) => candidate.room.roomIndex === floor.room.roomIndex,
    );
    if (room === undefined) {
      continue;
    }
    const words = pointWords(floor, room, floorDb, swappedRepeatDifferenceDb);
    if (words === null) {
      continue;
    }
    found.push({
      words,
      point: Object.freeze({
        kind: words.kind,
        roomId: floor.room.roomId,
        roomIndex: floor.room.roomIndex,
        roomName: floor.roomName,
        pitchLabel: floor.pitchLabel,
        line: focusPointLine(words),
      }),
    });
  }
  found.sort(
    (a, b) =>
      focusPointKindOrder.indexOf(a.point.kind) -
      focusPointKindOrder.indexOf(b.point.kind),
  );

  const first = found[0];
  if (first === undefined) {
    return Object.freeze({
      kind: "close",
      heading: resultFocusCopy.closeHeading,
      line: closeLine(swappedRepeatDifferenceDb, canStillSave),
      points: Object.freeze([]),
    });
  }
  const top = found.filter((entry) => entry.point.kind === first.point.kind);
  const sideCount = top.reduce(
    (count, entry) =>
      count + ("sides" in entry.words ? entry.words.sides.length : 1),
    0,
  );
  return Object.freeze({
    kind: first.point.kind,
    heading: focusHeading(first.point.kind, top.length, sideCount),
    line: focusLine(first.point.kind, top.length),
    points: Object.freeze(found.map((entry) => entry.point)),
  });
}
