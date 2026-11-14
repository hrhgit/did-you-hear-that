import { ghostSoundConfig } from "../../config/ghost-sound-config";
import type { RandomSource } from "../../config/seeded-random";
import { drawUniform } from "./draw-uniform";

export interface NurseryNote {
  /** Start of the note's attack, from the start of the sound. */
  readonly onsetMs: number;
  /** Index into `noteFrequenciesHz`. */
  readonly pitchIndex: number;
  readonly frequencyHz: number;
  readonly startPhaseRadians: number;
}

export interface NurseryMusicBoxPlan {
  readonly notes: readonly NurseryNote[];
}

/** Picks one index from 0 to `count - 1` with one draw. */
function drawIndex(random: RandomSource, count: number): number {
  return Math.min(count - 1, Math.floor(random.next() * count));
}

/**
 * Draws every random choice of one nursery music box: `noteCount` notes from the configured
 * pitches, none repeating the note straight before it (R5.3).
 */
export function planNurseryMusicBox(random: RandomSource): NurseryMusicBoxPlan {
  // Draw order, fixed so that a seed always gives the same plan:
  // 1. the first onset, from firstNoteOnsetMinMs to firstNoteOnsetMaxMs
  // 2. noteCount - 1 intervals, from noteIntervalMinMs to noteIntervalMaxMs, in note order
  // 3. for each note in order: its pitch, then its start phase. The first pitch is drawn from all
  //    of noteFrequenciesHz, each later one from those that differ from the note before.
  const config = ghostSoundConfig.nursery;
  const pitches = config.noteFrequenciesHz;
  const onsetsMs = [
    drawUniform(random, config.firstNoteOnsetMinMs, config.firstNoteOnsetMaxMs),
  ];
  for (let index = 1; index < config.noteCount; index += 1) {
    onsetsMs.push(
      onsetsMs[index - 1] +
        drawUniform(random, config.noteIntervalMinMs, config.noteIntervalMaxMs),
    );
  }
  const notes: NurseryNote[] = [];
  for (const onsetMs of onsetsMs) {
    const previous = notes.at(-1);
    let pitchIndex: number;
    if (previous === undefined) {
      pitchIndex = drawIndex(random, pitches.length);
    } else {
      const others = pitches
        .map((_, index) => index)
        .filter((index) => index !== previous.pitchIndex);
      pitchIndex = others[drawIndex(random, others.length)];
    }
    const startPhaseRadians = drawUniform(random, 0, 2 * Math.PI);
    notes.push(
      Object.freeze({
        onsetMs,
        pitchIndex,
        frequencyHz: pitches[pitchIndex],
        startPhaseRadians,
      }),
    );
  }
  return Object.freeze({ notes: Object.freeze(notes) });
}
