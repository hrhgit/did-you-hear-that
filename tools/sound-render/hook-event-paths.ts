import {
  soundConfigPaths,
  synthDirectoryPath,
} from "./sounds-for-changed-path";

/** Why a hook event gave no path: no input, blank input, input that is not JSON, or no path in it. */
export type NoHookPathReason = "noInput" | "empty" | "notJson" | "noPath";

export type HookEventPaths =
  | { readonly kind: "paths"; readonly paths: readonly string[] }
  | { readonly kind: "none"; readonly reason: NoHookPathReason };

/** True when the string names something under `src/audio/synth/` or one of the sound config files. */
function isSoundPath(value: string): boolean {
  const normalised = value.replaceAll("\\", "/");
  return (
    normalised.includes(synthDirectoryPath) ||
    soundConfigPaths.some((configPath) => normalised.includes(configPath))
  );
}

function none(reason: NoHookPathReason): HookEventPaths {
  return Object.freeze({ kind: "none", reason });
}

/**
 * Reads a Kiro hook event and returns every string value in it that contains `src/audio/synth/`
 * or one of the four sound config paths, at any depth, under any key and inside arrays (R13.5,
 * D18). The documentation does not name the field that holds the saved file, so the whole event
 * is searched. Keys are not collected. Each path is returned once, in document order, as it was
 * written. Backslashes count as slashes when matching.
 */
export function hookEventPaths(hookInput: string | undefined): HookEventPaths {
  if (hookInput === undefined) {
    return none("noInput");
  }
  if (hookInput.trim() === "") {
    return none("empty");
  }
  let event: unknown;
  try {
    event = JSON.parse(hookInput);
  } catch {
    return none("notJson");
  }

  const paths: string[] = [];
  // An explicit stack, so a deeply nested event cannot exhaust the call stack.
  const pending: unknown[] = [event];
  while (pending.length > 0) {
    const value = pending.pop();
    if (typeof value === "string") {
      if (isSoundPath(value) && !paths.includes(value)) {
        paths.push(value);
      }
    } else if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        pending.push(value[index]);
      }
    } else if (typeof value === "object" && value !== null) {
      const children = Object.values(value);
      for (let index = children.length - 1; index >= 0; index -= 1) {
        pending.push(children[index]);
      }
    }
  }
  return paths.length > 0
    ? Object.freeze({ kind: "paths", paths: Object.freeze(paths) })
    : none("noPath");
}
