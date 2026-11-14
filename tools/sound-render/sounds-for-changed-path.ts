import type { SoundId } from "../../src/config/sound-id";
import { soundIds } from "../../src/config/sound-id";

/** The directory of the synthesis code, relative to the repository root. */
export const synthDirectoryPath = "src/audio/synth/";

/** The four config files that shape sounds, relative to the repository root (R13.3). */
export const soundConfigPaths: readonly string[] = Object.freeze([
  "src/config/audio-safety-config.ts",
  "src/config/sound-rules-config.ts",
  "src/config/ghost-sound-config.ts",
  "src/config/sound-id.ts",
]);

/** A `src/` at the start of the path or after a slash, followed by the synth or config directory. */
const sourceRootPattern = /(?:^|\/)src\/(?=audio\/synth\/|config\/)/g;

/**
 * The path from the repository's `src/` on, such as `src/audio/synth/fft.ts`, or undefined when
 * the path is not under a `src/audio/synth/` or `src/config/` directory. Backslashes count as
 * slashes, and everything up to the last such `src/` is cut, so absolute and relative paths give
 * the same answer.
 */
function repositoryPathOf(changedPath: string): string | undefined {
  const normalised = changedPath.replaceAll("\\", "/");
  let lastStart: number | undefined;
  for (const match of normalised.matchAll(sourceRootPattern)) {
    lastStart = match.index + match[0].length - "src/".length;
  }
  return lastStart === undefined ? undefined : normalised.slice(lastStart);
}

/**
 * The sounds a changed file can affect (R13.2 to R13.4, D17 and D39), in the order of `soundIds`.
 *
 * - A file directly in `src/audio/synth/` whose name starts with a sound id and "-" affects that
 *   sound. `cellar-knock.ts`, `cellar-knock-plan.ts` and `cellar-knock.test.ts` give `cellar`, and
 *   `calibration-hiss.ts` gives `calibration`.
 * - Any other file under `src/audio/synth/`, including `measure/`, affects every sound.
 * - The four sound config files affect every sound.
 * - Any other path affects nothing, and the result is empty.
 */
export function soundsForChangedPath(changedPath: string): readonly SoundId[] {
  const repositoryPath = repositoryPathOf(changedPath);
  if (repositoryPath === undefined) {
    return Object.freeze([]);
  }
  if (repositoryPath.startsWith(synthDirectoryPath)) {
    const rest = repositoryPath.slice(synthDirectoryPath.length);
    const ownSound = rest.includes("/")
      ? undefined
      : soundIds.find((soundId) => rest.startsWith(`${soundId}-`));
    return Object.freeze(ownSound === undefined ? [...soundIds] : [ownSound]);
  }
  return Object.freeze(
    soundConfigPaths.includes(repositoryPath) ? [...soundIds] : [],
  );
}
