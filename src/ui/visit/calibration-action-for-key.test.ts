import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  bigMoveStepCount,
  calibrationActionForKey,
  type CalibrationKeyPress,
} from "./calibration-action-for-key";

const press = (
  key: string,
  extra: Partial<CalibrationKeyPress> = {},
): CalibrationKeyPress => ({
  key,
  repeat: false,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...extra,
});

describe("calibrationActionForKey", () => {
  it("moves one step with an arrow key", () => {
    for (const key of ["ArrowRight", "ArrowUp"]) {
      expect(calibrationActionForKey(press(key), false)).toEqual({
        kind: "move",
        stepCount: 1,
      });
    }
    for (const key of ["ArrowLeft", "ArrowDown"]) {
      expect(calibrationActionForKey(press(key), false)).toEqual({
        kind: "move",
        stepCount: -1,
      });
    }
  });

  it("moves a big step with Shift and an arrow, and with Page Up and Page Down", () => {
    const shift = { shiftKey: true };
    expect(calibrationActionForKey(press("ArrowUp", shift), false)).toEqual({
      kind: "move",
      stepCount: bigMoveStepCount,
    });
    expect(calibrationActionForKey(press("ArrowLeft", shift), false)).toEqual({
      kind: "move",
      stepCount: -bigMoveStepCount,
    });
    expect(calibrationActionForKey(press("PageUp"), false)).toEqual({
      kind: "move",
      stepCount: bigMoveStepCount,
    });
    expect(calibrationActionForKey(press("PageDown"), false)).toEqual({
      kind: "move",
      stepCount: -bigMoveStepCount,
    });
  });

  it("keeps moving while a key is held down", () => {
    expect(
      calibrationActionForKey(press("ArrowRight", { repeat: true }), false),
    ).toEqual({ kind: "move", stepCount: 1 });
  });

  it("goes to an end with Home and End", () => {
    expect(calibrationActionForKey(press("Home"), false)).toEqual({
      kind: "moveToEnd",
      end: "bottom",
    });
    expect(calibrationActionForKey(press("End"), false)).toEqual({
      kind: "moveToEnd",
      end: "top",
    });
  });

  it("moves the control while a button has the focus", () => {
    expect(calibrationActionForKey(press("ArrowLeft"), true)).toEqual({
      kind: "move",
      stepCount: -1,
    });
  });

  it("keeps the setting with Enter, once, and never from a button", () => {
    expect(calibrationActionForKey(press("Enter"), false)).toEqual({
      kind: "keep",
    });
    expect(
      calibrationActionForKey(press("Enter", { repeat: true }), false),
    ).toBeNull();
    expect(
      calibrationActionForKey(press("Enter", { shiftKey: true }), false),
    ).toBeNull();
    expect(calibrationActionForKey(press("Enter"), true)).toBeNull();
  });

  it("leaves the browser's shortcuts alone", () => {
    expect(
      calibrationActionForKey(press("ArrowLeft", { altKey: true }), false),
    ).toBeNull();
    expect(
      calibrationActionForKey(press("ArrowRight", { metaKey: true }), false),
    ).toBeNull();
    expect(
      calibrationActionForKey(press("Enter", { ctrlKey: true }), false),
    ).toBeNull();
  });

  it("does nothing for any other key", () => {
    const used = [
      "ArrowRight",
      "ArrowUp",
      "ArrowLeft",
      "ArrowDown",
      "PageUp",
      "PageDown",
      "Home",
      "End",
      "Enter",
    ];
    fc.assert(
      fc.property(
        fc.string().filter((key) => !used.includes(key)),
        fc.boolean(),
        fc.boolean(),
        (key, shiftKey, focusIsOnButton) => {
          expect(
            calibrationActionForKey(press(key, { shiftKey }), focusIsOnButton),
          ).toBeNull();
        },
      ),
    );
  });

  it("never moves further than a big step", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.boolean(),
        fc.boolean(),
        (key, shiftKey, repeat) => {
          const action = calibrationActionForKey(
            press(key, { shiftKey, repeat }),
            false,
          );
          if (action?.kind === "move") {
            expect(Math.abs(action.stepCount)).toBeLessThanOrEqual(
              bigMoveStepCount,
            );
          }
        },
      ),
    );
  });
});
