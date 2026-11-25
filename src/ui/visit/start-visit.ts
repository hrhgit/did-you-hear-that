import { resultPageConfig } from "../../config/result-page-config";
import { createSystemTimer } from "../../config/system-timer";
import { createSystemWallClock } from "../../config/system-wall-clock";
import { comparisonCopy } from "../../copy/comparison-lines";
import { siteTitle } from "../../copy/site-title";
import { createVisitArchive } from "../../session/create-visit-archive";
import { createVisitFlow } from "../../session/create-visit-flow";
import { findEarlierVisit } from "../../session/find-earlier-visit";
import { resultPicture } from "../../session/result-picture";
import { createResultView } from "../result/create-result-view";
import { buildVisitPage, type CheckAnswer } from "./build-visit-page";
import { joinSwapButtons } from "./join-swap-buttons";
import { listenForAnswers } from "./listen-for-answers";
import type { VisitSnapshot } from "../../session/visit-flow-types";
import { reactionOfEvent } from "./reaction-of-event";
import { screenOfSnapshot, type NoticeAction } from "./screen-of-snapshot";
import { createCaption } from "./show-caption";
import { createScreenView } from "./show-screen";

/**
 * Opens the house on the page: builds the room, starts the visit flow and joins the two. This is
 * the one place that chooses seeds. It draws two with `crypto.getRandomValues`: one for the
 * visit, which decides every sound, and one for the ids of saved visits. Nothing on the page
 * draws lots: what moves in the room either keeps its own time, as the lantern does, or answers a
 * scored trial. So nothing that moves on the page can follow a sound.
 * Throws if the document has no `<main>` element.
 */
export function startVisit(
  doc: Document,
  view: Window & typeof globalThis,
): void {
  const main = doc.querySelector("main");
  if (main === null) {
    throw new Error("The page has no <main> element to render into.");
  }
  doc.title = siteTitle;

  const seeds = new Uint32Array(2);
  view.crypto.getRandomValues(seeds);
  const visitSeed = seeds[0] ?? 0;
  const archiveSeed = seeds[1] ?? 0;

  const page = buildVisitPage(doc, main);

  const flow = createVisitFlow({
    window: view,
    timer: createSystemTimer(),
    seed: visitSeed,
  });
  // Saved visits stay in this browser. The archive is the only way the page reaches them.
  const archive = createVisitArchive({
    localStorage: () => view.localStorage,
    wallClock: createSystemWallClock(),
    seed: archiveSeed,
    mode: "keep",
  });
  const resultView = createResultView({
    doc,
    view,
    archive,
    pictureOf: resultPicture,
    // Comparison with an earlier visit is not built yet.
    findEarlier: findEarlierVisit,
    comparisonCopy,
    headphoneNameMaxCharacterCount:
      resultPageConfig.headphoneNameMaxCharacterCount,
    onSwappedRepeat: (roomIndex) => {
      flow.chooseSwappedRepeat(roomIndex);
    },
    onBack: () => {
      flow.backToFrontDoor();
    },
  });
  page.root.append(resultView.element);
  const screenView = createScreenView({
    doc,
    view,
    page,
    result: resultView,
    caption: createCaption(view, page.caption, page.captionNote),
  });

  // The stop control is wired before anything that can start a sound.
  page.stopButton.addEventListener("click", () => {
    flow.stop();
  });

  // Every action is called inside the press itself, with nothing awaited before it, so that the
  // browser takes the press as permission to start sound.
  const press = (button: HTMLButtonElement, action: () => void): void => {
    button.addEventListener("click", action);
  };
  press(page.frontDoor.choiceButtons.full, () => {
    flow.chooseVisit("full");
  });
  press(page.headphoneCheck.playButton, () => {
    flow.playHeadphoneCheck();
  });
  for (const [answer, button] of Object.entries(
    page.headphoneCheck.answerButtons,
  )) {
    press(button, () => {
      flow.answerHeadphoneCheck(answer as CheckAnswer);
    });
  }
  press(page.headphoneCheck.goOnButton, () => {
    flow.proceed();
  });
  press(page.rules.enterButton, () => {
    flow.proceed();
  });
  press(page.pauseButton, () => {
    flow.pause();
  });
  press(page.restButton, () => {
    if (screenView.restButtonIsMeant()) {
      flow.proceed();
    }
  });
  joinSwapButtons(
    page,
    () => screenView.current(),
    () => screenView.swapBackIsMeant(),
    {
      confirmSwap: () => {
        flow.confirmSwap();
      },
      playSwapCheck: () => {
        flow.playSwapCheck();
      },
      answerSwapCheck: (answer) => {
        flow.answerSwapCheck(answer);
      },
      startSwappedRoom: () => {
        flow.startSwappedRoom();
      },
      backToPicture: () => {
        flow.proceed();
      },
    },
  );
  // Either button of a notice does what the screen says it does, so the screen alone decides
  // which choice is lit and which is the quieter one.
  const doNotice = (action: NoticeAction | undefined): void => {
    if (action === "resume") {
      flow.resume();
    } else if (action === "backToFrontDoor") {
      flow.backToFrontDoor();
    } else if (action === "proceed") {
      flow.proceed();
    } else if (action === "goOnWithoutPractice") {
      flow.goOnWithoutPractice();
    }
  };
  press(page.notice.button, () => {
    doNotice(screenView.current()?.notice?.button?.action);
  });
  press(page.notice.secondButton, () => {
    doNotice(screenView.current()?.notice?.secondButton?.action);
  });

  listenForAnswers({
    doc,
    view,
    page,
    listening: () => screenView.current()?.answersShown === true,
    onAnswer: (side, pressedAtMs) => {
      flow.answer(side, pressedAtMs);
    },
  });

  flow.onEvent((event) => {
    const reaction = reactionOfEvent(event);
    if (reaction !== null) {
      screenView.react(reaction);
    }
  });
  const show = (snapshot: VisitSnapshot): void => {
    // The picture is drawn before its sheet appears, and forgotten once the visit has left it.
    // During a swapped repeat it is only out of sight.
    if (snapshot.stage === "result") {
      resultView.show(snapshot, snapshot.turnBackLine);
    } else if (snapshot.stage !== "swappedRepeat") {
      resultView.clear();
    }
    screenView.show(screenOfSnapshot(snapshot));
  };
  flow.subscribe(show);
  show(flow.snapshot());
}
