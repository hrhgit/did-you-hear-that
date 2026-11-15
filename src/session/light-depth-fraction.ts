import type { ResultPageConfig } from "../config/result-page-config";
import { resultPageConfig } from "../config/result-page-config";
import type { VisitEarResult } from "./visit-flow-types";

/** One floor's own range: from its own loudest playable level down to the quietest playable level. */
export interface FloorScale {
  /** The loudest level the search could ask for on this floor (the room summary's `searchCapDb`). */
  readonly searchCapDb: number;
  /** The quietest level the search could ask for (`hearingMethodConfig.floorDb`, or the one saved with a visit). */
  readonly floorDb: number;
}

/** What `lightDepthFraction` reads from the config. */
export type LightDepthSettings = Pick<
  ResultPageConfig,
  | "foundLightDepthAtCapFraction"
  | "foundLightDepthAtFloorFraction"
  | "betterThanFloorLightDepthFraction"
  | "worseThanCapLightDepthFraction"
>;

function requireFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(
      `${name} must be a finite number of decibels, but got ${String(value)}.`,
    );
  }
}

/**
 * How far the light reaches into one wing, from 0 (dark) to 1 (the far wall), or null when the
 * wing is drawn hatched (result-page design.md, "How far the light reaches", D15). A found
 * threshold is placed on its own floor's range, linear in decibels from the floor's loudest
 * playable level to the quietest, and held at the ends of that range. It depends on this ear's
 * result and this floor's scale only, so deeper means a quieter sound was caught on this floor and
 * means nothing across floors. The two found ends are proposed values, not approved (Q1). A pure
 * function.
 */
export function lightDepthFraction(
  result: VisitEarResult,
  scale: FloorScale,
  settings: LightDepthSettings = resultPageConfig,
): number | null {
  switch (result.state) {
    case "found": {
      requireFinite(result.thresholdDb, "A threshold");
      requireFinite(scale.searchCapDb, "A floor's loudest level");
      requireFinite(scale.floorDb, "The quietest level");
      const spanDb = scale.searchCapDb - scale.floorDb;
      const position =
        spanDb > 0
          ? Math.min(
              1,
              Math.max(0, (scale.searchCapDb - result.thresholdDb) / spanDb),
            )
          : 1;
      return (
        settings.foundLightDepthAtCapFraction +
        (settings.foundLightDepthAtFloorFraction -
          settings.foundLightDepthAtCapFraction) *
          position
      );
    }
    case "betterThanFloor":
      return settings.betterThanFloorLightDepthFraction;
    case "worseThanCap":
      return settings.worseThanCapLightDepthFraction;
    case "unreliable":
      return null;
  }
}
