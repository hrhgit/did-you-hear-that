import { ghostSoundIds, type GhostSoundId } from "../../config/sound-id";
import { calibrationCopy } from "../../copy/calibration-copy";
import { leavingCopy } from "../../copy/leaving-copy";
import { outputStateCopy } from "../../copy/output-state-copy";
import {
  betweenRoomsLine,
  roomCopy,
  roomNames,
  roomProgressLine,
} from "../../copy/room-copy";
import { visitCopy } from "../../copy/visit-copy";
import type {
  MissedSoundReplaySnapshot,
  VisitRoom,
  VisitSnapshot,
} from "../../session/visit-flow-types";

/** How a room of the drawing is shown. The drawing of the house takes the same four words. */
export type ScreenRoomState = "dark" | "lit" | "visited" | "closed";

/** The sheets of text. At most one is over the drawing at a time. */
export type SheetName =
  | "frontDoor"
  | "calibration"
  | "headphoneCheck"
  | "rules"
  | "notice"
  | "replay"
  | "result";

/** What the button of the notice sheet does. `proceed` is the flow's own next step. */
export type NoticeAction = "resume" | "backToFrontDoor" | "proceed";

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
 * The replay of the sounds a visitor did not catch. Before the sounds and after them it is a
 * sheet of text. While they play there is no sheet: the house is in full view, and the words
 * stand beside it.
 */
export interface ReplayScreen {
  /** Whether the sounds are playing now. */
  readonly playing: boolean;
  readonly heading: string;
  /** What the house says on the sheet, in order. Empty while the sounds play. */
  readonly lines: readonly string[];
  /** How many sounds there were when only some are played, or null. */
  readonly selectionLine: string | null;
  /** How many sounds the house made on each side and how many were caught, or null. */
  readonly counts: { readonly left: string; readonly right: string } | null;
  /** The sound that is playing, or the last one that started: its side and what is said of it. */
  readonly sound: {
    readonly side: "left" | "right";
    readonly label: string;
  } | null;
  /** The label of the control that starts the sounds, or null where they cannot be started. */
  readonly startLabel: string | null;
  /** The label of the control that skips the sounds or goes on to the picture, or null. */
  readonly proceedLabel: string | null;
}

/**
 * Everything the page shows for one snapshot of the visit, as plain data. It is made from the
 * snapshot alone, and a snapshot holds nothing about a trial, so a screen cannot either. The
 * result is only named here (`sheet: "result"`). Its picture is drawn by `src/ui/result` from the
 * snapshot itself.
 */
export interface Screen {
  /** The sheet over the drawing, or null inside a room and between two rooms. */
  readonly sheet: SheetName | null;
  /** Whether the stop control is shown: from the first sound until the picture. */
  readonly stopShown: boolean;
  /** What the stop control says. */
  readonly stopLabel: string;
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
  readonly replay: ReplayScreen | null;
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

/** The replay as the page shows it. Every word comes from the snapshot. */
function replayScreenOf(snapshot: MissedSoundReplaySnapshot): ReplayScreen {
  const view = snapshot.replay;
  const proceedLabel = snapshot.canProceed ? view.proceedLabel : null;
  const base = {
    playing: false,
    heading: view.heading,
    selectionLine: view.selectionLine,
    sound: null,
    startLabel: null,
    proceedLabel,
  } satisfies Partial<ReplayScreen>;
  switch (view.phase) {
    case "nothingMissed":
      return {
        ...base,
        lines: [view.line],
        counts: { left: view.counts.leftLine, right: view.counts.rightLine },
      };
    case "announcing":
      return {
        ...base,
        lines: view.announcementLines,
        counts: null,
        startLabel: view.canStart ? view.startLabel : null,
      };
    case "playing":
      return {
        ...base,
        playing: true,
        lines: [],
        counts:
          view.counts === null
            ? null
            : { left: view.counts.leftLine, right: view.counts.rightLine },
        sound:
          view.current === null
            ? null
            : { side: view.current.ear, label: view.current.rippleLabel },
      };
    case "finished":
      return {
        ...base,
        lines: [view.endLine],
        // The end line already says how many of the missed sounds were played, and the line
        // about the selection speaks of sounds still to come.
        selectionLine: null,
        counts: { left: view.counts.leftLine, right: view.counts.rightLine },
      };
  }
}

/** The screen for a snapshot. A pure function: the same snapshot always gives the same screen. */
export function screenOfSnapshot(snapshot: VisitSnapshot): Screen {
  // No sound can play at the front door, on the exit screen, on a device that cannot play, or
  // once the picture is shown, so the stop control is not shown there.
  const outside =
    snapshot.stage === "entry" ||
    snapshot.stage === "exit" ||
    snapshot.stage === "unsupported" ||
    snapshot.stage === "result" ||
    snapshot.stage === "swappedRepeat";
  const inRoom = snapshot.stage === "room" && snapshot.pause === null;
  const litRoom = inRoom ? snapshot.room : null;
  const base = {
    stopShown: !outside,
    stopLabel:
      snapshot.stage === "missedSoundReplay"
        ? snapshot.replay.stopLabel
        : roomCopy.stopButton,
    pauseShown: inRoom,
    answersShown: inRoom,
    room: null,
    litRoom: litRoom === null ? null : litRoom.roomId,
    roomStates: roomStatesOf(snapshot, litRoom),
    restLine: null,
    calibration: null,
    headphoneCheck: null,
    notice: null,
    replay: null,
    soundNotStartedLine: snapshot.activationRefused
      ? visitCopy.soundNotStartedLine
      : null,
  } satisfies Partial<Screen>;

  if (snapshot.pause !== null) {
    if (
      snapshot.stage === "missedSoundReplay" &&
      snapshot.replay.phase === "playing" &&
      snapshot.replay.pauseLine !== null
    ) {
      // The replay says for itself why its sounds paused.
      return {
        ...base,
        sheet: "notice",
        notice: {
          heading: leavingCopy.pauseHeading,
          line: snapshot.replay.pauseLine,
          button: { label: snapshot.replay.resumeLabel, action: "resume" },
        },
      };
    }
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
    case "missedSoundReplay": {
      const replay = replayScreenOf(snapshot);
      const current =
        snapshot.replay.phase === "playing" ? snapshot.replay.current : null;
      if (!replay.playing) {
        return { ...base, sheet: "replay", replay };
      }
      // While the sounds play the house is in full view, and the room of the sound is lit.
      return {
        ...base,
        sheet: null,
        replay,
        room:
          current === null
            ? null
            : {
                id: current.room.roomId,
                name: current.roomName,
                progress: current.positionLabel,
              },
        litRoom: current === null ? null : current.room.roomId,
        roomStates: roomStatesOf(snapshot, current?.room ?? null),
      };
    }
    case "result":
      return { ...base, sheet: "result" };
    case "swappedRepeat":
      // The swapped repeat has its own spec. Until it is built, a line says so and leads back.
      return {
        ...base,
        sheet: "notice",
        notice: {
          heading: leavingCopy.swappedRoomNotBuilt.heading,
          line: leavingCopy.swappedRoomNotBuilt.line,
          button: {
            label: leavingCopy.swappedRoomNotBuilt.button,
            action: "proceed",
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
