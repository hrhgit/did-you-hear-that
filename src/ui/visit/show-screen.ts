import type { HouseSection } from "../house/draw-house-section";
import type { MotionLayer } from "../house/motion-layer";
import type { Sheet, VisitPage } from "./build-visit-page";
import { leadSentence } from "./lead-sentence";
import type { ScreenReaction } from "./reaction-of-event";
import type { Screen, SheetName } from "./screen-of-snapshot";
import type { Caption } from "./show-caption";

/** Puts screens and reactions on the page. */
export interface ScreenView {
  /** Shows a screen. Only text, `hidden` and `disabled` change, and the focus when a sheet changes. */
  show(screen: Screen): void;
  /**
   * Draws a reaction to a scored trial, a ripple with its line or a line alone, or the ripple of
   * a sound that is played again.
   */
  react(reaction: ScreenReaction): void;
  /** The screen shown now. */
  current(): Screen | null;
  /** Whether the rest between rooms has been up long enough for its button to be meant. */
  restButtonIsMeant(): boolean;
  /** The same for the buttons of the sheet that comes before the replay of missed sounds. */
  replayButtonIsMeant(): boolean;
}

/**
 * How long the button of the rest between rooms ignores presses after it appears. A visitor who
 * is still answering the last sound of a room must not walk on to the next room by accident. The
 * buttons that start or skip the replay of missed sounds appear after the last room in the same
 * way, and wait as long.
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
    replay: page.replay,
    result,
  };
  let shown: Screen | null = null;
  let focusKey: string | null = null;
  let restShownAtMs: number | null = null;
  let replaySheetShownAtMs: number | null = null;
  let replayLinesShown = "";

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

  const showReplay = (screen: Screen): void => {
    const replay = screen.replay;
    const playing = replay?.playing === true;
    // While the sounds play, the house gives up room for the words beside it.
    if (playing) {
      page.root.dataset.replay = "playing";
    } else {
      delete page.root.dataset.replay;
    }
    page.replaying.element.hidden = !playing;
    if (screen.sheet === "replay") {
      replaySheetShownAtMs ??= view.performance.now();
    } else {
      replaySheetShownAtMs = null;
    }
    if (replay === null) {
      return;
    }

    if (playing) {
      const panel = page.replaying;
      const skipHadFocus = doc.activeElement === panel.skipButton;
      if (replay.sound !== null) {
        const { lead, rest } = leadSentence(replay.sound.label);
        panel.element.dataset.side = replay.sound.side;
        setText(panel.soundLead, lead);
        setText(panel.soundRest, rest);
      } else {
        delete panel.element.dataset.side;
        setText(panel.soundLead, "");
        setText(panel.soundRest, "");
      }
      setText(panel.countLines.left, replay.counts?.left ?? "");
      setText(panel.countLines.right, replay.counts?.right ?? "");
      setLine(panel.selectionLine, replay.selectionLine);
      panel.skipButton.hidden = replay.proceedLabel === null;
      if (replay.proceedLabel !== null) {
        setText(panel.skipButton, replay.proceedLabel);
      } else if (skipHadFocus) {
        focus(page.root);
      }
      return;
    }

    const sheet = page.replay;
    setText(sheet.heading, replay.heading);
    const lines = replay.lines.join("\n");
    if (lines !== replayLinesShown) {
      replayLinesShown = lines;
      sheet.lines.replaceChildren(
        ...replay.lines.map((line) => {
          const paragraph = doc.createElement("p");
          paragraph.className = "visit-voice";
          paragraph.textContent = line;
          return paragraph;
        }),
      );
    }
    setLine(sheet.selectionLine, replay.selectionLine);
    sheet.counts.hidden = replay.counts === null;
    setText(sheet.countLines.left, replay.counts?.left ?? "");
    setText(sheet.countLines.right, replay.counts?.right ?? "");
    const startHadFocus = doc.activeElement === sheet.startButton;
    sheet.startButton.hidden = replay.startLabel === null;
    if (replay.startLabel !== null) {
      setText(sheet.startButton, replay.startLabel);
    }
    sheet.proceedButton.hidden = replay.proceedLabel === null;
    if (replay.proceedLabel !== null) {
      setText(sheet.proceedButton, replay.proceedLabel);
    }
    // With nothing to start, the way on is the one thing to press, so it is the lit one.
    sheet.proceedButton.classList.toggle(
      "visit-button-lit",
      replay.startLabel === null,
    );
    setLine(sheet.statusLine, screen.soundNotStartedLine);
    if (startHadFocus && replay.startLabel === null) {
      focus(sheet.heading);
    }
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
      setText(page.stopButton, screen.stopLabel);
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
      if (screen.sheet !== null || screen.replay !== null) {
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
      showReplay(screen);
      for (const [name, sheet] of Object.entries(sheets)) {
        sheet.element.hidden = name !== screen.sheet;
      }

      // The focus follows the screen: to the heading of a new sheet, to the rest's button, and
      // to the page itself inside a room, where the keys answer.
      const key =
        screen.sheet === null
          ? screen.restLine !== null
            ? "rest"
            : screen.replay !== null
              ? "replaying"
              : "room"
          : screen.sheet === "replay"
            ? `replay:${screen.replay?.lines[0] ?? ""}`
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
      if (reaction.kind === "replayRipple") {
        // The ripple starts in the room the sound came from, whichever of the event and the
        // snapshot arrives first. It has no line here: the words of a replayed sound stand
        // beside the house for as long as it is the current one.
        motion.setLitRoom(reaction.roomId);
        motion.ripple(reaction.side);
        return;
      }
      if (reaction.kind === "ripple") {
        motion.ripple(reaction.side);
      }
      caption.say(reaction.line);
    },
    current: () => shown,
    restButtonIsMeant: () =>
      restShownAtMs !== null &&
      view.performance.now() - restShownAtMs >= restButtonGuardMs,
    replayButtonIsMeant: () =>
      replaySheetShownAtMs !== null &&
      view.performance.now() - replaySheetShownAtMs >= restButtonGuardMs,
  };
}
