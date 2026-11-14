import type {
  AudioBackend,
  BackendEvent,
  ScheduledChannels,
  TimestampPair,
} from "./audio-backend";
import type { OutputGraph } from "./output-graph";
import { createOutputGraph } from "./output-graph";

/** The browser window the backend is built from. */
export type BrowserWindow = Window & typeof globalThis;

/** Safari's audio session, where the browser offers it (D24). */
interface NavigatorWithAudioSession {
  readonly audioSession?: { type: string };
}

/** The context state the backend last asked for. Any other state but running is an interruption. */
type RequestedState = "running" | "suspended" | "closed";

/**
 * The `AudioBackend` for the browser (design.md, "The backend"). With the output graph it builds,
 * it is the only code that touches Web Audio (D3).
 *
 * It creates the `AudioContext` without asking for a sample rate, so the context runs at the
 * device's rate (D11), and it turns the page's events into the backend events of R14.3 to R14.6:
 * `visibilitychange` to hidden gives `hidden`, `pagehide` gives `pageLeft`, the media devices'
 * `devicechange` gives `deviceChanged`, and a context that leaves the running state without
 * being asked to gives `interrupted`.
 */
export function createWebAudioBackend(
  browserWindow: BrowserWindow,
): AudioBackend {
  const { document, navigator, performance } = browserWindow;
  const listeners = new Set<(event: BackendEvent) => void>();
  let context: AudioContext | null = null;
  let graph: OutputGraph | null = null;
  let requestedState: RequestedState = "running";
  let resumeAttempt: Promise<void> | null = null;

  const fire = (event: BackendEvent): void => {
    for (const listener of [...listeners]) {
      listener(event);
    }
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      fire("hidden");
    }
  });
  browserWindow.addEventListener("pagehide", () => {
    fire("pageLeft");
  });
  const mediaDevices = navigator.mediaDevices as MediaDevices | undefined;
  if (typeof mediaDevices?.addEventListener === "function") {
    mediaDevices.addEventListener("devicechange", () => {
      fire("deviceChanged");
    });
  }

  const createContext = (): AudioContext => {
    const audioSession = (navigator as NavigatorWithAudioSession).audioSession;
    if (audioSession !== undefined) {
      try {
        audioSession.type = "playback";
      } catch {
        // A browser that refuses the type keeps its own; the house plays as it would without it.
      }
    }
    // No options: the context runs at the device's own rate (D11).
    const created = new browserWindow.AudioContext();
    created.addEventListener("statechange", () => {
      if (created !== context) {
        return;
      }
      const state: string = created.state;
      if (state !== "running" && state !== requestedState) {
        fire("interrupted");
      }
    });
    return created;
  };

  const backend: AudioBackend = {
    hasWebAudio: () => typeof browserWindow.AudioContext === "function",

    userActivationActive: () =>
      (navigator.userActivation as UserActivation | undefined)?.isActive ??
      null,

    createOrResume() {
      requestedState = "running";
      if (context === null) {
        context = createContext();
        graph = createOutputGraph(context);
        resumeAttempt = context.state === "running" ? null : context.resume();
      } else {
        resumeAttempt = context.resume();
      }
      // whenRunning reports a failed resume. This keeps it from also counting as unhandled.
      resumeAttempt?.catch(() => undefined);
    },

    whenRunning() {
      const current = context;
      if (current === null) {
        return Promise.reject(new Error("No audio context has been created."));
      }
      if (current.state === "running") {
        return Promise.resolve();
      }
      const attempt = resumeAttempt;
      return new Promise<void>((resolve, reject) => {
        const finish = (outcome: () => void): void => {
          current.removeEventListener("statechange", onStateChange);
          outcome();
        };
        const onStateChange = (): void => {
          const state: string = current.state;
          if (state === "running") {
            finish(resolve);
          } else if (state === "closed") {
            finish(() => reject(new Error("The audio context was closed.")));
          }
        };
        current.addEventListener("statechange", onStateChange);
        attempt?.then(
          () => {
            if (current.state === "running") {
              finish(resolve);
            }
          },
          (error: unknown) => {
            finish(() => reject(error));
          },
        );
      });
    },

    sampleRateHz: () => (context === null ? Number.NaN : context.sampleRate),

    outputChannelCountMax: () =>
      context === null ? 0 : context.destination.maxChannelCount,

    currentTimeMs: () => (context === null ? 0 : context.currentTime * 1000),

    timestampPair(): TimestampPair | null {
      if (context === null) {
        return null;
      }
      // Where the browser reports when sound leaves the device, that includes output latency.
      const stamp =
        typeof context.getOutputTimestamp === "function"
          ? context.getOutputTimestamp()
          : null;
      if (
        stamp !== null &&
        typeof stamp.contextTime === "number" &&
        typeof stamp.performanceTime === "number" &&
        Number.isFinite(stamp.contextTime) &&
        Number.isFinite(stamp.performanceTime) &&
        stamp.performanceTime > 0
      ) {
        return Object.freeze({
          audioClockMs: stamp.contextTime * 1000,
          performanceMs: stamp.performanceTime,
        });
      }
      return Object.freeze({
        audioClockMs: context.currentTime * 1000,
        performanceMs: performance.now(),
      });
    },

    schedule(channels: ScheduledChannels, startMs: number) {
      graph?.play(
        channels.left,
        channels.right,
        channels.sampleRateHz,
        startMs / 1000,
      );
    },

    fadeToSilence(durationMs) {
      graph?.fadeToSilence(durationMs / 1000);
    },

    suspend() {
      if (context === null) {
        return;
      }
      requestedState = "suspended";
      context.suspend().catch(() => undefined);
    },

    close() {
      if (context === null) {
        return;
      }
      requestedState = "closed";
      const closing = context;
      context = null;
      graph = null;
      resumeAttempt = null;
      closing.close().catch(() => undefined);
    },

    onEvent(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return Object.freeze(backend);
}
