import { describe, expect, it } from "vitest";
import { calibrationCopy } from "../../copy/calibration-copy";
import { leavingCopy } from "../../copy/leaving-copy";
import { outputStateCopy } from "../../copy/output-state-copy";
import { replayCopy } from "../../copy/replay-copy";
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
  SnapshotBase,
  VisitLog,
  VisitRoom,
  VisitSnapshot,
  VisitStage,
  VisitSummary,
} from "../../session/visit-flow-types";
import { screenOfSnapshot } from "./screen-of-snapshot";

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

  it("offers only the start of calibration before the hiss plays", () => {
    const screen = screenOfSnapshot(calibration);
    expect(screen.sheet).toBe("calibration");
    expect(screen.calibration).toEqual({
      heading: visitCopy.calibrationHeading,
      started: false,
      canKeep: false,
      canGoLouder: false,
      settingFraction: null,
      statusLine: null,
    });
  });

  it("places the calibration setting between the ends of the control", () => {
    const screen = screenOfSnapshot({
      ...calibration,
      playing: true,
      playedSettingDb: -35,
    });
    expect(screen.calibration?.settingFraction).toBeCloseTo(0.5);
    expect(screen.calibration?.canKeep).toBe(true);
    expect(screen.calibration?.canGoLouder).toBe(true);
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
        button: { label: leavingCopy.goOnButton, action: "resume" },
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
        button: { label: leavingCopy.backButton, action: "backToFrontDoor" },
      });
    },
  );

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
          button: { label: replayCopy.resumeButton, action: "resume" },
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
    const screen = screenOfSnapshot({
      ...base("result", 3),
      visitLog: {} as VisitLog,
      summary: {} as VisitSummary,
    });
    expect(screen.sheet).toBe("result");
    expect(screen.notice).toBeNull();
    expect(screen.stopShown).toBe(false);
    expect(screen.answersShown).toBe(false);
    expect(screen.litRoom).toBeNull();
    expect(JSON.stringify(screen)).not.toContain("summary");
  });

  it("says that the swapped repeat is not built and leads back to the picture", () => {
    const screen = screenOfSnapshot({
      ...base("swappedRepeat", 3),
      room: stairs,
      visitLog: {} as VisitLog,
      summary: {} as VisitSummary,
    });
    expect(screen.sheet).toBe("notice");
    expect(screen.stopShown).toBe(false);
    expect(screen.notice).toEqual({
      heading: leavingCopy.swappedRoomNotBuilt.heading,
      line: leavingCopy.swappedRoomNotBuilt.line,
      button: {
        label: leavingCopy.swappedRoomNotBuilt.button,
        action: "proceed",
      },
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
      button: null,
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
});
