import type { CheckAnswer, VisitPage } from "./build-visit-page";
import type { Screen } from "./screen-of-snapshot";

/** What the buttons of the swapped repeat's sheet ask for. */
export interface SwapButtonActions {
  /** The visitor says the earpieces are swapped. */
  confirmSwap(): void;
  /** Play the check. The visit flow must be called inside the press, with nothing awaited. */
  playSwapCheck(): void;
  /** The answer to the check. */
  answerSwapCheck(answer: CheckAnswer): void;
  /** Go into the room. The visit flow must be called inside the press, with nothing awaited. */
  startSwappedRoom(): void;
  /** Back to the picture. */
  backToPicture(): void;
}

/**
 * Joins the buttons of the swapped repeat's sheet to what they ask for. The lit button does what
 * the screen shown at the press says it does, and calls it inside the press. The control that
 * leads back to the picture appears right after the last sound of the room, so it does nothing
 * until `backIsMeant` says it has been up long enough: a press that was meant as an answer must
 * not leave the page that sets the two runs side by side.
 */
export function joinSwapButtons(
  page: VisitPage,
  current: () => Screen | null,
  backIsMeant: () => boolean,
  actions: SwapButtonActions,
): void {
  page.swap.primaryButton.addEventListener("click", () => {
    const action = current()?.swap?.primary?.action;
    if (action === "confirmSwap") {
      actions.confirmSwap();
    } else if (action === "playSwapCheck") {
      actions.playSwapCheck();
    } else if (action === "startSwappedRoom") {
      actions.startSwappedRoom();
    }
  });
  for (const [answer, button] of Object.entries(page.swap.answerButtons)) {
    button.addEventListener("click", () => {
      if (current()?.swap?.check?.awaitingAnswer === true) {
        actions.answerSwapCheck(answer as CheckAnswer);
      }
    });
  }
  page.swap.backButton.addEventListener("click", () => {
    if (backIsMeant()) {
      actions.backToPicture();
    }
  });
}
