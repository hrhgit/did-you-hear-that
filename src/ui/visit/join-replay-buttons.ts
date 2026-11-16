import type { VisitPage } from "./build-visit-page";

/** What the buttons of the replay of missed sounds ask for. */
export interface ReplayButtonActions {
  /** Start the sounds. The visit flow must be called inside the press, with nothing awaited. */
  startReplay(): void;
  /** Skip the sounds, skip the rest of them, or go on to the picture. */
  proceed(): void;
}

/**
 * Joins the buttons of the replay of missed sounds to what they ask for. The sounds a visitor did
 * not catch are louder when they come again, so the two buttons that appear right after the last
 * room do nothing until `isMeant` says they have been up long enough: a press that was meant for
 * the last sound of the room must neither start the replay nor skip it. The button that skips the
 * rest appears only after the visitor has started the replay, so it needs no such wait.
 */
export function joinReplayButtons(
  page: VisitPage,
  isMeant: () => boolean,
  actions: ReplayButtonActions,
): void {
  page.replay.startButton.addEventListener("click", () => {
    if (isMeant()) {
      actions.startReplay();
    }
  });
  page.replay.proceedButton.addEventListener("click", () => {
    if (isMeant()) {
      actions.proceed();
    }
  });
  page.replaying.skipButton.addEventListener("click", () => {
    actions.proceed();
  });
}
