import { describe, expect, it } from "vitest";
import type { PlannedReplaySound } from "./missed-sound-replay-plan";
import { replaySoundOf } from "./replay-sound";

// A planned sound and its play outcome, as the view gives it (missed-sound-replay design.md, "The
// Replay_Controller").

const planned = (parts: Partial<PlannedReplaySound> = {}): PlannedReplaySound =>
  Object.freeze({
    trialOrder: 17,
    room: Object.freeze({ roomIndex: 1, roomId: "stairs", frequencyHz: 4000 }),
    ear: "left",
    missedLevelDb: -35,
    raisedLevelDb: -15,
    replayCapDb: 12,
    askedLevelDb: -15,
    heldByCap: false,
    ...parts,
  });

const asked = { playedLevelDb: -15, clampLimit: null };

function isDeeplyFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return true;
  }
  return Object.isFrozen(value) && Object.values(value).every(isDeeplyFrozen);
}

describe("replaySoundOf", () => {
  it("gives the planned fields, the position and its label, the room name and the pitch label", () => {
    expect(replaySoundOf(planned(), asked, 3, 20)).toEqual({
      position: 3,
      positionLabel: "Sound 3 of 20",
      trialOrder: 17,
      room: { roomIndex: 1, roomId: "stairs", frequencyHz: 4000 },
      roomName: "Stairs",
      pitchLabel: "4 kHz",
      ear: "left",
      missedLevelDb: -35,
      raisedLevelDb: -15,
      replayCapDb: 12,
      askedLevelDb: -15,
      playedLevelDb: -15,
      clampLimit: null,
      capChangedLevel: false,
      rippleLabel:
        "On your left, 4 kHz. When you did not catch it, it was 35 dB quieter than your calibration. Now it is louder.",
    });
  });

  it("takes the played level and the clamp limit from the outcome", () => {
    const sound = replaySoundOf(
      planned(),
      { playedLevelDb: -18.5, clampLimit: "ceiling" },
      1,
      1,
    );
    expect(sound.playedLevelDb).toBe(-18.5);
    expect(sound.clampLimit).toBe("ceiling");
    expect(sound.askedLevelDb).toBe(-15);
  });

  it("says the cap changed the level when the plan held it at the cap", () => {
    const sound = replaySoundOf(
      planned({
        ear: "right",
        room: { roomIndex: 0, roomId: "corridor", frequencyHz: 1000 },
        missedLevelDb: 5,
        raisedLevelDb: 25,
        replayCapDb: 15,
        askedLevelDb: 15,
        heldByCap: true,
      }),
      { playedLevelDb: 15, clampLimit: null },
      2,
      5,
    );
    expect(sound.capChangedLevel).toBe(true);
    expect(sound.roomName).toBe("Corridor");
    expect(sound.rippleLabel).toBe(
      "On your right, 1 kHz. When you did not catch it, it was 5 dB louder than your calibration. Now it is as loud as the house may play.",
    );
  });

  it("says the cap changed the level when the output stage names a clamp limit", () => {
    const sound = replaySoundOf(
      planned(),
      { playedLevelDb: -16, clampLimit: "anchorCap" },
      1,
      2,
    );
    expect(sound.capChangedLevel).toBe(true);
    expect(sound.rippleLabel).toBe(
      "On your left, 4 kHz. When you did not catch it, it was 35 dB quieter than your calibration. Now it is as loud as the house may play.",
    );
  });

  it("says the level did not change when neither the plan nor the output stage held it", () => {
    const sound = replaySoundOf(planned(), asked, 20, 20);
    expect(sound.capChangedLevel).toBe(false);
    expect(sound.rippleLabel.endsWith("Now it is louder.")).toBe(true);
    expect(sound.positionLabel).toBe("Sound 20 of 20");
  });

  it("is deeply frozen, also for a planned sound that is not", () => {
    const unfrozen: PlannedReplaySound = {
      ...planned(),
      room: { roomIndex: 2, roomId: "attic", frequencyHz: 8000 },
    };
    const sound = replaySoundOf(unfrozen, asked, 1, 1);
    expect(isDeeplyFrozen(sound)).toBe(true);
    expect(sound.pitchLabel).toBe("8 kHz");
    expect(sound.roomName).toBe("Attic");
  });

  it("refuses a position outside the replay", () => {
    expect(() => replaySoundOf(planned(), asked, 0, 20)).toThrow(RangeError);
    expect(() => replaySoundOf(planned(), asked, 21, 20)).toThrow(RangeError);
  });
});
