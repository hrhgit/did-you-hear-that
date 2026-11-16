import { audioOutputConfig } from "../../config/audio-output-config";
import { describe, expect, it } from "vitest";
import { calibrationCopy } from "../../copy/calibration-copy";
import { headphoneCheckCopy } from "../../copy/headphone-check-copy";
import { leavingCopy } from "../../copy/leaving-copy";
import { outputStateCopy } from "../../copy/output-state-copy";
import { notHeardLines, practiceCopy } from "../../copy/practice-copy";
import { replayCopy } from "../../copy/replay-copy";
import { roomCopy } from "../../copy/room-copy";
import { swappedRepeatCopy } from "../../copy/swapped-repeat-copy";
import { visitCopy } from "../../copy/visit-copy";
import type {
  CalibrationSnapshot,
  HeadphoneCheckSnapshot,
  MissedSoundReplay,
  MissedSoundReplaySnapshot,
  PauseReason,
  ReplayAnnouncing,
  ReplayCounts,
  ReplayFinished,
  ReplayNothingMissed,
  ReplayPlaying,
  ReplaySideCounts,
  ReplaySound,
  ResultSnapshot,
  SnapshotBase,
  SwappedRepeat,
  SwappedRepeatComparison,
  SwappedRepeatSnapshot,
  VisitLog,
  VisitRoom,
  VisitSnapshot,
  VisitStage,
  VisitSummary,
} from "../../session/visit-flow-types";
import { screenOfSnapshot } from "./screen-of-snapshot";
import { hearingMethodConfig } from "../../config/hearing-method-config";
import {
  swappedRepeatView,
  type SwappedRepeatViewInput,
} from "../../session/swapped-repeat-view";
import type { RoomSummary } from "../../session/visit-flow-types";

const quickRooms: readonly VisitRoom[] = [
  { roomIndex: 0, roomId: "corridor", frequencyHz: 1000 },
  { roomIndex: 1, roomId: "nursery", frequencyHz: 2000 },
  { roomIndex: 2, roomId: "stairs", frequencyHz: 4000 },
];

function base<Stage extends VisitStage>(
  stage: Stage,
  finishedRoomCount = 0,
): SnapshotBase<Stage> {
  return {
    stage,
    visitType: "quick",
    rooms: quickRooms,
    finishedRoomCount,
    canProceed: false,
    pause: null,
    activationRefused: false,
  };
}

const sideCounts: ReplaySideCounts = {
  madeCount: 7,
  caughtCount: 3,
  wrongSideCount: 0,
  missedCount: 4,
};

const counts: ReplayCounts = {
  throughTrialOrder: 40,
  left: sideCounts,
  right: sideCounts,
  leftLine: "On your left I made seven sounds. You caught three.",
  rightLine: "On your right I made seven sounds. You caught three.",
};

const replaySound: ReplaySound = {
  position: 3,
  positionLabel: "Sound 3 of 8",
  trialOrder: 40,
  room: { roomIndex: 2, roomId: "stairs", frequencyHz: 4000 },
  roomName: "Stairs",
  pitchLabel: "4 kHz",
  ear: "right",
  missedLevelDb: -35,
  raisedLevelDb: -15,
  replayCapDb: -10,
  askedLevelDb: -15,
  playedLevelDb: -15,
  clampLimit: null,
  capChangedLevel: false,
  rippleLabel:
    "On your right, 4 kHz. When you did not catch it, it was 35 dB quieter than your calibration. Now it is louder.",
};

const viewBase = {
  heading: replayCopy.heading,
  missedSoundCount: 8,
  replaySoundCount: 8,
  selectionLine: "A line about the selection.",
  stopLabel: replayCopy.stopButton,
  canStart: true,
  canSkip: true,
  proceedLabel: replayCopy.skipButton,
};

const announcing: ReplayAnnouncing = {
  ...viewBase,
  phase: "announcing",
  announcementLines: ["I will play them again.", "They are louder now."],
  startLabel: replayCopy.startButton,
};

const playing: ReplayPlaying = {
  ...viewBase,
  phase: "playing",
  canStart: false,
  proceedLabel: replayCopy.skipRestButton,
  current: replaySound,
  counts,
  pauseLine: null,
  resumeLabel: replayCopy.resumeButton,
};

/** The replay stage after the three rooms of the quick visit, with a way on. */
function replaySnapshot(replay: MissedSoundReplay): MissedSoundReplaySnapshot {
  return {
    ...base("missedSoundReplay", 3),
    canProceed: true,
    visitLog: {} as VisitLog,
    replay,
  };
}

const entry: VisitSnapshot = {
  ...base("entry"),
  visitType: null,
  rooms: [],
  choices: [
    { visitType: "quick", roomCount: 3 },
    { visitType: "full", roomCount: 5 },
  ],
};

const calibration: CalibrationSnapshot = {
  ...base("calibration"),
  again: false,
  playing: false,
  playedSettingDb: null,
  controlBottomDb: -60,
  controlTopDb: -10,
  atTop: false,
  line: calibrationCopy.openLine,
  keepRefusal: null,
};

const headphoneCheck: HeadphoneCheckSnapshot = {
  ...base("headphoneCheck"),
  roomsLine: "rooms line",
  awaitingAnswer: false,
  playRefusal: null,
  judgement: null,
  judgementLine: null,
};

const [corridor, nursery, stairs] = quickRooms as [
  VisitRoom,
  VisitRoom,
  VisitRoom,
];

describe("screenOfSnapshot", () => {
  it("shows the front door with every room dark and no stop control", () => {
    const screen = screenOfSnapshot(entry);
    expect(screen.sheet).toBe("frontDoor");
    expect(screen.stopShown).toBe(false);
    expect(screen.answersShown).toBe(false);
    expect(screen.litRoom).toBeNull();
    expect(new Set(Object.values(screen.roomStates))).toEqual(
      new Set(["dark"]),
    );
  });

  it("closes the rooms a quick visit skips", () => {
    const screen = screenOfSnapshot(calibration);
    expect(screen.roomStates).toEqual({
      cellar: "closed",
      corridor: "dark",
      nursery: "dark",
      stairs: "dark",
      attic: "closed",
    });
    expect(screen.stopShown).toBe(true);
  });

  it("offers only the start of calibration before the sound plays", () => {
    const screen = screenOfSnapshot(calibration);
    expect(screen.sheet).toBe("calibration");
    expect(screen.calibration).toEqual({
      heading: visitCopy.calibrationHeading,
      introLines: [calibrationCopy.openLine],
      keysLine: null,
      started: false,
      canKeep: false,
      canGoLouder: false,
      bottomDb: -60,
      topDb: -10,
      stepDb: audioOutputConfig.calibrationSettingStepDb,
      targetDb: -60,
      settingFraction: null,
      statusLine: null,
    });
  });

  it("shows the snapshot's heading and lines, with the keys line apart", () => {
    const screen = screenOfSnapshot({
      ...calibration,
      heading: calibrationCopy.hiss.heading,
      introLines: [
        calibrationCopy.hiss.openLine,
        calibrationCopy.whyLine,
        calibrationCopy.hiss.riseLine,
        calibrationCopy.keysLine,
      ],
      line: calibrationCopy.hiss.openLine,
    });
    expect(screen.calibration?.heading).toBe(calibrationCopy.hiss.heading);
    expect(screen.calibration?.introLines).toEqual([
      calibrationCopy.hiss.openLine,
      calibrationCopy.whyLine,
      calibrationCopy.hiss.riseLine,
    ]);
    expect(screen.calibration?.keysLine).toBe(calibrationCopy.keysLine);
    expect(screen.calibration?.statusLine).toBeNull();
  });

  it("says the music is loading under the opening lines", () => {
    const screen = screenOfSnapshot({
      ...calibration,
      calibrationSound: "loading",
      introLines: [calibrationCopy.openLine],
      line: calibrationCopy.loadingLine,
    });
    expect(screen.calibration?.statusLine).toBe(calibrationCopy.loadingLine);
  });

  it("puts the thumb at the target and the mark where the sound has got to", () => {
    const screen = screenOfSnapshot({
      ...calibration,
      playing: true,
      playedSettingDb: -35,
      targetSettingDb: -20,
    });
    expect(screen.calibration?.targetDb).toBe(-20);
    expect(screen.calibration?.settingFraction).toBeCloseTo(0.5);
    expect(screen.calibration?.canKeep).toBe(true);
    expect(screen.calibration?.canGoLouder).toBe(true);
  });

  it("puts the thumb at the played setting when the snapshot names no target", () => {
    const screen = screenOfSnapshot({
      ...calibration,
      playing: true,
      playedSettingDb: -35,
    });
    expect(screen.calibration?.targetDb).toBe(-35);
  });

  it("stops offering louder at the top of the control and says so", () => {
    const screen = screenOfSnapshot({
      ...calibration,
      playing: true,
      playedSettingDb: -10,
      atTop: true,
      line: calibrationCopy.atTopLine,
    });
    expect(screen.calibration?.canGoLouder).toBe(false);
    expect(screen.calibration?.settingFraction).toBe(1);
    expect(screen.calibration?.statusLine).toBe(calibrationCopy.atTopLine);
  });

  it("names a calibration after a device change differently", () => {
    const screen = screenOfSnapshot({ ...calibration, again: true });
    expect(screen.calibration?.heading).toBe(visitCopy.recalibrateHeading);
  });

  it("takes the heading from the snapshot when it gives one", () => {
    const screen = screenOfSnapshot({
      ...calibration,
      again: true,
      heading: calibrationCopy.againHeading,
    });
    expect(screen.calibration?.heading).toBe(calibrationCopy.againHeading);
  });

  it("lets the headphone check go on only when the flow says so", () => {
    expect(screenOfSnapshot(headphoneCheck).headphoneCheck).toEqual({
      roomsLine: "rooms line",
      awaitingAnswer: false,
      statusLine: null,
      canGoOn: false,
    });
    const judged = screenOfSnapshot({
      ...headphoneCheck,
      canProceed: true,
      judgement: "correct",
      judgementLine: "judged",
    });
    expect(judged.headphoneCheck?.canGoOn).toBe(true);
    expect(judged.headphoneCheck?.statusLine).toBe("judged");
  });

  it("says when the check could not be played", () => {
    const screen = screenOfSnapshot({ ...headphoneCheck, playRefusal: "busy" });
    expect(screen.headphoneCheck?.statusLine).toBe(
      visitCopy.checkNotPlayedLine,
    );
  });

  it("lights the room the visitor is in and marks the finished ones", () => {
    const screen = screenOfSnapshot({ ...base("room", 1), room: nursery });
    expect(screen.sheet).toBeNull();
    expect(screen.answersShown).toBe(true);
    expect(screen.pauseShown).toBe(true);
    expect(screen.litRoom).toBe("nursery");
    expect(screen.room).toEqual({
      id: "nursery",
      name: "Nursery",
      progress: "Room 2 of 3",
    });
    expect(screen.roomStates).toEqual({
      cellar: "closed",
      corridor: "visited",
      nursery: "lit",
      stairs: "dark",
      attic: "closed",
    });
  });

  it("rests between two rooms with no lamp on and no answers taken", () => {
    const screen = screenOfSnapshot({
      ...base("betweenRooms", 1),
      canProceed: true,
      finishedRoom: corridor,
      nextRoom: nursery,
    });
    expect(screen.sheet).toBeNull();
    expect(screen.answersShown).toBe(false);
    expect(screen.litRoom).toBeNull();
    expect(screen.restLine).toBe(
      "This room is quiet now. The nursery is next, when you are ready.",
    );
    expect(screen.roomStates.corridor).toBe("visited");
  });

  it.each<PauseReason>(["visitor", "hidden", "interrupted", "deviceChanged"])(
    "covers a room paused for the reason %s with the line for it",
    (reason) => {
      const screen = screenOfSnapshot({
        ...base("room", 2),
        room: stairs,
        pause: { reason },
      });
      expect(screen.sheet).toBe("notice");
      expect(screen.answersShown).toBe(false);
      expect(screen.litRoom).toBeNull();
      expect(screen.stopShown).toBe(true);
      expect(screen.notice).toEqual({
        heading: leavingCopy.pauseHeading,
        line: leavingCopy.pauseLines[reason],
        moreLines: [],
        button: { label: leavingCopy.goOnButton, action: "resume" },
        secondButton: null,
      });
    },
  );

  it.each(["visitor", "pageLeft", "soundRefused"] as const)(
    "shows the exit for the reason %s with a way back to the front door",
    (reason) => {
      const screen = screenOfSnapshot({ ...base("exit"), reason });
      expect(screen.stopShown).toBe(false);
      expect(screen.notice).toEqual({
        heading: leavingCopy.exitHeading,
        line: leavingCopy.exitLines[reason],
        moreLines: [],
        button: { label: leavingCopy.backButton, action: "backToFrontDoor" },
        secondButton: null,
      });
    },
  );

  describe("in a room's practice (audible-start, light plan)", () => {
    const practice = (
      phase: "practice" | "notHeard" | "counting",
      soundPlaying: boolean,
    ) => ({
      phase,
      soundPlaying,
      heading: practiceCopy.heading,
      lines:
        phase === "counting" ? practiceCopy.countingLines : practiceCopy.lines,
      soundPlayingLine: practiceCopy.soundPlayingLine,
      notHeardEars: phase === "notHeard" ? (["left"] as const) : [],
      notHeardLines: phase === "notHeard" ? notHeardLines(["left"]) : [],
      tryAgainLabel: practiceCopy.tryAgainLabel,
      goOnLabel: practiceCopy.goOnLabel,
    });

    it("shows the practice beside the house, and says a sound is playing only while one plays", () => {
      const quiet = screenOfSnapshot({
        ...base("room", 2),
        room: stairs,
        practice: practice("practice", false),
      });
      expect(quiet.sheet).toBeNull();
      expect(quiet.answersShown).toBe(true);
      expect(quiet.practice).toEqual({
        heading: practiceCopy.heading,
        lines: practiceCopy.lines,
        soundPlayingLine: null,
      });
      const playing = screenOfSnapshot({
        ...base("room", 2),
        room: stairs,
        practice: practice("practice", true),
      });
      expect(playing.practice?.soundPlayingLine).toBe(
        practiceCopy.soundPlayingLine,
      );
      expect(playing.practice?.soundPlayingLine).not.toMatch(/left|right/i);
    });

    it("keeps one still line through the counting", () => {
      const counting = screenOfSnapshot({
        ...base("room", 2),
        room: stairs,
        practice: practice("counting", true),
      });
      expect(counting.practice).toEqual({
        heading: null,
        lines: practiceCopy.countingLines,
        soundPlayingLine: null,
      });
      expect(
        screenOfSnapshot({
          ...base("room", 2),
          room: stairs,
          practice: practice("counting", false),
        }),
      ).toEqual(counting);
    });

    it("offers to try again or to go on when a practice sound was not heard", () => {
      const screen = screenOfSnapshot({
        ...base("room", 2),
        room: stairs,
        pause: { reason: "practiceNotHeard" },
        practice: practice("notHeard", false),
      });
      const [first, ...rest] = notHeardLines(["left"]);
      expect(screen.sheet).toBe("notice");
      expect(screen.answersShown).toBe(false);
      expect(screen.practice).toBeNull();
      expect(screen.notice).toEqual({
        heading: practiceCopy.heading,
        line: first,
        moreLines: rest,
        button: { label: practiceCopy.tryAgainLabel, action: "resume" },
        secondButton: {
          label: practiceCopy.goOnLabel,
          action: "goOnWithoutPractice",
        },
      });
    });

    it("has no practice outside a room", () => {
      expect(
        screenOfSnapshot({
          ...base("betweenRooms", 1),
          canProceed: true,
          finishedRoom: corridor,
          nextRoom: nursery,
        }).practice,
      ).toBeNull();
    });
  });

  describe("in the replay of missed sounds", () => {
    it("asks before the first sound, with the stop control and both ways on", () => {
      const screen = screenOfSnapshot(replaySnapshot(announcing));
      expect(screen.sheet).toBe("replay");
      expect(screen.stopShown).toBe(true);
      expect(screen.stopLabel).toBe(replayCopy.stopButton);
      expect(screen.answersShown).toBe(false);
      expect(screen.pauseShown).toBe(false);
      expect(screen.litRoom).toBeNull();
      expect(screen.replay).toEqual({
        playing: false,
        heading: replayCopy.heading,
        lines: announcing.announcementLines,
        selectionLine: announcing.selectionLine,
        counts: null,
        sound: null,
        startLabel: replayCopy.startButton,
        proceedLabel: replayCopy.skipButton,
      });
    });

    it("offers no start when the view cannot start", () => {
      const screen = screenOfSnapshot(
        replaySnapshot({ ...announcing, canStart: false }),
      );
      expect(screen.replay?.startLabel).toBeNull();
      expect(screen.replay?.proceedLabel).toBe(replayCopy.skipButton);
    });

    it("offers no way on while the flow would not proceed", () => {
      const screen = screenOfSnapshot({
        ...replaySnapshot(announcing),
        canProceed: false,
      });
      expect(screen.replay?.proceedLabel).toBeNull();
    });

    it("says that the sound did not start when the browser refused it", () => {
      const screen = screenOfSnapshot({
        ...replaySnapshot(announcing),
        activationRefused: true,
      });
      expect(screen.sheet).toBe("replay");
      expect(screen.soundNotStartedLine).toBe(visitCopy.soundNotStartedLine);
    });

    it("shows the house with the room of the playing sound lit, its place and both counts", () => {
      const screen = screenOfSnapshot(replaySnapshot(playing));
      expect(screen.sheet).toBeNull();
      expect(screen.stopShown).toBe(true);
      expect(screen.stopLabel).toBe(replayCopy.stopButton);
      expect(screen.answersShown).toBe(false);
      expect(screen.pauseShown).toBe(false);
      expect(screen.room).toEqual({
        id: "stairs",
        name: replaySound.roomName,
        progress: replaySound.positionLabel,
      });
      expect(screen.litRoom).toBe("stairs");
      expect(screen.roomStates).toEqual({
        cellar: "closed",
        corridor: "visited",
        nursery: "visited",
        stairs: "lit",
        attic: "closed",
      });
      expect(screen.replay).toEqual({
        playing: true,
        heading: replayCopy.heading,
        lines: [],
        selectionLine: playing.selectionLine,
        counts: { left: counts.leftLine, right: counts.rightLine },
        sound: { side: "right", label: replaySound.rippleLabel },
        startLabel: null,
        proceedLabel: replayCopy.skipRestButton,
      });
    });

    it("lights no room between the press and the first sound", () => {
      const screen = screenOfSnapshot(
        replaySnapshot({ ...playing, current: null, counts: null }),
      );
      expect(screen.sheet).toBeNull();
      expect(screen.room).toBeNull();
      expect(screen.litRoom).toBeNull();
      expect(screen.replay?.sound).toBeNull();
      expect(screen.replay?.counts).toBeNull();
      expect(screen.stopShown).toBe(true);
    });

    it.each(["hidden", "interrupted"] as const)(
      "covers a replay paused for the reason %s with the replay's own line",
      (reason) => {
        const screen = screenOfSnapshot({
          ...replaySnapshot({
            ...playing,
            pauseLine: replayCopy.pauseLines[reason],
          }),
          canProceed: false,
          pause: { reason },
        });
        expect(screen.sheet).toBe("notice");
        expect(screen.stopShown).toBe(true);
        expect(screen.stopLabel).toBe(replayCopy.stopButton);
        expect(screen.replay).toBeNull();
        expect(screen.litRoom).toBeNull();
        expect(screen.notice).toEqual({
          heading: leavingCopy.pauseHeading,
          line: replayCopy.pauseLines[reason],
          moreLines: [],
          button: { label: replayCopy.resumeButton, action: "resume" },
          secondButton: null,
        });
      },
    );

    it("ends with the end line, both counts and the way to the picture", () => {
      const finished: ReplayFinished = {
        ...viewBase,
        phase: "finished",
        canStart: false,
        canSkip: false,
        proceedLabel: replayCopy.goOnButton,
        ending: "allPlayed",
        endLine: "Those were all of them.",
        counts,
        last: replaySound,
      };
      const screen = screenOfSnapshot(replaySnapshot(finished));
      expect(screen.sheet).toBe("replay");
      expect(screen.stopShown).toBe(true);
      expect(screen.litRoom).toBeNull();
      expect(screen.replay).toEqual({
        playing: false,
        heading: replayCopy.heading,
        lines: [finished.endLine],
        selectionLine: null,
        counts: { left: counts.leftLine, right: counts.rightLine },
        sound: null,
        startLabel: null,
        proceedLabel: replayCopy.goOnButton,
      });
    });

    it("says so when nothing was missed, and leads to the picture", () => {
      const nothingMissed: ReplayNothingMissed = {
        ...viewBase,
        phase: "nothingMissed",
        missedSoundCount: 0,
        replaySoundCount: 0,
        selectionLine: null,
        canStart: false,
        canSkip: false,
        proceedLabel: replayCopy.goOnButton,
        line: replayCopy.nothingMissedLine,
        counts,
      };
      const screen = screenOfSnapshot(replaySnapshot(nothingMissed));
      expect(screen.sheet).toBe("replay");
      expect(screen.stopShown).toBe(true);
      expect(screen.replay).toEqual({
        playing: false,
        heading: replayCopy.heading,
        lines: [replayCopy.nothingMissedLine],
        selectionLine: null,
        counts: { left: counts.leftLine, right: counts.rightLine },
        sound: null,
        startLabel: null,
        proceedLabel: replayCopy.goOnButton,
      });
    });
  });

  it("names the result and holds nothing of it", () => {
    // The cast lets this literal stand while the swapped repeat adds fields to the snapshot.
    const screen = screenOfSnapshot({
      ...base("result", 3),
      visitLog: {} as VisitLog,
      summary: {} as VisitSummary,
    } as ResultSnapshot);
    expect(screen.sheet).toBe("result");
    expect(screen.notice).toBeNull();
    expect(screen.stopShown).toBe(false);
    expect(screen.answersShown).toBe(false);
    expect(screen.litRoom).toBeNull();
    expect(JSON.stringify(screen)).not.toContain("summary");
  });

  describe("in a swapped repeat", () => {
    const repeatBase = {
      heading: swappedRepeatCopy.heading,
      roomName: "Stairs",
      pitchLabel: "4 kHz",
      firstDifferenceLabel: "20 dB quieter on the left",
      stopLabel: swappedRepeatCopy.stopButton,
      backLabel: swappedRepeatCopy.backButton,
    } as const;
    const floor = {
      roomName: "Stairs",
      pitchLabel: "4 kHz",
      firstDifferenceLabel: "20 dB quieter on the left",
    };
    const checkView = {
      ...repeatBase,
      phase: "check",
      earpieces: "unknown",
      question: swappedRepeatCopy.question,
      answers: headphoneCheckCopy.answers,
      playLabel: swappedRepeatCopy.playCheckButton,
      awaitingAnswer: false,
      playRefusal: null,
      playRefusalLine: null,
      judgement: null,
      judgementLine: null,
      cutLine: null,
    } as const;
    const roomView = {
      ...repeatBase,
      phase: "room",
      earpieces: "swapped",
      runNumber: 1,
      answers: roomCopy.answers,
      pauseLabel: "Pause this room",
      pauseLine: null,
      resumeLabel: "Go on with this room",
    } as const;

    function repeatSnapshot(
      repeat: SwappedRepeat,
      pause: PauseReason | null = null,
    ): SwappedRepeatSnapshot {
      return {
        ...base("swappedRepeat", 3),
        canProceed: true,
        pause: pause === null ? null : { reason: pause },
        room: stairs,
        visitLog: {} as VisitLog,
        summary: {} as VisitSummary,
        repeat,
      };
    }

    it("asks for the swap on a sheet of its own, with the stop control and the way back", () => {
      const screen = screenOfSnapshot(
        repeatSnapshot({
          ...repeatBase,
          phase: "instruction",
          earpieces: "unknown",
          lines: swappedRepeatCopy.instructionLines,
          againLine: null,
          confirmLabel: swappedRepeatCopy.confirmButton,
        }),
      );
      expect(screen.sheet).toBe("swap");
      expect(screen.notice).toBeNull();
      expect(screen.stopShown).toBe(true);
      expect(screen.stopLabel).toBe(swappedRepeatCopy.stopButton);
      expect(screen.pauseShown).toBe(false);
      expect(screen.answersShown).toBe(false);
      expect(screen.litRoom).toBeNull();
      expect(screen.room).toBeNull();
      expect(screen.swap).toEqual({
        phase: "instruction",
        heading: swappedRepeatCopy.heading,
        floor,
        headphones: "asked",
        lines: swappedRepeatCopy.instructionLines,
        check: null,
        againLine: null,
        statusLine: null,
        primary: {
          label: swappedRepeatCopy.confirmButton,
          action: "confirmSwap",
        },
        backLabel: swappedRepeatCopy.backButton,
        comparison: null,
        turnBackLine: null,
      });
    });

    it("says the swap again after a check that found the headphones as they were", () => {
      const screen = screenOfSnapshot(
        repeatSnapshot({
          ...repeatBase,
          phase: "instruction",
          earpieces: "asMarked",
          lines: swappedRepeatCopy.instructionLines,
          againLine: swappedRepeatCopy.againLine,
          confirmLabel: swappedRepeatCopy.confirmButton,
        }),
      );
      expect(screen.swap?.againLine).toBe(swappedRepeatCopy.againLine);
      expect(screen.swap?.statusLine).toBeNull();
      expect(screen.swap?.headphones).toBe("asked");
    });

    it("offers the check and takes an answer only while the flow awaits one", () => {
      const before = screenOfSnapshot(repeatSnapshot(checkView));
      expect(before.sheet).toBe("swap");
      expect(before.swap?.phase).toBe("check");
      expect(before.swap?.lines).toEqual([]);
      expect(before.swap?.check).toEqual({
        question: swappedRepeatCopy.question,
        answers: headphoneCheckCopy.answers,
        awaitingAnswer: false,
      });
      expect(before.swap?.primary).toEqual({
        label: swappedRepeatCopy.playCheckButton,
        action: "playSwapCheck",
      });
      expect(before.swap?.statusLine).toBeNull();

      const after = screenOfSnapshot(
        repeatSnapshot({ ...checkView, awaitingAnswer: true }),
      );
      expect(after.swap?.check?.awaitingAnswer).toBe(true);
    });

    it("says what the check came to, and a check that did not play before anything else", () => {
      const judged = {
        ...checkView,
        judgement: "bothSides",
        judgementLine: swappedRepeatCopy.judgementLines.bothSides,
      } as const;
      expect(screenOfSnapshot(repeatSnapshot(judged)).swap?.statusLine).toBe(
        swappedRepeatCopy.judgementLines.bothSides,
      );
      expect(
        screenOfSnapshot(
          repeatSnapshot({ ...judged, cutLine: swappedRepeatCopy.cutLine }),
        ).swap?.statusLine,
      ).toBe(swappedRepeatCopy.cutLine);
      expect(
        screenOfSnapshot(
          repeatSnapshot({
            ...judged,
            cutLine: swappedRepeatCopy.cutLine,
            playRefusal: "busy",
            playRefusalLine: swappedRepeatCopy.playRefusedLine,
          }),
        ).swap?.statusLine,
      ).toBe(swappedRepeatCopy.playRefusedLine);
    });

    it("leads into the room once the check has confirmed the swap", () => {
      const screen = screenOfSnapshot(
        repeatSnapshot({
          ...repeatBase,
          phase: "ready",
          earpieces: "swapped",
          judgementLine: swappedRepeatCopy.judgementLines.confirmed,
          lines: ["A line about the room."],
          startLabel: swappedRepeatCopy.startButton,
        }),
      );
      expect(screen.swap?.phase).toBe("ready");
      expect(screen.swap?.headphones).toBe("swapped");
      expect(screen.swap?.lines).toEqual([
        swappedRepeatCopy.judgementLines.confirmed,
        "A line about the room.",
      ]);
      expect(screen.swap?.primary).toEqual({
        label: swappedRepeatCopy.startButton,
        action: "startSwappedRoom",
      });
      expect(screen.answersShown).toBe(false);
    });

    it("shows the room like every other room, lit, answered and with its own pause", () => {
      const screen = screenOfSnapshot(repeatSnapshot(roomView));
      expect(screen.sheet).toBeNull();
      expect(screen.swap).toBeNull();
      expect(screen.stopShown).toBe(true);
      expect(screen.pauseShown).toBe(true);
      expect(screen.pauseLabel).toBe("Pause this room");
      expect(screen.answersShown).toBe(true);
      expect(screen.litRoom).toBe("stairs");
      expect(screen.roomStates.stairs).toBe("lit");
      expect(screen.room).toEqual({
        id: "stairs",
        name: "Stairs",
        progress: "4 kHz",
      });
      expect(screen.restLine).toBeNull();
    });

    it("holds nothing in the room that changes with a sound", () => {
      const first = screenOfSnapshot(repeatSnapshot(roomView));
      const later = screenOfSnapshot({
        ...repeatSnapshot(roomView),
        visitLog: { trials: [1, 2, 3] } as unknown as VisitLog,
      });
      expect(later).toEqual(first);
    });

    it("pauses the room with the repeat's own line and way on", () => {
      const screen = screenOfSnapshot(
        repeatSnapshot(
          { ...roomView, pauseLine: swappedRepeatCopy.pauseLines.visitor },
          "visitor",
        ),
      );
      expect(screen.sheet).toBe("notice");
      expect(screen.notice).toEqual({
        heading: leavingCopy.pauseHeading,
        line: swappedRepeatCopy.pauseLines.visitor,
        moreLines: [],
        button: { label: "Go on with this room", action: "resume" },
        secondButton: null,
      });
      expect(screen.stopShown).toBe(true);
      expect(screen.pauseShown).toBe(false);
      expect(screen.answersShown).toBe(false);
      expect(screen.litRoom).toBeNull();
    });

    it("sets both runs beside each other when the room is finished", () => {
      const comparison = { roomIndex: 2 } as SwappedRepeatComparison;
      const screen = screenOfSnapshot(
        repeatSnapshot({
          ...repeatBase,
          phase: "finished",
          earpieces: "unknown",
          ending: "finished",
          endLine: swappedRepeatCopy.endLines.finished,
          comparison,
          turnBackLine: swappedRepeatCopy.turnBackLine,
        }),
      );
      expect(screen.sheet).toBe("swap");
      expect(screen.swap?.phase).toBe("finished");
      expect(screen.swap?.headphones).toBeNull();
      expect(screen.swap?.lines).toEqual([swappedRepeatCopy.endLines.finished]);
      expect(screen.swap?.comparison).toBe(comparison);
      expect(screen.swap?.turnBackLine).toBe(swappedRepeatCopy.turnBackLine);
      expect(screen.swap?.primary).toBeNull();
      expect(screen.stopShown).toBe(true);
    });

    it("says why a floor cannot be visited again and offers only the way back", () => {
      const screen = screenOfSnapshot(
        repeatSnapshot({
          ...repeatBase,
          phase: "unavailable",
          earpieces: "asMarked",
          reason: "calibrationGone",
          line: swappedRepeatCopy.unavailableLines.calibrationGone,
        }),
      );
      expect(screen.sheet).toBe("swap");
      expect(screen.swap?.phase).toBe("unavailable");
      expect(screen.swap?.lines).toEqual([
        swappedRepeatCopy.unavailableLines.calibrationGone,
      ]);
      expect(screen.swap?.headphones).toBeNull();
      expect(screen.swap?.primary).toBeNull();
      expect(screen.swap?.check).toBeNull();
      expect(screen.swap?.backLabel).toBe(swappedRepeatCopy.backButton);
    });
  });

  it("offers nothing on a device that cannot play", () => {
    const screen = screenOfSnapshot({
      ...base("unsupported"),
      reason: "monoOutput",
      sampleRateHz: 48000,
    });
    expect(screen.notice).toEqual({
      heading: visitCopy.cannotPlayHeading,
      line: outputStateCopy.unsupportedLines.monoOutput,
      moreLines: [],
      button: null,
      secondButton: null,
    });
  });

  it("says when the browser did not let the sound start", () => {
    expect(screenOfSnapshot(entry).soundNotStartedLine).toBeNull();
    expect(
      screenOfSnapshot({ ...entry, activationRefused: true })
        .soundNotStartedLine,
    ).toBe(visitCopy.soundNotStartedLine);
  });

  it("gives the same screen for the same snapshot", () => {
    const snapshot: VisitSnapshot = { ...base("room", 1), room: nursery };
    expect(screenOfSnapshot(snapshot)).toEqual(screenOfSnapshot(snapshot));
  });

  describe("with the views the session gives", () => {
    const counts = {
      presentationCount: 10,
      catchCount: 5,
      wrongSideCount: 0,
      missCount: 5,
    };
    const roomSummary: RoomSummary = {
      room: { roomIndex: 2, roomId: "stairs", frequencyHz: 4000 },
      left: { ...counts, state: "found", thresholdDb: -40 },
      right: { ...counts, state: "found", thresholdDb: -60 },
      searchCapDb: 0,
      noSoundTrialCount: 0,
      falseAlarmCount: 0,
      rightMinusLeftDb: -20,
      swappedRepeatOffered: true,
    };
    const input: SwappedRepeatViewInput = {
      roomSummary,
      phase: "instruction",
      earpieces: "unknown",
      unavailable: null,
      again: false,
      awaitingAnswer: false,
      playRefusal: null,
      judgement: null,
      cut: false,
      runNumber: 1,
      pauseReason: null,
      ending: null,
      record: null,
      floorDb: hearingMethodConfig.floorDb,
    };
    function screenOf(
      changes: Partial<SwappedRepeatViewInput>,
      pause: PauseReason | null = null,
    ) {
      const repeat = swappedRepeatView({ ...input, ...changes });
      const snapshot: SwappedRepeatSnapshot = {
        ...base("swappedRepeat", 3),
        canProceed: true,
        pause: pause === null ? null : { reason: pause },
        room: stairs,
        visitLog: {} as VisitLog,
        summary: {} as VisitSummary,
        repeat,
      };
      return screenOfSnapshot(snapshot);
    }
    function words(screen: ReturnType<typeof screenOfSnapshot>): string[] {
      const found: string[] = [];
      const walk = (value: unknown): void => {
        if (typeof value === "string") {
          found.push(value);
        } else if (Array.isArray(value)) {
          value.forEach(walk);
        } else if (value !== null && typeof value === "object") {
          Object.values(value).forEach(walk);
        }
      };
      walk(screen);
      return found;
    }

    it("puts every phase before the room on the sheet of the swap, with only text that is there", () => {
      const cases: Partial<SwappedRepeatViewInput>[] = [
        { phase: "unavailable", unavailable: "calibrationGone" },
        { phase: "unavailable", unavailable: "calibrationChanged" },
        { phase: "instruction" },
        { phase: "instruction", again: true },
        { phase: "check" },
        { phase: "check", awaitingAnswer: true },
        { phase: "check", judgement: "notSwapped" },
        { phase: "check", judgement: "bothSides" },
        { phase: "check", judgement: "notHeard" },
        { phase: "check", playRefusal: "busy" },
        { phase: "check", cut: true },
        { phase: "ready", earpieces: "swapped" },
        { phase: "finished", ending: "deviceChanged", earpieces: "swapped" },
        { phase: "finished", ending: "soundRefused", earpieces: "swapped" },
      ];
      for (const changes of cases) {
        const screen = screenOf(changes);
        const label = JSON.stringify(changes);
        expect(screen.sheet, label).toBe("swap");
        expect(screen.swap, label).not.toBeNull();
        expect(screen.answersShown, label).toBe(false);
        expect(screen.stopShown, label).toBe(true);
        for (const text of words(screen)) {
          expect(text.trim(), label).toBe(text);
        }
        expect(screen.swap?.heading, label).toBe(swappedRepeatCopy.heading);
        expect(screen.swap?.backLabel, label).toBe(
          swappedRepeatCopy.backButton,
        );
      }
      expect(screenOf({ phase: "check" }).swap?.check?.awaitingAnswer).toBe(
        false,
      );
      expect(
        screenOf({ phase: "check", awaitingAnswer: true }).swap?.check
          ?.awaitingAnswer,
      ).toBe(true);
      expect(
        screenOf({ phase: "instruction", again: true }).swap?.againLine,
      ).not.toBeNull();
      expect(screenOf({ phase: "instruction" }).swap?.againLine).toBeNull();
    });

    it("lights, answers and pauses the room as every other room, with the same answer labels", () => {
      const room = screenOf({ phase: "room", earpieces: "swapped" });
      expect(room.sheet).toBeNull();
      expect(room.answersShown).toBe(true);
      expect(room.pauseShown).toBe(true);
      expect(room.litRoom).toBe("stairs");
      expect(room.room?.name).toBe("Stairs");
      const repeat = swappedRepeatView({
        ...input,
        phase: "room",
        earpieces: "swapped",
      });
      expect(repeat.phase === "room" && repeat.answers).toEqual(
        roomCopy.answers,
      );
      for (const reason of ["visitor", "hidden", "interrupted"] as const) {
        const paused = screenOf(
          { phase: "room", earpieces: "swapped", pauseReason: reason },
          reason,
        );
        expect(paused.answersShown, reason).toBe(false);
        expect(paused.notice?.button?.action, reason).toBe("resume");
        expect(paused.notice?.line, reason).toBeTruthy();
      }
    });
  });
});
