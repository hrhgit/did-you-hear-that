import { answerForKey, type AnswerSide } from "./answer-for-key";
import type { VisitPage } from "./build-visit-page";

/** How long an answer's hint stays bright after a press. */
const pressShownMs = 220;

/**
 * Sends every answer the visitor gives to `onAnswer`: the arrow keys or `A` and `L` on a
 * keyboard, and the left and right halves of the screen on touch. It only listens while
 * `listening()` is true. Every press brightens its hint in the same way, whether or not the
 * house was waiting for an answer, so the hint tells the visitor nothing about a sound.
 * Returns a function that stops listening.
 */
export function listenForAnswers(options: {
  readonly doc: Document;
  readonly view: Window;
  readonly page: VisitPage;
  readonly listening: () => boolean;
  /** Called with the side and the time of the press, as the input event gives it. */
  readonly onAnswer: (side: AnswerSide, pressedAtMs: number) => void;
}): () => void {
  const { doc, view, page, listening, onAnswer } = options;
  const shown: Record<AnswerSide, number | null> = { left: null, right: null };

  const answer = (side: AnswerSide, pressedAtMs: number): void => {
    if (!listening()) {
      return;
    }
    onAnswer(side, pressedAtMs);
    const button = page.answerButtons[side];
    button.dataset.pressed = "true";
    if (shown[side] !== null) {
      view.clearTimeout(shown[side]);
    }
    shown[side] = view.setTimeout(() => {
      delete button.dataset.pressed;
      shown[side] = null;
    }, pressShownMs);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const side = answerForKey(event);
    if (side !== null && listening()) {
      event.preventDefault();
      answer(side, event.timeStamp);
    }
  };
  doc.addEventListener("keydown", onKeyDown);

  const removers: (() => void)[] = [
    () => {
      doc.removeEventListener("keydown", onKeyDown);
    },
  ];
  for (const side of ["left", "right"] as const) {
    const button = page.answerButtons[side];
    // A touch answers the moment the finger lands, not when it lifts.
    const onPointerDown = (event: PointerEvent): void => {
      if (event.button === 0) {
        answer(side, event.timeStamp);
      }
    };
    // A click that no pointer made comes from Enter or Space on the focused half.
    const onClick = (event: MouseEvent): void => {
      if (event.detail === 0) {
        answer(side, event.timeStamp);
      }
    };
    button.addEventListener("pointerdown", onPointerDown);
    button.addEventListener("click", onClick);
    removers.push(() => {
      button.removeEventListener("pointerdown", onPointerDown);
      button.removeEventListener("click", onClick);
    });
  }

  return () => {
    for (const remove of removers) {
      remove();
    }
    for (const side of ["left", "right"] as const) {
      if (shown[side] !== null) {
        view.clearTimeout(shown[side]);
        shown[side] = null;
      }
      delete page.answerButtons[side].dataset.pressed;
    }
  };
}
