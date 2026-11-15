import { calibrationCopy } from "../../copy/calibration-copy";
import { frontDoorCopy } from "../../copy/front-door-copy";
import { headphoneCheckCopy } from "../../copy/headphone-check-copy";
import { leavingCopy } from "../../copy/leaving-copy";
import { roomCopy } from "../../copy/room-copy";
import { rulesCopy } from "../../copy/rules-copy";
import { siteTitle } from "../../copy/site-title";
import { visitCopy } from "../../copy/visit-copy";

/** A sheet of text laid over the faint drawing. Only one is shown at a time. */
export interface Sheet {
  readonly element: HTMLElement;
  /** The sheet's heading, which takes the focus when the sheet appears. */
  readonly heading: HTMLElement;
}

/** The two answers of the headphone check that are not a side. */
export type CheckAnswer = "left" | "right" | "bothSides" | "nothingHeard";

/**
 * Every element of the visit, made once. Drawing a snapshot only changes text, `hidden` and
 * `disabled`, so no control ever moves away from under a press.
 */
export interface VisitPage {
  readonly root: HTMLElement;
  /** Where the drawing of the house and its moving layer go. */
  readonly houseFrame: HTMLElement;
  readonly stopButton: HTMLButtonElement;
  readonly pauseButton: HTMLButtonElement;
  readonly room: HTMLElement;
  readonly roomName: HTMLElement;
  readonly roomProgress: HTMLElement;
  readonly answerButtons: Readonly<Record<"left" | "right", HTMLButtonElement>>;
  readonly caption: HTMLElement;
  /** The rest between two rooms: a line and a button, where the caption is. */
  readonly rest: HTMLElement;
  readonly restLine: HTMLElement;
  readonly restButton: HTMLButtonElement;
  readonly frontDoor: Sheet & {
    readonly choiceButtons: Readonly<
      Record<"quick" | "full" | "replay", HTMLButtonElement>
    >;
    readonly statusLine: HTMLElement;
  };
  readonly calibration: Sheet & {
    readonly openLine: HTMLElement;
    /** A drawn line with a mark on it: where the control stands between its two ends. */
    readonly meter: HTMLElement;
    readonly statusLine: HTMLElement;
    readonly startButton: HTMLButtonElement;
    readonly quieterButton: HTMLButtonElement;
    readonly louderButton: HTMLButtonElement;
    readonly keepButton: HTMLButtonElement;
  };
  readonly headphoneCheck: Sheet & {
    readonly keptLine: HTMLElement;
    readonly roomsLine: HTMLElement;
    readonly playButton: HTMLButtonElement;
    readonly question: HTMLElement;
    readonly answerList: HTMLElement;
    readonly answerButtons: Readonly<Record<CheckAnswer, HTMLButtonElement>>;
    readonly judgementLine: HTMLElement;
    readonly goOnButton: HTMLButtonElement;
  };
  readonly rules: Sheet & { readonly enterButton: HTMLButtonElement };
  readonly notice: Sheet & {
    readonly line: HTMLElement;
    readonly statusLine: HTMLElement;
    readonly button: HTMLButtonElement;
  };
}

type Children = readonly (HTMLElement | string)[];

/** Builds the visit's elements inside `main` and returns handles to the ones that change. */
export function buildVisitPage(doc: Document, main: HTMLElement): VisitPage {
  const make = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    children: Children = [],
  ): HTMLElementTagNameMap[K] => {
    const element = doc.createElement(tag);
    if (className !== "") {
      element.className = className;
    }
    element.append(...children);
    return element;
  };
  const button = (
    label: string,
    extraClass = "",
    note?: string,
  ): HTMLButtonElement => {
    const element = make("button", `visit-button ${extraClass}`.trim(), [
      label,
    ]);
    element.type = "button";
    if (note !== undefined) {
      element.append(make("span", "visit-button-note", [note]));
    }
    return element;
  };
  const heading = (text: string): HTMLHeadingElement => {
    const element = make("h1", "", [text]);
    element.tabIndex = -1;
    return element;
  };
  const sheet = (
    name: string,
    title: HTMLElement,
    children: Children,
  ): HTMLElement => {
    const element = make("section", `visit-sheet visit-sheet-${name}`, [
      make("div", "visit-sheet-body", [title, ...children]),
    ]);
    element.hidden = true;
    return element;
  };
  const controls = (items: Children, extraClass = ""): HTMLElement =>
    make("div", `visit-controls ${extraClass}`.trim(), items);

  // The bar: stop at the left, the room at the right.
  const stopButton = button(roomCopy.stopButton, "visit-stop");
  stopButton.hidden = true;
  const roomName = make("span", "visit-room-name");
  const roomProgress = make("span", "visit-room-progress");
  const room = make("p", "visit-room", [roomName, roomProgress]);
  room.hidden = true;
  const pauseButton = button(roomCopy.pauseButton, "visit-stop");
  pauseButton.hidden = true;
  const bar = make("div", "visit-bar", [stopButton, pauseButton, room]);

  // The drawing.
  const houseFrame = make("div", "visit-house");
  houseFrame.setAttribute("role", "img");
  houseFrame.setAttribute("aria-label", roomCopy.houseLabel);

  // The answers.
  const answer = (side: "left" | "right"): HTMLButtonElement => {
    const element = make("button", `visit-answer visit-answer-${side}`, [
      make("span", "visit-answer-hint", [
        roomCopy.answers[side].hint,
        make("span", "visit-answer-keys", [roomCopy.answerKeys[side]]),
      ]),
    ]);
    element.type = "button";
    // The name of the button is the word a visitor sees on it, so that someone who speaks to
    // their device can ask for it by that word. The longer sentence describes it.
    element.setAttribute("aria-description", roomCopy.answers[side].name);
    element.hidden = true;
    return element;
  };
  const answerButtons = { left: answer("left"), right: answer("right") };

  const caption = make("p", "visit-caption");
  caption.setAttribute("role", "status");
  caption.setAttribute("aria-live", "polite");

  const restLine = make("p", "visit-rest-line visit-voice");
  const restButton = button(roomCopy.goOnButton, "visit-button-lit");
  const rest = make("div", "visit-rest", [restLine, restButton]);
  rest.hidden = true;

  // The front door.
  const choiceButtons = {
    quick: button(
      frontDoorCopy.choices.quick.button,
      "visit-button-lit",
      frontDoorCopy.choices.quick.note,
    ),
    full: button(
      frontDoorCopy.choices.full.button,
      "",
      frontDoorCopy.choices.full.note,
    ),
    replay: button(
      frontDoorCopy.choices.replay.button,
      "",
      frontDoorCopy.choices.replay.note,
    ),
  };
  // The replay has its own spec. Until it is built its door stays shut, but can still be read.
  choiceButtons.replay.setAttribute("aria-disabled", "true");
  const choices = controls(
    Object.values(choiceButtons),
    "visit-controls-stacked",
  );
  choices.setAttribute("role", "group");
  choices.setAttribute("aria-label", frontDoorCopy.choicesLabel);
  const frontDoorHeading = heading(siteTitle);
  const status = (): HTMLElement => {
    const element = make("p", "visit-status visit-quiet");
    element.setAttribute("role", "status");
    return element;
  };
  const frontDoorStatus = status();
  const frontDoor = sheet("front", frontDoorHeading, [
    make("p", "visit-lead", [frontDoorCopy.headphonesLine]),
    make("p", "visit-voice visit-quiet", [frontDoorCopy.aboutLine]),
    choices,
    frontDoorStatus,
    make("p", "visit-quiet", [frontDoorCopy.privacyLine]),
  ]);

  // Calibration: one control, quieter and louder, and a button to keep the setting.
  const calibrationHeading = heading(visitCopy.calibrationHeading);
  const openLine = make("p", "", [calibrationCopy.openLine]);
  const statusLine = status();
  const meter = make("div", "visit-meter", [make("span", "visit-meter-mark")]);
  meter.setAttribute("aria-hidden", "true");
  meter.hidden = true;
  const startButton = button(calibrationCopy.startButton, "visit-button-lit");
  const quieterButton = button(calibrationCopy.quieterButton);
  const louderButton = button(calibrationCopy.louderButton);
  const keepButton = button(calibrationCopy.keepButton, "visit-button-lit");
  const calibration = sheet("calibration", calibrationHeading, [
    openLine,
    meter,
    controls([startButton, quieterButton, louderButton, keepButton]),
    statusLine,
  ]);

  // The headphone check.
  const checkHeading = heading(visitCopy.headphoneCheckHeading);
  const keptLine = make("p", "", [calibrationCopy.keptLine]);
  const roomsLine = make("p", "visit-quiet");
  const playButton = button(headphoneCheckCopy.playButton, "visit-button-lit");
  const question = make("p", "visit-voice", [headphoneCheckCopy.question]);
  const checkAnswers: Record<CheckAnswer, HTMLButtonElement> = {
    left: button(headphoneCheckCopy.answers.left),
    right: button(headphoneCheckCopy.answers.right),
    bothSides: button(headphoneCheckCopy.answers.bothSides),
    nothingHeard: button(headphoneCheckCopy.answers.nothingHeard),
  };
  const answerList = controls(Object.values(checkAnswers));
  answerList.setAttribute("role", "group");
  answerList.setAttribute("aria-label", headphoneCheckCopy.question);
  const judgementLine = make("p", "visit-status");
  judgementLine.setAttribute("role", "status");
  const checkGoOnButton = button(visitCopy.goOnButton, "visit-button-lit");
  const headphoneCheck = sheet("check", checkHeading, [
    keptLine,
    roomsLine,
    controls([playButton]),
    question,
    answerList,
    judgementLine,
    controls([checkGoOnButton]),
  ]);

  // The rules.
  const rulesHeading = heading(rulesCopy.heading);
  const enterButton = button(rulesCopy.enterButton, "visit-button-lit");
  const rules = sheet("rules", rulesHeading, [
    make(
      "ol",
      "visit-rules",
      rulesCopy.sentences.map((sentence) => make("li", "", [sentence])),
    ),
    make("p", "visit-quiet", [rulesCopy.keyboardLine]),
    make("p", "visit-quiet", [rulesCopy.touchLine]),
    controls([enterButton]),
  ]);

  // One sheet for everything else the house has to say: paused, stopped, ended, cannot play.
  const noticeHeading = heading(leavingCopy.pauseHeading);
  const noticeLine = make("p", "visit-voice");
  const noticeStatus = status();
  const noticeButton = button(leavingCopy.goOnButton, "visit-button-lit");
  const notice = sheet("notice", noticeHeading, [
    noticeLine,
    controls([noticeButton]),
    noticeStatus,
  ]);

  main.classList.add("visit");
  // The drawing starts faint, behind the front door. Set before anything is drawn, so that the
  // page never opens on a bright house that then fades.
  main.dataset.house = "faint";
  main.tabIndex = -1;
  main.replaceChildren(
    houseFrame,
    // The bar comes first, so that the first press of Tab in a room lands on the stop control.
    bar,
    answerButtons.left,
    answerButtons.right,
    caption,
    rest,
    frontDoor,
    calibration,
    headphoneCheck,
    rules,
    notice,
  );

  return {
    root: main,
    houseFrame,
    stopButton,
    pauseButton,
    room,
    roomName,
    roomProgress,
    answerButtons,
    caption,
    rest,
    restLine,
    restButton,
    frontDoor: {
      element: frontDoor,
      heading: frontDoorHeading,
      choiceButtons,
      statusLine: frontDoorStatus,
    },
    calibration: {
      element: calibration,
      heading: calibrationHeading,
      openLine,
      meter,
      statusLine,
      startButton,
      quieterButton,
      louderButton,
      keepButton,
    },
    headphoneCheck: {
      element: headphoneCheck,
      heading: checkHeading,
      keptLine,
      roomsLine,
      playButton,
      question,
      answerList,
      answerButtons: checkAnswers,
      judgementLine,
      goOnButton: checkGoOnButton,
    },
    rules: { element: rules, heading: rulesHeading, enterButton },
    notice: {
      element: notice,
      heading: noticeHeading,
      line: noticeLine,
      statusLine: noticeStatus,
      button: noticeButton,
    },
  };
}
