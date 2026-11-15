import { hearingMethodConfig } from "../config/hearing-method-config";
import type { GhostSoundId } from "../config/sound-id";
import { ghostSoundIds } from "../config/sound-id";
import { limitsStatement } from "../copy/limits-statement";
import { resultPageCopy } from "../copy/result-page-copy";
import type { WingWords } from "../copy/result-lines";
import {
  differenceLabel,
  differenceLine,
  falseAlarmLine,
  floorDescription,
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
import type { FloorScale } from "./light-depth-fraction";
import { lightDepthFraction } from "./light-depth-fraction";
import type {
  Ear,
  LocalDate,
  PictureFloor,
  PictureWing,
  ResultPicture,
  ResultPictureInput,
  VisitEarResult,
  VisitSummary,
  VisitType,
} from "./result-page-types";
import type { RoomSummary } from "./visit-flow-types";

/** What the picture is drawn from, for a live result or a saved visit alike. */
interface PictureSource {
  readonly kind: "live" | "saved";
  readonly summary: VisitSummary;
  readonly visitType: VisitType;
  readonly floorDb: number;
  readonly localDate: LocalDate;
}

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
      visitType: input.visit.visitLog.visitType,
      floorDb: hearingMethodConfig.floorDb,
      localDate: input.localDate,
    };
  }
  return {
    kind: "saved",
    summary: input.savedVisit.summary,
    visitType: input.savedVisit.visitType,
    floorDb: input.savedVisit.floorDb,
    localDate: input.savedVisit.savedOnLocalDate,
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

function wing(
  ear: Ear,
  result: VisitEarResult,
  scale: FloorScale,
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
    // Outlines of an earlier visit belong to the comparison tasks (design.md, "Comparison").
    earlier: null,
  };
}

/** One floor, from its own room summary and the visit's quietest level alone (D16). */
function floor(
  roomSummary: RoomSummary,
  floorDb: number,
  live: boolean,
): PictureFloor {
  const { room, rightMinusLeftDb } = roomSummary;
  const scale: FloorScale = { searchCapDb: roomSummary.searchCapDb, floorDb };
  return {
    room: {
      roomIndex: room.roomIndex,
      roomId: room.roomId,
      frequencyHz: room.frequencyHz,
    },
    roomName: roomNames[room.roomId],
    pitchLabel: pitchLabel(room.frequencyHz),
    left: wing("left", roomSummary.left, scale),
    right: wing("right", roomSummary.right, scale),
    rightMinusLeftDb,
    differenceLabel: differenceLabel(rightMinusLeftDb),
    differenceLine: differenceLine(rightMinusLeftDb),
    swappedRepeat:
      live && roomSummary.swappedRepeatOffered && rightMinusLeftDb !== null
        ? {
            roomIndex: room.roomIndex,
            line: swappedRepeatLine(rightMinusLeftDb),
            buttonLabel: resultPageCopy.swappedRepeatButton,
          }
        : null,
    description: floorDescription(
      room.roomId,
      room.frequencyHz,
      words(roomSummary.left),
      words(roomSummary.right),
      rightMinusLeftDb,
    ),
  };
}

/**
 * Everything the page draws and says about one visit (result-page design.md, "`resultPicture`").
 * One floor per room summary in the summary's order, which is the order of the house from the
 * lowest floor up; each floor and each wing is computed from its own room summary, on the floor's
 * own scale from its `searchCapDb` to the visit's `floorDb` (D15, D16). The only fields made from
 * more than one floor are the pooled false alarm line and the visit notice (D17). Every string
 * comes from `src/copy`, and the limits statement is the constant itself. Only a live result
 * offers the swapped repeat (D20). `earlier` and `comparison` stay null until the comparison tasks
 * are built. A pure function: the same input gives an equal, deeply frozen picture, and the input
 * is neither changed nor frozen.
 */
export function resultPicture(input: ResultPictureInput): ResultPicture {
  const source = sourceOf(input);
  const { summary, visitType, localDate } = source;
  const roomCount = summary.rooms.length;
  const floors = summary.rooms.map((roomSummary) =>
    floor(roomSummary, source.floorDb, source.kind === "live"),
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
    comparison: null,
    imageCaption: imageCaption(localDate, visitType, roomCount),
    imageFileBaseName: imageFileBaseName(localDate),
  };
  return deepFreeze(picture);
}
