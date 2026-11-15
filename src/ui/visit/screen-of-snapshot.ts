import { ghostSoundIds, type GhostSoundId } from "../../config/sound-id";
import { calibrationCopy } from "../../copy/calibration-copy";
import { leavingCopy } from "../../copy/leaving-copy";
import { outputStateCopy } from "../../copy/output-state-copy";
import {
  betweenRoomsLine,
  roomNames,
  roomProgressLine,
} from "../../copy/room-copy";
import { visitCopy } from "../../copy/visit-copy";
import type { VisitRoom, VisitSnapshot } from "../../session/visit-flow-types";

/** How a room of the drawing is shown. The drawing of the house takes the same four words. */
export type ScreenRoomState = "dark" | "lit" | "visited" | "closed";

/** The sheets of text. At most one is over the drawing at a time. */
export type SheetName =
  "frontDoor" | "calibration" | "headphoneCheck" | "rules" | "notice";

/** What the button of the notice sheet does. */
export type NoticeAction = "resume" | "backToFrontDoor" | "leaveAfterLastRoom";

/** The calibration sheet. */
export interface CalibrationScreen {
  readonly heading: string;
  /** Whether the hiss has been started, so that the control can be used. */
  readonly started: boolean;
  /** Whether a setting has been played, so that it can be kept. */
  readonly canKeep: boolean;
  readonly canGoLouder: boolean;
  /** Where the control stands between its bottom (0) and its top (1), or null before a repeat. */
  readonly settingFraction: number | null;
  /** What the house says about the setting, or null while only the opening line applies. */
  readonly statusLine: string | null;
}

/** The headphone check sheet. */
export interface HeadphoneCheckScreen {
  readonly roomsLine: string;
  /** Whether the four answers can be pressed: from a played check until its answer. */
  readonly awaitingAnswer: boolean;
  /** The line for the last answer, or for a check that could not be played, or null. */
  readonly statusLine: string | null;
  readonly canGoOn: boolean;
}

/** The notice sheet: a pause, the exit, the end of the rooms, or a device that cannot play. */
export interface NoticeScreen {
  readonly heading: string;
  readonly line: string;
  /** The button's label and what it does, or null where nothing more can happen. */
  readonly button: {
    readonly label: string;
    readonly action: NoticeAction;
  } | null;
}

/**
 * Everything the page shows for one snapshot of the visit, as plain data. It is made from the
 * snapshot alone, and a snapshot holds nothing about a trial, so a screen cannot either.
 */
export interface Screen {
  /** The sheet over the drawing, or null inside a room and between two rooms. */
  readonly sheet: SheetName | null;
  /** Whether the stop control is shown: from the first sound until the last room is finished. */
  readonly stopShown: boolean;
  /** Whether the pause control is shown: inside a room. */
  readonly pauseShown: boolean;
  /** Whether the two halves of the screen take answers: inside a room. */
  readonly answersShown: boolean;
  /** The room named in the bar, or null. */
  readonly room: {
    readonly id: GhostSoundId;
    readonly name: string;
    readonly progress: string;
  } | null;
  /** The room whose lamp is on and whose dust moves, or null. */
  readonly litRoom: GhostSoundId | null;
  readonly roomStates: Readonly<Record<GhostSoundId, ScreenRoomState>>;
  /** The line of the rest between two rooms, or null. */
  readonly restLine: string | null;
  readonly calibration: CalibrationScreen | null;
  readonly headphoneCheck: HeadphoneCheckScreen | null;
  readonly notice: NoticeScreen | null;
  /** Said when the browser did not let the sound start, or null. */
  readonly soundNotStartedLine: string | null;
}

function roomStatesOf(
  snapshot: VisitSnapshot,
  litRoom: VisitRoom | null,
): Readonly<Record<GhostSoundId, ScreenRoomState>> {
  const states = {} as Record<GhostSoundId, ScreenRoomState>;
  const chosen = snapshot.rooms.length > 0;
  for (const roomId of ghostSoundIds) {
    // Before a visit is chosen every room is dark. After that, a room the visit skips is closed.
    states[roomId] = chosen ? "closed" : "dark";
  }
  for (const room of snapshot.rooms) {
    states[room.roomId] =
      room.roomIndex < snapshot.finishedRoomCount ? "visited" : "dark";
  }
  if (litRoom !== null) {
    states[litRoom.roomId] = "lit";
  }
  return Object.freeze(states);
}

function roomLabelOf(
  snapshot: VisitSnapshot,
  room: VisitRoom,
): NonNullable<Screen["room"]> {
  return {
    id: room.roomId,
    name: roomNames[room.roomId],
    progress: roomProgressLine(room.roomIndex + 1, snapshot.rooms.length),
  };
}

/** The screen for a snapshot. A pure function: the same snapshot always gives the same screen. */
export function screenOfSnapshot(snapshot: VisitSnapshot): Screen {
  // No sound can play at the front door, on the exit screen, on a device that cannot play, or
  // after the last room, so the stop control is not shown there.
  const outside =
    snapshot.stage === "entry" ||
    snapshot.stage === "exit" ||
    snapshot.stage === "unsupported" ||
    snapshot.stage === "missedSoundReplay" ||
    snapshot.stage === "result" ||
    snapshot.stage === "swappedRepeat";
  const inRoom = snapshot.stage === "room" && snapshot.pause === null;
  const litRoom = inRoom ? snapshot.room : null;
  const base = {
    stopShown: !outside,
    pauseShown: inRoom,
    answersShown: inRoom,
    room: null,
    litRoom: litRoom === null ? null : litRoom.roomId,
    roomStates: roomStatesOf(snapshot, litRoom),
    restLine: null,
    calibration: null,
    headphoneCheck: null,
    notice: null,
    soundNotStartedLine: snapshot.activationRefused
      ? visitCopy.soundNotStartedLine
      : null,
  } satisfies Partial<Screen>;

  if (snapshot.pause !== null) {
    return {
      ...base,
      sheet: "notice",
      notice: {
        heading: leavingCopy.pauseHeading,
        line: leavingCopy.pauseLines[snapshot.pause.reason],
        button: { label: leavingCopy.goOnButton, action: "resume" },
      },
    };
  }

  switch (snapshot.stage) {
    case "entry":
      return { ...base, sheet: "frontDoor" };
    case "calibration": {
      const { playedSettingDb, controlBottomDb, controlTopDb } = snapshot;
      const span = controlTopDb - controlBottomDb;
      return {
        ...base,
        sheet: "calibration",
        calibration: {
          heading: snapshot.again
            ? visitCopy.recalibrateHeading
            : visitCopy.calibrationHeading,
          started: snapshot.playing,
          canKeep: snapshot.playing && playedSettingDb !== null,
          canGoLouder: snapshot.playing && !snapshot.atTop,
          settingFraction:
            playedSettingDb === null || !(span > 0)
              ? null
              : Math.min(
                  1,
                  Math.max(0, (playedSettingDb - controlBottomDb) / span),
                ),
          statusLine:
            snapshot.line === calibrationCopy.openLine ? null : snapshot.line,
        },
      };
    }
    case "headphoneCheck":
      return {
        ...base,
        sheet: "headphoneCheck",
        headphoneCheck: {
          roomsLine: snapshot.roomsLine,
          awaitingAnswer: snapshot.awaitingAnswer,
          statusLine:
            snapshot.playRefusal !== null
              ? visitCopy.checkNotPlayedLine
              : snapshot.judgementLine,
          canGoOn: snapshot.canProceed,
        },
      };
    case "rules":
      return { ...base, sheet: "rules" };
    case "room":
      return {
        ...base,
        sheet: null,
        room: roomLabelOf(snapshot, snapshot.room),
      };
    case "betweenRooms":
      return {
        ...base,
        sheet: null,
        room: roomLabelOf(snapshot, snapshot.finishedRoom),
        restLine: betweenRoomsLine(snapshot.nextRoom.roomId),
      };
    case "missedSoundReplay":
    case "result":
    case "swappedRepeat":
      // The replay and the result have their own specs. Until they are built, the visit ends
      // here with a line that says so.
      return {
        ...base,
        sheet: "notice",
        notice: {
          heading: leavingCopy.ended.heading,
          line: leavingCopy.ended.line,
          button: {
            label: leavingCopy.backButton,
            action: "leaveAfterLastRoom",
          },
        },
      };
    case "exit":
      return {
        ...base,
        sheet: "notice",
        notice: {
          heading: leavingCopy.exitHeading,
          line: leavingCopy.exitLines[snapshot.reason],
          button: { label: leavingCopy.backButton, action: "backToFrontDoor" },
        },
      };
    case "unsupported":
      return {
        ...base,
        sheet: "notice",
        notice: {
          heading: visitCopy.cannotPlayHeading,
          line: outputStateCopy.unsupportedLines[snapshot.reason],
          button: null,
        },
      };
  }
}
