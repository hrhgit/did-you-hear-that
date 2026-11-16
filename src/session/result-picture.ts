import { hearingMethodConfig } from "../config/hearing-method-config";
import type { GhostSoundId } from "../config/sound-id";
import { ghostSoundIds } from "../config/sound-id";
import {
  earlierVisitLine,
  earlierVisitUnreliableLine,
} from "../copy/comparison-lines";
import { limitsStatement } from "../copy/limits-statement";
import { resultPageCopy } from "../copy/result-page-copy";
import type { WingWords } from "../copy/result-lines";
import {
  differenceLabel,
  differenceLine,
  falseAlarmLine,
  floorDescription,
  playableFloorLine,
  swappedRepeatLine,
  unreliableReasonLine,
  visitNoticeLine,
  wingLine,
} from "../copy/result-lines";
import { pitchLabel, roomNames } from "../copy/room-copy";
import {
  imageCaption,
  imageFileBaseName,
  visitDateLabel,
  visitTypeLabel,
} from "../copy/saved-visit-lines";
import { floorAnchorKind, sameAnchorKind } from "./calibration-anchor";
import type { FloorScale } from "./light-depth-fraction";
import { lightDepthFraction } from "./light-depth-fraction";
import { swappedRepeatComparison } from "./swapped-repeat-comparison";
import type {
  Ear,
  EarlierWing,
  LocalDate,
  PictureComparison,
  PictureFloor,
  PictureWing,
  ResultPicture,
  ResultPictureInput,
  SavedVisit,
  SwappedRepeatRun,
  VisitEarResult,
  VisitSummary,
  VisitType,
} from "./result-page-types";
import type { RoomSummary, VisitLog } from "./visit-flow-types";

/** What the picture is drawn from, for a live result or a saved visit alike. */
interface PictureSource {
  readonly kind: "live" | "saved";
  readonly summary: VisitSummary;
  /** The log the summary was made from, which says how each floor's anchor was set. */
  readonly visitLog: VisitLog;
  readonly visitType: VisitType;
  readonly floorDb: number;
  readonly localDate: LocalDate;
  /** The swapped repeats that ran to their end, in the order they ended (swapped-repeat R12.2). */
  readonly swappedRepeats: readonly SwappedRepeatRun[];
}

const noSwappedRepeats: readonly SwappedRepeatRun[] = Object.freeze([]);

/** Freezes a value and every object reachable from it that is not frozen yet. */
function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}

function sourceOf(input: ResultPictureInput): PictureSource {
  if (input.kind === "live") {
    return {
      kind: "live",
      summary: input.visit.summary,
      visitLog: input.visit.visitLog,
      visitType: input.visit.visitLog.visitType,
      floorDb: hearingMethodConfig.floorDb,
      localDate: input.localDate,
      // A missing list means none (swapped-repeat R12.2).
      swappedRepeats: input.visit.swappedRepeats ?? noSwappedRepeats,
    };
  }
  return {
    kind: "saved",
    summary: input.savedVisit.summary,
    visitLog: input.savedVisit.visitLog,
    visitType: input.savedVisit.visitType,
    floorDb: input.savedVisit.floorDb,
    localDate: input.savedVisit.savedOnLocalDate,
    swappedRepeats: input.savedVisit.swappedRepeats ?? noSwappedRepeats,
  };
}

/** What the copy needs about one ear's result. */
function words(result: VisitEarResult): WingWords {
  return {
    state: result.state,
    thresholdDb: result.state === "found" ? result.thresholdDb : null,
    reasons: result.state === "unreliable" ? result.reasons : [],
  };
}

/**
 * The earlier visit's mark in one wing, on the shown floor's own scale, so that in one wing the
 * light and the outline answer one question (D25). No outline for an unreliable earlier ear.
 */
function earlierWing(
  earlierResult: VisitEarResult,
  scale: FloorScale,
): EarlierWing {
  return {
    state: earlierResult.state,
    outlineDepthFraction: lightDepthFraction(earlierResult, scale),
  };
}

function wing(
  ear: Ear,
  result: VisitEarResult,
  scale: FloorScale,
  earlierResult: VisitEarResult | null,
): PictureWing {
  return {
    ear,
    state: result.state,
    lightDepthFraction: lightDepthFraction(result, scale),
    line: wingLine(words(result)),
    reasonLine:
      result.state === "unreliable" && result.reasons.length > 0
        ? unreliableReasonLine(result.reasons[0])
        : null,
    // The outline of an earlier visit (design.md, "Comparison with an earlier visit").
    earlier: earlierResult === null ? null : earlierWing(earlierResult, scale),
  };
}

/**
 * One floor, from its own room summary alone (D16), the earlier visit's summary of the same room,
 * or null when there is none, and the floor's swapped repeat, or null. The floor is drawn on its
 * own scale, from its `searchCapDb` to its `searchFloorDb`, or to the visit's quietest level for a
 * floor recorded before the audible-start spec, which has no `searchFloorDb` (audible-start R12.6,
 * D23). The repeat is drawn beside the floor and changes nothing else of it; a floor with one
 * offers no other (swapped-repeat R12.1, R12.3, R12.4, D16; Q4, decided by the owner on
 * 2026-11-15).
 */
function floor(
  roomSummary: RoomSummary,
  floorDb: number,
  live: boolean,
  earlierRoom: RoomSummary | null,
  repeatRun: SwappedRepeatRun | null,
): PictureFloor {
  const { room, rightMinusLeftDb } = roomSummary;
  const scale: FloorScale = {
    searchCapDb: roomSummary.searchCapDb,
    floorDb: roomSummary.searchFloorDb ?? floorDb,
  };
  const floorLine = playableFloorLine(
    (["left", "right"] as const).filter((ear) =>
      atPlayableFloor(roomSummary[ear], scale.floorDb),
    ),
  );
  const description = floorDescription(
    room.roomId,
    room.frequencyHz,
    words(roomSummary.left),
    words(roomSummary.right),
    rightMinusLeftDb,
  );
  return {
    room: {
      roomIndex: room.roomIndex,
      roomId: room.roomId,
      frequencyHz: room.frequencyHz,
    },
    roomName: roomNames[room.roomId],
    pitchLabel: pitchLabel(room.frequencyHz),
    left: wing("left", roomSummary.left, scale, earlierRoom?.left ?? null),
    right: wing("right", roomSummary.right, scale, earlierRoom?.right ?? null),
    rightMinusLeftDb,
    differenceLabel: differenceLabel(rightMinusLeftDb),
    differenceLine: differenceLine(rightMinusLeftDb),
    swappedRepeat:
      live &&
      roomSummary.swappedRepeatOffered &&
      rightMinusLeftDb !== null &&
      repeatRun === null
        ? {
            roomIndex: room.roomIndex,
            line: swappedRepeatLine(rightMinusLeftDb),
            buttonLabel: resultPageCopy.swappedRepeatButton,
          }
        : null,
    repeat:
      repeatRun === null
        ? null
        : swappedRepeatComparison(roomSummary, repeatRun, floorDb),
    playableFloorLine: floorLine,
    description:
      floorLine === null ? description : `${description} ${floorLine}`,
  };
}

/**
 * Whether a side's result reached the quietest the house can play on its floor: better than the
 * floor, or found at most one upward step above the Search_Floor `searchFloorDb` (audible-start
 * R22.1; for a floor saved before that spec, the visit's `floorDb`, R22.2).
 */
function atPlayableFloor(
  result: VisitEarResult,
  searchFloorDb: number,
): boolean {
  return (
    result.state === "betterThanFloor" ||
    (result.state === "found" &&
      result.thresholdDb <= searchFloorDb + hearingMethodConfig.upwardStepDb)
  );
}

/**
 * The swapped repeat of this floor, or null. A visit holds at most one (Q4); should a list hold
 * more, the last to end is drawn.
 */
function repeatRunOf(
  swappedRepeats: readonly SwappedRepeatRun[],
  roomSummary: RoomSummary,
): SwappedRepeatRun | null {
  return (
    swappedRepeats
      .filter((run) => run.roomIndex === roomSummary.room.roomIndex)
      .at(-1) ?? null
  );
}

/**
 * The earlier visit's room summary of the same room, or null when it did not enter that room, or
 * when the two floors' anchors were set in different ways, which are never compared
 * (audible-start R11.3, D26).
 */
function earlierRoomOf(
  earlierVisit: SavedVisit | null,
  shownLog: VisitLog,
  roomSummary: RoomSummary,
): RoomSummary | null {
  if (earlierVisit === null) {
    return null;
  }
  const earlierRoom = earlierVisit.summary.rooms.find(
    (room) => room.room.roomId === roomSummary.room.roomId,
  );
  if (earlierRoom === undefined) {
    return null;
  }
  return sameAnchorKind(
    floorAnchorKind(shownLog, roomSummary.room.roomIndex),
    floorAnchorKind(earlierVisit.visitLog, earlierRoom.room.roomIndex),
  )
    ? earlierRoom
    : null;
}

/** The line naming the earlier visit (D25), or null without one. */
function comparisonOf(
  earlierVisit: SavedVisit | null,
): PictureComparison | null {
  if (earlierVisit === null) {
    return null;
  }
  return {
    earlierSavedVisitId: earlierVisit.savedVisitId,
    line: earlierVisit.summary.visitFalseAlarmRateAboveLimit
      ? earlierVisitUnreliableLine(earlierVisit.savedOnLocalDate)
      : earlierVisitLine(earlierVisit.savedOnLocalDate),
  };
}

/**
 * Everything the page draws and says about one visit (result-page design.md, "`resultPicture`").
 * One floor per room summary in the summary's order, which is the order of the house from the
 * lowest floor up; each floor and each wing is computed from its own room summary, on the floor's
 * own scale from its `searchCapDb` to its own `searchFloorDb`, or to the visit's `floorDb` for a
 * floor recorded before the audible-start spec (D15, D16; audible-start R12.6). The only fields made from
 * more than one floor are the pooled false alarm line and the visit notice (D17). Every string
 * comes from `src/copy`, and the limits statement is the constant itself. Only a live result
 * offers the swapped repeat (D20). With an earlier visit, each wing of a floor whose room the
 * earlier visit also entered, with an anchor set the same way (audible-start R11.3, D26), has its
 * earlier state and an outline on this floor's own scale, and `comparison` names the earlier
 * visit's date when at least one floor has; without one, every `earlier` and `comparison` is
 * null (D25). Each floor with a swapped repeat in `visit.swappedRepeats` or
 * `savedVisit.swappedRepeats` gives its Comparison in `repeat` and offers no repeat; every other
 * field is what it is without repeats (swapped-repeat R12). A pure function: the same input gives
 * an equal, deeply frozen picture, and the input is neither changed nor frozen.
 */
export function resultPicture(input: ResultPictureInput): ResultPicture {
  const source = sourceOf(input);
  const { summary, visitType, localDate } = source;
  const roomCount = summary.rooms.length;
  const earlierRooms = summary.rooms.map((roomSummary) =>
    earlierRoomOf(input.earlierVisit, source.visitLog, roomSummary),
  );
  const floors = summary.rooms.map((roomSummary, position) =>
    floor(
      roomSummary,
      source.floorDb,
      source.kind === "live",
      earlierRooms[position] ?? null,
      repeatRunOf(source.swappedRepeats, roomSummary),
    ),
  );
  const visitedRoomIds = new Set<GhostSoundId>(
    floors.map((visitFloor) => visitFloor.room.roomId),
  );
  const picture: ResultPicture = {
    kind: source.kind,
    visitType,
    heading: resultPageCopy.heading,
    dateLabel: visitDateLabel(localDate),
    visitTypeLabel: visitTypeLabel(visitType, roomCount),
    floors,
    closedRoomIds: ghostSoundIds.filter(
      (roomId) => !visitedRoomIds.has(roomId),
    ),
    falseAlarmLine: falseAlarmLine(
      summary.pooledFalseAlarmCount,
      summary.pooledNoSoundTrialCount,
    ),
    visitNotice: summary.visitFalseAlarmRateAboveLimit
      ? {
          heading: resultPageCopy.visitNoticeHeading,
          line: visitNoticeLine(summary.visitFalseAlarmRateLimitFraction),
        }
      : null,
    limitsStatement,
    // Named only when a floor draws it (audible-start R11.3).
    comparison: earlierRooms.some((earlierRoom) => earlierRoom !== null)
      ? comparisonOf(input.earlierVisit)
      : null,
    imageCaption: imageCaption(localDate, visitType, roomCount),
    imageFileBaseName: imageFileBaseName(localDate),
  };
  return deepFreeze(picture);
}
