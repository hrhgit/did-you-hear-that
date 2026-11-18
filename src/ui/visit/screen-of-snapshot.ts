import { audioOutputConfig } from "../../config/audio-output-config";
import type { GhostSoundId } from "../../config/sound-id";
import { calibrationCopy } from "../../copy/calibration-copy";
import {
  creatureCardLabel,
  creatureCaughtCountLine,
  creatureCopy,
  creatureIntroLine,
  oneRoomCopy,
  stillAboutLine,
} from "../../copy/creature-copy";
import { leavingCopy } from "../../copy/leaving-copy";
import { outputStateCopy } from "../../copy/output-state-copy";
import {
  betweenRoomsLine,
  caughtCountLine,
  chaseCopy,
  lanternLabel,
  roomCopy,
  roomNames,
  roomProgressLine,
  streakLine,
} from "../../copy/room-copy";
import { visitCopy } from "../../copy/visit-copy";
import type {
  HeadphoneCheckAnswer,
  MissedSoundReplaySnapshot,
  RoomChase,
  RoomCreature,
  RoomLantern,
  RoomSnapshot,
  SwappedRepeatComparison,
  SwappedRepeatSnapshot,
  VisitRoom,
  VisitSnapshot,
} from "../../session/visit-flow-types";
import type { ShelfCreature } from "../room/creature-shelf";

/** The sheets of text. At most one is over the room at a time. */
export type SheetName =
  | "frontDoor"
  | "calibration"
  | "headphoneCheck"
  | "rules"
  | "notice"
  | "replay"
  | "swap"
  | "result";

/**
 * What a button of the notice sheet does. `proceed` is the flow's own next step;
 * `goOnWithoutPractice` starts a room's counting after a practice sound was not heard.
 */
export type NoticeAction =
  "resume" | "backToFrontDoor" | "proceed" | "goOnWithoutPractice";

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
  /** Lines said after the first, quieter, in order. Empty for most notices. */
  readonly moreLines: readonly string[];
  /** The button's label and what it does, or null where nothing more can happen. */
  readonly button: {
    readonly label: string;
    readonly action: NoticeAction;
  } | null;
  /** A second choice beside the button, or null. */
  readonly secondButton: {
    readonly label: string;
    readonly action: NoticeAction;
  } | null;
}

/**
 * The words of the roll call and of the counting, under the lantern, in the room, which stays in
 * full view (audible-start, light plan; one-room design.md, "The roll call"). The line that a
 * sound is playing is shown only for a practice sound, which counts for nothing, and never names
 * its side. Through the counting the line that it counts stands still, so it changes with no trial.
 */
export interface PracticeScreen {
  /** Over the practice, or null once the room counts. */
  readonly heading: string | null;
  readonly lines: readonly string[];
  /** Said while a practice sound plays, or null. */
  readonly soundPlayingLine: string | null;
}

/**
 * A creature's card along the foot of the room (one-room design.md, "The creatures"): who it is,
 * whether it is still about, how many of its sounds were caught, and a bar at each side for the
 * quietest catch on that side. Everything on it changes only when a room run begins, when a trial
 * is scored and when its search ends, so it says nothing of a trial that is still open. During the
 * roll call it also shows who is making the practice sound, never on which side.
 */
export type CreatureScreen = ShelfCreature;

/**
 * Who stands in the room in plain view. At the roll call it is the one whose practice sound plays
 * or is about to play, in the middle of the room, which tells no side. While missed sounds are
 * played again it is the creature of the playing sound, in the doorway of its side: by then every
 * answer has been given. Nobody stands in plain view while the room counts.
 */
export interface FeaturedScreen {
  readonly id: GhostSoundId;
  readonly place: "centre" | "left" | "right";
  /** How it is introduced, under the lantern, or null. */
  readonly line: string | null;
  /** Whether its practice sound is playing now. */
  readonly sounding: boolean;
}

/**
 * The lantern and the count of a room that counts (the game layer of 2026-11-16). The lantern
 * changes with the visitor's own answers, with a catch in the moment it is scored, and with the
 * clock. Everything else here changes only when a trial is scored. So none of it says anything
 * about a trial that is still open or still to come.
 */
export interface ChaseScreen {
  readonly lantern: {
    readonly cells: number;
    readonly cellCount: number;
    /** The lantern in words, for a visitor who cannot see it. */
    readonly label: string;
    /** Said while the lantern is dark, or null. */
    readonly darkLine: string | null;
  };
  readonly caughtLine: string;
  /** Said from two caught sounds in a row, or null. */
  readonly streakLine: string | null;
}

/**
 * The replay of the sounds a visitor did not catch. Before the sounds and after them it is a
 * sheet of text. While they play there is no sheet: the room is in full view, and the words
 * stand under it.
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
  /** The sheet over the room, or null inside a room and between two rooms. */
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
  /**
   * The words at the right of the bar, or null: the room and its place among the rooms, or, where
   * the rooms run together, how many creatures are still about. `progress` may be empty.
   */
  readonly room: {
    readonly name: string;
    readonly progress: string;
  } | null;
  /** The creatures' cards, in visit order. Empty outside a room. */
  readonly creatures: readonly CreatureScreen[];
  /** Who stands in the room in plain view, or null. */
  readonly featured: FeaturedScreen | null;
  /** The line of the rest between two rooms, or null. */
  readonly restLine: string | null;
  readonly calibration: CalibrationScreen | null;
  readonly headphoneCheck: HeadphoneCheckScreen | null;
  readonly notice: NoticeScreen | null;
  readonly replay: ReplayScreen | null;
  readonly swap: SwapScreen | null;
  /** The words of the practice and the counting in a room, or null. */
  readonly practice: PracticeScreen | null;
  /** The lantern and the count of a room that counts, or null. */
  readonly chase: ChaseScreen | null;
  /** Said when the browser did not let the sound start, or null. */
  readonly soundNotStartedLine: string | null;
}

/** A room and its place among the rooms of the visit, for the bar. */
function roomLabelOf(
  snapshot: VisitSnapshot,
  room: VisitRoom,
): NonNullable<Screen["room"]> {
  return {
    name: roomNames[room.roomId],
    progress: roomProgressLine(room.roomIndex + 1, snapshot.rooms.length),
  };
}

/**
 * The words of the bar inside a room. Where the rooms run together there is one room and no
 * order of rooms: the bar is empty through the roll call and then says how many creatures are
 * still about, which changes only when a search ends.
 */
function roomWordsOf(snapshot: RoomSnapshot): Screen["room"] {
  if (snapshot.together !== true) {
    return roomLabelOf(snapshot, snapshot.room);
  }
  if (snapshot.practice?.phase !== "counting") {
    return null;
  }
  const aboutCount = (snapshot.creatures ?? []).filter(
    ({ state }) => state === "about",
  ).length;
  return { name: stillAboutLine(aboutCount), progress: "" };
}

/**
 * A creature's card. `rollCall` is whether the practice is still going, when nothing counts yet,
 * and `practising` is the creature whose practice sound plays or is about to play.
 */
function creatureScreenOf(
  creature: RoomCreature,
  rollCall: boolean,
  practising: GhostSoundId | null,
): CreatureScreen {
  const id = creature.room.roomId;
  const gone = creature.state === "gone";
  const span = creature.topLevelDb - creature.floorLevelDb;
  const depthOf = (side: "left" | "right"): number | null => {
    const levelDb = creature.deepestCaughtDb[side];
    return levelDb === null || !(span > 0)
      ? null
      : Math.min(1, Math.max(0, (creature.topLevelDb - levelDb) / span));
  };
  return {
    id,
    name: creatureCopy[id].name,
    state: gone ? "gone" : practising === id ? "calling" : "about",
    statusLine: gone
      ? oneRoomCopy.goneLabel
      : rollCall
        ? null
        : creatureCaughtCountLine(creature.caughtCount),
    depth: { left: depthOf("left"), right: depthOf("right") },
    label:
      rollCall && !gone
        ? creatureIntroLine(id)
        : creatureCardLabel(
            id,
            creature.state,
            creature.caughtCount,
            creature.deepestCaughtDb,
          ),
  };
}

/** The lantern and the chase as the page shows them, or null while a room does not count. */
function chaseScreenOf(
  lantern: RoomLantern | null,
  chase: RoomChase | null,
): ChaseScreen | null {
  if (lantern === null || chase === null) {
    return null;
  }
  return {
    lantern: {
      cells: lantern.cells,
      cellCount: lantern.cellCount,
      label: lanternLabel(lantern.cells, lantern.cellCount),
      darkLine: lantern.cells === 0 ? chaseCopy.lanternDarkLine : null,
    },
    caughtLine: caughtCountLine(chase.caughtCount),
    streakLine: chase.streak >= 2 ? streakLine(chase.streak) : null,
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
  // The room of a swapped repeat is a room like every other: answered and paused the same.
  const repeatRoom =
    snapshot.stage === "swappedRepeat" && snapshot.repeat.phase === "room"
      ? snapshot.repeat
      : null;
  const inRoom =
    (snapshot.stage === "room" || repeatRoom !== null) &&
    snapshot.pause === null;
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
    creatures: [],
    featured: null,
    restLine: null,
    calibration: null,
    headphoneCheck: null,
    notice: null,
    replay: null,
    swap: null,
    practice: null,
    chase: null,
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
          moreLines: [],
          button: { label: snapshot.replay.resumeLabel, action: "resume" },
          secondButton: null,
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
          moreLines: [],
          button: { label: repeatRoom.resumeLabel, action: "resume" },
          secondButton: null,
        },
      };
    }
    if (
      snapshot.stage === "room" &&
      snapshot.pause.reason === "practiceNotHeard" &&
      snapshot.practice !== undefined &&
      snapshot.practice.notHeardLines.length > 0
    ) {
      // A practice sound was not caught: the house says on which side, and offers to go on to the
      // counting (the next step, so the lit button) or, more quietly, to practise again.
      const { practice } = snapshot;
      const [first = "", ...rest] = practice.notHeardLines;
      return {
        ...base,
        sheet: "notice",
        notice: {
          heading: practice.heading ?? leavingCopy.pauseHeading,
          line: first,
          moreLines: rest,
          button: {
            label: practice.goOnLabel,
            action: "goOnWithoutPractice",
          },
          secondButton: { label: practice.tryAgainLabel, action: "resume" },
        },
      };
    }
    return {
      ...base,
      sheet: "notice",
      notice: {
        heading: leavingCopy.pauseHeading,
        line: leavingCopy.pauseLines[snapshot.pause.reason],
        moreLines: [],
        button: { label: leavingCopy.goOnButton, action: "resume" },
        secondButton: null,
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
    case "room": {
      const { practice } = snapshot;
      // Until it counts, the practice shows who is making its sound. Never once it counts: that
      // would tell which search a counted sound belongs to before it is answered.
      const rollCall = practice !== undefined && practice.phase !== "counting";
      const practising =
        practice !== undefined && rollCall
          ? (practice.practising ?? null)
          : null;
      return {
        ...base,
        sheet: null,
        room: roomWordsOf(snapshot),
        creatures: (snapshot.creatures ?? []).map((creature) =>
          creatureScreenOf(creature, rollCall, practising?.roomId ?? null),
        ),
        featured:
          practice === undefined || practising === null
            ? null
            : {
                id: practising.roomId,
                place: "centre",
                line: creatureIntroLine(practising.roomId),
                sounding: practice.soundPlaying,
              },
        chase: chaseScreenOf(snapshot.lantern ?? null, snapshot.chase ?? null),
        practice:
          practice === undefined
            ? null
            : {
                heading: rollCall ? practice.heading : null,
                lines: practice.lines,
                // Never while counting: the line would tell when a counted sound plays.
                soundPlayingLine:
                  practice.soundPlaying && rollCall
                    ? practice.soundPlayingLine
                    : null,
              },
      };
    }
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
      // While the sounds play the room is in full view, and the creature of the playing sound
      // stands in the doorway of its side. Every answer has been given by now.
      return {
        ...base,
        sheet: null,
        replay,
        room:
          current === null
            ? null
            : {
                name: creatureCopy[current.room.roomId].name,
                progress: current.positionLabel,
              },
        featured:
          current === null
            ? null
            : {
                id: current.room.roomId,
                place: current.ear,
                line: null,
                sounding: false,
              },
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
          moreLines: [],
          button: { label: leavingCopy.backButton, action: "backToFrontDoor" },
          secondButton: null,
        },
      };
    case "unsupported":
      return {
        ...base,
        sheet: "notice",
        notice: {
          heading: visitCopy.cannotPlayHeading,
          line: outputStateCopy.unsupportedLines[snapshot.reason],
          moreLines: [],
          button: null,
          secondButton: null,
        },
      };
  }
}
