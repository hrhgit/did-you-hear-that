import { ESLint, type Linter } from "eslint";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "..", "..");
const linter = new ESLint({ cwd: repositoryRoot });

const restrictionRuleIds = new Set([
  "no-restricted-globals",
  "no-restricted-properties",
  "no-restricted-syntax",
  "@typescript-eslint/no-restricted-types",
]);

async function restrictionMessages(
  probeFile: string,
  code: string,
): Promise<Linter.LintMessage[]> {
  const [result] = await linter.lintText(code, {
    filePath: path.join(repositoryRoot, probeFile),
  });
  if (result === undefined) {
    throw new Error("ESLint returned no result");
  }
  expect(result.messages.filter((message) => message.fatal === true)).toEqual(
    [],
  );
  return result.messages.filter(
    (message) =>
      message.ruleId !== null && restrictionRuleIds.has(message.ruleId),
  );
}

interface Case {
  /** What is used, for the test name. */
  use: string;
  code: string;
}

const globalObjects = ["window", "globalThis", "self"];

// The names below are copied from design.md, "Sound API rule and injection rule", so that a name
// dropped from the configuration fails here.
const soundGlobals = [
  "AudioContext",
  "webkitAudioContext",
  "OfflineAudioContext",
  "AudioBuffer",
  "AudioBufferSourceNode",
  "AudioWorkletNode",
  "OscillatorNode",
  "GainNode",
  "MediaElementAudioSourceNode",
  "MediaStreamAudioSourceNode",
  "Audio",
  "speechSynthesis",
  "SpeechSynthesisUtterance",
];
const soundGlobalProperties = [
  "AudioContext",
  "webkitAudioContext",
  "OfflineAudioContext",
  "Audio",
  "speechSynthesis",
];
const soundTypes = [
  "AudioContext",
  "BaseAudioContext",
  "OfflineAudioContext",
  "AudioNode",
  "AudioBuffer",
  "AudioBufferSourceNode",
  "AudioDestinationNode",
  "AudioParam",
  "AudioWorkletNode",
  "GainNode",
  "OscillatorNode",
  "StereoPannerNode",
  "PannerNode",
  "ChannelMergerNode",
  "ChannelSplitterNode",
  "MediaElementAudioSourceNode",
  "HTMLAudioElement",
];

const soundCases: Case[] = [
  ...soundGlobals.map((name) => ({
    use: `the global ${name}`,
    code: `export const probe = ${name};\n`,
  })),
  ...globalObjects.flatMap((object) =>
    soundGlobalProperties.map((property) => ({
      use: `${object}.${property}`,
      code: `export const probe = ${object}.${property};\n`,
    })),
  ),
  ...soundTypes.map((name) => ({
    use: `the type ${name}`,
    code: `export type Probe = ${name};\n`,
  })),
  { use: "new Audio()", code: "export const probe = new Audio();\n" },
  ...["audio", "video", "VIDEO"].map((tag) => ({
    use: `createElement("${tag}")`,
    code: `export const probe = document.createElement("${tag}");\n`,
  })),
];

const timerGlobals = [
  "setTimeout",
  "setInterval",
  "clearTimeout",
  "clearInterval",
  "requestAnimationFrame",
];

const clockCases: Case[] = [
  { use: "Date.now", code: "export const probe = Date.now();\n" },
  { use: "performance.now", code: "export const probe = performance.now();\n" },
  { use: "new Date()", code: "export const probe = new Date();\n" },
  { use: "Date()", code: "export const probe = Date();\n" },
  { use: "Date(0)", code: "export const probe = Date(0);\n" },
  ...timerGlobals.map((name) => ({
    use: `the global ${name}`,
    code: `export const probe = ${name};\n`,
  })),
  ...globalObjects.flatMap((object) =>
    timerGlobals.map((name) => ({
      use: `${object}.${name}`,
      code: `export const probe = ${object}.${name};\n`,
    })),
  ),
];

const randomCases: Case[] = [
  { use: "Math.random", code: "export const probe = Math.random();\n" },
  {
    use: "a destructured Math.random",
    code: "export const { random } = Math;\n",
  },
];

describe("sound API rule", () => {
  it.each(soundCases)(
    "reports $use outside src/audio/output",
    async ({ code }) => {
      for (const probeFile of [
        "src/ui/probe.ts",
        "src/config/probe.ts",
        "src/engine/probe.ts",
      ]) {
        const messages = await restrictionMessages(probeFile, code);
        expect(messages.length, probeFile).toBeGreaterThan(0);
        expect(messages[0]?.message).toContain("audio-safety rule 1");
      }
    },
  );

  it.each(soundCases)("allows $use in src/audio/output", async ({ code }) => {
    expect(
      await restrictionMessages("src/audio/output/probe.ts", code),
    ).toEqual([]);
  });
});

describe("clock and timer rule", () => {
  it.each(clockCases)(
    "reports $use in src/engine, src/audio/synth and src/session",
    async ({ code }) => {
      for (const probeFile of [
        "src/engine/probe.ts",
        "src/audio/synth/probe.ts",
        "src/session/probe.ts",
      ]) {
        const messages = await restrictionMessages(probeFile, code);
        expect(messages.length, probeFile).toBeGreaterThan(0);
        expect(messages[0]?.message).toContain("tech.md");
      }
    },
  );

  it.each(clockCases)("allows $use in src/ui", async ({ code }) => {
    expect(await restrictionMessages("src/ui/probe.ts", code)).toEqual([]);
  });

  it("allows new Date(ms) in src/engine, so a given time can be formatted", async () => {
    expect(
      await restrictionMessages(
        "src/engine/probe.ts",
        "export const probe = (ms: number) => new Date(ms);\n",
      ),
    ).toEqual([]);
  });
});

describe("Math.random rule", () => {
  it.each(randomCases)(
    "reports $use in every part of src",
    async ({ code }) => {
      for (const probeFile of [
        "src/config/probe.ts",
        "src/audio/output/probe.ts",
        "src/engine/probe.ts",
        "src/ui/probe.ts",
        "src/main.ts",
      ]) {
        const messages = await restrictionMessages(probeFile, code);
        expect(messages.length, probeFile).toBeGreaterThan(0);
        expect(messages[0]?.message).toContain("tech.md");
      }
    },
  );

  it.each(randomCases)("allows $use in tests", async ({ code }) => {
    expect(await restrictionMessages("tests/probe.test.ts", code)).toEqual([]);
  });
});

describe("merged blocks", () => {
  it("reports all three bans in one file in src/session, so no block overrides another", async () => {
    const messages = await restrictionMessages(
      "src/session/probe.ts",
      [
        "export const a = Math.random();",
        "export const b = new AudioContext();",
        "export const c = Date.now();",
        "export type D = GainNode;",
        'export const e = document.createElement("audio");',
        "export const f = new Date();",
        "",
      ].join("\n"),
    );
    expect(messages.map((message) => message.line).sort()).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });
});
