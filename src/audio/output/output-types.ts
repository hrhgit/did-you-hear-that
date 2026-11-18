import type { SoundId } from "../../config/sound-id";

/**
 * One ear. The engine has the same type. The output stage may not import the engine, so the type
 * is declared again here, and a type-level test in `src/session/` checks that the two are the same
 * (design.md, Types).
 */
export type Ear = "left" | "right";

/** An ear, or both ears. Only the calibration noise may be played in both ears (D21). */
export type EarChoice = Ear | "both";

/**
 * Why a sound is played. Only calibration repeats have the Purpose `calibration`. A `practice`
 * sound is held to every limit of a `trial` sound (audible-start). A `reminder` is a ghost sound
 * played after a long quiet that counts for nothing, and a `chime` the soft bell after a catch;
 * both are held to the same limits (the game layer, 2026-11-17).
 */
export type Purpose =
  | "trial"
  | "practice"
  | "replay"
  | "listening"
  | "headphoneCheck"
  | "calibration"
  | "reminder"
  | "chime";

/**
 * The limit that set the played level of a clamped sound. Only the ceiling is left: the anchor cap
 * and the rise limit were dropped from the output stage on 2026-11-17.
 */
export type ClampLimit = "ceiling";

/** Why `preparePlayback` refused a request, in the order its steps check them. */
export type PreparationRefusal =
  | "unsupportedSampleRate"
  | "emptyBuffer"
  | "notFinite"
  | "silentBuffer"
  | "invalidLevel"
  | "invalidCalibrationGain"
  | "bothEarsForGhostSound"
  | "beyondCeiling";

/** A request to `preparePlayback`. */
export interface PlaybackRequest {
  /** Mono samples. Never modified. */
  readonly samples: Float32Array;
  readonly sampleRateHz: number;
  readonly soundId: SoundId;
  readonly earChoice: EarChoice;
  readonly requestedLevelDb: number;
  readonly calibrationGain: number;
}

/** What `preparePlayback` returns: a refusal, or the two channels to play as they are. */
export type PreparedPlayback =
  | { readonly kind: "refused"; readonly reason: PreparationRefusal }
  | {
      readonly kind: "ready";
      readonly left: Float32Array;
      readonly right: Float32Array;
      readonly requestedLevelDb: number;
      readonly playedLevelDb: number;
      readonly appliedGain: number;
      readonly clampLimit: ClampLimit | null;
      /** Largest absolute sample over both channels. */
      readonly peakFraction: number;
    };

/** Why the output shell stopped all sound (D14, D18). */
export type StopReason =
  "control" | "hidden" | "pageLeft" | "deviceChanged" | "interrupted";

/** Why a device cannot carry the house (D11, D12). */
export type UnsupportedReason =
  "noWebAudio" | "sampleRateTooLow" | "monoOutput";

/** The state of the output shell (design.md, States). */
export type OutputState =
  | { readonly kind: "inactive" | "starting" | "running" }
  | { readonly kind: "stopped"; readonly reason: StopReason }
  | {
      readonly kind: "unsupported";
      readonly reason: UnsupportedReason;
      /** null when no context was created, as for `noWebAudio`. */
      readonly sampleRateHz: number | null;
    };
