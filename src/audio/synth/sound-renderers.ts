import type { RandomSource } from "../../config/seeded-random";
import type { SoundId } from "../../config/sound-id";
import { renderAtticWhine } from "./attic-whine";
import { renderCalibrationHiss } from "./calibration-hiss";
import { renderCellarKnock } from "./cellar-knock";
import { renderCorridorHum } from "./corridor-hum";
import { renderNurseryMusicBox } from "./nursery-music-box";
import { renderStairsScrape } from "./stairs-scrape";

/**
 * Renders one sound: mono samples at the reference RMS, as a new buffer. Throws a `RangeError` for
 * an unsupported sample rate.
 */
export type RenderFunction = (
  sampleRate: number,
  random: RandomSource,
) => Float32Array;

/** The render function of every sound, keyed by sound id (R4.1). */
export const soundRenderers: Readonly<Record<SoundId, RenderFunction>> =
  Object.freeze({
    cellar: renderCellarKnock,
    corridor: renderCorridorHum,
    nursery: renderNurseryMusicBox,
    stairs: renderStairsScrape,
    attic: renderAtticWhine,
    calibration: renderCalibrationHiss,
  });
