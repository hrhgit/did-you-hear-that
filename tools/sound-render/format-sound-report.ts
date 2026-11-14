import type {
  RuleName,
  SoundMeasurement,
} from "../../src/audio/synth/measure/measurement-types";
import { audioSafetyConfig } from "../../src/config/audio-safety-config";
import { ghostSoundIds } from "../../src/config/sound-id";
import { soundRulesConfig } from "../../src/config/sound-rules-config";
import type { SoundRun } from "./measure-sounds";
import { reportSampleRatesHz, reportSeeds } from "./measure-sounds";

/** The order and the words for each rule, as the report and the printed lines show them. */
export const ruleLabels: Readonly<Record<RuleName, string>> = Object.freeze({
  band: "band",
  fadeIn: "fade in",
  fadeOut: "fade out",
  duration: "duration",
  level: "level",
  peak: "peak",
  calibrationShape: "calibration shape",
});

const ruleOrder = Object.keys(ruleLabels) as RuleName[];

/** "44100 Hz and 48000 Hz", from the tool's constants. */
export function reportRatesText(): string {
  return reportSampleRatesHz.map((rate) => `${rate} Hz`).join(" and ");
}

/** "seeds 1 to 10", from the tool's constants. */
export function reportSeedsText(): string {
  return `seeds ${reportSeeds[0]} to ${reportSeeds[reportSeeds.length - 1]}`;
}

/**
 * A number with a fixed count of decimals, so the report changes only when a sound changes. A
 * value that rounds to zero is shown without a minus sign. NaN and the infinities get words.
 */
export function formatFixed(value: number, decimals: number): string {
  if (Number.isNaN(value)) {
    return "not a number";
  }
  if (value === Number.POSITIVE_INFINITY) {
    return "+infinity";
  }
  if (value === Number.NEGATIVE_INFINITY) {
    return "-infinity";
  }
  const text = value.toFixed(decimals);
  return /^-0\.?0*$/.test(text) ? text.slice(1) : text;
}

/** "1/3" for a unit fraction, otherwise the number itself. */
function octaveFractionText(fraction: number): string {
  const denominator = Math.round(1 / fraction);
  return Math.abs(1 / denominator - fraction) < 1e-12
    ? `1/${denominator}`
    : String(fraction);
}

interface Worst {
  readonly value: number;
  readonly seed: number;
}

/**
 * The worst value over the runs and the seed that gave it, the first such seed on a tie. A NaN
 * counts as worse than any number, because it breaks its rule (D33).
 */
function worstOf(
  runs: readonly SoundRun[],
  valueOf: (run: SoundRun) => number | null,
  isWorse: (candidate: number, current: number) => boolean,
): Worst | null {
  let worst: Worst | null = null;
  for (const run of runs) {
    const value = valueOf(run);
    if (value === null) {
      continue;
    }
    if (
      worst === null ||
      (Number.isNaN(value) && !Number.isNaN(worst.value)) ||
      (!Number.isNaN(worst.value) && isWorse(value, worst.value))
    ) {
      worst = { value, seed: run.seed };
    }
  }
  return worst;
}

const lower = (candidate: number, current: number) => candidate < current;
const higher = (candidate: number, current: number) => candidate > current;
const fartherFromZero = (candidate: number, current: number) =>
  Math.abs(candidate) > Math.abs(current);

function cell(worst: Worst | null, format: (value: number) => string): string {
  if (worst === null) {
    return "n/a";
  }
  // A NaN gets no unit: "not a number (3)", not "not a number ms (3)".
  const text = Number.isNaN(worst.value)
    ? formatFixed(worst.value, 0)
    : format(worst.value);
  return `${text} (${worst.seed})`;
}

/** "meets every rule", or the rules broken and the seeds whose renderer threw. */
function rulesCell(runs: readonly SoundRun[]): string {
  const broken = new Set(
    runs.flatMap((run) => run.brokenRules.map((rule) => rule.rule)),
  );
  const thrownSeeds = runs
    .filter((run) => run.errorMessage !== null)
    .map((run) => run.seed);
  const parts: string[] = [];
  if (broken.size > 0) {
    parts.push(
      `breaks: ${ruleOrder
        .filter((rule) => broken.has(rule))
        .map((rule) => ruleLabels[rule])
        .join(", ")}`,
    );
  }
  if (thrownSeeds.length > 0) {
    parts.push(
      `the renderer threw at ${thrownSeeds.length === 1 ? "seed" : "seeds"} ${thrownSeeds.join(", ")}`,
    );
  }
  return parts.length === 0 ? "meets every rule" : parts.join("; ");
}

function resultRow(runs: readonly SoundRun[]): string {
  const { soundId, sampleRateHz } = runs[0];
  const measured =
    (pick: (measurement: SoundMeasurement) => number | null) =>
    (run: SoundRun) =>
      run.measurement === null ? null : pick(run.measurement);
  const cells = [
    soundId,
    String(sampleRateHz),
    cell(
      worstOf(
        runs,
        measured((measurement) => measurement.inBandShareFraction),
        lower,
      ),
      (value) => `${formatFixed(value * 100, 2)} %`,
    ),
    cell(
      worstOf(
        runs,
        measured((measurement) => measurement.outOfBandRatioDb),
        higher,
      ),
      (value) => `${formatFixed(value, 1)} dB`,
    ),
    cell(
      worstOf(
        runs,
        measured((measurement) => measurement.fadeInMs),
        lower,
      ),
      (value) => `${formatFixed(value, 1)} ms`,
    ),
    cell(
      worstOf(
        runs,
        measured((measurement) => measurement.fadeOutMs),
        lower,
      ),
      (value) => `${formatFixed(value, 1)} ms`,
    ),
    cell(
      worstOf(
        runs,
        measured((measurement) => measurement.durationMs),
        higher,
      ),
      (value) => `${formatFixed(value, 1)} ms`,
    ),
    cell(
      worstOf(
        runs,
        measured((measurement) => measurement.levelDeviationDb),
        fartherFromZero,
      ),
      (value) => `${formatFixed(value, 3)} dB`,
    ),
    cell(
      worstOf(
        runs,
        measured((measurement) => measurement.peakFraction),
        higher,
      ),
      (value) => formatFixed(value, 3),
    ),
    cell(
      worstOf(
        runs,
        measured((measurement) => measurement.crestFactorDb),
        higher,
      ),
      (value) => `${formatFixed(value, 1)} dB`,
    ),
    cell(
      worstOf(
        runs,
        measured((measurement) => measurement.calibrationShapeDistanceMaxDb),
        higher,
      ),
      (value) => `${formatFixed(value, 1)} dB`,
    ),
    rulesCell(runs),
  ];
  return `| ${cells.join(" | ")} |`;
}

/** The runs grouped by sound and rate, in the order the runs come in. */
function groupBySoundAndRate(runs: readonly SoundRun[]): SoundRun[][] {
  const groups = new Map<string, SoundRun[]>();
  for (const run of runs) {
    const key = `${run.soundId} ${run.sampleRateHz}`;
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [run]);
    } else {
      group.push(run);
    }
  }
  return [...groups.values()];
}

/** One line per broken rule or thrown error, in the words the tool prints. */
export function findingDescriptions(runs: readonly SoundRun[]): string[] {
  return runs.flatMap((run) => {
    const where = `${run.soundId} at ${run.sampleRateHz} Hz, seed ${run.seed}`;
    if (run.errorMessage !== null) {
      return [
        `${where}: the renderer threw an error: ${run.errorMessage.replace(/\.+$/, "")}`,
      ];
    }
    return run.brokenRules.map((rule) => `${where}: ${rule.description}`);
  });
}

/**
 * Builds `docs/reports/sounds.md` from the runs of a full render (R12.2, R12.3, D16, D22): the
 * rules and their limits, one row per sound and rate with the worst value of each measure and the
 * seed that gave it, the rules each row breaks, and notes. It holds no date or anything else that
 * changes between runs of the same code.
 */
export function formatSoundReport(runs: readonly SoundRun[]): string {
  const { fadeMinMs, ghostSoundMaxDurationMs } = audioSafetyConfig;
  const {
    bandWidthOctaveFraction,
    outOfBandBelowInBandMinDb,
    referenceRmsFraction,
    levelToleranceDb,
    calibrationShapeDb,
    calibrationShapeToleranceDb,
  } = soundRulesConfig;
  const shapeText = ghostSoundIds
    .map((id) => `${id} ${formatFixed(calibrationShapeDb[id], 0)}`)
    .join(", ");

  const findings = findingDescriptions(runs);
  const lines = [
    "# Ghost sounds report",
    "",
    `Written by \`npm run render:sounds\`. Do not edit by hand. Each sound is rendered at ${reportRatesText()} with ${reportSeedsText()}, and each row shows the worst value over those seeds, with the seed in brackets. The property tests check the same rules for random seeds.`,
    "",
    "## Rules",
    "",
    "| Rule | Limit | Source |",
    "| --- | --- | --- |",
    `| Band | out-of-band energy at least ${outOfBandBelowInBandMinDb} dB below in-band energy, band ${octaveFractionText(bandWidthOctaveFraction)} of an octave around the room's pitch | Brief 02, D2, D3 |`,
    `| Fade | at least ${fadeMinMs} ms in and out, first and last sample exactly zero | audio-safety.md, rule 3; D4 |`,
    `| Duration | at most ${ghostSoundMaxDurationMs} ms, the calibration noise included | audio-safety.md, rule 6; D8 |`,
    `| Level | RMS within ${levelToleranceDb} dB of ${referenceRmsFraction} of full scale | Brief 02, D7 |`,
    "| Peak | below full scale | D7 |",
    `| Calibration shape | each room band within ${calibrationShapeToleranceDb} dB of the configured shape (${shapeText} dB, relative to the loudest room band) | D8 |`,
    "",
    "## Results",
    "",
    "| Sound | Rate | In-band share | Out-of-band | Fade in | Fade out | Duration | Level | Peak | Crest factor | Shape | Rules |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...groupBySoundAndRate(runs).map(resultRow),
    "",
    "Worst means the lowest value for the in-band share and the fades, the value farthest from zero for the level, and the highest value for the others. The level is the RMS in dB relative to the reference RMS. The shape is the largest distance of a room band from the configured shape. n/a marks a measure that does not apply to the sound, or a row whose renderer threw at every seed.",
    "",
  ];
  if (findings.length > 0) {
    lines.push(
      "## Broken rules",
      "",
      ...findings.map((finding) => `- ${finding}.`),
      "",
    );
  }
  lines.push(
    "## Notes",
    "",
    "- The calibration shape is a starting guess with no measured source. It is tuned by ear later.",
    "- Crest factor has no limit here. It decides how close a sound can come to the absolute ceiling, which the audio-output spec enforces.",
    "- Nothing in this report says how loud a sound is at the ear. Levels are relative to full scale.",
    "",
  );
  return lines.join("\n");
}
