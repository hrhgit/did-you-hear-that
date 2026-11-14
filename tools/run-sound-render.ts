import type { RenderFunction } from "../src/audio/synth/sound-renderers";
import { soundRenderers } from "../src/audio/synth/sound-renderers";
import type { SoundId } from "../src/config/sound-id";
import { soundIds } from "../src/config/sound-id";
import {
  findingDescriptions,
  formatSoundReport,
  reportRatesText,
} from "./sound-render/format-sound-report";
import type { NoHookPathReason } from "./sound-render/hook-event-paths";
import { hookEventPaths } from "./sound-render/hook-event-paths";
import type { SoundRun } from "./sound-render/measure-sounds";
import { measureSounds, reportSeeds } from "./sound-render/measure-sounds";
import {
  parseRenderArguments,
  renderUsage,
} from "./sound-render/parse-render-arguments";
import { soundsForChangedPath } from "./sound-render/sounds-for-changed-path";

export interface SoundRenderInput {
  /** The arguments after the script name, `process.argv.slice(2)`. */
  readonly arguments: readonly string[];
  /** Standard input in hook mode, undefined when it was a terminal or not read. */
  readonly hookInput: string | undefined;
  /** Only used in the witness line. */
  readonly nowIso: string;
  /** Only printed and returned. The wrapper appends the witness line to it. */
  readonly witnessLogPath: string;
  /** The renderers to check. Tests inject broken ones. Defaults to the real sounds. */
  readonly renderers?: Readonly<Record<SoundId, RenderFunction>>;
}

export interface SoundRenderResult {
  readonly exitCode: 0 | 1;
  readonly stdoutLines: readonly string[];
  readonly stderrLines: readonly string[];
  /** The text of `docs/reports/sounds.md`, in full mode only. */
  readonly report: string | undefined;
  /** One JSON line for the hook witness log, in hook mode only. */
  readonly witnessLine: string | undefined;
}

const prefix = "render:sounds:";

/** The witness line keeps at most this many characters of the raw hook event (R13.9). */
export const witnessHookInputMaxCharacters = 4000;

const noHookPathReasons: Readonly<Record<NoHookPathReason, string>> =
  Object.freeze({
    noInput: "standard input held no hook event",
    empty: "the hook event was empty",
    notJson: "the hook event was not valid JSON",
    noPath: "the hook event held no synthesis or sound config path",
  });

const noSoundInHookPathsReason = "no path in the hook event can change a sound";

/** "cellar", "cellar and attic", "cellar, corridor and attic". */
function listText(items: readonly string[]): string {
  return items.length <= 1
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function checkedText(): string {
  return `at ${reportRatesText()} over ${reportSeeds.length} seeds`;
}

/** The sounds any of the paths can change, in the order of `soundIds`. */
function soundsForPaths(paths: readonly string[]): readonly SoundId[] {
  const selected = new Set(paths.flatMap(soundsForChangedPath));
  return soundIds.filter((soundId) => selected.has(soundId));
}

/** Per sound: one line per finding, or one summary line when it met every rule (R12.4, R12.5). */
function checkLines(
  sounds: readonly SoundId[],
  runs: readonly SoundRun[],
): string[] {
  return sounds.flatMap((soundId) => {
    const findings = findingDescriptions(
      runs.filter((run) => run.soundId === soundId),
    );
    return findings.length > 0
      ? findings.map((finding) => `${prefix} ${finding}.`)
      : [`${prefix} ${soundId}: every rule met ${checkedText()}.`];
  });
}

function hasFindings(runs: readonly SoundRun[]): boolean {
  return runs.some(
    (run) => run.errorMessage !== null || run.brokenRules.length > 0,
  );
}

/** The first `witnessHookInputMaxCharacters` characters, counted in code points. */
function cutHookInput(hookInput: string): string {
  const characters: string[] = [];
  for (const character of hookInput) {
    if (characters.length === witnessHookInputMaxCharacters) {
      break;
    }
    characters.push(character);
  }
  return characters.join("");
}

function runHook(
  input: SoundRenderInput,
  renderers: Readonly<Record<SoundId, RenderFunction>>,
): SoundRenderResult {
  const found = hookEventPaths(input.hookInput);
  const paths = found.kind === "paths" ? found.paths : [];
  const changedSounds = soundsForPaths(paths);
  const reason =
    found.kind === "none"
      ? noHookPathReasons[found.reason]
      : changedSounds.length === 0
        ? noSoundInHookPathsReason
        : undefined;
  const sounds = reason === undefined ? changedSounds : soundIds;
  const runs = measureSounds(sounds, renderers);
  const exitCode = hasFindings(runs) ? 1 : 0;
  const witnessLine = JSON.stringify({
    time: input.nowIso,
    hookInput:
      input.hookInput === undefined ? null : cutHookInput(input.hookInput),
    paths,
    sounds,
    exitCode,
  });
  const witnessText = `Witness log: ${input.witnessLogPath}.`;
  const reasonText =
    reason === undefined ? undefined : `${reason}, so every sound is checked.`;

  if (exitCode === 0) {
    // One summary line on standard output, which Kiro adds to the agent's context (R13.7).
    const summary = `every rule met for ${listText(sounds)} ${checkedText()}.`;
    return Object.freeze({
      exitCode,
      stdoutLines: Object.freeze([
        reasonText === undefined
          ? `${prefix} ${summary} ${witnessText}`
          : `${prefix} ${reasonText} ${summary[0].toUpperCase()}${summary.slice(1)} ${witnessText}`,
      ]),
      stderrLines: Object.freeze([]),
      report: undefined,
      witnessLine,
    });
  }
  // Every finding on standard error, which Kiro sends to the agent with an error notice (R13.8).
  return Object.freeze({
    exitCode,
    stdoutLines: Object.freeze([]),
    stderrLines: Object.freeze([
      ...(reasonText === undefined ? [] : [`${prefix} ${reasonText}`]),
      ...checkLines(sounds, runs),
      `${prefix} witness log: ${input.witnessLogPath}.`,
    ]),
    report: undefined,
    witnessLine,
  });
}

/**
 * The core of `npm run render:sounds` (ghost-sounds design.md, The render tool). It renders and
 * checks the sounds and returns what to print, the report and the witness line. It writes no file
 * and reads nothing from the process, so every mode can be tested with injected renderers.
 *
 * - No arguments: every sound, a report, output on standard output (R12).
 * - `--changed <path>`: the sounds the paths can change, no report (R13.1 to R13.4).
 * - `--hook`: the sounds named by the hook event on standard input, a witness line, findings on
 *   standard error (R13.5 to R13.9).
 */
export function runSoundRender(input: SoundRenderInput): SoundRenderResult {
  const renderers = input.renderers ?? soundRenderers;
  const parsed = parseRenderArguments(input.arguments);

  switch (parsed.mode) {
    case "invalid":
      return Object.freeze({
        exitCode: 1,
        stdoutLines: Object.freeze([]),
        stderrLines: Object.freeze([
          `${prefix} ${parsed.problem}. ${renderUsage}`,
        ]),
        report: undefined,
        witnessLine: undefined,
      });
    case "full": {
      const runs = measureSounds(soundIds, renderers);
      return Object.freeze({
        exitCode: hasFindings(runs) ? 1 : 0,
        stdoutLines: Object.freeze(checkLines(soundIds, runs)),
        stderrLines: Object.freeze([]),
        report: formatSoundReport(runs),
        witnessLine: undefined,
      });
    }
    case "changed": {
      const sounds = soundsForPaths(parsed.paths);
      if (sounds.length === 0) {
        return Object.freeze({
          exitCode: 0,
          stdoutLines: Object.freeze([
            `${prefix} ${parsed.paths.join(", ")} cannot change a sound. Nothing checked.`,
          ]),
          stderrLines: Object.freeze([]),
          report: undefined,
          witnessLine: undefined,
        });
      }
      const runs = measureSounds(sounds, renderers);
      return Object.freeze({
        exitCode: hasFindings(runs) ? 1 : 0,
        stdoutLines: Object.freeze(checkLines(sounds, runs)),
        stderrLines: Object.freeze([]),
        report: undefined,
        witnessLine: undefined,
      });
    }
    case "hook":
      return runHook(input, renderers);
  }
}
