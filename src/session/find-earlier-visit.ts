import { anchorKindOf } from "./calibration-anchor";
import { sameHeadphoneNameKey } from "./canonical-headphone-name";
import type { SavedVisit, SavedVisitList } from "./result-page-types";

/** Whether a saved visit's anchor was matched to the visitor's hands, before audible-start. */
const anchoredToHands = (visit: SavedVisit): boolean =>
  anchorKindOf(visit.visitLog, visit.visitLog.calibrations.length - 1) ===
  "hands";

/**
 * The earlier visit drawn as outlines (result-page design.md, "Comparison with an earlier visit",
 * D25): the newest listed visit saved before the shown one whose headphone name is the same as
 * `typedHeadphoneName`, ignoring letter case and spacing. When `shownSavedVisitId` is null or not
 * listed, as for a live visit not saved yet, the newest listed visit with that name. Null for a
 * name with no tidy form, and null when no listed visit has the name. Visits saved with no name
 * never match, because unnamed headphones may be different headphones. The shown visit is never
 * its own earlier visit. The visit type need not be the same: floors are matched by room.
 *
 * A visit whose anchor was matched to the visitor's hands, as every visit saved before the
 * audible-start spec was, is found only for a shown visit that is listed and was anchored the same
 * way; for a live visit, which never is, and for a visit anchored with the music or the hiss, it is
 * skipped (audible-start R11.4, D26). A visit's anchor is that of its last calibration. A pure
 * function.
 */
export function findEarlierVisit(
  list: SavedVisitList,
  typedHeadphoneName: string,
  shownSavedVisitId: string | null,
): SavedVisit | null {
  const key = sameHeadphoneNameKey(typedHeadphoneName);
  if (key === null) {
    return null;
  }
  const shownIndex =
    shownSavedVisitId === null
      ? -1
      : list.visits.findIndex(
          (listing) => listing.visit.savedVisitId === shownSavedVisitId,
        );
  const shownVisit = list.visits[shownIndex]?.visit;
  const handsAllowed = shownVisit !== undefined && anchoredToHands(shownVisit);
  // list.visits is newest first, so everything after the shown visit was saved before it.
  for (const listing of list.visits.slice(shownIndex + 1)) {
    const name = listing.visit.headphoneName;
    if (
      name !== null &&
      sameHeadphoneNameKey(name) === key &&
      (handsAllowed || !anchoredToHands(listing.visit))
    ) {
      return listing.visit;
    }
  }
  return null;
}
