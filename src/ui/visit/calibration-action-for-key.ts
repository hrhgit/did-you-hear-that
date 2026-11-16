/** How many steps of the control a big move covers: Shift with an arrow, or Page Up and Page Down. */
export const bigMoveStepCount = 5;

/** The parts of a key press that decide what it does on the calibration sheet. */
export interface CalibrationKeyPress {
  readonly key: string;
  readonly repeat: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}

/** What a key press asks of the calibration control. */
export type CalibrationKeyAction =
  /** Move the control by this many steps. Positive is louder. */
  | { readonly kind: "move"; readonly stepCount: number }
  /** Put the control at one of its ends. */
  | { readonly kind: "moveToEnd"; readonly end: "bottom" | "top" }
  /** Keep the setting last played. */
  | { readonly kind: "keep" };

/**
 * What a key press does while the calibration control is in use.
 *
 * - The right and up arrows move the control one step louder, the left and down arrows one step
 *   quieter. With Shift they move `bigMoveStepCount` steps, as Page Up and Page Down do. A key
 *   held down keeps moving the control: the hiss still rises a little at a time, so holding a
 *   key cannot make it jump.
 * - Home and End put the control at its bottom and its top.
 * - Enter keeps the setting. It does so once for a key held down, and not at all while a button
 *   has the focus, where Enter presses that button.
 * - A key pressed together with Alt, Control or the command key is a shortcut of the browser.
 */
export function calibrationActionForKey(
  press: CalibrationKeyPress,
  focusIsOnButton: boolean,
): CalibrationKeyAction | null {
  if (press.altKey || press.ctrlKey || press.metaKey) {
    return null;
  }
  const size = press.shiftKey ? bigMoveStepCount : 1;
  switch (press.key) {
    case "ArrowRight":
    case "ArrowUp":
      return { kind: "move", stepCount: size };
    case "ArrowLeft":
    case "ArrowDown":
      return { kind: "move", stepCount: -size };
    case "PageUp":
      return { kind: "move", stepCount: bigMoveStepCount };
    case "PageDown":
      return { kind: "move", stepCount: -bigMoveStepCount };
    case "Home":
      return { kind: "moveToEnd", end: "bottom" };
    case "End":
      return { kind: "moveToEnd", end: "top" };
    case "Enter":
      return press.repeat || press.shiftKey || focusIsOnButton
        ? null
        : { kind: "keep" };
    default:
      return null;
  }
}
