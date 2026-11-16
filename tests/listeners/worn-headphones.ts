import type {
  ListenerEar,
  ListenerResponse,
  SimulatedListener,
} from "./listener-types";

// Worn_Headphones (swapped-repeat design.md, "What tests/listeners gains", R21.1). The listener's
// own threshold is per ear; the output plays per earpiece. A sound on an earpiece reaches the ear
// that earpiece sits on, made quieter by that earpiece's share of the imbalance.

/** What a listener wearing headphones is told about a trial: for a sound, the earpiece it played in and its level. */
export type WornTrial =
  | {
      readonly kind: "sound";
      readonly earpiece: ListenerEar;
      readonly levelDb: number;
    }
  | { readonly kind: "noSound" };

/** How the listener wears the headphones. */
export interface WornHeadphonesOptions {
  /**
   * Headphone_Imbalance: how much quieter the right earpiece plays than the left, in dB. The left
   * earpiece plays H/2 louder and the right H/2 quieter than asked.
   */
  readonly imbalanceDb: number;
  /**
   * For each ear, the earpiece on it. Read at every call, so the holder of this object may
   * replace it when the listener swaps the headphones or turns them back.
   */
  earpieceOnEar: Readonly<Record<ListenerEar, ListenerEar>>;
}

const ears: readonly ListenerEar[] = Object.freeze(["left", "right"]);

/** Half of the imbalance goes to each earpiece. */
const shareOfEachEarpiece = 0.5;

/** The ear the earpiece sits on. Throws a `RangeError` unless each earpiece sits on exactly one ear. */
function earUnder(
  earpieceOnEar: Readonly<Record<ListenerEar, ListenerEar>>,
  earpiece: ListenerEar,
): ListenerEar {
  const under = ears.filter((ear) => earpieceOnEar[ear] === earpiece);
  if (under.length !== 1 || earpieceOnEar.left === earpieceOnEar.right) {
    throw new RangeError(
      `Each earpiece must sit on exactly one ear, but got ${JSON.stringify(earpieceOnEar)}.`,
    );
  }
  return under[0] as ListenerEar;
}

/**
 * A listener wearing headphones: answers a sound on an earpiece at a level as `listener` answers
 * that sound on the ear the earpiece sits on, at the level lowered by the earpiece's share of the
 * imbalance (−H/2 on the left earpiece, +H/2 on the right). A no-sound trial goes to the listener
 * unchanged. `options.earpieceOnEar` is read at every call.
 */
export function wornHeadphones(
  listener: SimulatedListener,
  options: WornHeadphonesOptions,
): (trial: WornTrial) => ListenerResponse {
  if (!Number.isFinite(options.imbalanceDb)) {
    throw new RangeError(
      `An imbalance must be a finite number of decibels, but got ${String(options.imbalanceDb)}.`,
    );
  }
  return (trial) => {
    if (trial.kind === "noSound") {
      return listener.respond({ kind: "noSound" });
    }
    const ear = earUnder(options.earpieceOnEar, trial.earpiece);
    const loweredByDb =
      (trial.earpiece === "left" ? -1 : 1) *
      options.imbalanceDb *
      shareOfEachEarpiece;
    return listener.respond({
      kind: "sound",
      ear,
      levelDb: trial.levelDb - loweredByDb,
    });
  };
}
