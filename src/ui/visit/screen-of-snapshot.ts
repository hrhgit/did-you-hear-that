import { audioOutputConfig } from "../../config/audio-output-config";
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
  HeadphoneCheckAnswer,
  MissedSoundReplaySnapshot,
  SwappedRepeatComparison,
  SwappedRepeatSnapshot,
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
  | "swap"
  | "result";

/** What the button of the notice sheet does. `proceed` is the flow's own next step. */
export type NoticeAction = "resume" | "backToFrontDoor" | "proceed";

/** The calibration sheet. */
export interface CalibrationScreen {
  readonly heading: string;
  /** What to read before using the control, in order, without the line about the keys. */
  readonly introLines: readonly string[];
  /** The line that names the keys, shown under the control, or null. */
  readonly keysLine: string | null;
  /** Whether the calibration sound has been started, so that the control can be used. */
  readonly started: boolean;
  /** Whether a setting has been played, so that it can be kept. */
  readonly canKeep: boolean;
  readonly canGoLouder: boolean;
  /** The control's ends and its step, in dB of the setting. */
  readonly bottomDb: number;
  readonly topDb: number;
  readonly stepDb: number;
  /** Where the visitor has put the control: the thumb of the slider. */
  readonly targetDb: number;
  /** Where the sound has got to between the bottom (0) and the top (1), or null before it plays. */
  readonly settingFraction: number | null;
  /** What the house says about the setting, or null while only the opening lines apply. */
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

/** What the lit button of the swapped repeat's sheet asks the visit flow for. */
export type SwapAction = "confirmSwap" | "playSwapCheck" | "startSwappedRoom";

/**
 * The swapped repeat of one floor, outside its room: a sheet of text that says how to swap the
 * earpieces, checks the swap, leads into the room and, afterwards, sets both runs of the room
 * side by side. While the room runs there is no sheet, as in every room.
 */
export interface SwapScreen {
  /** The step of the repeat the sheet shows. */
  readonly phase:
    "unavailable" | "instruction" | "check" | "ready" | "finished";
  readonly heading: string;
  /** The floor that is visited again, and what its first run found between left and right. */
  readonly floor: {
    readonly roomName: string;
    readonly pitchLabel: string;
    readonly firstDifferenceLabel: string;
  };
  /**
   * How the sketch of the headphones is drawn: `asked` while the house has only asked for the
   * swap, `swapped` once a check has confirmed it, or null where the sheet shows no sketch.
   */
  readonly headphones: "asked" | "swapped" | null;
  /** What the house says, in order. */
  readonly lines: readonly string[];
  /** The question of the check and its four answers, or null outside the check. */
  readonly check: {
    readonly question: string;
    readonly answers: Readonly<Record<HeadphoneCheckAnswer, string>>;
    /** Whether the answers can be pressed: from a played check until its answer. */
    readonly awaitingAnswer: boolean;
  } | null;
  /**
   * Said above the lit button when a check found the headphones the way they were, so that the
   * swap is asked for again; otherwise null.
   */
  readonly againLine: string | null;
  /** What the house says about the last press of the check: why it must be made again, or null. */
  readonly statusLine: string | null;
  /** The lit button, or null where the only way on is back to the picture. */
  readonly primary: {
    readonly label: string;
    readonly action: SwapAction;
  } | null;
  /** The label of the control that leads back to the picture. */
  readonly backLabel: string;
  /** Both runs of the room side by side, once the repeat has run to its end. */
  readonly comparison: SwappedRepeatComparison | null;
  /** The line that asks the visitor to turn the headphones back, or null. */
  readonly turnBackLine: string | null;
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
  /**
   * Whether the stop control is shown: from the first sound until the picture, and all through a
   * swapped repeat.
   */
  readonly stopShown: boolean;
  /** What the stop control says. */
  readonly stopLabel: string;
  /** Whether the pause control is shown: inside a room. */
  readonly pauseShown: boolean;
  /** What the pause control says. */
  readonly pauseLabel: string;
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
  readonly swap: SwapScreen | null;
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

/**
 * The sheet of the swapped repeat. Every word comes from the snapshot. The phase `room` has no
 * sheet, so it gives null.
 */
function swapScreenOf(snapshot: SwappedRepeatSnapshot): SwapScreen | null {
  const view = snapshot.repeat;
  const base = {
    heading: view.heading,
    floor: {
      roomName: view.roomName,
      pitchLabel: view.pitchLabel,
      firstDifferenceLabel: view.firstDifferenceLabel,
    },
    headphones: view.earpieces === "swapped" ? "swapped" : "asked",
    check: null,
    againLine: null,
    statusLine: null,
    primary: null,
    backLabel: view.backLabel,
    comparison: null,
    turnBackLine: null,
  } satisfies Partial<SwapScreen>;
  switch (view.phase) {
    case "unavailable":
      return {
        ...base,
        phase: view.phase,
        headphones: null,
        lines: [view.line],
      };
    case "instruction":
      return {
        ...base,
        phase: view.phase,
        lines: view.lines,
        againLine: view.againLine,
        primary: { label: view.confirmLabel, action: "confirmSwap" },
      };
    case "check":
      return {
        ...base,
        phase: view.phase,
        lines: [],
        check: {
          question: view.question,
          answers: view.answers,
          awaitingAnswer: view.awaitingAnswer,
        },
        // A check that did not play is said first: it is what the last press came to.
        statusLine: view.playRefusalLine ?? view.cutLine ?? view.judgementLine,
        primary: { label: view.playLabel, action: "playSwapCheck" },
      };
    case "ready":
      return {
        ...base,
        phase: view.phase,
        lines: [view.judgementLine, ...view.lines],
        primary: { label: view.startLabel, action: "startSwappedRoom" },
      };
    case "room":
      return null;
    case "finished":
      return {
        ...base,
        phase: view.phase,
        headphones: null,
        lines: [view.endLine],
        comparison: view.comparison,
        turnBackLine: view.turnBackLine,
      };
  }
}

/** The screen for a snapshot. A pure function: the same snapshot always gives the same screen. */
export function screenOfSnapshot(snapshot: VisitSnapshot): Screen {
  // No sound can play at the front door, on the exit screen, on a device that cannot play, or
  // once the picture is shown, so the stop control is not shown there. A swapped repeat shows it
  // from its first sheet to its last.
  const outside =
    snapshot.stage === "entry" ||
    snapshot.stage === "exit" ||
    snapshot.stage === "unsupported" ||
    snapshot.stage === "result";
  // The room of a swapped repeat is a room like every other: lit, answered and paused the same.
  const repeatRoom =
    snapshot.stage === "swappedRepeat" && snapshot.repeat.phase === "room"
      ? snapshot.repeat
      : null;
  const inRoom =
    (snapshot.stage === "room" || repeatRoom !== null) &&
    snapshot.pause === null;
  const litRoom =
    inRoom && (snapshot.stage === "room" || snapshot.stage === "swappedRepeat")
      ? snapshot.room
      : null;
  const base = {
    stopShown: !outside,
    stopLabel:
      snapshot.stage === "missedSoundReplay"
        ? snapshot.replay.stopLabel
        : snapshot.stage === "swappedRepeat"
          ? snapshot.repeat.stopLabel
          : roomCopy.stopButton,
    pauseShown: inRoom,
    pauseLabel: repeatRoom?.pauseLabel ?? roomCopy.pauseButton,
    answersShown: inRoom,
    room: null,
    litRoom: litRoom === null ? null : litRoom.roomId,
    roomStates: roomStatesOf(snapshot, litRoom),
    restLine: null,
    calibration: null,
    headphoneCheck: null,
    notice: null,
    replay: null,
    swap: null,
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
    if (repeatRoom !== null && repeatRoom.pauseLine !== null) {
      // So does the room of a swapped repeat.
      return {
        ...base,
        sheet: "notice",
        notice: {
          heading: leavingCopy.pauseHeading,
          line: repeatRoom.pauseLine,
          button: { label: repeatRoom.resumeLabel, action: "resume" },
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
      const introLines = snapshot.introLines ?? [calibrationCopy.openLine];
      return {
        ...base,
        sheet: "calibration",
        calibration: {
          heading:
            snapshot.heading ??
            (snapshot.again
              ? visitCopy.recalibrateHeading
              : visitCopy.calibrationHeading),
          introLines: introLines.filter(
            (line) => line !== calibrationCopy.keysLine,
          ),
          keysLine: introLines.includes(calibrationCopy.keysLine)
            ? calibrationCopy.keysLine
            : null,
          started: snapshot.playing,
          canKeep: snapshot.playing && playedSettingDb !== null,
          canGoLouder: snapshot.playing && !snapshot.atTop,
          bottomDb: controlBottomDb,
          topDb: controlTopDb,
          stepDb: audioOutputConfig.calibrationSettingStepDb,
          targetDb:
            snapshot.targetSettingDb ?? playedSettingDb ?? controlBottomDb,
          settingFraction:
            playedSettingDb === null || !(span > 0)
              ? null
              : Math.min(
                  1,
                  Math.max(0, (playedSettingDb - controlBottomDb) / span),
                ),
          // The opening lines stand above the control already.
          statusLine: introLines.includes(snapshot.line) ? null : snapshot.line,
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
    case "swappedRepeat": {
      const swap = swapScreenOf(snapshot);
      if (swap === null) {
        // Inside the room the bar names the floor and its pitch. Neither changes with a sound.
        return {
          ...base,
          sheet: null,
          room: {
            id: snapshot.room.roomId,
            name: snapshot.repeat.roomName,
            progress: snapshot.repeat.pitchLabel,
          },
        };
      }
      return { ...base, sheet: "swap", swap };
    }
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
