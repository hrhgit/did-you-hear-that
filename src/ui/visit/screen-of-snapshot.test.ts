import { describe, expect, it } from "vitest";
import { calibrationCopy } from "../../copy/calibration-copy";
import { leavingCopy } from "../../copy/leaving-copy";
import { outputStateCopy } from "../../copy/output-state-copy";
import { visitCopy } from "../../copy/visit-copy";
import type {
  CalibrationSnapshot,
  HeadphoneCheckSnapshot,
  MissedSoundReplaySnapshot,
  PauseReason,
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

  it("leads from the last room to the picture", () => {
    const screen = screenOfSnapshot({
      ...base("missedSoundReplay", 3),
      visitLog: {} as VisitLog,
    } as MissedSoundReplaySnapshot);
    expect(screen.sheet).toBe("notice");
    expect(screen.stopShown).toBe(false);
    expect(screen.notice).toEqual({
      heading: leavingCopy.lastRoom.heading,
      line: leavingCopy.lastRoom.line,
      button: { label: leavingCopy.lastRoom.button, action: "proceed" },
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
