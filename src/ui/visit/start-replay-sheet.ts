import { createSeededRandom } from "../../config/seeded-random";
import { siteTitle } from "../../copy/site-title";
import type { VisitEvent, VisitSnapshot } from "../../session/visit-flow-types";
import { drawHouseSection } from "../house/draw-house-section";
import { startMotionLayer } from "../house/motion-layer";
import { buildVisitPage } from "./build-visit-page";
import { joinReplayButtons } from "./join-replay-buttons";
import { joinSwapButtons } from "./join-swap-buttons";
import { reactionOfEvent } from "./reaction-of-event";
import { screenOfSnapshot } from "./screen-of-snapshot";
import { createCaption } from "./show-caption";
import { createScreenView } from "./show-screen";

/**
 * What the development replay sheet puts on `window.replaySheet`: a way to show any moment of a
 * visit with no visit flow behind it, and a record of what the page asked the flow to do.
 */
export interface ReplaySheet {
  /** Shows a snapshot, as the page does when the visit flow hands it one. */
  show(snapshot: VisitSnapshot): void;
  /** Gives the page an event of the visit flow, as the page gets one when a sound starts. */
  event(event: VisitEvent): void;
  /**
   * Every request the page made of the flow, in order: `startReplay`, `proceed`, `resume`, `stop`,
   * `pause` and, from a swapped repeat, `confirmSwap`, `playSwapCheck`, `answerSwapCheck:` with
   * the answer, and `startSwappedRoom`.
   */
  readonly requests: string[];
}

/** The seeds of the drawing and of what moves over it. Fixed, so every test sees the same page. */
const houseDrawingSeed = 1887;
const ambientSeed = 20261115;

/**
 * The development replay sheet (`replay-sheet.html`): the page of the visit with no visit flow
 * and no sound. The browser tests hand it the snapshots and events a simulated visit gave in
 * Node, to draw the replay of missed sounds and the swapped repeat of a floor, which a visit in a
 * browser would take minutes to reach. It is built from the same parts as the real page, joined
 * in the same way.
 */
function startReplaySheet(
  doc: Document,
  view: Window & typeof globalThis,
): void {
  const main = doc.querySelector("main");
  if (main === null) {
    throw new Error("The page has no <main> element to render into.");
  }
  doc.title = siteTitle;

  const page = buildVisitPage(doc, main);
  const house = drawHouseSection(doc, createSeededRandom(houseDrawingSeed));
  const motion = startMotionLayer({
    doc,
    view,
    house,
    random: createSeededRandom(ambientSeed),
  });
  page.houseFrame.append(house.element, motion.canvas);

  // The picture is not drawn here. An empty sheet stands in its place and stays hidden.
  const result = doc.createElement("section");
  result.hidden = true;
  const resultHeading = doc.createElement("h1");
  resultHeading.tabIndex = -1;
  result.append(resultHeading);
  page.root.append(result);

  const screenView = createScreenView({
    doc,
    view,
    page,
    result: { element: result, heading: resultHeading },
    house,
    motion,
    caption: createCaption(view, page.caption),
  });

  const requests: string[] = [];
  page.stopButton.addEventListener("click", () => {
    requests.push("stop");
  });
  joinReplayButtons(page, () => screenView.replayButtonIsMeant(), {
    startReplay: () => {
      requests.push("startReplay");
    },
    proceed: () => {
      requests.push("proceed");
    },
  });
  page.pauseButton.addEventListener("click", () => {
    requests.push("pause");
  });
  joinSwapButtons(
    page,
    () => screenView.current(),
    () => screenView.swapBackIsMeant(),
    {
      confirmSwap: () => {
        requests.push("confirmSwap");
      },
      playSwapCheck: () => {
        requests.push("playSwapCheck");
      },
      answerSwapCheck: (answer) => {
        requests.push(`answerSwapCheck:${answer}`);
      },
      startSwappedRoom: () => {
        requests.push("startSwappedRoom");
      },
      backToPicture: () => {
        requests.push("proceed");
      },
    },
  );
  page.notice.button.addEventListener("click", () => {
    requests.push(screenView.current()?.notice?.button?.action ?? "none");
  });

  const sheet: ReplaySheet = {
    show(snapshot) {
      screenView.show(screenOfSnapshot(snapshot));
    },
    event(event) {
      const reaction = reactionOfEvent(event);
      if (reaction !== null) {
        screenView.react(reaction);
      }
    },
    requests,
  };
  (view as unknown as { replaySheet: ReplaySheet }).replaySheet = sheet;
}

startReplaySheet(document, window);
