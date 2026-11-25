import { audioOutputConfig } from "../../config/audio-output-config";
import { describe, expect, it } from "vitest";
import { calibrationCopy } from "../../copy/calibration-copy";
import {
  oneRoomCopy,
  rollCallCopy,
  rollCallNotHeardLines,
} from "../../copy/creature-copy";
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
  RoomCreature,
  RoomPractice,
  RoomSnapshot,
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
import type { RhythmStanding } from "../../session/rhythm-score";

const standingOf = (changes: Partial<RhythmStanding> = {}): RhythmStanding => ({
  score: 4200,
  combo: 12,
  maxCombo: 15,
  flame: 70,
  flameMax: 100,
  relights: 0,
  counts: {
    perfect: 0,
    great: 0,
    good: 0,
    miss: 0,
    wrong: 0,
    trick: 0,
    steady: 0,
  },
  ...changes,
});

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
    visitType: "full",
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
    { visitType: "full", roomCount: 3 },
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
  it("shows the front door with nobody in the room and no stop control", () => {
    const screen = screenOfSnapshot(entry);
    expect(screen.sheet).toBe("frontDoor");
    expect(screen.stopShown).toBe(false);
    expect(screen.answersShown).toBe(false);
    expect(screen.room).toBeNull();
    expect(screen.creatures).toEqual([]);
    expect(screen.featured).toBeNull();
    expect(screen.chase).toBeNull();
  });

  it("shows the stop control from the calibration on, with nobody in the room yet", () => {
    const screen = screenOfSnapshot(calibration);
    expect(screen.stopShown).toBe(true);
    expect(screen.creatures).toEqual([]);
    expect(screen.featured).toBeNull();
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
      introLines: [calibrationCopy.hiss.openLine, calibrationCopy.keysLine],
      line: calibrationCopy.hiss.openLine,
    });
    expect(screen.calibration?.heading).toBe(calibrationCopy.hiss.heading);
    expect(screen.calibration?.introLines).toEqual([
      calibrationCopy.hiss.openLine,
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

  it("names the room and its place among the rooms where they run one after another", () => {
    const screen = screenOfSnapshot({ ...base("room", 1), room: nursery });
    expect(screen.sheet).toBeNull();
    expect(screen.answersShown).toBe(true);
    expect(screen.pauseShown).toBe(true);
    expect(screen.room).toEqual({ name: "Nursery", progress: "Room 2 of 3" });
    expect(screen.creatures).toEqual([]);
    expect(screen.featured).toBeNull();
  });

  it("rests between two rooms with nobody in view and no answers taken", () => {
    const screen = screenOfSnapshot({
      ...base("betweenRooms", 1),
      canProceed: true,
      finishedRoom: corridor,
      nextRoom: nursery,
    });
    expect(screen.sheet).toBeNull();
    expect(screen.answersShown).toBe(false);
    expect(screen.featured).toBeNull();
    expect(screen.creatures).toEqual([]);
    expect(screen.room).toEqual({ name: "Corridor", progress: "Room 1 of 3" });
    expect(screen.restLine).toBe(
      "This room is quiet now. The nursery is next, when you are ready.",
    );
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
      expect(screen.featured).toBeNull();
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
        button: {
          label: practiceCopy.goOnLabel,
          action: "goOnWithoutPractice",
        },
        secondButton: { label: practiceCopy.tryAgainLabel, action: "resume" },
      });
    });

    describe("with the rhythm game of a room that counts", () => {
      const chase = {
        caughtCount: 4,
        streak: 3,
        bestStreak: 3,
        deepestCaughtDb: { left: -40, right: null },
        topLevelDb: -10,
        floorLevelDb: -70,
      };
      const counting = (changes: Partial<RhythmStanding> = {}) =>
        screenOfSnapshot({
          ...base("room", 2),
          room: stairs,
          practice: practice("counting", false),
          rhythm: standingOf(changes),
          chase,
        });

      it("shows the score, the combo, Jack's flame and the count", () => {
        expect(counting().chase).toEqual({
          score: 4200,
          combo: 12,
          maxCombo: 15,
          flame: 0.7,
          label: "4200 points, combo 12. Jack's flame: 70 of 100",
          relitLine: null,
          caughtLine: "4 caught",
        });
      });

      it("says Jack was lit again only once his candle has gone out", () => {
        expect(counting({ relights: 2 }).chase?.relitLine).toMatch(/2 times/);
        expect(counting().chase?.relitLine).toBeNull();
      });

      it("changes nothing but the chase when only the standing changes", () => {
        const withoutChase = (changes: Partial<RhythmStanding>) => ({
          ...counting(changes),
          chase: null,
        });
        expect(withoutChase({ combo: 0, flame: 10 })).toEqual(withoutChase({}));
      });

      it("has no chase in the practice or while paused", () => {
        expect(
          screenOfSnapshot({
            ...base("room", 2),
            room: stairs,
            practice: practice("practice", false),
            rhythm: null,
            chase: null,
          }).chase,
        ).toBeNull();
        expect(
          screenOfSnapshot({
            ...base("room", 2),
            room: stairs,
            pause: { reason: "visitor" },
            practice: practice("counting", false),
            rhythm: standingOf(),
            chase,
          }).chase,
        ).toBeNull();
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

  describe("in the one room, where the creatures take turns (one-room)", () => {
    const creature = (
      room: VisitRoom,
      changes: Partial<RoomCreature> = {},
    ): RoomCreature => ({
      room,
      state: "about",
      caughtCount: 0,
      deepestCaughtDb: { left: null, right: null },
      topLevelDb: -10,
      floorLevelDb: -70,
      ...changes,
    });
    const allAbout = [creature(corridor), creature(nursery), creature(stairs)];
    const practiceOf = (
      phase: RoomPractice["phase"],
      changes: Partial<RoomPractice> = {},
    ): RoomPractice => ({
      phase,
      soundPlaying: false,
      soundEar: null,
      heading: phase === "counting" ? null : rollCallCopy.heading,
      lines:
        phase === "counting" ? rollCallCopy.countingLines : rollCallCopy.lines,
      soundPlayingLine: practiceCopy.soundPlayingLine,
      notHeardEars: [],
      notHeardLines: [],
      tryAgainLabel: practiceCopy.tryAgainLabel,
      goOnLabel: practiceCopy.goOnLabel,
      practising: null,
      notHeard: [],
      ...changes,
    });
    const rollCallOf = (
      practising: VisitRoom,
      soundPlaying: boolean,
      soundEar: "left" | "right" = "left",
    ): RoomSnapshot => ({
      ...base("room", 0),
      room: practising,
      together: true,
      practice: practiceOf("practice", {
        practising,
        soundPlaying,
        soundEar: soundPlaying ? soundEar : null,
      }),
      rhythm: null,
      chase: null,
      creatures: allAbout,
    });
    const chase = {
      caughtCount: 13,
      streak: 0,
      bestStreak: 4,
      deepestCaughtDb: { left: -40, right: -55 },
      topLevelDb: -10,
      floorLevelDb: -70,
    };
    const countingOf = (
      creatures: readonly RoomCreature[],
      changes: Partial<RoomSnapshot> = {},
    ): RoomSnapshot => ({
      ...base("room", 0),
      room: nursery,
      together: true,
      practice: practiceOf("counting"),
      rhythm: standingOf({ score: 0, combo: 0, maxCombo: 0, flame: 100 }),
      chase,
      creatures,
      ...changes,
    });

    it("shows who is making the practice sound in the doorway of the side it plays from", () => {
      const screen = screenOfSnapshot(rollCallOf(nursery, true, "left"));
      expect(screen.sheet).toBeNull();
      expect(screen.answersShown).toBe(true);
      expect(screen.pauseShown).toBe(true);
      // The one room has no place in an order of rooms, and nothing counts yet.
      expect(screen.room).toBeNull();
      expect(screen.chase).toBeNull();
      expect(screen.featured).toEqual({
        id: "nursery",
        place: "left",
        line: "Tink, the black cat from the nursery. Four small notes of her bell.",
        sounding: true,
        rollCall: true,
      });
      expect(screen.practice).toEqual({
        heading: "Meet them",
        lines: rollCallCopy.lines,
        soundPlayingLine: practiceCopy.soundPlayingLine,
      });
      // Nothing that is said names a side, and the creature is in the doorway it sounds from.
      // (The cards' two bars are empty.)
      expect(
        JSON.stringify([
          screen.practice,
          screen.creatures.map(({ name, state, statusLine, label }) => [
            name,
            state,
            statusLine,
            label,
          ]),
        ]),
      ).not.toMatch(/left|right/i);
    });

    it("stands the creature in the doorway of the right side for a sound from the right", () => {
      const screen = screenOfSnapshot(rollCallOf(nursery, true, "right"));
      expect(screen.featured).toMatchObject({
        id: "nursery",
        place: "right",
        sounding: true,
        rollCall: true,
      });
    });

    it("marks the card of the one that is calling, and introduces each creature on its card", () => {
      const screen = screenOfSnapshot(rollCallOf(nursery, true));
      expect(screen.creatures).toEqual([
        {
          id: "corridor",
          name: "Murmur",
          state: "about",
          statusLine: null,
          depth: { left: null, right: null },
          label: "Murmur, the ghost from the corridor. A wavering hum.",
        },
        {
          id: "nursery",
          name: "Tink",
          state: "calling",
          statusLine: null,
          depth: { left: null, right: null },
          label:
            "Tink, the black cat from the nursery. Four small notes of her bell.",
        },
        {
          id: "stairs",
          name: "Scritch",
          state: "about",
          statusLine: null,
          depth: { left: null, right: null },
          label: "Scritch, the spider from the stairs. A dry scrape.",
        },
      ]);
    });

    it("keeps the creature in the middle between its two sounds, without the line that one is playing", () => {
      const screen = screenOfSnapshot(rollCallOf(nursery, false));
      expect(screen.featured).toEqual({
        id: "nursery",
        place: "centre",
        line: "Tink, the black cat from the nursery. Four small notes of her bell.",
        sounding: false,
        rollCall: true,
      });
      expect(screen.practice?.soundPlayingLine).toBeNull();
      expect(screen.creatures[1]?.state).toBe("calling");
    });

    it("shows nobody in the middle once it counts, and says in the bar how many are still about", () => {
      const screen = screenOfSnapshot(
        countingOf([
          creature(corridor, {
            state: "gone",
            caughtCount: 9,
            deepestCaughtDb: { left: -40, right: -55 },
          }),
          creature(nursery, {
            caughtCount: 4,
            deepestCaughtDb: { left: -40, right: null },
          }),
          creature(stairs),
        ]),
      );
      expect(screen.sheet).toBeNull();
      expect(screen.answersShown).toBe(true);
      expect(screen.featured).toBeNull();
      expect(screen.room).toEqual({ name: "2 still about", progress: "" });
      expect(screen.practice).toEqual({
        heading: null,
        lines: rollCallCopy.countingLines,
        soundPlayingLine: null,
      });
      expect(screen.chase).toEqual({
        score: 0,
        combo: 0,
        maxCombo: 0,
        flame: 1,
        label: "0 points, combo 0. Jack's flame: 100 of 100",
        relitLine: null,
        caughtLine: "13 caught",
      });
    });

    it("gives each creature a card with its own catches and a bar for each side", () => {
      const screen = screenOfSnapshot(
        countingOf([
          creature(corridor, {
            state: "gone",
            caughtCount: 9,
            deepestCaughtDb: { left: -40, right: -55 },
          }),
          creature(nursery, {
            caughtCount: 4,
            deepestCaughtDb: { left: -40, right: null },
          }),
          creature(stairs),
        ]),
      );
      expect(screen.creatures).toEqual([
        {
          id: "corridor",
          name: "Murmur",
          state: "gone",
          statusLine: oneRoomCopy.goneLabel,
          depth: { left: 0.5, right: 0.75 },
          label:
            "Murmur, the ghost, gone back to the corridor. 9 caught. Quietest catch on your left: 40 dB quieter than your calibration. Quietest catch on your right: 55 dB quieter than your calibration.",
        },
        {
          id: "nursery",
          name: "Tink",
          state: "about",
          statusLine: "4 caught",
          depth: { left: 0.5, right: null },
          label:
            "Tink, the black cat from the nursery. 4 caught. Quietest catch on your left: 40 dB quieter than your calibration. Nothing caught on your right yet.",
        },
        {
          id: "stairs",
          name: "Scritch",
          state: "about",
          statusLine: "0 caught",
          depth: { left: null, right: null },
          label:
            "Scritch, the spider from the stairs. 0 caught. Nothing caught on your left yet. Nothing caught on your right yet.",
        },
      ]);
    });

    it("keeps each bar between the loudest and the quietest sound of its own creature", () => {
      const [beyond, flat] = screenOfSnapshot(
        countingOf([
          creature(corridor, { deepestCaughtDb: { left: -95, right: 5 } }),
          // No room between its loudest and its quietest sound: there is no scale to mark.
          creature(nursery, {
            topLevelDb: -30,
            floorLevelDb: -30,
            deepestCaughtDb: { left: -30, right: null },
          }),
        ]),
      ).creatures;
      expect(beyond?.depth).toEqual({ left: 1, right: 0 });
      expect(flat?.depth).toEqual({ left: null, right: null });
    });

    it("never says who is next once it counts, whatever the practice names", () => {
      const screen = screenOfSnapshot(
        countingOf(allAbout, {
          practice: practiceOf("counting", {
            practising: stairs,
            soundPlaying: true,
          }),
        }),
      );
      expect(screen.featured).toBeNull();
      expect(screen.practice?.soundPlayingLine).toBeNull();
      expect(screen.creatures.map(({ state }) => state)).toEqual([
        "about",
        "about",
        "about",
      ]);
    });

    it("says that all have gone home when the last search has ended", () => {
      const screen = screenOfSnapshot(
        countingOf(allAbout.map((one) => ({ ...one, state: "gone" }))),
      );
      expect(screen.room).toEqual({ name: "All gone home", progress: "" });
      expect(screen.creatures.map(({ statusLine }) => statusLine)).toEqual([
        "Gone home",
        "Gone home",
        "Gone home",
      ]);
    });

    it("changes nothing but the chase when only the standing changes", () => {
      const withoutChase = (flame: number) => ({
        ...screenOfSnapshot(
          countingOf(allAbout, { rhythm: standingOf({ flame }) }),
        ),
        chase: null,
      });
      expect(withoutChase(0)).toEqual(withoutChase(100));
    });

    it("says who was not caught at the roll call, and offers to try again or to go on", () => {
      const lines = rollCallNotHeardLines([
        { roomId: "nursery", side: "left" },
      ]);
      const screen = screenOfSnapshot({
        ...rollCallOf(nursery, false),
        pause: { reason: "practiceNotHeard" },
        practice: practiceOf("notHeard", {
          notHeardEars: ["left"],
          notHeardLines: lines,
          notHeard: [{ room: nursery, ear: "left" }],
        }),
      });
      const [first, ...rest] = lines;
      expect(first).toBe(
        "Not caught, even a little louder: Tink on your left.",
      );
      expect(screen.sheet).toBe("notice");
      expect(screen.answersShown).toBe(false);
      expect(screen.featured).toBeNull();
      expect(screen.notice).toEqual({
        heading: "Meet them",
        line: first,
        moreLines: rest,
        button: {
          label: practiceCopy.goOnLabel,
          action: "goOnWithoutPractice",
        },
        secondButton: { label: practiceCopy.tryAgainLabel, action: "resume" },
      });
    });

    it("covers a paused room with the notice and names nobody on it", () => {
      const screen = screenOfSnapshot(
        countingOf(allAbout, { pause: { reason: "visitor" } }),
      );
      expect(screen.sheet).toBe("notice");
      expect(screen.answersShown).toBe(false);
      expect(screen.pauseShown).toBe(false);
      expect(screen.chase).toBeNull();
      expect(screen.featured).toBeNull();
      expect(screen.room).toBeNull();
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
      expect(screen.featured).toBeNull();
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

    it("shows the room with the creature of the playing sound in the doorway of its side, its place and both counts", () => {
      const screen = screenOfSnapshot(replaySnapshot(playing));
      expect(screen.sheet).toBeNull();
      expect(screen.stopShown).toBe(true);
      expect(screen.stopLabel).toBe(replayCopy.stopButton);
      expect(screen.answersShown).toBe(false);
      expect(screen.pauseShown).toBe(false);
      // The bar names the creature, not the floor it lives on.
      expect(screen.room).toEqual({
        name: "Scritch",
        progress: replaySound.positionLabel,
      });
      expect(screen.featured).toEqual({
        id: "stairs",
        place: "right",
        line: null,
        sounding: false,
        rollCall: false,
      });
      expect(screen.creatures).toEqual([]);
      expect(screen.chase).toBeNull();
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

    it("shows nobody between the press and the first sound", () => {
      const screen = screenOfSnapshot(
        replaySnapshot({ ...playing, current: null, counts: null }),
      );
      expect(screen.sheet).toBeNull();
      expect(screen.room).toBeNull();
      expect(screen.featured).toBeNull();
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
        expect(screen.featured).toBeNull();
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
      expect(screen.featured).toBeNull();
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
    expect(screen.featured).toBeNull();
    expect(screen.creatures).toEqual([]);
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
      expect(screen.featured).toBeNull();
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

    it("shows the room like every other room, answered and with its own pause", () => {
      const screen = screenOfSnapshot(repeatSnapshot(roomView));
      expect(screen.sheet).toBeNull();
      expect(screen.swap).toBeNull();
      expect(screen.stopShown).toBe(true);
      expect(screen.pauseShown).toBe(true);
      expect(screen.pauseLabel).toBe("Pause this room");
      expect(screen.answersShown).toBe(true);
      // The bar names the floor and its pitch. Nobody stands in view, and no card is shown: one
      // floor is visited again, and its creature shows only when one of its sounds is caught.
      expect(screen.room).toEqual({ name: "Stairs", progress: "4 kHz" });
      expect(screen.creatures).toEqual([]);
      expect(screen.featured).toBeNull();
      expect(screen.chase).toBeNull();
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
      expect(screen.featured).toBeNull();
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

    it("answers and pauses the room as every other room, with the same answer labels", () => {
      const room = screenOf({ phase: "room", earpieces: "swapped" });
      expect(room.sheet).toBeNull();
      expect(room.answersShown).toBe(true);
      expect(room.pauseShown).toBe(true);
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
