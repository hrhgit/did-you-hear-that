import { createManualTimer } from "../../src/config/manual-timer";
import type { ManualTimer } from "../../src/config/manual-timer";
import type { RandomSource } from "../../src/config/seeded-random";
import { createSeededRandom } from "../../src/config/seeded-random";
import type {
  AudioOutput,
  CalibrationMusicOutput,
  StopEvent,
} from "../../src/audio/output/create-audio-output";
import { createAudioOutput } from "../../src/audio/output/create-audio-output";
import type {
  FakeAudioBackend,
  FakeAudioBackendOptions,
} from "../../src/audio/output/fake-audio-backend";
import { createFakeAudioBackend } from "../../src/audio/output/fake-audio-backend";

// Builds output shells on the fake backend for the shell properties (CP7 to CP10, CP13). The
// audio clock and the manual timer start together and are moved together by `advance`.

export interface ShellUnderTest {
  readonly backend: FakeAudioBackend;
  readonly timer: ManualTimer;
  /** The shell, with its calibration music calls. */
  readonly output: AudioOutput & CalibrationMusicOutput;
  readonly random: RandomSource;
  /** Every stop event, in order, as one registered listener heard it. */
  readonly stops: StopEvent[];
}

export function createShellUnderTest(
  options: FakeAudioBackendOptions & { readonly seed: number },
): ShellUnderTest {
  const backend = createFakeAudioBackend(options);
  const timer = createManualTimer({ startMs: options.startMs ?? 0 });
  const output = createAudioOutput({ backend, timer });
  const stops: StopEvent[] = [];
  output.onStop((event) => stops.push(event));
  return {
    backend,
    timer,
    output,
    random: createSeededRandom(options.seed),
    stops,
  };
}

/**
 * Resolves the calibration music load of a shell made with `calibrationMusic: { mode: "pending" }`
 * with `samples`, and waits until the shell has heard it (audible-start design.md, "Testing the
 * music under Node").
 */
export async function resolveMusicLoad(
  shell: ShellUnderTest,
  samples: Float32Array,
): Promise<void> {
  shell.backend.resolveCalibrationMusic(samples);
  for (let round = 0; round < 5; round += 1) {
    await Promise.resolve();
  }
}

/** Moves the audio clock and the timer forward together. */
export function advance(shell: ShellUnderTest, durationMs: number): void {
  shell.backend.advanceClockBy(durationMs);
  shell.timer.advanceBy(durationMs);
}

/** Moves both clocks to `endMs` on the audio clock, if that is still ahead. */
export function advanceTo(shell: ShellUnderTest, endMs: number): void {
  advance(shell, Math.max(0, endMs - shell.backend.currentTimeMs()));
}

/**
 * Activates the shell, calibrates it by repeats towards `settingDb`, waiting out each one, and
 * keeps the setting. Throws if any step is refused.
 */
export async function calibrate(
  shell: ShellUnderTest,
  settingDb: number,
): Promise<void> {
  const activation = await shell.output.activate();
  if (activation.kind !== "running") {
    throw new Error(`The shell did not run: ${activation.kind}.`);
  }
  shell.output.beginCalibration();
  for (let repeat = 0; repeat < 100; repeat += 1) {
    const outcome = shell.output.playCalibrationRepeat({
      requestedSettingDb: settingDb,
      random: shell.random,
    });
    if (outcome.kind !== "scheduled") {
      throw new Error(`A calibration repeat was refused: ${outcome.reason}.`);
    }
    advanceTo(shell, outcome.endMs);
    if (outcome.settingDb === settingDb) {
      const kept = shell.output.keepCalibration();
      if (kept.kind !== "kept") {
        throw new Error(`The calibration was not kept: ${kept.reason}.`);
      }
      return;
    }
  }
  throw new Error(`No calibration repeat reached ${settingDb} dB.`);
}
