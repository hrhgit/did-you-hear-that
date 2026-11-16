import type { VisitPage } from "./build-visit-page";
import { calibrationActionForKey } from "./calibration-action-for-key";
import type { CalibrationScreen } from "./screen-of-snapshot";

/** What the calibration control asks of the visit flow. */
export interface CalibrationControlActions {
  readonly setTarget: (settingDb: number) => void;
  readonly keep: () => void;
}

/**
 * Joins the slider and the keys of the calibration sheet to the visit flow. Dragging the slider
 * sets the target at once; the sound follows it a little at a time, as the flow plays it. The keys
 * of `calibrationActionForKey` move the target while the sheet is up and its sound has started,
 * wherever the focus is on the page. They are handled here and not by the slider itself, so that
 * a key moves the control by the same steps whether or not the slider has the focus.
 * Returns a function that stops listening.
 */
export function joinCalibrationControl(options: {
  readonly doc: Document;
  readonly page: VisitPage;
  /** The calibration sheet shown now, or null while it is not up. */
  readonly current: () => CalibrationScreen | null;
  readonly actions: CalibrationControlActions;
}): () => void {
  const { doc, page, current, actions } = options;
  const { range } = page.calibration;

  const onInput = (): void => {
    const settingDb = Number(range.value);
    if (current()?.started === true && Number.isFinite(settingDb)) {
      actions.setTarget(settingDb);
    }
  };
  range.addEventListener("input", onInput);

  const onKeyDown = (event: KeyboardEvent): void => {
    const calibration = current();
    if (calibration === null || !calibration.started) {
      return;
    }
    const focusIsOnButton = doc.activeElement instanceof HTMLButtonElement;
    const action = calibrationActionForKey(event, focusIsOnButton);
    if (action === null) {
      return;
    }
    event.preventDefault();
    switch (action.kind) {
      case "move":
        actions.setTarget(
          calibration.targetDb + action.stepCount * calibration.stepDb,
        );
        return;
      case "moveToEnd":
        actions.setTarget(
          action.end === "bottom" ? calibration.bottomDb : calibration.topDb,
        );
        return;
      case "keep":
        if (calibration.canKeep) {
          actions.keep();
        }
        return;
    }
  };
  doc.addEventListener("keydown", onKeyDown);

  return () => {
    range.removeEventListener("input", onInput);
    doc.removeEventListener("keydown", onKeyDown);
  };
}
