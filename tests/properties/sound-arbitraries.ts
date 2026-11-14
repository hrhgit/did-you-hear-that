import fc from "fast-check";
import type { SoundId } from "../../src/config/sound-id";
import { ghostSoundIds, soundIds } from "../../src/config/sound-id";
import { soundRulesConfig } from "../../src/config/sound-rules-config";

/** Every seed `createSeededRandom` accepts: 0 to 2^32 − 1. */
export const seedArbitrary: fc.Arbitrary<number> = fc.integer({
  min: 0,
  max: 0xffffffff,
});

/** Two different seeds. */
export const seedPairArbitrary: fc.Arbitrary<readonly [number, number]> = fc
  .tuple(seedArbitrary, seedArbitrary)
  .filter(([first, second]) => first !== second);

/** The two rates of the report and of CP1 (R16.1). */
export const reportSampleRatesHz: readonly number[] = Object.freeze([
  44100, 48000,
]);

export const reportSampleRateArbitrary: fc.Arbitrary<number> = fc.constantFrom(
  ...reportSampleRatesHz,
);

/** The other common rates named by R16.2. */
export const otherCommonSampleRatesHz: readonly number[] = Object.freeze([
  22050, 32000, 88200, 96000, 192000,
]);

/** CP2's rates: the other common rates, and any integer from the lowest rate to 192000 Hz. */
export const otherSampleRateArbitrary: fc.Arbitrary<number> = fc.oneof(
  fc.constantFrom(...otherCommonSampleRatesHz),
  fc.integer({ min: soundRulesConfig.sampleRateMinHz, max: 192000 }),
);

/** Any supported rate, for properties that do not measure: CP1's and CP2's rates together. */
export const supportedSampleRateArbitrary: fc.Arbitrary<number> = fc.oneof(
  reportSampleRateArbitrary,
  otherSampleRateArbitrary,
);

/**
 * CP5's rates: any double below the lowest supported rate, including zero, negatives and
 * −Infinity, and the values that are not finite.
 */
export const rejectedSampleRateArbitrary: fc.Arbitrary<number> = fc.oneof(
  fc.double({
    max: soundRulesConfig.sampleRateMinHz,
    maxExcluded: true,
    noNaN: true,
  }),
  fc.constantFrom(
    0,
    -0,
    -1,
    soundRulesConfig.sampleRateMinHz - 1e-6,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ),
);

export const soundIdArbitrary: fc.Arbitrary<SoundId> = fc.constantFrom(
  ...soundIds,
);

// Path arbitraries for CP8 (task 9 of the ghost-sounds spec).

const nameCharacters = "abcdefghijklmnopqrstuvwxyz0123456789-".split("");

/** A file-name suffix made of lower-case letters, digits and "-". */
export const fileSuffixArbitrary: fc.Arbitrary<string> = fc.string({
  unit: fc.constantFrom(...nameCharacters),
  minLength: 1,
  maxLength: 20,
});

const directoryNameArbitrary: fc.Arbitrary<string> = fc.string({
  unit: fc.constantFrom(
    ..."abcdefghijklmnopqrstuvwxyzABC_.0123456789".split(""),
  ),
  minLength: 1,
  maxLength: 12,
});

export type PathStyle = "relative" | "posixAbsolute" | "windowsAbsolute";

export interface PathParts {
  /** Directories above the repository's `src`, empty for a relative path. */
  readonly prefixDirectories: readonly string[];
  readonly style: PathStyle;
}

/** Where the repository sits: nowhere (a relative path), or under any absolute prefix. */
export const pathPartsArbitrary: fc.Arbitrary<PathParts> = fc.oneof(
  fc.constant<PathParts>({ prefixDirectories: [], style: "relative" }),
  fc.record({
    prefixDirectories: fc.array(directoryNameArbitrary, {
      minLength: 1,
      maxLength: 5,
    }),
    style: fc.constantFrom<PathStyle>("posixAbsolute", "windowsAbsolute"),
  }),
);

/** Joins a repository-relative path such as "src/audio/synth/fft.ts" onto a prefix. */
export function pathWithPrefix(
  parts: PathParts,
  repositoryPath: string,
): string {
  if (parts.style === "relative") {
    return repositoryPath;
  }
  const segments = [...parts.prefixDirectories, ...repositoryPath.split("/")];
  return parts.style === "posixAbsolute"
    ? `/${segments.join("/")}`
    : `C:\\${segments.join("\\")}`;
}

/** A synthesis file of one sound: `src/audio/synth/<id>-<suffix>.ts` or `.test.ts`. */
export const soundFilePathArbitrary: fc.Arbitrary<{
  readonly soundId: SoundId;
  readonly path: string;
}> = fc
  .record({
    soundId: soundIdArbitrary,
    suffix: fileSuffixArbitrary,
    isTest: fc.boolean(),
    parts: pathPartsArbitrary,
  })
  .map(({ soundId, suffix, isTest, parts }) => ({
    soundId,
    path: pathWithPrefix(
      parts,
      `src/audio/synth/${soundId}-${suffix}${isTest ? ".test" : ""}.ts`,
    ),
  }));

/** A `.ts` file under `src/audio/synth/` whose name does not start with a sound id and "-". */
export const sharedSynthPathArbitrary: fc.Arbitrary<string> = fc
  .record({
    name: fileSuffixArbitrary,
    inMeasure: fc.boolean(),
    isTest: fc.boolean(),
    parts: pathPartsArbitrary,
  })
  .filter(({ name }) => !soundIds.some((id) => name.startsWith(`${id}-`)))
  .map(({ name, inMeasure, isTest, parts }) =>
    pathWithPrefix(
      parts,
      `src/audio/synth/${inMeasure ? "measure/" : ""}${name}${isTest ? ".test" : ""}.ts`,
    ),
  );

/** The four config files that shape sounds (R13.3). */
export const soundConfigFiles: readonly string[] = Object.freeze([
  "src/config/audio-safety-config.ts",
  "src/config/sound-rules-config.ts",
  "src/config/ghost-sound-config.ts",
  "src/config/sound-id.ts",
]);

export const soundConfigPathArbitrary: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom(...soundConfigFiles), pathPartsArbitrary)
  .map(([file, parts]) => pathWithPrefix(parts, file));

/** Paths that cannot change a sound: outside `src/audio/synth/` and the four config files. */
export const unrelatedPathArbitrary: fc.Arbitrary<string> = fc
  .tuple(
    fc.oneof(
      fc.constantFrom(
        "src/audio/output/play.ts",
        "src/config/hearing-method-config.ts",
        "src/config/seeded-random.ts",
        "src/ui/base.css",
        "docs/src/audio/synth.ts",
        "src/audio/synthesis/x.ts",
        "tools/render-sounds.ts",
        "README.md",
      ),
      fileSuffixArbitrary.map((name) => `src/engine/${name}.ts`),
      fc
        .constantFrom(...ghostSoundIds)
        .map((id) => `src/copy/${id}-room-name.ts`),
    ),
    pathPartsArbitrary,
  )
  .map(([file, parts]) => pathWithPrefix(parts, file));
