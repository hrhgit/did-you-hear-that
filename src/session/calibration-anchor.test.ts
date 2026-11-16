import { describe, expect, it } from "vitest";
import type { GhostSoundId } from "../config/sound-id";
import { ghostSoundIds } from "../config/sound-id";
import {
  anchorKindOf,
  floorAnchorKind,
  sameAnchorKind,
} from "./calibration-anchor";
import type {
  CalibrationAnchor,
  LoggedCalibration,
  LoggedRoomAttempt,
} from "./visit-flow-types";

const roomTopLevelDb = Object.fromEntries(
  ghostSoundIds.map((roomId) => [roomId, 5]),
) as Record<GhostSoundId, number>;

function calibration(
  calibrationIndex: number,
  anchor?: "music" | "hiss",
): LoggedCalibration {
  return {
    calibrationIndex,
    settingDb: -20,
    roomTopLevelDb,
    keptAtMs: 1000 * calibrationIndex,
    ...(anchor === undefined ? {} : { anchor }),
  };
}

function attempt(
  roomIndex: number,
  attemptNumber: number,
  calibrationIndex: number,
  ending: "finished" | "abandoned",
): LoggedRoomAttempt {
  return {
    roomIndex,
    attempt: attemptNumber,
    engineSeed: 7,
    calibrationIndex,
    searchCapDb: 5,
    startedAtMs: 0,
    endedAtMs: 1,
    ending,
    result: null,
  };
}

describe("anchorKindOf", () => {
  it("gives the anchor a calibration was logged with", () => {
    const log = {
      calibrations: [calibration(0, "music"), calibration(1, "hiss")],
    };
    expect(anchorKindOf(log, 0)).toBe("music");
    expect(anchorKindOf(log, 1)).toBe("hiss");
  });

  it("gives hands for a calibration recorded before audible-start, which has no anchor (R11.2)", () => {
    expect(anchorKindOf({ calibrations: [calibration(0)] }, 0)).toBe("hands");
  });

  it("gives null for a calibration the log does not hold", () => {
    expect(anchorKindOf({ calibrations: [calibration(0, "music")] }, 1)).toBe(
      null,
    );
    expect(anchorKindOf({ calibrations: [] }, 0)).toBeNull();
  });
});

describe("floorAnchorKind", () => {
  it("gives the kind of the calibration of the room's last finished attempt", () => {
    const log = {
      calibrations: [calibration(0, "music"), calibration(1, "hiss")],
      roomAttempts: [
        attempt(0, 1, 0, "finished"),
        attempt(1, 1, 0, "abandoned"),
        attempt(1, 2, 1, "finished"),
        attempt(2, 1, 0, "finished"),
        attempt(2, 2, 1, "abandoned"),
      ],
    };
    expect(floorAnchorKind(log, 0)).toBe("music");
    expect(floorAnchorKind(log, 1)).toBe("hiss");
    // An abandoned attempt after the finished one does not count.
    expect(floorAnchorKind(log, 2)).toBe("music");
  });

  it("gives hands for a floor of a visit recorded before audible-start", () => {
    const log = {
      calibrations: [calibration(0)],
      roomAttempts: [attempt(0, 1, 0, "finished")],
    };
    expect(floorAnchorKind(log, 0)).toBe("hands");
  });

  it("gives null for a room with no finished attempt", () => {
    const log = {
      calibrations: [calibration(0, "music")],
      roomAttempts: [attempt(0, 1, 0, "abandoned")],
    };
    expect(floorAnchorKind(log, 0)).toBeNull();
    expect(floorAnchorKind(log, 3)).toBeNull();
  });
});

describe("sameAnchorKind", () => {
  const kinds: readonly (CalibrationAnchor | null)[] = [
    "hands",
    "music",
    "hiss",
    null,
  ];

  it("is true exactly for two equal kinds that are known (D26)", () => {
    for (const first of kinds) {
      for (const second of kinds) {
        expect(sameAnchorKind(first, second), `${first} ${second}`).toBe(
          first !== null && first === second,
        );
      }
    }
  });
});
