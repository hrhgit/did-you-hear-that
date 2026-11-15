import { describe, expect, it } from "vitest";
import { bannedTerms } from "../config/banned-terms";
import { findBannedTerms } from "./find-banned-terms";
import * as replayCopyModule from "./replay-copy";
import { replayCopy } from "./replay-copy";

// The copy of the missed-sound replay (missed-sound-replay design.md, "The copy" and "The copy
// tests").

/** Every string reachable from a module's exports, with the path to it. */
function stringsOf(
  moduleName: string,
  exports: Record<string, unknown>,
): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = [];
  const walk = (value: unknown, path: string): void => {
    if (typeof value === "string") {
      found.push({ path, text: value });
    } else if (typeof value === "object" && value !== null) {
      for (const [key, nested] of Object.entries(value)) {
        walk(nested, `${path}.${key}`);
      }
    }
  };
  for (const [name, value] of Object.entries(exports)) {
    walk(value, `${moduleName}.${name}`);
  }
  return found;
}

const constantStrings = stringsOf("replayCopy", replayCopyModule);

describe("the replay's fixed copy", () => {
  it("has strings to check", () => {
    expect(constantStrings.length).toBe(10);
  });

  it.each(constantStrings)(
    "$path is non-empty, trimmed and uses no banned term",
    ({ text }) => {
      expect(findBannedTerms(text, bannedTerms)).toEqual([]);
      expect(text.trim()).toBe(text);
      expect(text).not.toBe("");
    },
  );

  it("has the design's wording", () => {
    expect(replayCopy).toEqual({
      heading: "The sounds you did not catch",
      startButton: "Play them",
      skipButton: "Skip them",
      skipRestButton: "Skip the rest",
      goOnButton: "See the picture",
      resumeButton: "Go on",
      stopButton: "Stop the sounds",
      nothingMissedLine:
        "You answered every sound I made, so I have nothing to play again.",
      pauseLines: {
        hidden:
          "The sounds paused while this page was out of sight. When you go on, they carry on where they stopped.",
        interrupted:
          "Something else on this device took over the sound, so the sounds paused. When you go on, they carry on where they stopped.",
      },
    });
  });

  it("is frozen, with its pause lines", () => {
    expect(Object.isFrozen(replayCopy)).toBe(true);
    expect(Object.isFrozen(replayCopy.pauseLines)).toBe(true);
  });
});
