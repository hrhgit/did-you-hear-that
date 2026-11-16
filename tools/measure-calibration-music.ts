import { spawnSync } from "node:child_process";
import path from "node:path";
import { calibrationControlTopDb } from "../src/audio/output/calibration-music-top";
import { calibrationSettingTopDb } from "../src/audio/output/calibration-setting-top";
import { gainToDecibels } from "../src/audio/output/gain-to-decibels";
import { measureCalibrationMusic } from "../src/audio/output/measure-calibration-music";
import { nextCalibrationMusicSettingDb } from "../src/audio/output/next-calibration-music-setting";
import { renderCalibrationHiss } from "../src/audio/synth/calibration-hiss";
import { decibelsToGain } from "../src/audio/synth/decibels-to-gain";
import { audioOutputConfig } from "../src/config/audio-output-config";
import { audioSafetyConfig } from "../src/config/audio-safety-config";
import { calibrationMusicConfig } from "../src/config/calibration-music-config";
import { ghostSoundConfig } from "../src/config/ghost-sound-config";
import { createSeededRandom } from "../src/config/seeded-random";
import { soundRulesConfig } from "../src/config/sound-rules-config";

// Decodes the calibration music with ffmpeg into memory and prints the numbers of "Measurements
// of the file" in .kiro/specs/audible-start/design.md (D8): at 44 100 and 48 000 Hz the samples,
// the length, the RMS, the peak, the crest factor and the Music_Top; the step at the loop's seam;
// the time the music takes to rise to the Keep_Minimum and to the top; and the integrated
// loudness of the music and of the hiss by ffmpeg's EBU R128 filter. It writes no file, plays
// nothing and is not run by `npm test`. It needs ffmpeg on the PATH.
// Run with `npx tsx tools/measure-calibration-music.ts`.

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const musicPath = path.join(
  repositoryRoot,
  "public",
  calibrationMusicConfig.filePath,
);
const sampleRatesHz = [44100, 48000] as const;
/** The hiss renders measured for loudness, and their seed ("Measurements of the file"). */
const hissRenderCount = 40;
const hissSeed = 12345;
const hissSampleRateHz = 48000;
/** Large enough for several minutes of 32-bit samples at 48 kHz. */
const decodeBufferMaxBytes = 1 << 30;

function decibelsOf(fraction: number): string {
  return `${gainToDecibels(fraction).toFixed(2)} dBFS`;
}

/** Runs ffmpeg and gives its standard output as bytes, or throws with its standard error. */
function runFfmpeg(args: readonly string[], input?: Uint8Array): Buffer {
  const result = spawnSync("ffmpeg", ["-v", "error", ...args], {
    input,
    maxBuffer: decodeBufferMaxBytes,
  });
  if (result.error !== undefined) {
    throw new Error(`Could not run ffmpeg: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `ffmpeg exited with ${String(result.status)}: ${result.stderr.toString("utf8")}`,
    );
  }
  return result.stdout;
}

/** Decodes the music to mono 32-bit samples at a rate, in memory. */
function decodeMusic(sampleRateHz: number): Float32Array {
  const bytes = runFfmpeg([
    "-i",
    musicPath,
    "-f",
    "f32le",
    "-ac",
    "1",
    "-ar",
    String(sampleRateHz),
    "-",
  ]);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Float32Array(copy.buffer, 0, Math.floor(copy.byteLength / 4));
}

/** The integrated loudness of ffmpeg's EBU R128 filter, in LUFS. */
function integratedLoudnessLufs(args: readonly string[], input?: Uint8Array) {
  const result = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-nostats", ...args, "-af", "ebur128", "-f", "null", "-"],
    { input, maxBuffer: decodeBufferMaxBytes },
  );
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `ffmpeg's loudness filter failed: ${result.error?.message ?? result.stderr.toString("utf8")}`,
    );
  }
  const summary = result.stderr.toString("utf8").split("Summary:").at(-1) ?? "";
  const match = /I:\s+(-?\d+(?:\.\d+)?)\s+LUFS/.exec(summary);
  if (match === null) {
    throw new Error("ffmpeg's loudness filter gave no integrated loudness.");
  }
  return Number(match[1]);
}

/** Time for the music to rise from the bottom of the control to a setting, in milliseconds. */
function riseMs(targetDb: number, topDb: number): number {
  let playedDb = audioOutputConfig.calibrationSettingMinDb;
  let stepCount = 0;
  while (playedDb < Math.min(targetDb, topDb)) {
    playedDb = nextCalibrationMusicSettingDb(playedDb, targetDb, topDb);
    stepCount += 1;
  }
  return stepCount * audioOutputConfig.calibrationMusicGainStepMs;
}

function quantile(sorted: Float64Array, fraction: number): number {
  return sorted[
    Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))
  ];
}

const lines: string[] = [
  `Calibration music: ${path.relative(repositoryRoot, musicPath)}`,
  "",
  "| Rate | Samples | Length | RMS | Peak | Crest | Music_Top | Control_Top | Peak at the Control_Top |",
  "|---|---|---|---|---|---|---|---|---|",
];
const seamLines: string[] = [];
let controlTopDb = calibrationSettingTopDb();
let musicRmsFraction: number | null = null;

for (const sampleRateHz of sampleRatesHz) {
  const samples = decodeMusic(sampleRateHz);
  const measure = measureCalibrationMusic(samples);
  if (measure === null) {
    lines.push(
      `| ${sampleRateHz} Hz | ${samples.length} | empty, silent or not finite | | | | | | |`,
    );
    continue;
  }
  musicRmsFraction ??= measure.rmsFraction;
  const musicTopDb = calibrationControlTopDb(measure.crestDb);
  controlTopDb = Math.min(controlTopDb, musicTopDb);
  const levelGain =
    (decibelsToGain(musicTopDb) * soundRulesConfig.referenceRmsFraction) /
    measure.rmsFraction;
  const peakAtTopFraction = measure.peakFraction * levelGain;
  lines.push(
    `| ${sampleRateHz} Hz | ${samples.length} | ${(samples.length / sampleRateHz).toFixed(2)} s | ${measure.rmsFraction.toFixed(5)}, ${decibelsOf(measure.rmsFraction)} | ${measure.peakFraction.toFixed(5)}, ${decibelsOf(measure.peakFraction)} | ${measure.crestDb.toFixed(2)} dB | ${musicTopDb} dB | ${Math.min(musicTopDb, calibrationSettingTopDb())} dB | ${peakAtTopFraction.toFixed(4)} (ceiling ${audioSafetyConfig.ceilingFraction}) |`,
  );

  const steps = new Float64Array(samples.length - 1);
  for (let index = 1; index < samples.length; index += 1) {
    steps[index - 1] = Math.abs(samples[index] - samples[index - 1]);
  }
  steps.sort();
  const first = samples[0];
  const last = samples[samples.length - 1];
  seamLines.push(
    `${sampleRateHz} Hz: first sample ${first.toFixed(4)}, last ${last.toFixed(4)}, step at the seam ${Math.abs(first - last).toFixed(4)}; steps within the piece: 99th percentile ${quantile(steps, 0.99).toFixed(4)}, 99.9th ${quantile(steps, 0.999).toFixed(4)}, largest ${steps[steps.length - 1].toFixed(4)}`,
  );
}

lines.push("", "Loop seam:", ...seamLines);

lines.push(
  "",
  `Rise of the music from ${audioOutputConfig.calibrationSettingMinDb} dB: to the Keep_Minimum (${audioOutputConfig.calibrationSettingKeepMinDb} dB) ${(riseMs(audioOutputConfig.calibrationSettingKeepMinDb, controlTopDb) / 1000).toFixed(1)} s, to the Control_Top (${controlTopDb} dB) ${(riseMs(controlTopDb, controlTopDb) / 1000).toFixed(1)} s.`,
);

const musicLufs = integratedLoudnessLufs(["-i", musicPath]);
const hissRandom = createSeededRandom(hissSeed);
const hissRenders: Float32Array[] = [];
for (let index = 0; index < hissRenderCount; index += 1) {
  hissRenders.push(renderCalibrationHiss(hissSampleRateHz, hissRandom));
}
const hissSamples = new Float32Array(
  hissRenders.reduce((sum, render) => sum + render.length, 0),
);
let offset = 0;
for (const render of hissRenders) {
  hissSamples.set(render, offset);
  offset += render.length;
}
const hissMeasure = measureCalibrationMusic(hissSamples);
const hissLufs = integratedLoudnessLufs(
  ["-f", "f32le", "-ar", String(hissSampleRateHz), "-ac", "1", "-i", "-"],
  new Uint8Array(hissSamples.buffer),
);
lines.push(
  "",
  `Integrated loudness (EBU R128): the music ${musicLufs.toFixed(1)} LUFS; the hiss, ${hissRenderCount} renders of ${ghostSoundConfig.calibration.durationMs} ms at ${hissSampleRateHz} Hz (seed ${hissSeed}), ${hissLufs.toFixed(1)} LUFS at an RMS of ${hissMeasure === null ? "none" : decibelsOf(hissMeasure.rmsFraction)}.`,
);

if (hissMeasure !== null && musicRmsFraction !== null) {
  const hissAboveMusicLu =
    hissLufs -
    gainToDecibels(hissMeasure.rmsFraction) -
    (musicLufs - gainToDecibels(musicRmsFraction));
  lines.push(
    `At equal RMS the hiss is ${hissAboveMusicLu.toFixed(1)} LU louder than the music.`,
  );
}

for (const line of lines) {
  console.log(line);
}
