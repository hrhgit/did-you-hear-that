/** The side a sound came from, as the visitor answers it. */
export type AnswerSide = "left" | "right";

/** The parts of a key press that decide whether it is an answer. */
export interface KeyPress {
  readonly key: string;
  readonly repeat: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}

/**
 * The answer a key press gives: the left and right arrow keys, or `A` for left and `L` for
 * right, in either letter case. A key held down answers once. A key pressed together with Alt,
 * Control or the command key is a shortcut of the browser and is not an answer.
 */
export function answerForKey(press: KeyPress): AnswerSide | null {
  if (press.repeat || press.altKey || press.ctrlKey || press.metaKey) {
    return null;
  }
  switch (press.key) {
    case "ArrowLeft":
    case "a":
    case "A":
      return "left";
    case "ArrowRight":
    case "l":
    case "L":
      return "right";
    default:
      return null;
  }
}
