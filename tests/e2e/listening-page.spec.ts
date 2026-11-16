import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { audioOutputConfig } from "../../src/config/audio-output-config";
import { audioSafetyConfig } from "../../src/config/audio-safety-config";
import { soundIds } from "../../src/config/sound-id";
import { soundRulesConfig } from "../../src/config/sound-rules-config";
import { calibrationCopy } from "../../src/copy/calibration-copy";
import {
  calibrationSettingLine,
  listeningPageCopy,
} from "../../src/copy/listening-page-copy";
import { outputStateCopy } from "../../src/copy/output-state-copy";
import type { OutputGraph } from "../../src/audio/output/output-graph";
import { devServer } from "./dev-server";

// The Browser_Suite of the audio-output spec (R21, design.md "Testing strategy"). It opens the
// listening page on the development server in headless Chromium, with probes installed before
// the page's scripts that keep a copy of every channel handed to Web Audio.

const address = `http://localhost:${devServer.port}${devServer.listeningPagePath}`;
const repositoryRoot = path.resolve(import.meta.dirname, "..", "..");

const { ceilingFraction } = audioSafetyConfig;
const {
  calibrationSettingMinDb,
  calibrationSettingKeepMinDb,
  outputFadeMs,
  stopFadeMs,
} = audioOutputConfig;
const { referenceRmsFraction } = soundRulesConfig;

/** The level tolerance of the ghost-sounds spec, the one R21.2 asks for. */
const rmsToleranceDb = 0.01;

// The headless browser is muted. The checks read what the page hands to Web Audio and what an
// offline render of the output graph produces, which muting does not change (D49).
test.use({ launchOptions: { args: ["--mute-audio"] } });

/** One buffer handed to Web Audio, summarised inside the page. */
interface ChannelSummary {
  readonly length: number;
  readonly peakAbs: number;
  readonly rms: number;
  /** Every sample is `+0`. */
  readonly allPositiveZero: boolean;
  readonly anyNotFinite: boolean;
}

interface BufferSummary {
  readonly sampleRate: number;
  readonly channels: readonly (ChannelSummary | null)[];
  /** The two channels hold the same samples. */
  readonly channelsEqual: boolean;
}

interface ProbeState {
  contexts: AudioContext[];
  contextsCreatedWithActivation: boolean[];
  buffers: { sampleRate: number; channels: (Float32Array | null)[] }[];
  bufferRecords: Map<AudioBuffer, number>;
  started: { when: number; bufferIndex: number }[];
  /**
   * The calibration music's loops as they started: the buffer and the value of the level gain the
   * loop's source is connected to (audible-start design.md, "Playing").
   */
  loops: { bufferIndex: number; levelGain: number }[];
  loopTargets: WeakMap<AudioBufferSourceNode, AudioNode>;
  endedCount: number;
  stopped: { when: number }[];
  curves: {
    first: number;
    last: number;
    length: number;
    startTime: number;
    duration: number;
  }[];
}

/**
 * Runs in the page before any of its scripts (as `page-checks.ts` does for the house). Wraps the
 * `AudioContext` constructor, `AudioBuffer.prototype.copyToChannel`, the buffer source's `start`
 * and `stop`, and `AudioParam.prototype.setValueCurveAtTime`, and keeps what each received. The
 * wrappers still do what the originals do. This function is serialised into the page, so it uses
 * nothing from the surrounding module.
 */
function installListeningProbes(): void {
  const probe: ProbeState = {
    contexts: [],
    contextsCreatedWithActivation: [],
    buffers: [],
    bufferRecords: new Map(),
    started: [],
    loops: [],
    loopTargets: new WeakMap(),
    endedCount: 0,
    stopped: [],
    curves: [],
  };
  Object.defineProperty(window, "__listeningProbe", { value: probe });

  const OriginalContext = window.AudioContext;
  window.AudioContext = new Proxy(OriginalContext, {
    construct(target, args, newTarget) {
      const context = Reflect.construct(
        target,
        args,
        newTarget,
      ) as AudioContext;
      probe.contexts.push(context);
      probe.contextsCreatedWithActivation.push(
        navigator.userActivation.isActive,
      );
      return context;
    },
  });

  const originalCopy = AudioBuffer.prototype.copyToChannel;
  AudioBuffer.prototype.copyToChannel = function (
    this: AudioBuffer,
    source: Float32Array<ArrayBuffer>,
    channelNumber: number,
    bufferOffset?: number,
  ): void {
    let index = probe.bufferRecords.get(this);
    if (index === undefined) {
      index = probe.buffers.length;
      probe.bufferRecords.set(this, index);
      probe.buffers.push({
        sampleRate: this.sampleRate,
        channels: new Array<Float32Array | null>(this.numberOfChannels).fill(
          null,
        ),
      });
    }
    const record = probe.buffers[index];
    if (record !== undefined) {
      record.channels[channelNumber] = new Float32Array(source);
    }
    originalCopy.call(this, source, channelNumber, bufferOffset);
  };

  const originalStart = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (
    this: AudioBufferSourceNode,
    when?: number,
    offset?: number,
    duration?: number,
  ): void {
    const bufferIndex =
      this.buffer === null ? -1 : (probe.bufferRecords.get(this.buffer) ?? -1);
    probe.started.push({ when: when ?? 0, bufferIndex });
    if (this.loop) {
      const target = probe.loopTargets.get(this);
      probe.loops.push({
        bufferIndex,
        levelGain: target instanceof GainNode ? target.gain.value : Number.NaN,
      });
    }
    this.addEventListener("ended", () => {
      probe.endedCount += 1;
    });
    originalStart.call(this, when, offset, duration);
  };

  // A source's first connection is to the gain that sets its level, for the music's loop.
  const originalConnect = AudioBufferSourceNode.prototype.connect as (
    this: AudioBufferSourceNode,
    destination: AudioNode,
    output?: number,
    input?: number,
  ) => AudioNode;
  AudioBufferSourceNode.prototype.connect = function (
    this: AudioBufferSourceNode,
    destination: AudioNode,
    output?: number,
    input?: number,
  ): AudioNode {
    if (!probe.loopTargets.has(this)) {
      probe.loopTargets.set(this, destination);
    }
    return originalConnect.call(this, destination, output, input);
  } as typeof AudioBufferSourceNode.prototype.connect;

  const originalStop = AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.stop = function (
    this: AudioBufferSourceNode,
    when?: number,
  ): void {
    probe.stopped.push({ when: when ?? 0 });
    originalStop.call(this, when);
  };

  const originalCurve = AudioParam.prototype.setValueCurveAtTime;
  AudioParam.prototype.setValueCurveAtTime = function (
    this: AudioParam,
    values: Iterable<number>,
    startTime: number,
    duration: number,
  ): AudioParam {
    const curve = Array.from(values);
    probe.curves.push({
      first: curve[0] ?? Number.NaN,
      last: curve[curve.length - 1] ?? Number.NaN,
      length: curve.length,
      startTime,
      duration,
    });
    return originalCurve.call(this, values, startTime, duration);
  };
}

/** Opens the listening page with the probes installed, and records uncaught errors. */
async function openListeningPage(page: Page): Promise<string[]> {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  await page.addInitScript(installListeningProbes);
  await page.goto(address, { waitUntil: "load" });
  await expect(page.locator('[data-part="stop-button"]')).toHaveText(
    outputStateCopy.stopButton,
  );
  return pageErrors;
}

const part = (page: Page, name: string) =>
  page.locator(`[data-part="${name}"]`);

/** Summarises every buffer handed to Web Audio, inside the page. */
async function bufferSummaries(page: Page): Promise<BufferSummary[]> {
  return page.evaluate(() => {
    const probe = (window as unknown as { __listeningProbe: ProbeState })
      .__listeningProbe;
    const summarise = (channel: Float32Array | null): ChannelSummary | null => {
      if (channel === null) {
        return null;
      }
      let peakAbs = 0;
      let sumOfSquares = 0;
      let allPositiveZero = true;
      let anyNotFinite = false;
      for (const sample of channel) {
        if (!Number.isFinite(sample)) {
          anyNotFinite = true;
        }
        peakAbs = Math.max(peakAbs, Math.abs(sample));
        sumOfSquares += sample * sample;
        if (!Object.is(sample, 0)) {
          allPositiveZero = false;
        }
      }
      return {
        length: channel.length,
        peakAbs,
        rms: Math.sqrt(sumOfSquares / Math.max(1, channel.length)),
        allPositiveZero,
        anyNotFinite,
      };
    };
    return probe.buffers.map((buffer) => {
      const [left, right] = buffer.channels;
      const channelsEqual =
        left !== null &&
        left !== undefined &&
        right !== null &&
        right !== undefined &&
        left.length === right.length &&
        left.every((sample, index) => Object.is(sample, right[index]));
      return {
        sampleRate: buffer.sampleRate,
        channels: buffer.channels.map(summarise),
        channelsEqual,
      };
    });
  });
}

async function probeCounts(page: Page) {
  return page.evaluate(() => {
    const probe = (window as unknown as { __listeningProbe: ProbeState })
      .__listeningProbe;
    return {
      contexts: probe.contexts.length,
      contextsCreatedWithActivation: [...probe.contextsCreatedWithActivation],
      contextStates: probe.contexts.map((context) => context.state),
      buffers: probe.buffers.length,
      started: probe.started.length,
      loops: [...probe.loops],
      ended: probe.endedCount,
      stopped: [...probe.stopped],
      curves: [...probe.curves],
      currentTime: probe.contexts[0]?.currentTime ?? Number.NaN,
    };
  });
}

/** Waits until every source that started has ended. */
async function waitForSilence(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const probe = (window as unknown as { __listeningProbe: ProbeState })
      .__listeningProbe;
    return probe.started.length === probe.endedCount;
  });
}

/** Waits until at least `count` sources have started. */
async function waitForStarts(page: Page, count: number): Promise<void> {
  await page.waitForFunction(
    (expected) =>
      (window as unknown as { __listeningProbe: ProbeState }).__listeningProbe
        .started.length >= expected,
    count,
  );
}

async function pressStart(page: Page): Promise<void> {
  await part(page, "start-button").click();
  await expect(part(page, "sample-rate")).toBeVisible();
}

/** Calibrates up to the Keep_Minimum with the Louder button and keeps it. */
async function calibrateAndKeep(page: Page): Promise<void> {
  await part(page, "calibration-start").click();
  for (
    let press = 0;
    press < calibrationSettingKeepMinDb - calibrationSettingMinDb;
    press += 1
  ) {
    await part(page, "louder").click();
  }
  await expect(part(page, "played-setting")).toHaveText(
    calibrationSettingLine(calibrationSettingKeepMinDb),
    { timeout: 20_000 },
  );
  await part(page, "keep").click();
  await expect(part(page, "calibration-line")).toHaveText(
    calibrationCopy.keptLine,
  );
  await waitForSilence(page);
}

/** Simulates the page becoming hidden or visible, as a tab switch does. */
async function setVisibility(
  page: Page,
  state: "hidden" | "visible",
): Promise<void> {
  await page.evaluate((visibility) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => visibility === "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

const rmsDifferenceDb = (rms: number, expectedRms: number): number =>
  Math.abs(20 * Math.log10(rms / expectedRms));

test.describe(`listening page on the development server (${address})`, () => {
  test("creates no audio context before Start and exactly one inside its press (R21.1)", async ({
    page,
  }) => {
    const pageErrors = await openListeningPage(page);
    await expect(
      page.getByRole("heading", { level: 1, name: listeningPageCopy.header }),
    ).toBeVisible();
    await expect(part(page, "stop-button")).toBeVisible();
    await page.waitForTimeout(500);
    expect(await probeCounts(page)).toMatchObject({
      contexts: 0,
      buffers: 0,
      started: 0,
    });

    await pressStart(page);
    const counts = await probeCounts(page);
    expect(counts.contexts).toBe(1);
    expect(counts.contextsCreatedWithActivation).toEqual([true]);
    expect(counts.contextStates).toEqual(["running"]);
    expect(counts.started).toBe(0);
    expect(pageErrors).toEqual([]);
  });

  test("hands Web Audio only buffers within the ceiling, the first the calibration music at the bottom of the control, one-ear sounds with an exactly silent other channel (R21.2)", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const pageErrors = await openListeningPage(page);
    await pressStart(page);
    await calibrateAndKeep(page);

    const beforeCheck = (await probeCounts(page)).started;
    await part(page, "check-play").click();
    await waitForStarts(page, beforeCheck + 1);
    await waitForSilence(page);

    const expectedSides: ("left" | "right")[] = ["left"];
    for (const soundId of soundIds) {
      for (const ear of ["left", "right"] as const) {
        const before = (await probeCounts(page)).started;
        await part(page, `row-${soundId}`)
          .locator(`[data-part="play-${ear}"]`)
          .click();
        await waitForStarts(page, before + 1);
        await waitForSilence(page);
        expectedSides.push(ear);
      }
    }

    // The stop control stays at the top of the window at every scroll position (R14.8).
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    const stopBox = await part(page, "stop-button").boundingBox();
    expect(stopBox?.y ?? Number.NaN).toBeLessThan(40);
    await expect(part(page, "stop-button")).toBeInViewport();

    const buffers = await bufferSummaries(page);
    const counts = await probeCounts(page);
    expect(counts.contexts).toBe(1);
    expect(counts.started).toBe(buffers.length);
    const contextRate = await page.evaluate(
      () =>
        (window as unknown as { __listeningProbe: ProbeState }).__listeningProbe
          .contexts[0]?.sampleRate,
    );

    // The first buffer is the calibration music's loop, in both ears, starting at the bottom of
    // the control: the music is handed over as it is, and its level gain brings its RMS there
    // (audible-start Q34, "Playing").
    const first = buffers[0];
    expect(first?.channelsEqual).toBe(true);
    expect(counts.loops).toHaveLength(1);
    expectLoopAtBottom(buffers, counts.loops[0]);

    // No sample that reaches the ears is beyond the ceiling; every buffer is at the context's
    // rate. The music's loop is handed over as it was decoded and its level gain sets what plays,
    // so its peak is checked as it plays, through that gain. Its fade in only rises from 0 to 1.
    // Every other buffer is checked as it is handed over.
    const loopGains = new Map(
      counts.loops.map((loop) => [loop.bufferIndex, loop.levelGain]),
    );
    for (const [index, buffer] of buffers.entries()) {
      expect(buffer.sampleRate, `buffer ${index}`).toBe(contextRate);
      expect(buffer.channels, `buffer ${index}`).toHaveLength(2);
      const playedGain = loopGains.get(index) ?? 1;
      for (const channel of buffer.channels) {
        expect(channel?.anyNotFinite, `buffer ${index}`).toBe(false);
        expect(
          (channel?.peakAbs ?? Number.NaN) * playedGain,
          `buffer ${index}`,
        ).toBeLessThanOrEqual(ceilingFraction);
      }
    }

    // The music's loop comes first, in both ears, and is the only such buffer; then the one-ear
    // sounds, in order.
    const oneEar = buffers.filter((buffer) => !buffer.channelsEqual);
    const calibration = buffers.slice(0, buffers.length - oneEar.length);
    expect(calibration).toHaveLength(1);
    for (const sound of calibration) {
      expect(sound.channelsEqual).toBe(true);
      expect(sound.channels[0]?.allPositiveZero).toBe(false);
    }
    expect(oneEar).toHaveLength(expectedSides.length);
    for (const [index, buffer] of oneEar.entries()) {
      const [left, right] = buffer.channels;
      const side = expectedSides[index];
      const played = side === "left" ? left : right;
      const other = side === "left" ? right : left;
      expect(played?.allPositiveZero, `one-ear sound ${index}, ${side}`).toBe(
        false,
      );
      expect(other?.allPositiveZero, `one-ear sound ${index}, ${side}`).toBe(
        true,
      );
      expect(other?.length).toBe(played?.length);
    }
    expect(pageErrors).toEqual([]);
  });

  test("renders a left-only and a right-only buffer on their own channel, and a stop to exact zero within the stop fade (R21.3)", async ({
    page,
  }) => {
    await openListeningPage(page);
    await page.addScriptTag({
      type: "module",
      content: [
        'import { createOutputGraph } from "/src/audio/output/output-graph.ts";',
        "window.__createOutputGraph = createOutputGraph;",
      ].join("\n"),
    });
    await page.waitForFunction(() => "__createOutputGraph" in window);

    const results = await page.evaluate(
      async ({ stopFadeS }) => {
        const createGraph = (
          window as unknown as {
            __createOutputGraph: (context: BaseAudioContext) => OutputGraph;
          }
        ).__createOutputGraph;
        const rate = 48000;
        const tone = (length: number): Float32Array => {
          const samples = new Float32Array(length);
          const fadeLength = Math.round(0.025 * rate);
          for (let n = 0; n < length; n += 1) {
            const fadeIn = Math.min(1, n / fadeLength);
            const fadeOut = Math.min(1, (length - 1 - n) / fadeLength);
            samples[n] =
              0.2 * Math.sin((2 * Math.PI * 440 * n) / rate) * fadeIn * fadeOut;
          }
          return samples;
        };
        const routing = async (side: "left" | "right") => {
          const length = Math.round(0.5 * rate);
          const context = new OfflineAudioContext({
            numberOfChannels: 2,
            length: length + rate / 10,
            sampleRate: rate,
          });
          const graph = createGraph(context);
          const signal = tone(length);
          const silence = new Float32Array(length);
          graph.play(
            side === "left" ? signal : silence,
            side === "left" ? silence : signal,
            rate,
            0,
          );
          const rendered = await context.startRendering();
          const played = rendered.getChannelData(side === "left" ? 0 : 1);
          const other = rendered.getChannelData(side === "left" ? 1 : 0);
          let largestDifference = 0;
          for (let n = 0; n < length; n += 1) {
            largestDifference = Math.max(
              largestDifference,
              Math.abs((played[n] ?? 0) - (signal[n] ?? 0)),
            );
          }
          return {
            largestDifference,
            playedPeak: Math.max(...Array.from(played, Math.abs)),
            otherAllZero: other.every((sample) => sample === 0),
          };
        };
        const stop = async () => {
          const length = rate;
          const context = new OfflineAudioContext({
            numberOfChannels: 2,
            length,
            sampleRate: rate,
          });
          const graph = createGraph(context);
          const signal = tone(length);
          graph.play(signal, signal, rate, 0);
          let fadeStartS = Number.NaN;
          void context.suspend(0.5).then(() => {
            fadeStartS = context.currentTime;
            graph.fadeToSilence(stopFadeS);
            void context.resume();
          });
          const rendered = await context.startRendering();
          const fadeStart = Math.round(fadeStartS * rate);
          const silentFrom = Math.ceil((fadeStartS + stopFadeS) * rate);
          const channels = [
            rendered.getChannelData(0),
            rendered.getChannelData(1),
          ];
          let beforeDifference = 0;
          let rose = false;
          let notZeroAfter = 0;
          for (const channel of channels) {
            for (let n = 0; n < fadeStart; n += 1) {
              beforeDifference = Math.max(
                beforeDifference,
                Math.abs((channel[n] ?? 0) - (signal[n] ?? 0)),
              );
            }
            let previousRatio = 1;
            for (let n = fadeStart; n < silentFrom; n += 1) {
              const input = signal[n] ?? 0;
              if (Math.abs(input) > 1e-3) {
                const ratio = (channel[n] ?? 0) / input;
                if (ratio > previousRatio + 1e-6 || ratio < -1e-6) {
                  rose = true;
                }
                previousRatio = ratio;
              }
            }
            for (let n = silentFrom; n < length; n += 1) {
              if (channel[n] !== 0) {
                notZeroAfter += 1;
              }
            }
          }
          return {
            fadeStartS,
            silentFrom,
            beforeDifference,
            rose,
            notZeroAfter,
            liveSources: graph.liveSourceCount(),
          };
        };
        return {
          left: await routing("left"),
          right: await routing("right"),
          stop: await stop(),
        };
      },
      { stopFadeS: stopFadeMs / 1000 },
    );

    for (const side of ["left", "right"] as const) {
      expect(results[side].largestDifference, side).toBe(0);
      expect(results[side].playedPeak, side).toBeGreaterThan(0.1);
      expect(results[side].otherAllZero, side).toBe(true);
    }
    expect(results.stop.fadeStartS).toBeGreaterThan(0.49);
    expect(results.stop.beforeDifference).toBe(0);
    expect(results.stop.rose).toBe(false);
    expect(results.stop.notZeroAfter).toBe(0);
    expect(results.stop.liveSources).toBe(0);
  });

  test("stops all sound with the stop control, and starts nothing until Start is pressed again (R21.4)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const pageErrors = await openListeningPage(page);
    await pressStart(page);
    await part(page, "calibration-start").click();
    await waitForStarts(page, 1);

    const timeAtStop = (await probeCounts(page)).currentTime;
    await part(page, "stop-button").click();
    await expect(part(page, "stop-line")).toHaveText(
      outputStateCopy.stoppedLines.control,
    );
    await expectStopped(page, timeAtStop);

    await part(page, "start-again-button").click();
    await expect(part(page, "start-again-button")).toBeHidden();
    await page.waitForTimeout(2_000);
    const afterRestart = await probeCounts(page);
    expect(afterRestart.contexts).toBe(1);
    expect(afterRestart.contextStates).toEqual(["running"]);
    expect(afterRestart.started).toBe(1);

    await part(page, "calibration-start").click();
    await waitForStarts(page, 2);
    // The calibration starts again at the bottom of the control.
    const buffers = await bufferSummaries(page);
    const { loops } = await probeCounts(page);
    expect(loops).toHaveLength(2);
    expectLoopAtBottom(buffers, loops[1]);
    expect(pageErrors).toEqual([]);
  });

  test("stops all sound when the page is hidden, and starts nothing until Start is pressed again (R21.4)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const pageErrors = await openListeningPage(page);
    await pressStart(page);
    await part(page, "calibration-start").click();
    await waitForStarts(page, 1);

    const timeAtStop = (await probeCounts(page)).currentTime;
    await setVisibility(page, "hidden");
    await expect(part(page, "stop-line")).toHaveText(
      outputStateCopy.stoppedLines.hidden,
    );
    await expectStopped(page, timeAtStop);

    await setVisibility(page, "visible");
    await page.waitForTimeout(2_000);
    expect((await probeCounts(page)).started).toBe(1);

    await part(page, "start-again-button").click();
    await part(page, "calibration-start").click();
    await waitForStarts(page, 2);
    expect(pageErrors).toEqual([]);
  });

  test("leaves the listening page out of the built site (R21.5)", () => {
    const distDirectory = path.join(repositoryRoot, "dist");
    const files = readdirSync(distDirectory, {
      recursive: true,
      withFileTypes: true,
    })
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(entry.parentPath, entry.name));
    expect(files.length).toBeGreaterThan(0);
    const contents = files.map((file) => ({
      file: path.relative(repositoryRoot, file),
      text: readFileSync(file, "utf8"),
    }));
    const distinctiveStrings = [
      "listen.html",
      "createFakeAudioBackend",
      "createListeningPageSession",
      "renderListeningPage",
      ...Object.values(listeningPageCopy).filter((text) => text.length >= 12),
    ];
    expect(distinctiveStrings).toContain(listeningPageCopy.header);
    for (const { file, text } of contents) {
      expect(path.basename(file)).not.toBe("listen.html");
      for (const needle of distinctiveStrings) {
        expect(text.includes(needle), `${needle} in ${file}`).toBe(false);
      }
    }
  });
});

/**
 * Checks that a loop of the calibration music starts at the bottom of the control: its buffer
 * holds the music in both ears, and its RMS times its level gain is the RMS of the bottom setting,
 * to the tolerance of R21.2.
 */
function expectLoopAtBottom(
  buffers: readonly BufferSummary[],
  loop: { bufferIndex: number; levelGain: number } | undefined,
): void {
  expect(loop).toBeDefined();
  const buffer = buffers[loop?.bufferIndex ?? -1];
  expect(buffer?.channelsEqual).toBe(true);
  const levelGain = loop?.levelGain ?? Number.NaN;
  expect(levelGain).toBeGreaterThan(0);
  const expectedRms =
    referenceRmsFraction * 10 ** (calibrationSettingMinDb / 20);
  for (const channel of buffer?.channels ?? []) {
    expect(
      rmsDifferenceDb((channel?.rms ?? 0) * levelGain, expectedRms),
    ).toBeLessThanOrEqual(rmsToleranceDb);
  }
}

/**
 * Checks what a stop did to the live page: one stop fade from 1 to exactly 0 over `stopFadeMs`,
 * every source stopped by the end of the fade, the context suspended, and no new source for a
 * while. The calibration music's loop has its own fade in from exact zero to 1 over
 * `outputFadeMs`; it is the only other curve, and it never raises the stop gain.
 */
async function expectStopped(page: Page, timeAtStop: number): Promise<void> {
  await page.waitForFunction(
    () =>
      (window as unknown as { __listeningProbe: ProbeState }).__listeningProbe
        .contexts[0]?.state === "suspended",
  );
  const counts = await probeCounts(page);
  const fadeIns = counts.curves.filter(
    (curve) => curve.first === 0 && curve.last === 1,
  );
  expect(fadeIns).toHaveLength(counts.loops.length);
  for (const fadeIn of fadeIns) {
    expect(fadeIn.duration).toBeCloseTo(outputFadeMs / 1000, 9);
  }
  const stops = counts.curves.filter((curve) => !fadeIns.includes(curve));
  expect(stops).toHaveLength(1);
  const [curve] = stops;
  expect(curve?.first).toBe(1);
  expect(curve?.last).toBe(0);
  expect(curve?.duration).toBeCloseTo(stopFadeMs / 1000, 9);
  expect(curve?.startTime ?? Number.NaN).toBeGreaterThanOrEqual(timeAtStop);
  expect(counts.stopped.length).toBeGreaterThanOrEqual(1);
  for (const { when } of counts.stopped) {
    expect(when).toBeCloseTo(
      (curve?.startTime ?? 0) + (curve?.duration ?? 0),
      9,
    );
  }
  expect(counts.started).toBe(1);
  await page.waitForTimeout(3_000);
  expect((await probeCounts(page)).started).toBe(1);
  await expect(part(page, "start-again-button")).toBeVisible();
}
