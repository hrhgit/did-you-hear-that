// The vocabulary every simulated listener uses. It does not depend on the engine's types, so the
// same listeners can drive any search under test (design.md, Simulated listeners; R13.7).

export type ListenerEar = "left" | "right";

export type ListenerResponse = ListenerEar | "none";

/** What a listener is told about a trial: its kind, and for a sound its ear and level. */
export type ListenerTrial =
  | {
      readonly kind: "sound";
      readonly ear: ListenerEar;
      readonly levelDb: number;
    }
  | { readonly kind: "noSound" };

export interface SimulatedListener {
  respond(trial: ListenerTrial): ListenerResponse;
}
