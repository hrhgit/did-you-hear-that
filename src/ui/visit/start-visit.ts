import { createSeededRandom } from "../../config/seeded-random";
import { createSystemTimer } from "../../config/system-timer";
import { siteTitle } from "../../copy/site-title";
import { createVisitFlow } from "../../session/create-visit-flow";
import { drawHouseSection } from "../house/draw-house-section";
import { startMotionLayer } from "../house/motion-layer";
import { buildVisitPage, type CheckAnswer } from "./build-visit-page";
import { listenForAnswers } from "./listen-for-answers";
import { reactionOfEvent } from "./reaction-of-event";
import { screenOfSnapshot } from "./screen-of-snapshot";
import { createCaption } from "./show-caption";
import { createScreenView } from "./show-screen";

/** The seed of the pencil that draws the house, so the house looks the same on every visit. */
const houseDrawingSeed = 1887;

/**
 * Opens the house on the page: draws it, starts the visit flow and joins the two. This is the
 * one place that chooses seeds. It draws two with `crypto.getRandomValues`: one for the visit,
 * which decides every sound, and one for the dust, the lamp and the shadow under the door. The
 * two never meet, so nothing that moves on the page can follow a sound.
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
  const ambientSeed = seeds[1] ?? 0;

  const page = buildVisitPage(doc, main);
  const house = drawHouseSection(doc, createSeededRandom(houseDrawingSeed));
  const motion = startMotionLayer({
    doc,
    view,
    house,
    random: createSeededRandom(ambientSeed),
  });
  page.houseFrame.append(house.element, motion.canvas);

  const flow = createVisitFlow({
    window: view,
    timer: createSystemTimer(),
    seed: visitSeed,
  });
  const screenView = createScreenView({
    doc,
    view,
    page,
    house,
    motion,
    caption: createCaption(view, page.caption),
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
  press(page.frontDoor.choiceButtons.quick, () => {
    flow.chooseVisit("quick");
  });
  press(page.frontDoor.choiceButtons.full, () => {
    flow.chooseVisit("full");
  });
  press(page.calibration.startButton, () => {
    flow.startCalibration();
  });
  press(page.calibration.quieterButton, () => {
    flow.quieter();
  });
  press(page.calibration.louderButton, () => {
    flow.louder();
  });
  press(page.calibration.keepButton, () => {
    flow.keepCalibration();
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
  press(page.notice.button, () => {
    const action = screenView.current()?.notice?.button?.action;
    if (action === "resume") {
      flow.resume();
    } else if (action === "backToFrontDoor") {
      flow.backToFrontDoor();
    } else if (action === "leaveAfterLastRoom") {
      // The replay and the result are not built yet. Walk past them to the front door.
      for (let step = 0; step < 3 && flow.snapshot().canProceed; step += 1) {
        flow.proceed();
      }
      flow.backToFrontDoor();
    }
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
  flow.subscribe((snapshot) => {
    screenView.show(screenOfSnapshot(snapshot));
  });
  screenView.show(screenOfSnapshot(flow.snapshot()));
}
