import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { soundIds } from "../../src/config/sound-id";
import {
  sharedSynthPathArbitrary,
  soundConfigPathArbitrary,
  soundFilePathArbitrary,
  unrelatedPathArbitrary,
} from "./changed-path-arbitraries";
import { hookEventPaths } from "./hook-event-paths";
import { soundsForChangedPath } from "./sounds-for-changed-path";

// CP8 lives next to the code it tests, because files in tests may not import from tools (D39).

/** Runs per property (design.md, Correctness properties). */
const runs = 200;
const timeout = 120_000;

/** Any path the hook mode must find: a sound's file, a shared synthesis file or a config file. */
const soundPathArbitrary: fc.Arbitrary<string> = fc.oneof(
  soundFilePathArbitrary.map(({ path }) => path),
  sharedSynthPathArbitrary,
  soundConfigPathArbitrary,
);

interface Level {
  readonly kind: "array" | "object";
  readonly key: string;
  readonly fillers: readonly unknown[];
  readonly position: number;
}

const levelArbitrary: fc.Arbitrary<Level> = fc.record({
  kind: fc.constantFrom<"array" | "object">("array", "object"),
  key: fc.string(),
  fillers: fc.array(fc.jsonValue({ maxDepth: 2 }), { maxLength: 3 }),
  position: fc.nat(),
});

/** Places the path at the bottom of the levels: inside an array, or under a key of an object. */
function placePath(path: string, levels: readonly Level[]): unknown {
  let value: unknown = path;
  for (const level of levels) {
    if (level.kind === "array") {
      const items = [...level.fillers];
      items.splice(level.position % (items.length + 1), 0, value);
      value = items;
    } else {
      value = {
        ...Object.fromEntries(
          level.fillers.map((filler, index) => [`filler${index}`, filler]),
        ),
        [level.key]: value,
      };
    }
  }
  return value;
}

describe("ghost sounds CP8. Changed paths select the right sounds (Universal; R13.2 to R13.6)", () => {
  it(
    "maps a sound's own file to that sound alone, for any suffix and prefix",
    () => {
      fc.assert(
        fc.property(soundFilePathArbitrary, ({ soundId, path }) => {
          expect(soundsForChangedPath(path)).toEqual([soundId]);
        }),
        { numRuns: runs },
      );
    },
    timeout,
  );

  it(
    "maps any other synthesis file to every sound",
    () => {
      fc.assert(
        fc.property(sharedSynthPathArbitrary, (path) => {
          expect(soundsForChangedPath(path)).toEqual(soundIds);
        }),
        { numRuns: runs },
      );
    },
    timeout,
  );

  it(
    "maps the four sound config files to every sound",
    () => {
      fc.assert(
        fc.property(soundConfigPathArbitrary, (path) => {
          expect(soundsForChangedPath(path)).toEqual(soundIds);
        }),
        { numRuns: runs },
      );
    },
    timeout,
  );

  it(
    "maps any path outside them to nothing",
    () => {
      fc.assert(
        fc.property(unrelatedPathArbitrary, (path) => {
          expect(soundsForChangedPath(path)).toEqual([]);
        }),
        { numRuns: runs },
      );
    },
    timeout,
  );

  it(
    "finds the path in a hook event at any depth, under any key or inside an array",
    () => {
      fc.assert(
        fc.property(
          soundPathArbitrary,
          fc.array(levelArbitrary, { maxLength: 6 }),
          (path, levels) => {
            const event = JSON.stringify(placePath(path, levels));
            expect(hookEventPaths(event)).toEqual({
              kind: "paths",
              paths: [path],
            });
          },
        ),
        { numRuns: runs },
      );
    },
    timeout,
  );
});
