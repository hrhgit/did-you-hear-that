import { describe, expect, it } from "vitest";
import { createSeededRandom } from "../../config/seeded-random";
import { soundIds } from "../../config/sound-id";
import { renderAtticWhine } from "./attic-whine";
import { renderCalibrationHiss } from "./calibration-hiss";
import { renderCellarKnock } from "./cellar-knock";
import { renderCorridorHum } from "./corridor-hum";
import { renderNurseryMusicBox } from "./nursery-music-box";
import { soundRenderers } from "./sound-renderers";
import { renderStairsScrape } from "./stairs-scrape";

describe("soundRenderers", () => {
  it("has exactly the six sound ids", () => {
    expect(Object.keys(soundRenderers)).toEqual([...soundIds]);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(soundRenderers)).toBe(true);
  });

  it("maps each id to its render function", () => {
    expect(soundRenderers).toEqual({
      cellar: renderCellarKnock,
      corridor: renderCorridorHum,
      nursery: renderNurseryMusicBox,
      stairs: renderStairsScrape,
      attic: renderAtticWhine,
      calibration: renderCalibrationHiss,
    });
    expect(soundRenderers.cellar).toBe(renderCellarKnock);
    expect(soundRenderers.calibration).toBe(renderCalibrationHiss);
  });

  it("keeps no state between calls: equal seeds give equal samples with other renders in between (R3.5)", () => {
    for (const id of soundIds) {
      const before = soundRenderers[id](44100, createSeededRandom(11));
      for (const other of soundIds) {
        soundRenderers[other](48000, createSeededRandom(12));
      }
      const after = soundRenderers[id](44100, createSeededRandom(11));
      expect(after, id).toEqual(before);
      expect(after, id).not.toBe(before);
    }
  });
});
