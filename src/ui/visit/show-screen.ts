import type { HouseSection } from "../house/draw-house-section";
import type { MotionLayer } from "../house/motion-layer";
import type { Sheet, VisitPage } from "./build-visit-page";
import type { ScreenReaction } from "./reaction-of-event";
import type { Screen, SheetName } from "./screen-of-snapshot";
import type { Caption } from "./show-caption";

/** Puts screens and reactions on the page. */
export interface ScreenView {
  /** Shows a screen. Only text, `hidden` and `disabled` change, and the focus when a sheet changes. */
  show(screen: Screen): void;
  /** Draws a reaction to a scored trial: a ripple with its line, or a line alone. */
  react(reaction: ScreenReaction): void;
  /** The screen shown now. */
  current(): Screen | null;
  /** Whether the rest between rooms has been up long enough for its button to be meant. */
  restButtonIsMeant(): boolean;
}

/**
 * How long the button of the rest between rooms ignores presses after it appears. A visitor who
 * is still answering the last sound of a room must not walk on to the next room by accident.
 */
const restButtonGuardMs = 700;

function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) {
    element.textContent = text;
  }
}

/** Shows a line, or hides its element while there is none. */
function setLine(element: HTMLElement, line: string | null): void {
  setText(element, line ?? "");
  element.hidden = line === null;
}

export function createScreenView(options: {
  readonly doc: Document;
  readonly view: Window;
  readonly page: VisitPage;
  /** The result, which lies over the visit like a sheet and is drawn by `src/ui/result`. */
  readonly result: Sheet;
  readonly house: HouseSection;
  readonly motion: MotionLayer;
  readonly caption: Caption;
}): ScreenView {
  const { doc, view, page, result, house, motion, caption } = options;
  const sheets: Readonly<Record<SheetName, Sheet>> = {
    frontDoor: page.frontDoor,
    calibration: page.calibration,
    headphoneCheck: page.headphoneCheck,
    rules: page.rules,
    notice: page.notice,
    result,
  };
  let shown: Screen | null = null;
  let focusKey: string | null = null;
  let restShownAtMs: number | null = null;

  const focus = (element: HTMLElement): void => {
    element.focus({ preventScroll: true });
  };

  const showCalibration = (screen: Screen): void => {
    const calibration = screen.calibration;
    if (calibration === null) {
      return;
    }
    const sheet = page.calibration;
    const startHadFocus = doc.activeElement === sheet.startButton;
    setText(sheet.heading, calibration.heading);
    sheet.startButton.hidden = calibration.started;
    sheet.quieterButton.hidden = !calibration.started;
    sheet.louderButton.hidden = !calibration.started;
    sheet.keepButton.hidden = !calibration.started;
    sheet.louderButton.disabled = !calibration.canGoLouder;
    sheet.keepButton.disabled = !calibration.canKeep;
    sheet.meter.hidden = !calibration.started;
    sheet.meter.style.setProperty(
      "--visit-setting",
      String(calibration.settingFraction ?? 0),
    );
    setText(
      sheet.statusLine,
      screen.soundNotStartedLine ?? calibration.statusLine ?? "",
    );
    if (calibration.started && startHadFocus) {
      focus(sheet.louderButton);
    }
  };

  const showHeadphoneCheck = (screen: Screen): void => {
    const check = screen.headphoneCheck;
    if (check === null) {
      return;
    }
    const sheet = page.headphoneCheck;
    const answers = Object.values(sheet.answerButtons);
    const answerHadFocus = answers.some(
      (button) => doc.activeElement === button,
    );
    setText(sheet.roomsLine, check.roomsLine);
    for (const button of answers) {
      button.disabled = !check.awaitingAnswer;
    }
    setText(sheet.judgementLine, check.statusLine ?? "");
    sheet.goOnButton.hidden = !check.canGoOn;
    if (answerHadFocus && !check.awaitingAnswer) {
      // The answer that was pressed can no longer hold the focus.
      focus(check.canGoOn ? sheet.goOnButton : sheet.playButton);
    }
  };

  const showNotice = (screen: Screen): void => {
    const notice = screen.notice;
    if (notice === null) {
      return;
    }
    const sheet = page.notice;
    setText(sheet.heading, notice.heading);
    setText(sheet.line, notice.line);
    sheet.button.hidden = notice.button === null;
    if (notice.button !== null) {
      setText(sheet.button, notice.button.label);
    }
    setLine(sheet.statusLine, screen.soundNotStartedLine);
  };

  return {
    show(screen) {
      const first = shown === null;
      shown = screen;

      // The drawing.
      page.root.dataset.house = screen.sheet === null ? "full" : "faint";
      house.setRoomStates(screen.roomStates);
      motion.setLitRoom(screen.litRoom);

      // The bar.
      page.stopButton.hidden = !screen.stopShown;
      page.pauseButton.hidden = !screen.pauseShown;
      page.room.hidden = screen.room === null;
      if (screen.room !== null) {
        setText(page.roomName, screen.room.name);
        setText(page.roomProgress, screen.room.progress);
      }

      // The room.
      page.answerButtons.left.hidden = !screen.answersShown;
      page.answerButtons.right.hidden = !screen.answersShown;
      if (screen.restLine === null) {
        restShownAtMs = null;
      } else {
        setText(page.restLine, screen.restLine);
        restShownAtMs ??= view.performance.now();
      }
      page.rest.hidden = screen.restLine === null;
      if (screen.sheet !== null) {
        caption.clear();
      }

      // The sheets.
      setLine(
        page.frontDoor.statusLine,
        screen.sheet === "frontDoor" ? screen.soundNotStartedLine : null,
      );
      showCalibration(screen);
      showHeadphoneCheck(screen);
      showNotice(screen);
      for (const [name, sheet] of Object.entries(sheets)) {
        sheet.element.hidden = name !== screen.sheet;
      }

      // The focus follows the screen: to the heading of a new sheet, to the rest's button, and
      // to the page itself inside a room, where the keys answer.
      const key =
        screen.sheet === null
          ? screen.restLine === null
            ? "room"
            : "rest"
          : `${screen.sheet}:${screen.notice?.heading ?? ""}`;
      if (key !== focusKey) {
        focusKey = key;
        if (!first) {
          if (screen.sheet !== null) {
            focus(sheets[screen.sheet].heading);
          } else if (screen.restLine !== null) {
            focus(page.restButton);
          } else {
            focus(page.root);
          }
        }
      }
    },
    react(reaction) {
      if (reaction.kind === "ripple") {
        motion.ripple(reaction.side);
      }
      caption.say(reaction.line);
    },
    current: () => shown,
    restButtonIsMeant: () =>
      restShownAtMs !== null &&
      view.performance.now() - restShownAtMs >= restButtonGuardMs,
  };
}
