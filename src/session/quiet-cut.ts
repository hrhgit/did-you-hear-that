import type { HeadphoneTraitsConfig } from "../config/headphone-traits-config";
import { headphoneTraitsConfig } from "../config/headphone-traits-config";
import type { Ear } from "../engine/search-types";
import { quantile } from "./output-delay";

export type QuietCutSettings = Pick<
  HeadphoneTraitsConfig,
  "cutWindowDb" | "cutEdgesMinCount" | "cutPitchesMinCount" | "cutSharpShareMin"
>;

/** The edge one ear's search found at one pitch (headphone-traits design.md "The quiet cut"). */
export interface FoundEdge {
  readonly roomIndex: number;
  readonly frequencyHz: number;
  readonly ear: Ear;
  /** Half way between the quietest counted catch and the loudest counted miss below it. */
  readonly edgeDb: number;
  /** Whether the quietest catch was graded Perfect or Great, after the offset. */
  readonly sharp: boolean;
  /** The room's search floor. */
  readonly floorDb: number;
}

export interface QuietCut {
  /** The median of the edges at the cut. */
  readonly levelDb: number;
  /** The edges at the cut, in the order given. */
  readonly edges: readonly FoundEdge[];
}

/**
 * A level under which the headphones or the system may play nothing: edges at several pitches
 * piled up within `cutWindowDb`, mostly sharp, above the floor, with nothing of the visit caught
 * below them. Null when there is none. A pure function.
 */
export function findQuietCut(
  edges: readonly FoundEdge[],
  quietestCatchDb: number,
  settings: QuietCutSettings = headphoneTraitsConfig,
): QuietCut | null {
  const sorted = [...edges].sort((a, b) => a.edgeDb - b.edgeDb);
  let best: FoundEdge[] = [];
  for (const [index, low] of sorted.entries()) {
    const inWindow = sorted
      .slice(index)
      .filter((edge) => edge.edgeDb <= low.edgeDb + settings.cutWindowDb);
    if (inWindow.length > best.length) {
      best = inWindow;
    }
  }
  if (best.length < settings.cutEdgesMinCount) {
    return null;
  }
  const pitches = new Set(best.map((edge) => edge.frequencyHz));
  const sharpShare = best.filter((edge) => edge.sharp).length / best.length;
  const lowDb = best[0]!.edgeDb;
  const aboveFloor = best.every((edge) => edge.edgeDb > edge.floorDb);
  if (
    pitches.size < settings.cutPitchesMinCount ||
    sharpShare < settings.cutSharpShareMin ||
    !aboveFloor ||
    quietestCatchDb < lowDb
  ) {
    return null;
  }
  const chosen = new Set(best);
  return Object.freeze({
    levelDb: quantile(
      best.map((edge) => edge.edgeDb),
      0.5,
    ),
    edges: Object.freeze(edges.filter((edge) => chosen.has(edge))),
  });
}
