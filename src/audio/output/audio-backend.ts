import type { StopReason } from "./output-types";

/**
 * Something the browser reports that stops all sound (R14.3 to R14.6). The fifth stop reason,
 * `control`, comes from the session through `stopAll`, never from the backend.
 */
export type BackendEvent = Exclude<StopReason, "control">;

/** The two channels of one sound, as `preparePlayback` returned them, at the context's rate. */
export interface ScheduledChannels {
  readonly left: Float32Array;
  readonly right: Float32Array;
  readonly sampleRateHz: number;
}

/** An audio clock time and a page clock time read together (R13.2, D17). */
export interface TimestampPair {
  readonly audioClockMs: number;
  readonly performanceMs: number;
}

/**
 * What the output shell needs from the browser (design.md, "The output shell", D3). It names no
 * Web Audio type, so the shell runs under Node with the fake backend in its place.
 *
 * Before `createOrResume` has created a context, and after `close`, the methods that act on the
 * context do nothing, and the ones that read it return the values given below.
 */
export interface AudioBackend {
  /** Whether the browser offers Web Audio at all. */
  hasWebAudio(): boolean;
  /** Whether a user activation is active, or null where the browser cannot tell (D23). */
  userActivationActive(): boolean | null;
  /**
   * Creates the context the first time, and again after `close`. Resumes it otherwise. Called
   * only inside the shell's `activate`, synchronously (R4.1, R4.2).
   */
  createOrResume(): void;
  /** Resolves when the context is running. Rejects if resuming it fails. */
  whenRunning(): Promise<void>;
  /** The context's sample rate, or NaN with no context. */
  sampleRateHz(): number;
  /** The most channels the destination can carry, or 0 with no context. */
  outputChannelCountMax(): number;
  /** The audio clock in milliseconds, or 0 with no context. */
  currentTimeMs(): number;
  /** The two clocks read together, or null with no context. */
  timestampPair(): TimestampPair | null;
  /** Plays the two channels as they are, starting at `startMs` on the audio clock. */
  schedule(channels: ScheduledChannels, startMs: number): void;
  /**
   * Fades every channel to exact zero over `durationMs` with a raised cosine, from now, and stops
   * every source at the end of the fade (R10.6, D14).
   */
  fadeToSilence(durationMs: number): void;
  /** Suspends the context. A change of state the shell asked for is not an `interrupted` event. */
  suspend(): void;
  /** Closes the context. A change of state the shell asked for is not an `interrupted` event. */
  close(): void;
  /** Registers the listener for every backend event. Returns the function that removes it. */
  onEvent(listener: (event: BackendEvent) => void): () => void;
}
