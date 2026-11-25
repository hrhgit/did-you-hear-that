import { describe, expect, it } from "vitest";
import { ghostSoundConfig } from "../config/ghost-sound-config";
import { hearingMethodConfig } from "../config/hearing-method-config";
import { visitRooms } from "./visit-rooms";

const { roomFrequenciesHz } = hearingMethodConfig;

describe("visitRooms", () => {
  it("gives the full visit every room from the cellar up to the attic (R2.7, D18)", () => {
    expect(visitRooms("full")).toEqual([
      {
        roomIndex: 0,
        roomId: "cellar",
        frequencyHz: roomFrequenciesHz.full[0],
      },
      {
        roomIndex: 1,
        roomId: "corridor",
        frequencyHz: roomFrequenciesHz.full[1],
      },
      {
        roomIndex: 2,
        roomId: "nursery",
        frequencyHz: roomFrequenciesHz.full[2],
      },
      {
        roomIndex: 3,
        roomId: "stairs",
        frequencyHz: roomFrequenciesHz.full[3],
      },
      { roomIndex: 4, roomId: "attic", frequencyHz: roomFrequenciesHz.full[4] },
    ]);
  });

  it("names each room by the ghost sound whose centre frequency is the room's", () => {
    for (const visitType of ["full"] as const) {
      for (const room of visitRooms(visitType)) {
        expect(ghostSoundConfig[room.roomId].centreHz).toBe(room.frequencyHz);
      }
    }
  });

  it("returns a frozen list of frozen rooms", () => {
    for (const visitType of ["full"] as const) {
      const rooms = visitRooms(visitType);
      expect(Object.isFrozen(rooms)).toBe(true);
      for (const room of rooms) {
        expect(Object.isFrozen(room)).toBe(true);
      }
    }
  });

  it("throws a RangeError for a frequency that no ghost sound has", () => {
    expect(() =>
      visitRooms("full", {
        roomFrequenciesHz: { full: [1000, 3000] },
        ghostSounds: ghostSoundConfig,
      }),
    ).toThrow(RangeError);
  });

  it("throws a RangeError for a frequency that two ghost sounds share", () => {
    expect(() =>
      visitRooms("full", {
        roomFrequenciesHz: { full: [1000] },
        ghostSounds: {
          ...ghostSoundConfig,
          nursery: { ...ghostSoundConfig.nursery, centreHz: 1000 },
        },
      }),
    ).toThrow(RangeError);
  });
});
