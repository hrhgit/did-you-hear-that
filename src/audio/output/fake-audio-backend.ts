import type {
  AudioBackend,
  BackendEvent,
  DecodedCalibrationMusic,
  ScheduledChannels,
  TimestampPair,
} from "./audio-backend";

/**
 * One call of the calibration music's loop, with the audio clock time it was made at
 * (audible-start design.md, "Testing the music under Node").
 */
export type FakeLoopCall =
  | {
      readonly kind: "startLoop";
      readonly left: Float32Array;
      readonly right: Float32Array;
      readonly sampleRateHz: number;
      readonly startMs: number;
      readonly levelGain: number;
      readonly fadeInMs: number;
      readonly atMs: number;
    }
  | {
      readonly kind: "rampLoopLevel";
      readonly levelGain: number;
      readonly startMs: number;
      readonly endMs: number;
      readonly atMs: number;
    }
  | {
      readonly kind: "stopLoop";
      readonly fadeOutMs: number;
      readonly atMs: number;
    };

/** One call the shell made to the fake backend, in the order made. */
export type FakeBackendCall =
  | { readonly kind: "createOrResume" }
  | {
      readonly kind: "schedule";
      readonly left: Float32Array;
      readonly right: Float32Array;
      readonly sampleRateHz: number;
      readonly startMs: number;
    }
  | { readonly kind: "fadeToSilence"; readonly durationMs: number }
  | { readonly kind: "suspend" }
  | { readonly kind: "close" }
  | FakeLoopCall;

/**
 * The loop's calls and every `fadeToSilence`, each with its audio clock time, in order: what a
 * test needs to rebuild the music's gain over time.
 */
export type FakeLoopTimelineEntry =
  | FakeLoopCall
  | {
      readonly kind: "fadeToSilence";
      readonly durationMs: number;
      readonly atMs: number;
    };

/**
 * How `loadCalibrationMusic` answers: with the given samples, by rejecting, as a failed fetch or
 * decoding does, or not at all until the test calls `resolveCalibrationMusic` or
 * `rejectCalibrationMusic`. The default is `reject`: a fake has no music file unless a test gives
 * it one, and the shell then uses the hiss.
 */
export type FakeCalibrationMusicLoad =
  | {
      readonly mode: "resolve";
      readonly samples: Float32Array;
      /** The rate of the samples; the fake context's rate by default. */
      readonly sampleRateHz?: number;
    }
  | { readonly mode: "reject" }
  | { readonly mode: "pending" };

/** One call of `loadCalibrationMusic`. */
export interface FakeMusicLoadCall {
  readonly filePath: string;
  readonly atMs: number;
}

/** The state of the fake context. `none` until the first `createOrResume`. */
export type FakeContextState = "none" | "running" | "suspended" | "closed";

/**
 * How `whenRunning` settles: at once, only when the test calls `settleRunning`, or by
 * rejecting, as a `resume()` that fails does.
 */
export type FakeRunningMode = "immediate" | "manual" | "reject";

export interface FakeAudioBackendOptions {
  readonly hasWebAudio?: boolean;
  readonly userActivationActive?: boolean | null;
  readonly sampleRateHz?: number;
  readonly outputChannelCountMax?: number;
  readonly runningMode?: FakeRunningMode;
  /** The audio clock when the fake is created. */
  readonly startMs?: number;
  /** How far the page clock is ahead of the audio clock in `timestampPair`. */
  readonly performanceOffsetMs?: number;
  /** How `loadCalibrationMusic` answers; `reject` by default. */
  readonly calibrationMusic?: FakeCalibrationMusicLoad;
}

export interface FakeAudioBackend extends AudioBackend {
  /** Every call, in order. */
  readonly calls: readonly FakeBackendCall[];
  /** The `schedule` calls only, in order. */
  scheduled(): readonly Extract<FakeBackendCall, { kind: "schedule" }>[];
  /** How many contexts `createOrResume` has created. */
  contextCount(): number;
  contextState(): FakeContextState;
  setUserActivationActive(value: boolean | null): void;
  setRunningMode(mode: FakeRunningMode): void;
  /** Settles every pending `whenRunning` as the mode in force says, `manual` meaning resolve. */
  settleRunning(): void;
  /** Moves the audio clock forward. */
  advanceClockBy(durationMs: number): void;
  /** Delivers an event to every registered listener. */
  fire(event: BackendEvent): void;
  /** Every call of `loadCalibrationMusic`, in order. They are not in `calls`. */
  musicLoads(): readonly FakeMusicLoadCall[];
  /** The loop's calls and every `fadeToSilence`, with their audio clock times, in order. */
  loopTimeline(): readonly FakeLoopTimelineEntry[];
  /** Sets how later calls of `loadCalibrationMusic` answer. */
  setCalibrationMusic(load: FakeCalibrationMusicLoad): void;
  /** Resolves every pending load with these samples, at the fake context's rate by default. */
  resolveCalibrationMusic(samples: Float32Array, sampleRateHz?: number): void;
  /** Rejects every pending load. */
  rejectCalibrationMusic(): void;
}

/**
 * An `AudioBackend` for tests under Node (design.md, "The fake backend"). It records every call,
 * has a settable sample rate, channel count, activation flag and audio clock, and lets a test fire
 * any backend event. Its calibration music is what the test gives it, resolved, rejected or left
 * pending, and its loop calls are recorded with their audio clock times (audible-start
 * design.md, "Testing the music under Node"). Production code never imports it, and the final task checks that the built
 * site does not contain it.
 */
export function createFakeAudioBackend(
  options: FakeAudioBackendOptions = {},
): FakeAudioBackend {
  const calls: FakeBackendCall[] = [];
  const listeners = new Set<(event: BackendEvent) => void>();
  const pending: { resolve: () => void; reject: (error: Error) => void }[] = [];
  const performanceOffsetMs = options.performanceOffsetMs ?? 1000;
  let userActivation: boolean | null =
    options.userActivationActive === undefined
      ? true
      : options.userActivationActive;
  let runningMode: FakeRunningMode = options.runningMode ?? "immediate";
  let clockMs = options.startMs ?? 0;
  let state: FakeContextState = "none";
  let createdCount = 0;
  let musicLoad: FakeCalibrationMusicLoad = options.calibrationMusic ?? {
    mode: "reject",
  };
  const musicLoadCalls: FakeMusicLoadCall[] = [];
  const pendingMusicLoads: {
    resolve: (music: DecodedCalibrationMusic) => void;
    reject: (error: Error) => void;
  }[] = [];
  const timeline: FakeLoopTimelineEntry[] = [];
  const contextRateHz = (): number => options.sampleRateHz ?? 48000;

  const recordLoopCall = (call: FakeLoopCall): void => {
    calls.push(call);
    timeline.push(call);
  };

  const hasContext = (): boolean =>
    state === "running" || state === "suspended";

  const settle = (entry: (typeof pending)[number]): void => {
    if (runningMode === "reject") {
      entry.reject(new Error("The fake context could not be resumed."));
    } else {
      state = "running";
      entry.resolve();
    }
  };

  return {
    calls,
    scheduled: () =>
      calls.filter(
        (call): call is Extract<FakeBackendCall, { kind: "schedule" }> =>
          call.kind === "schedule",
      ),
    contextCount: () => createdCount,
    contextState: () => state,
    setUserActivationActive(value) {
      userActivation = value;
    },
    setRunningMode(mode) {
      runningMode = mode;
    },
    settleRunning() {
      for (const entry of pending.splice(0)) {
        settle(entry);
      }
    },
    advanceClockBy(durationMs) {
      if (!Number.isFinite(durationMs) || durationMs < 0) {
        throw new RangeError(
          `A duration must be a finite number of 0 or more, but got ${String(durationMs)}.`,
        );
      }
      clockMs += durationMs;
    },
    fire(event) {
      for (const listener of [...listeners]) {
        listener(event);
      }
    },
    musicLoads: () => Object.freeze([...musicLoadCalls]),
    loopTimeline: () => Object.freeze([...timeline]),
    setCalibrationMusic(load) {
      musicLoad = load;
    },
    resolveCalibrationMusic(samples, sampleRateHz) {
      const music = Object.freeze({
        samples,
        sampleRateHz: sampleRateHz ?? contextRateHz(),
      });
      for (const entry of pendingMusicLoads.splice(0)) {
        entry.resolve(music);
      }
    },
    rejectCalibrationMusic() {
      for (const entry of pendingMusicLoads.splice(0)) {
        entry.reject(new Error("The fake calibration music failed to load."));
      }
    },

    hasWebAudio: () => options.hasWebAudio ?? true,
    userActivationActive: () => userActivation,
    createOrResume() {
      calls.push(Object.freeze({ kind: "createOrResume" }));
      if (!hasContext()) {
        createdCount += 1;
      }
      // A new context starts suspended until whenRunning settles, as a resumed one does.
      state = "suspended";
    },
    whenRunning() {
      return new Promise<void>((resolve, reject) => {
        const entry = { resolve, reject };
        if (runningMode === "manual") {
          pending.push(entry);
        } else {
          settle(entry);
        }
      });
    },
    sampleRateHz: () => (hasContext() ? contextRateHz() : Number.NaN),
    outputChannelCountMax: () =>
      hasContext() ? (options.outputChannelCountMax ?? 2) : 0,
    currentTimeMs: () => (hasContext() ? clockMs : 0),
    timestampPair: (): TimestampPair | null =>
      hasContext()
        ? Object.freeze({
            audioClockMs: clockMs,
            performanceMs: clockMs + performanceOffsetMs,
          })
        : null,
    schedule(channels: ScheduledChannels, startMs: number) {
      calls.push(
        Object.freeze({
          kind: "schedule",
          left: channels.left,
          right: channels.right,
          sampleRateHz: channels.sampleRateHz,
          startMs,
        }),
      );
    },
    fadeToSilence(durationMs) {
      calls.push(Object.freeze({ kind: "fadeToSilence", durationMs }));
      timeline.push(
        Object.freeze({ kind: "fadeToSilence", durationMs, atMs: clockMs }),
      );
    },
    loadCalibrationMusic(filePath) {
      musicLoadCalls.push(Object.freeze({ filePath, atMs: clockMs }));
      if (!hasContext()) {
        return Promise.reject(new Error("No audio context has been created."));
      }
      const load = musicLoad;
      if (load.mode === "resolve") {
        return Promise.resolve(
          Object.freeze({
            samples: load.samples,
            sampleRateHz: load.sampleRateHz ?? contextRateHz(),
          }),
        );
      }
      if (load.mode === "reject") {
        return Promise.reject(
          new Error("The fake calibration music failed to load."),
        );
      }
      return new Promise<DecodedCalibrationMusic>((resolve, reject) => {
        pendingMusicLoads.push({ resolve, reject });
      });
    },
    startLoop(channels: ScheduledChannels, startMs, levelGain, fadeInMs) {
      recordLoopCall(
        Object.freeze({
          kind: "startLoop",
          left: channels.left,
          right: channels.right,
          sampleRateHz: channels.sampleRateHz,
          startMs,
          levelGain,
          fadeInMs,
          atMs: clockMs,
        }),
      );
    },
    rampLoopLevel(levelGain, startMs, endMs) {
      recordLoopCall(
        Object.freeze({
          kind: "rampLoopLevel",
          levelGain,
          startMs,
          endMs,
          atMs: clockMs,
        }),
      );
    },
    stopLoop(fadeOutMs) {
      recordLoopCall(
        Object.freeze({ kind: "stopLoop", fadeOutMs, atMs: clockMs }),
      );
    },
    suspend() {
      calls.push(Object.freeze({ kind: "suspend" }));
      if (state === "running") {
        state = "suspended";
      }
    },
    close() {
      calls.push(Object.freeze({ kind: "close" }));
      if (hasContext()) {
        state = "closed";
      }
    },
    onEvent(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
