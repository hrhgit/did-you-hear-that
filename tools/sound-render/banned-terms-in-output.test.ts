import { describe, expect, it } from "vitest";
import { bannedTerms } from "../../src/config/banned-terms";
import { findBannedTerms } from "../../src/copy/find-banned-terms";
import { runSoundRender } from "../run-sound-render";
import type { Renderers } from "./injected-renderers";
import { formatSoundReport } from "./format-sound-report";
import {
  bandBreakingRenderers,
  everyBrokenRuleRenderers,
  fadeSkippingRenderers,
  goodRenderers,
  throwingRenderers,
} from "./injected-renderers";
import { measureSounds } from "./measure-sounds";

// The report and every line the render tool prints avoid the banned terms of wording.md (R12.7,
// D22).

const atticEvent = JSON.stringify({ path: "src/audio/synth/attic-whine.ts" });

function outputOf(
  args: readonly string[],
  renderers: Renderers,
  hookInput?: string,
): string[] {
  const result = runSoundRender({
    arguments: args,
    hookInput,
    nowIso: "2026-11-20T10:00:00.000Z",
    witnessLogPath: "/tmp/did-you-hear-that-hook-runs.log",
    renderers,
  });
  return [
    ...result.stdoutLines,
    ...result.stderrLines,
    ...(result.report === undefined ? [] : [result.report]),
  ];
}

/** Every mode with renderers that meet every rule. */
function everyModeOutput(): string[] {
  return [
    ...outputOf([], goodRenderers),
    ...outputOf(["--changed", "src/audio/synth/attic-whine.ts"], goodRenderers),
    ...outputOf(["--changed", "src/ui/base.css"], goodRenderers),
    ...outputOf(["--changed"], goodRenderers),
    ...outputOf(["--unknown"], goodRenderers),
    ...outputOf(["--hook"], goodRenderers, atticEvent),
    ...outputOf(["--hook"], fadeSkippingRenderers, atticEvent),
  ];
}

/**
 * The lines for every broken rule. One ghost sound and the calibration noise are enough, because
 * the lines of the other ghost sounds differ only in the sound id.
 */
function everyBrokenRuleOutput(): string[] {
  return everyBrokenRuleRenderers.flatMap((renderers) =>
    outputOf(
      [
        "--changed",
        "src/audio/synth/cellar-knock.ts",
        "--changed",
        "src/audio/synth/calibration-hiss.ts",
      ],
      renderers,
    ),
  );
}

function hookReasonLines(): string[] {
  return [
    undefined,
    "",
    "not json",
    "{}",
    '{"path":"mysrc/audio/synth/x"}',
  ].flatMap((hookInput) => {
    const result = runSoundRender({
      arguments: ["--hook"],
      hookInput,
      nowIso: "2026-11-20T10:00:00.000Z",
      witnessLogPath: "/tmp/did-you-hear-that-hook-runs.log",
      renderers: throwingRenderers,
    });
    return [...result.stdoutLines, ...result.stderrLines];
  });
}

describe("banned terms in the render tool's output", () => {
  it("finds none in the report built from the real sounds or in the real run's lines", () => {
    const result = runSoundRender({
      arguments: [],
      hookInput: undefined,
      nowIso: "2026-11-20T10:00:00.000Z",
      witnessLogPath: "/tmp/did-you-hear-that-hook-runs.log",
    });
    expect(result.report).toBeDefined();
    expect(findBannedTerms(result.report ?? "", bannedTerms)).toEqual([]);
    expect(findBannedTerms(result.stdoutLines.join("\n"), bannedTerms)).toEqual(
      [],
    );
  }, 120_000);

  it("finds none in any line the tool can print, including every broken-rule description", () => {
    const brokenReport = formatSoundReport(
      measureSounds(["cellar", "calibration"], bandBreakingRenderers),
    );
    expect(brokenReport).toContain("breaks: band");
    const lines = [
      ...everyModeOutput(),
      ...everyBrokenRuleOutput(),
      ...hookReasonLines(),
      brokenReport,
    ];
    expect(findBannedTerms(lines.join("\n"), bannedTerms)).toEqual([]);

    // The renderer sets reach the description of every rule, so the scan covers all of them.
    for (const fragment of [
      // band
      "out-of-band energy",
      "no in-band energy",
      // fadeIn and fadeOut
      "first sample",
      "last sample",
      "fade in ",
      "fade out ",
      // duration
      "duration ",
      // level
      "the buffer is silent",
      "RMS ",
      // peak
      "peak ",
      // calibrationShape
      "calibration shape off by",
      // values and the tool's own lines
      "not a number",
      "the renderer threw an error",
      "cannot change a sound",
      "usage:",
      "so every sound is checked",
      "witness log",
      "Witness log",
      "every rule met",
    ]) {
      expect(
        lines.some((line) => line.includes(fragment)),
        fragment,
      ).toBe(true);
    }
  }, 120_000);
});
