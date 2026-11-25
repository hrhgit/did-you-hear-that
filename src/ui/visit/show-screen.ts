import { repeatComparisonBlock } from "../result/show-repeat-comparison";
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
   * Draws a reaction to a scored trial: the creature of a caught sound in the doorway of its
   * side, with rings, the outline of one that went by, leaving, or a line alone. Or the rings of a
   * sound that is played again, or the line of a creature that has gone home.
   */
  react(reaction: ScreenReaction): void;
  /** The screen shown now. */
  current(): Screen | null;
  /** Whether the rest between rooms has been up long enough for its button to be meant. */
  restButtonIsMeant(): boolean;
  /** The same for the buttons of the sheet that comes before the replay of missed sounds. */
  replayButtonIsMeant(): boolean;
  /**
   * The same for the control that leads back from a swapped repeat to the picture. Only the sheet
   * that follows the repeat's room makes it wait.
   */
  swapBackIsMeant(): boolean;
}

/**
 * How long the button of the rest between rooms ignores presses after it appears. A visitor who
 * is still answering the last sound of a room must not walk on to the next room by accident. The
 * buttons that start or skip the replay of missed sounds appear after the last room in the same
 * way, and wait as long. So does the way back to the picture after the room of a swapped repeat.
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
  readonly caption: Caption;
}): ScreenView {
  const { doc, view, page, result, caption } = options;
  const { scene, shelf } = page;
  const sheets: Readonly<Record<SheetName, Sheet>> = {
    frontDoor: page.frontDoor,
    calibration: page.calibration,
    headphoneCheck: page.headphoneCheck,
    rules: page.rules,
    notice: page.notice,
    replay: page.replay,
    swap: page.swap,
    result,
  };
  let shown: Screen | null = null;
  let focusKey: string | null = null;
  let restShownAtMs: number | null = null;
  let replaySheetShownAtMs: number | null = null;
  let replayLinesShown = "";
  let calibrationLinesShown = "";
  let swapLinesShown = "";
  let swapComparisonShown: unknown = null;
  let swapPhaseKey: string | null = null;
  /** When the sheet that follows the room of a swapped repeat appeared, or null. */
  let swapEndShownAtMs: number | null = null;

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
    const lines = calibration.introLines.join("\n");
    if (lines !== calibrationLinesShown) {
      calibrationLinesShown = lines;
      sheet.introLines.replaceChildren(
        ...calibration.introLines.map((line) => {
          const paragraph = doc.createElement("p");
          paragraph.textContent = line;
          return paragraph;
        }),
      );
    }
    setLine(sheet.keysLine, calibration.started ? calibration.keysLine : null);
    sheet.startButton.hidden = calibration.started;
    sheet.keepButton.hidden = !calibration.started;
    sheet.dial.hidden = !calibration.started;
    sheet.louderButton.disabled = !calibration.canGoLouder;
    sheet.keepButton.disabled = !calibration.canKeep;
    const { range } = sheet;
    const ends = [
      ["min", calibration.bottomDb],
      ["max", calibration.topDb],
      ["step", calibration.stepDb],
    ] as const;
    for (const [name, value] of ends) {
      if (range.getAttribute(name) !== String(value)) {
        range.setAttribute(name, String(value));
      }
    }
    if (range.value !== String(calibration.targetDb)) {
      range.value = String(calibration.targetDb);
    }
    sheet.meter.style.setProperty(
      "--visit-setting",
      String(calibration.settingFraction ?? 0),
    );
    setText(
      sheet.statusLine,
      screen.soundNotStartedLine ?? calibration.statusLine ?? "",
    );
    if (calibration.started && startHadFocus) {
      // The slider takes the focus, so that the keys move it at once.
      focus(range);
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
    setLine(sheet.roomsLine, check.roomsLine);
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
    showLines(sheet.moreLines, notice.moreLines, "notice");
    sheet.button.hidden = notice.button === null;
    if (notice.button !== null) {
      setText(sheet.button, notice.button.label);
    }
    sheet.secondButton.hidden = notice.secondButton === null;
    if (notice.secondButton !== null) {
      setText(sheet.secondButton, notice.secondButton.label);
    }
    setLine(sheet.statusLine, screen.soundNotStartedLine);
  };

  /** The lines shown in each holder, so that a holder is filled again only when they change. */
  const linesShown = new Map<string, string>();
  const showLines = (
    holder: HTMLElement,
    lines: readonly string[],
    key: string,
  ): void => {
    const joined = lines.join("\n");
    if (linesShown.get(key) === joined) {
      return;
    }
    linesShown.set(key, joined);
    holder.replaceChildren(
      ...lines.map((line) => {
        const paragraph = doc.createElement("p");
        paragraph.textContent = line;
        return paragraph;
      }),
    );
  };

  const showPractice = (screen: Screen): void => {
    const practice = screen.practice;
    const panel = page.practice;
    panel.element.hidden = practice === null;
    if (practice === null) {
      return;
    }
    setLine(panel.heading, practice.heading);
    showLines(panel.lines, practice.lines, "practice");
    // Who is making the practice sound. Never on which side.
    setLine(
      panel.introLine,
      screen.featured?.rollCall === true ? screen.featured.line : null,
    );
    setLine(panel.soundLine, practice.soundPlayingLine);
  };

  /** Whether the room was in plain view on the screen before this one. */
  let roomWasInView = false;

  /** Who was practising in the room on the screen before this one, or null for nobody. */
  let practisingShown: string | null = null;

  /**
   * The room: who stands in it, the cards along its foot, and the lantern. The picture is laid out
   * again only while the room is in plain view and when a sheet first covers it, so nothing jumps
   * behind a sheet that is fading away.
   */
  const showRoom = (screen: Screen): void => {
    const { chase } = screen;
    // In plain view: no sheet over the room and no rest between two rooms.
    const inView = screen.sheet === null && screen.restLine === null;
    if (inView) {
      if (!roomWasInView) {
        // What the last sounds left in the doorways is long out of sight.
        scene.clear();
      }
      page.root.dataset.shelf = screen.creatures.length > 0 ? "shown" : "none";
      if (screen.featured?.rollCall === true) {
        page.root.dataset.rollCall = "true";
      } else {
        delete page.root.dataset.rollCall;
      }
      shelf.show(screen.creatures);
      scene.setFeatured(screen.featured);
      // Whoever is practising, in the doorway of its sound or in the middle between them.
      const practising =
        screen.featured?.rollCall === true ? screen.featured.id : null;
      if (
        practising !== null &&
        practisingShown !== null &&
        practising !== practisingShown
      ) {
        // What the house said about the one before must not stand under the next one.
        caption.hurry();
      }
      practisingShown = practising;
      scene.setBeat(screen.beat ?? null);
      // Nothing counts in a practice: the display says it is a warm-up. Once the room counts it
      // shows the combo, the score and Jack's flame (the rhythm game, 2026-11-18).
      scene.setStanding(
        chase === null
          ? null
          : {
              score: chase.score,
              combo: chase.combo,
              flame: chase.flame,
              label: chase.label,
              relitLine: chase.relitLine,
            },
        chase === null && screen.practice !== null,
      );
    } else {
      scene.setFeatured(null);
      practisingShown = null;
      if (screen.restLine !== null) {
        // The rest between two rooms lies over the foot of the room, where the cards are.
        shelf.show([]);
      } else if (screen.sheet !== "notice") {
        // A notice is a pause: the room waits behind it as it was. Every other sheet ends what
        // the room was showing.
        shelf.show([]);
        scene.setBeat(null);
        scene.setStanding(null, false);
      } else {
        // Behind a notice the cards wait as they were, and the display of the game is put away
        // until the room is in view again.
        scene.setStanding(null, false);
      }
    }
    roomWasInView = inView;
  };

  const showReplay = (screen: Screen): void => {
    const replay = screen.replay;
    const playing = replay?.playing === true;
    // While the sounds play, the room gives up its foot for the words under it.
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

  const showSwap = (screen: Screen): void => {
    const swap = screen.sheet === "swap" ? screen.swap : null;
    const phase = swap?.phase ?? null;
    if (phase === "finished") {
      swapEndShownAtMs ??= view.performance.now();
    } else {
      swapEndShownAtMs = null;
    }
    if (swap === null || phase === null) {
      swapPhaseKey = null;
      return;
    }
    const sheet = page.swap;
    const answers = Object.entries(sheet.answerButtons);
    const answerHadFocus = answers.some(
      ([, button]) => doc.activeElement === button,
    );
    const primaryHadFocus = doc.activeElement === sheet.primaryButton;

    setText(sheet.heading, swap.heading);
    setText(sheet.floorName, swap.floor.roomName);
    setText(sheet.floorPitch, swap.floor.pitchLabel);
    setText(sheet.floorDifference, swap.floor.firstDifferenceLabel);
    sheet.sketch.toggleAttribute("hidden", swap.headphones === null);
    if (swap.headphones !== null) {
      sheet.sketch.setAttribute("data-state", swap.headphones);
    }

    const lines = swap.lines.join("\n");
    if (lines !== swapLinesShown) {
      swapLinesShown = lines;
      sheet.lines.replaceChildren(
        ...swap.lines.map((line) => {
          const paragraph = doc.createElement("p");
          paragraph.className = "visit-voice";
          paragraph.textContent = line;
          return paragraph;
        }),
      );
    }
    sheet.lines.hidden = swap.lines.length === 0;

    // Both runs side by side. Drawn again only when the comparison itself is another one.
    if (swap.comparison !== swapComparisonShown) {
      swapComparisonShown = swap.comparison;
      sheet.comparison.replaceChildren(
        ...(swap.comparison === null
          ? []
          : [
              repeatComparisonBlock(doc, swap.comparison, {
                idPrefix: "visit-swap-repeat",
                headingLevel: 2,
              }),
            ]),
      );
    }
    sheet.comparison.hidden = swap.comparison === null;
    setLine(sheet.turnBackLine, swap.turnBackLine);
    setLine(sheet.againLine, swap.againLine);

    // During the check the line keeps its place while it is empty, so that no button moves away
    // from under a press when a line appears.
    const statusLine = screen.soundNotStartedLine ?? swap.statusLine;
    setText(sheet.statusLine, statusLine ?? "");
    sheet.statusLine.hidden = statusLine === null && swap.check === null;

    sheet.primaryButton.hidden = swap.primary === null;
    if (swap.primary !== null) {
      setText(sheet.primaryButton, swap.primary.label);
    }
    sheet.question.hidden = swap.check === null;
    sheet.answerList.hidden = swap.check === null;
    if (swap.check !== null) {
      setText(sheet.question, swap.check.question);
      for (const [answer, button] of answers) {
        setText(
          button,
          swap.check.answers[answer as keyof typeof swap.check.answers],
        );
        button.disabled = !swap.check.awaitingAnswer;
      }
    }
    setText(sheet.backButton, swap.backLabel);
    // With nothing else to press, the way back is the lit one.
    sheet.backButton.classList.toggle(
      "visit-button-lit",
      swap.primary === null,
    );

    // The focus follows the sheet from one step to the next: to the button of the new step, or
    // to the heading where the step has none. The first step is focused as every new sheet is.
    const stepChanged = swapPhaseKey !== null && swapPhaseKey !== phase;
    swapPhaseKey = phase;
    if (stepChanged) {
      focus(swap.primary !== null ? sheet.primaryButton : sheet.heading);
    } else if (
      swap.check !== null &&
      !swap.check.awaitingAnswer &&
      (answerHadFocus || (primaryHadFocus && sheet.primaryButton.hidden))
    ) {
      // The answer that was pressed can no longer hold the focus.
      focus(sheet.primaryButton);
    }
  };

  return {
    show(screen) {
      const first = shown === null;
      shown = screen;

      // The room behind everything: in full view, or faint under a sheet.
      page.root.dataset.house = screen.sheet === null ? "full" : "faint";
      // Which sheet is up, so that each can lay out the yard behind it in its own way.
      page.root.dataset.sheet = screen.sheet ?? "none";
      scene.setCovered(screen.sheet === "result");

      // The bar.
      page.stopButton.hidden = !screen.stopShown;
      setText(page.stopButton, screen.stopLabel);
      page.pauseButton.hidden = !screen.pauseShown;
      setText(page.pauseButton, screen.pauseLabel);
      page.room.hidden = screen.room === null;
      if (screen.room !== null) {
        setText(page.roomName, screen.room.name);
        setText(page.roomProgress, screen.room.progress);
      }

      // The answers, the rest and the caption.
      page.answerButtons.left.hidden = !screen.answersShown;
      page.answerButtons.right.hidden = !screen.answersShown;
      if (screen.restLine === null) {
        restShownAtMs = null;
      } else {
        setText(page.restLine, screen.restLine);
        restShownAtMs ??= view.performance.now();
      }
      page.rest.hidden = screen.restLine === null;
      if (
        screen.sheet !== null ||
        screen.replay !== null ||
        screen.restLine !== null
      ) {
        // The rest lies over the place of the caption.
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
      showPractice(screen);
      showRoom(screen);
      showReplay(screen);
      showSwap(screen);
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
      switch (reaction.kind) {
        case "replayRipple":
          // The creature of the sound stands in the doorway of its side, whichever of the event
          // and the snapshot arrives first, and rings go out from it. It has no line here: the
          // words of a replayed sound stand under the room for as long as it is the current one.
          scene.setFeatured({
            id: reaction.roomId,
            place: reaction.side,
            sounding: false,
          });
          scene.rings(reaction.side);
          return;
        case "ripple":
          if (shown?.featured?.rollCall === true) {
            // A practice sound, whose creature stands in plain view in the doorway of the side it
            // sounds from: rings from the side that was answered, and a hop from the one that made it.
            scene.rings(reaction.side);
            if (shown.featured.id === reaction.roomId) {
              scene.cheer();
            }
          } else {
            // The sound was caught: its creature is kicked away from Jack on its side.
            scene.caught(reaction.side, reaction.roomId, reaction.judgement);
          }
          shelf.flash(reaction.roomId);
          caption.say(reaction.line, "catch");
          return;
        case "slipped":
          // The sound went by. Its time to answer is over, and so is its trial.
          // It reaches Jack and bites a little of his flame away.
          scene.slipped(reaction.side, reaction.roomId, reaction.judgement);
          caption.say(reaction.line, "miss");
          return;
        case "say":
          if (reaction.judgement !== undefined) {
            scene.passed(reaction.judgement, reaction.side ?? null);
          }
          caption.say(reaction.line);
          return;
        case "cue":
          scene.cue(reaction.atMs, reaction.beatMs);
          return;
        case "whiff":
          scene.whiff(reaction.side);
          return;
        case "gone":
          // Its card shows it asleep as soon as the screen says so. Here, the line.
          caption.note(reaction.line);
          return;
      }
    },
    current: () => shown,
    restButtonIsMeant: () =>
      restShownAtMs !== null &&
      view.performance.now() - restShownAtMs >= restButtonGuardMs,
    replayButtonIsMeant: () =>
      replaySheetShownAtMs !== null &&
      view.performance.now() - replaySheetShownAtMs >= restButtonGuardMs,
    swapBackIsMeant: () =>
      swapEndShownAtMs === null ||
      view.performance.now() - swapEndShownAtMs >= restButtonGuardMs,
  };
}
