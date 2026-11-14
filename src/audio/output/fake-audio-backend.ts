import type {
  AudioBackend,
  BackendEvent,
  ScheduledChannels,
  TimestampPair,
} from "./audio-backend";

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
  | { readonly kind: "close" };

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
}

/**
 * An `AudioBackend` for tests under Node (design.md, "The fake backend"). It records every call,
 * has a settable sample rate, channel count, activation flag and audio clock, and lets a test fire
 * any backend event. Production code never imports it, and the final task checks that the built
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
    sampleRateHz: () =>
      hasContext() ? (options.sampleRateHz ?? 48000) : Number.NaN,
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
