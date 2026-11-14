/**
 * Builds the flat-config blocks that confine sound-producing APIs to `src/audio/output` and keep
 * randomness and clock reads injected (design.md, D7 and D8).
 *
 * `no-restricted-globals`, `no-restricted-properties`, `no-restricted-syntax` and
 * `@typescript-eslint/no-restricted-types` each take one option list per file. A later block that
 * sets the same rule for the same file replaces the earlier list, so this builds one block per
 * file group with the lists already merged. The file groups do not overlap.
 */

const soundRule =
  "Sound leaves the product only through src/audio/output (audio-safety rule 1, structure.md).";
const randomRule =
  "Randomness is always injected. Take a RandomSource from src/config/seeded-random (tech.md, Testing rules).";
const clockRule =
  "Time is always injected. Take a Timer from src/config/timer (tech.md, Testing rules).";
const typeImportRule =
  "Use `import type` for a relative module, so the import boundary rule can check it (structure.md, Dependency rules).";

/** The objects through which a browser global can also be reached as a property. */
const globalObjects = Object.freeze(["window", "globalThis", "self"]);

/** @typedef {{ name: string, message: string }} RestrictedGlobal */
/** @typedef {{ object: string, property: string, message: string }} RestrictedProperty */
/** @typedef {{ selector: string, message: string }} RestrictedSyntax */
/** @typedef {Record<string, { message: string }>} RestrictedTypes */

/**
 * @typedef {object} Restriction
 * @property {RestrictedGlobal[]} globals
 * @property {RestrictedProperty[]} properties
 * @property {RestrictedSyntax[]} syntax
 * @property {RestrictedTypes} types
 */

/** Names that can make sound without the output stage. */
const soundApiNames = Object.freeze({
  globals: Object.freeze([
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
  ]),
  globalProperties: Object.freeze([
    "AudioContext",
    "webkitAudioContext",
    "OfflineAudioContext",
    "Audio",
    "speechSynthesis",
  ]),
  types: Object.freeze([
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
  ]),
  mediaElements: Object.freeze(["audio", "video"]),
});

/** Names that read the clock or schedule work without the injected timer. */
const clockNames = Object.freeze({
  properties: Object.freeze([
    Object.freeze({ object: "Date", property: "now" }),
    Object.freeze({ object: "performance", property: "now" }),
  ]),
  timerGlobals: Object.freeze([
    "setTimeout",
    "setInterval",
    "clearTimeout",
    "clearInterval",
    "requestAnimationFrame",
  ]),
});

/** @returns {Restriction} */
function soundApiRestriction() {
  return {
    globals: soundApiNames.globals.map((name) => ({
      name,
      message: soundRule,
    })),
    properties: globalObjects.flatMap((object) =>
      soundApiNames.globalProperties.map((property) => ({
        object,
        property,
        message: soundRule,
      })),
    ),
    syntax: [
      {
        selector: `CallExpression[callee.property.name='createElement'][arguments.0.value=/^(${soundApiNames.mediaElements.join("|")})$/i]`,
        message: soundRule,
      },
    ],
    types: Object.fromEntries(
      soundApiNames.types.map((name) => [name, { message: soundRule }]),
    ),
  };
}

/** @returns {Restriction} */
function randomRestriction() {
  return {
    globals: [],
    properties: [{ object: "Math", property: "random", message: randomRule }],
    syntax: [],
    types: {},
  };
}

/** @returns {Restriction} */
function clockRestriction() {
  return {
    globals: clockNames.timerGlobals.map((name) => ({
      name,
      message: clockRule,
    })),
    properties: [
      ...clockNames.properties.map(({ object, property }) => ({
        object,
        property,
        message: clockRule,
      })),
      ...globalObjects.flatMap((object) =>
        clockNames.timerGlobals.map((property) => ({
          object,
          property,
          message: clockRule,
        })),
      ),
    ],
    syntax: [
      {
        selector: "NewExpression[callee.name='Date'][arguments.length=0]",
        message: clockRule,
      },
      { selector: "CallExpression[callee.name='Date']", message: clockRule },
    ],
    types: {},
  };
}

/**
 * `typeof import("../x")` in a type position is an import that `import-x/no-restricted-paths`
 * does not visit, so relative type imports of that form are banned everywhere.
 *
 * @returns {Restriction}
 */
function typeImportRestriction() {
  return {
    globals: [],
    properties: [],
    syntax: [
      {
        selector: "TSImportType[source.value=/^\\./]",
        message: typeImportRule,
      },
    ],
    types: {},
  };
}

/**
 * @param {string[]} files
 * @param {string[]} ignores
 * @param {Restriction[]} restrictions
 * @returns {import("eslint").Linter.Config}
 */
function block(files, ignores, restrictions) {
  /** @type {import("eslint").Linter.RulesRecord} */
  const rules = {};
  const globals = restrictions.flatMap((restriction) => restriction.globals);
  const properties = restrictions.flatMap(
    (restriction) => restriction.properties,
  );
  const syntax = restrictions.flatMap((restriction) => restriction.syntax);
  const types = Object.assign(
    {},
    ...restrictions.map((restriction) => restriction.types),
  );
  if (globals.length > 0) {
    rules["no-restricted-globals"] = ["error", ...globals];
  }
  if (properties.length > 0) {
    rules["no-restricted-properties"] = ["error", ...properties];
  }
  if (syntax.length > 0) {
    rules["no-restricted-syntax"] = ["error", ...syntax];
  }
  if (Object.keys(types).length > 0) {
    rules["@typescript-eslint/no-restricted-types"] = ["error", { types }];
  }
  return ignores.length > 0 ? { files, ignores, rules } : { files, rules };
}

const outputFiles = ["src/audio/output/**"];
const injectedTimeFiles = [
  "src/engine/**",
  "src/audio/synth/**",
  "src/session/**",
];

/**
 * Returns one block per file group:
 *
 * | File group                                       | Math.random | Sound API | Clock |
 * | src/audio/output                                 | banned      | allowed   | allowed |
 * | src/engine, src/audio/synth, src/session         | banned      | banned    | banned |
 * | every other file under src                       | banned      | banned    | allowed |
 * | every file outside src                           | allowed     | allowed   | allowed |
 *
 * Every group also bans relative `typeof import()` types.
 *
 * @returns {import("eslint").Linter.Config[]}
 */
export function createSourceRestrictionConfigs() {
  return [
    block(outputFiles, [], [randomRestriction(), typeImportRestriction()]),
    block(
      injectedTimeFiles,
      [],
      [
        randomRestriction(),
        soundApiRestriction(),
        clockRestriction(),
        typeImportRestriction(),
      ],
    ),
    block(
      ["src/**"],
      [...outputFiles, ...injectedTimeFiles],
      [randomRestriction(), soundApiRestriction(), typeImportRestriction()],
    ),
    block(
      ["**/*.ts", "**/*.mts", "**/*.cts"],
      ["src/**"],
      [typeImportRestriction()],
    ),
  ];
}
