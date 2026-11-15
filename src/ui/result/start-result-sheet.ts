import { resultPageConfig } from "../../config/result-page-config";
import { createSystemWallClock } from "../../config/system-wall-clock";
import { siteTitle } from "../../copy/site-title";
import { createVisitArchive } from "../../session/create-visit-archive";
import { resultPicture } from "../../session/result-picture";
import type { VisitToSave } from "../../session/result-page-types";
import { createResultView } from "./create-result-view";

/**
 * What the development result sheet puts on `window.resultSheet`: a way to show the result of a
 * visit with no visit flow behind it, and a record of what the result asked the flow to do.
 */
export interface ResultSheet {
  /** Shows the result of a visit, as the page does when the flow reaches its result. */
  show(visit: VisitToSave): void;
  /** Hides the result and forgets the visit, as the page does when the visit leaves it. */
  clear(): void;
  /** Every request the result made of the flow, in order: `back`, or `swappedRepeat:` and a room index. */
  readonly requests: string[];
}

/**
 * The development result sheet (`result-sheet.html`): the result page alone, on the real archive
 * of this browser. It plays no sound and starts no visit. The browser tests use it to draw
 * results that a visit in a browser would take minutes to reach.
 */
function startResultSheet(
  doc: Document,
  view: Window & typeof globalThis,
): void {
  const main = doc.querySelector("main");
  if (main === null) {
    throw new Error("The page has no <main> element to render into.");
  }
  doc.title = siteTitle;
  main.classList.add("visit");

  const seeds = new Uint32Array(1);
  view.crypto.getRandomValues(seeds);
  const archive = createVisitArchive({
    localStorage: () => view.localStorage,
    wallClock: createSystemWallClock(),
    seed: seeds[0] ?? 0,
    mode: "keep",
  });
  const requests: string[] = [];
  const resultView = createResultView({
    doc,
    view,
    archive,
    pictureOf: resultPicture,
    findEarlier: null,
    comparisonCopy: null,
    headphoneNameMaxCharacterCount:
      resultPageConfig.headphoneNameMaxCharacterCount,
    onSwappedRepeat: (roomIndex) => {
      requests.push(`swappedRepeat:${String(roomIndex)}`);
    },
    onBack: () => {
      requests.push("back");
    },
  });
  main.replaceChildren(resultView.element);

  const sheet: ResultSheet = {
    show(visit) {
      resultView.show(visit);
      resultView.heading.focus({ preventScroll: true });
    },
    clear() {
      resultView.clear();
    },
    requests,
  };
  (view as unknown as { resultSheet: ResultSheet }).resultSheet = sheet;
}

startResultSheet(document, window);
