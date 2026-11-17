/**
 * Every fixed string of the result page (result-page design.md, "`src/copy/result-page-copy.ts`").
 * `headphonesLabel` is shown before the visitor's own name for the headphones, in an element of
 * its own; `unnamedHeadphonesLabel` stands in for a visit saved without one. The name itself never
 * enters a string of the house (D11).
 */
export const resultPageCopy = Object.freeze({
  heading: "The quietest sounds you caught",
  leftLabel: "Left",
  rightLabel: "Right",
  differenceHeading: "Left and right",
  visitNoticeHeading: "This whole visit is unreliable",
  swappedRepeatButton: "Swap the headphones and visit this room again",
  savePictureButton: "Save picture",
  pictureNotSavedLine: "The picture could not be saved just now. Try again.",
  headphoneNameLabel: "Name your headphones. You may leave this empty.",
  saveButton: "Save this visit in this browser",
  notSavedLine:
    "This visit is not saved. If you leave without saving it, nothing from it is kept.",
  savedLine: "Saved in this browser. Nothing has left it.",
  renamedLine: "The name of the headphones was changed.",
  mayBeClearedLine:
    "A browser can clear what is saved in it on its own, so a saved visit may not stay forever.",
  savedVisitsHeading: "Visits saved in this browser",
  noSavedVisitsLine: "No visits are saved in this browser.",
  headphonesLabel: "Headphones",
  unnamedHeadphonesLabel: "Not named",
  showButton: "Show its picture",
  backToThisVisitButton: "Back to this visit",
  deleteButton: "Delete",
  deleteAllButton: "Delete all saved visits",
  deleteAllQuestion: "Delete every saved visit? This cannot be undone.",
  deleteAllConfirmButton: "Delete them all",
  deleteAllCancelButton: "Keep them",
  deletedLine: "The visit was deleted.",
  allDeletedLine: "Every saved visit was deleted.",
  unavailableListLine:
    "This browser does not let the house keep visits, so none can be saved or shown here.",
  unreadableListLine:
    "The visits saved in this browser could not be read. Delete them all to save new ones.",
  robotModeLine: "Robot mode keeps nothing in this browser.",
});

/**
 * The score of the chase on the result page (the game layer of 2026-11-16). Not part of the
 * result page's design, so it stands apart from `resultPageCopy`.
 */
export const chaseScoreCopy = Object.freeze({
  heading: "Your chase",
});

function requireWholeCount(count: number, what: string): void {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(
      `${what} must be a whole number from 0 up, but got ${String(count)}.`,
    );
  }
}

/** The sounds caught in the whole visit: "23 caught in all". */
export function totalCaughtLine(count: number): string {
  requireWholeCount(count, "The sounds caught");
  return count === 1 ? "1 caught in all" : `${String(count)} caught in all`;
}

/** The longest row of catches in one room: "Longest row: 6 in a row". */
export function longestRowLine(count: number): string {
  requireWholeCount(count, "The longest row");
  return count < 2
    ? "Never two in a row"
    : `Longest row: ${String(count)} in a row`;
}

/**
 * The sounds caught in one room: "Cellar: 7 caught". Counts only. The levels of two floors are
 * never set side by side, since floors cannot be compared (limits statement).
 */
export function roomCaughtLine(roomName: string, count: number): string {
  requireWholeCount(count, "The sounds caught in a room");
  return `${roomName}: ${String(count)} caught`;
}
